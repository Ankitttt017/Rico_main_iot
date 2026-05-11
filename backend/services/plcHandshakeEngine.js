const { emitRealtime } = require("./realtimeService");
const plcService = require("./plcCommunicationService");
const plcConnectionManager = require("./plcConnectionManager");
const { logInfo, logWarn } = require("./industrialLogger");
const telemetry = require("./industrialTelemetryService");
const recoveryEngine = require("./plcReconnectRecoveryEngine");
const { TIMELINE_EVENTS, recordTimelineEvent } = require("./operationTimelineService");
const plcStateMachineService = require("./plcStateMachineService");
const industrialEventService = require("./industrialEventService");
const machineWatchdogService = require("./machineWatchdogService");
const { sleep } = require("./plcProtocols/utils");

// Helper function to resolve bin acknowledgment configuration
function resolveBinAckConfig(machine = {}) {
  let signalMap = [];
  try {
    signalMap = typeof machine?.plc_signal_map === "string" ? JSON.parse(machine.plc_signal_map) : machine?.plc_signal_map || [];
  } catch (e) { 
    signalMap = []; 
  }
  
  if (!Array.isArray(signalMap)) signalMap = [];

  const found = signalMap.find(row => {
    const s = String(row.signal || row.label || "").toUpperCase();
    return s.includes("BIN") && (s.includes("ACK") || s.includes("DEP") || s.includes("KEEP") || s.includes("PLACE"));
  });

  if (found && Number.isFinite(Number(found.register))) {
    return {
      enabled: true,
      register: Number(found.register),
      value: Number(found.value ?? 1),
      label: found.signal || found.label || "BIN_ACK"
    };
  }

  return { enabled: false, register: null, value: 0, label: "BIN_ACK" };
}

class PlcHandshakeEngine {
  constructor() {
    this.machineBusy = new Set();
    this.cycleContext = new Map();
  }

  async transitionSafely(machineId, targetState, metadata = {}, options = {}) {
    const { suppressInvalid = true, tag = "FSM_TRANSITION_FAILED" } = options;
    try {
      await plcStateMachineService.transition(machineId, targetState, metadata);
      return true;
    } catch (error) {
      if (suppressInvalid && String(error?.message || "").includes("Illegal state transition")) {
        logWarn(tag, {
          machineId,
          targetState,
          error: error.message,
          suppressed: true
        });
        return false;
      }
      throw error;
    }
  }

  resolveFailureState(currentState, error) {
    const timeoutFailure = String(error?.message || "").toUpperCase().includes("TIMEOUT");
    if (!timeoutFailure) return plcStateMachineService.states.PLC_ERROR;

    switch (currentState) {
      case plcStateMachineService.states.START_SENT:
      case plcStateMachineService.states.WAITING_ACK:
        return plcStateMachineService.states.ACK_TIMEOUT;
      case plcStateMachineService.states.ACK_RECEIVED:
      case plcStateMachineService.states.WAITING_RUNNING:
      case plcStateMachineService.states.RUNNING:
        return plcStateMachineService.states.RUNNING_TIMEOUT;
      case plcStateMachineService.states.WAITING_END:
        return plcStateMachineService.states.END_TIMEOUT;
      case plcStateMachineService.states.RESETTING:
      case plcStateMachineService.states.RESET_ACK_WAIT:
        return plcStateMachineService.states.RESET_TIMEOUT;
      default:
        return plcStateMachineService.states.PLC_ERROR;
    }
  }

  getState(machineId) {
    const id = Number(machineId || 0);
    return {
      isBusy: this.machineBusy.has(id),
      context: this.cycleContext.get(id) || null,
    };
  }

  /**
   * Mark a machine as resetting (used by cycleFinalizationService).
   * Prevents new cycles from starting during reset.
   */
  async markResetting(machineId) {
    const id = Number(machineId || 0);
    if (!id) return;
    try {
      // Use proper state machine transition instead of directly setting state
      await plcStateMachineService.transition(id, plcStateMachineService.states.RESETTING, {
        error_message: "Cycle finalization - entering reset state"
      });
    } catch (transitionError) {
      // If transition fails due to invalid state, log it but continue
      logWarn("MARK_RESETTING_TRANSITION_FAILED", {
        machineId: id,
        error: transitionError.message
      });
    }
    // Keep machineBusy set to block new cycles during reset
    this.machineBusy.add(id);
  }

  /**
   * Mark a machine as idle after successful reset (used by cycleFinalizationService).
   * Releases the machine lock so new cycles can start.
   */
  async markIdle(machineId) {
    const id = Number(machineId || 0);
    if (!id) return;
    try {
      // Use proper state machine transition to IDLE
      await plcStateMachineService.transition(id, plcStateMachineService.states.IDLE, {
        error_message: null,
        cycle_token: null,
        active_operation_id: null
      });
    } catch (transitionError) {
      logWarn("MARK_IDLE_TRANSITION_FAILED", {
        machineId: id,
        error: transitionError.message
      });
    }
    // Always clear locks and context to allow new cycles
    this.machineBusy.delete(id);
    this.cycleContext.delete(id);
  }

  /**
   * Mark a machine as recovering from an error (used by cycleFinalizationService).
   * Keeps the machine locked but records the error context.
   */
  async markRecovering(machineId, error) {
    const id = Number(machineId || 0);
    if (!id) return;
    try {
      // Try to transition to RECOVERING via PLC_ERROR first if needed
      const runtime = await plcStateMachineService.getOrCreateRuntimeState(id);
      const currentState = runtime.current_state;
      
      // If we're in RESETTING, we can't go directly to RECOVERING
      // Instead, go through the valid path: RESETTING -> PLC_ERROR -> RECOVERING
      if (currentState === "RESETTING") {
        await plcStateMachineService.transition(id, plcStateMachineService.states.PLC_ERROR, {
          error_message: error?.message || "Unknown recovery error"
        });
      }
      
      // Now transition to RECOVERING
      await plcStateMachineService.transition(id, plcStateMachineService.states.RECOVERING, {
        error_message: error?.message || "Unknown recovery error"
      });
    } catch (transitionError) {
      logWarn("MARK_RECOVERING_TRANSITION_FAILED", {
        machineId: id,
        error: transitionError.message
      });
    }
    // Release busy lock so operator can retry — keeping it locked would deadlock the machine
    this.machineBusy.delete(id);
  }

  async recordTimelineForMachine(machineId, eventType, eventData = {}) {
    const context = this.cycleContext.get(Number(machineId || 0));
    if (!context?.operationLogId) return;
    
    const durationFromStartMs = Date.now() - Number(context.startedAtMs || Date.now());
    try {
      await recordTimelineEvent({
        operationId: context.operationLogId,
        partId: context.partId,
        machineId: Number(machineId || 0),
        stationNo: context.stationNo || null,
        eventType,
        eventData,
        durationFromStartMs,
      });
      
      // Standardized Industrial Event (Point 18)
      industrialEventService.emitOperationTimeline(machineId, context.cycleToken, eventType, eventData);
    } catch (_error) {
      // Timeline failures must never break PLC runtime.
    }
  }

  async executeCycle({
    machine,
    partId,
    stationNo,
    operationLogId = null,
    onStarted,
    onEndedOk,
    onEndedNg,
    onError,
  }) {
    const machineId = Number(machine?.id || 0);
    if (!machineId) throw new Error("Invalid machine for PLC handshake");
    
    if (this.machineBusy.has(machineId)) {
      const err = new Error("Machine busy");
      err.code = "MACHINE_BUSY";
      logWarn("MACHINE_BUSY_REJECT", { machineId, partId, stationNo });
      throw err;
    }

    const ip = machine.plc_ip || machine.machine_ip;
    const port = machine.plc_port || machine.machine_port;
    const cycleStartedAtMs = Date.now();
    
    // Generate Unique Cycle Token (Point 9)
    const cycleToken = plcStateMachineService.generateCycleToken();

    this.machineBusy.add(machineId);
    this.cycleContext.set(machineId, {
      operationLogId,
      partId: String(partId || "").trim() || null,
      stationNo: String(stationNo || "").trim().toUpperCase() || null,
      startedAtMs: cycleStartedAtMs,
      cycleToken
    });

    try {
      // Handle state machine recovery before starting cycle
      // If machine is in RESETTING, PLC_ERROR, or RECOVERING, we need to go through IDLE first
      const runtime = await plcStateMachineService.getOrCreateRuntimeState(machineId);
      const currentState = runtime.current_state;
      const recoveryStates = ["RESETTING", "PLC_ERROR", "RECOVERING", "ACK_TIMEOUT", "RUNNING_TIMEOUT", "END_TIMEOUT", "RESET_TIMEOUT"];
      
      if (recoveryStates.includes(currentState)) {
        logInfo("CYCLE_STATE_RECOVERY", { 
          machineId, 
          fromState: currentState, 
          toState: "IDLE" 
        });
        try {
          // Force transition to IDLE to recover from error state
          await plcStateMachineService.transition(machineId, plcStateMachineService.states.IDLE, {
            error_message: `Recovery from ${currentState} state`,
            cycle_token: null,
            active_operation_id: null
          });
        } catch (recoveryError) {
          logWarn("CYCLE_STATE_RECOVERY_FAILED", {
            machineId,
            fromState: currentState,
            error: recoveryError.message
          });
          // Continue anyway - the new cycle context will start fresh
        }
      }

      // Now transition to SCANNED (normal entry point for new cycle)
      await this.transitionSafely(machineId, plcStateMachineService.states.SCANNED, {
        cycle_token: cycleToken
      });

      // Transition to VALIDATED (Point 2)
      await this.transitionSafely(machineId, plcStateMachineService.states.VALIDATED, {
        cycle_token: cycleToken,
        active_operation_id: operationLogId
      });
      await this.recordTimelineForMachine(machineId, "VALIDATED");

      const result = await plcConnectionManager.runExclusive({
        machineId,
        ip,
        port,
        operationName: "PLC_HANDSHAKE_CYCLE",
        task: async () => {
          
          // 1. Send START command
          await this.transitionSafely(machineId, plcStateMachineService.states.START_SENT);
          await this.recordTimelineForMachine(machineId, "START_SENT");
          await this.transitionSafely(machineId, plcStateMachineService.states.WAITING_ACK);
          await this.recordTimelineForMachine(machineId, "WAITING_ACK");
          
          // Point 10: Hold START signal
          if (machine.start_hold_ms > 0) await sleep(machine.start_hold_ms);

          return plcService.executePlcHandshake({
            ip,
            port,
            partId,
            stationNo,
            machineId,
            machine,
            onAckStart: async (ack) => {
              // Point 17: Write Verification (Simulated by receiving ACK)
              await this.transitionSafely(machineId, plcStateMachineService.states.ACK_RECEIVED, { ack });
              await this.recordTimelineForMachine(machineId, "ACK_RECEIVED", { ack });
              
              await this.transitionSafely(machineId, plcStateMachineService.states.WAITING_RUNNING);
              await this.recordTimelineForMachine(machineId, "WAITING_RUNNING");
              
              if (typeof onStarted === "function") await onStarted(ack);
            },
            onAckEndOk: async (ack) => {
              await this.transitionSafely(machineId, plcStateMachineService.states.COMPLETED_OK, { ack });
              await this.recordTimelineForMachine(machineId, "COMPLETED_OK", { ack });
              machineWatchdogService.recordSuccess(machineId);
              if (typeof onEndedOk === "function") await onEndedOk(ack);
            },
            onAckEndNg: async (ack) => {
              const bin = resolveBinAckConfig(machine);
              if (bin.enabled) {
                await this.transitionSafely(machineId, plcStateMachineService.states.WAITING_BIN_ACK, { ack });
                await this.recordTimelineForMachine(machineId, "WAITING_BIN_ACK", { ack });
              } else {
                await this.transitionSafely(machineId, plcStateMachineService.states.COMPLETED_NG, { ack });
                await this.recordTimelineForMachine(machineId, "COMPLETED_NG", { ack });
              }
              machineWatchdogService.recordSuccess(machineId);
              if (typeof onEndedNg === "function") await onEndedNg(ack);
            },
            onFailure: async (error) => {
              const runtime = await plcStateMachineService.getOrCreateRuntimeState(machineId);
              const currentState = runtime.current_state;
              const errorState = this.resolveFailureState(currentState, error);
              const transitioned = await this.transitionSafely(machineId, errorState, {
                error_message: error.message
              }, {
                tag: "ON_FAILURE_STATE_TRANSITION_FAILED"
              });
              if (!transitioned && errorState !== plcStateMachineService.states.PLC_ERROR) {
                await this.transitionSafely(machineId, plcStateMachineService.states.PLC_ERROR, {
                  error_message: error.message
                }, {
                  tag: "ON_FAILURE_PLC_ERROR_FALLBACK_FAILED"
                });
              }
              
              const timeoutFailure = String(error?.message || "").toUpperCase().includes("TIMEOUT");
              machineWatchdogService.recordError(machineId, timeoutFailure ? "TIMEOUT" : "PLC_ERROR", error.message);
              
              await this.recordTimelineForMachine(machineId, errorState, { error: error.message });
              if (typeof onError === "function") await onError(error);
            },
          });
        },
      });

      const latencyMs = Date.now() - cycleStartedAtMs;
      telemetry.recordPlcLatency(latencyMs, Boolean(result?.ok), result?.ok ? null : "ERROR");

      if (!result?.ok) {
        throw new Error(result?.error || "PLC handshake failed");
      }

      telemetry.recordCycleCompletion(latencyMs, true);
      return result;
    } catch (error) {
      const latencyMs = Date.now() - cycleStartedAtMs;
      const timeoutFailure = String(error?.message || "").toUpperCase().includes("TIMEOUT");
      telemetry.recordPlcLatency(latencyMs, false, timeoutFailure ? "TIMEOUT" : "ERROR");
      telemetry.recordCycleCompletion(latencyMs, false);

      // Handle error state transition properly through valid state paths
      try {
        const runtime = await plcStateMachineService.getOrCreateRuntimeState(machineId);
        const currentState = runtime.current_state;
        
        // First transition to an appropriate error state if not already there
        if (!["PLC_ERROR", "RECOVERING", "ACK_TIMEOUT", "RUNNING_TIMEOUT", "END_TIMEOUT", "RESET_TIMEOUT"].includes(currentState)) {
          const targetErrorState = this.resolveFailureState(currentState, error);
          try {
            await this.transitionSafely(machineId, targetErrorState, {
              error_message: error.message
            });
          } catch (stateError) {
            logWarn("ERROR_STATE_TRANSITION_FAILED", {
              machineId,
              currentState,
              targetState: targetErrorState,
              error: stateError.message
            });
          }
        }

        // Now try to transition to RECOVERING
        try {
          await this.transitionSafely(machineId, plcStateMachineService.states.RECOVERING, {
            error_message: error.message
          });
        } catch (recoveringError) {
          // If we can't transition to RECOVERING, just go to IDLE as fallback
          logWarn("RECOVERING_STATE_TRANSITION_FAILED", {
            machineId,
            error: recoveringError.message
          });
          try {
            await this.transitionSafely(machineId, plcStateMachineService.states.IDLE, {
              error_message: `Recovery fallback from error: ${error.message}`
            });
          } catch (idleError) {
            logWarn("IDLE_STATE_FALLBACK_FAILED", {
              machineId,
              error: idleError.message
            });
          }
        }
      } catch (stateManagementError) {
        logWarn("ERROR_STATE_MANAGEMENT_FAILED", {
          machineId,
          error: stateManagementError.message
        });
      }

      try {
        await recoveryEngine.handlePlcDisconnect({
          machineId,
          currentState: "ERROR",
          operationId: operationLogId,
          error,
        });
      } catch (_recoveryError) {}
      
      throw error;
    } finally {
      this.machineBusy.delete(machineId);
      this.cycleContext.delete(machineId);
    }
  }
}

module.exports = new PlcHandshakeEngine();
