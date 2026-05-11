/**
 * plcLatchManager.js
 * ══════════════════════════════════════════════════════════════════
 *
 * INDUSTRIAL LATCH / HOLD MANAGER
 *
 * Enforces the industrial HOLD paradigm:
 *   SCAN → VALIDATE → WRITE START (LATCH ON)
 *   → PLC RUNNING ACK
 *   → PROCESS COMPLETE (END_OK / END_NG)
 *   → RESET (LATCH OFF → write 0 + reset value)
 *
 * Key guarantee:
 *   Once a machine latch is ACTIVE, NO other code path is
 *   permitted to write 0 to the start/block register until
 *   releaseLatch() is explicitly called by cycleFinalizationService.
 *
 * This prevents:
 *   • Polling service from reading START=1 and re-clearing it
 *   • Retry logic prematurely toggling the output
 *   • Recovery handlers pulsing the signal
 *   • Any setTimeout / debounce auto-clear reaching the wire
 *
 * ══════════════════════════════════════════════════════════════════
 */

const { logInfo, logWarn } = require("./industrialLogger");

class PlcLatchManager {
  constructor() {
    /**
     * machineId (number) → {
     *   startRegister: number,
     *   blockRegister: number | null,
     *   activeValue: number,          // value currently latched (e.g. 1 or 2)
     *   latchedAtMs: number,          // epoch ms when latch was acquired
     *   cycleToken: string | null,
     *   stationNo: string | null,
     *   partId: string | null,
     * }
     */
    this.latches = new Map();
  }

  /**
   * Acquire a latch for the machine.
   * Called immediately after writing START value to PLC.
   */
  acquireLatch(machineId, { startRegister, blockRegister = null, activeValue, cycleToken, stationNo, partId } = {}) {
    const id = Number(machineId);
    if (!id) return;

    const entry = {
      startRegister: Number(startRegister),
      blockRegister: blockRegister !== null ? Number(blockRegister) : null,
      activeValue: Number(activeValue ?? 1),
      latchedAtMs: Date.now(),
      stationNo: stationNo || null,
      partId: partId || null,
      runningSeen: false,
    };

    this.latches.set(id, entry);
    logInfo("PLC_LATCH_ACQUIRED", {
      machineId: id,
      startRegister: entry.startRegister,
      activeValue: entry.activeValue,
      cycleToken: entry.cycleToken,
      partId: entry.partId,
      stationNo: entry.stationNo,
    });
  }

  /**
   * Release the latch for the machine.
   * Called ONLY by cycleFinalizationService after reset is confirmed.
   */
  releaseLatch(machineId, reason = "RESET_COMPLETE") {
    const id = Number(machineId);
    const entry = this.latches.get(id);
    if (!entry) return;

    const heldMs = Date.now() - entry.latchedAtMs;
    logInfo("PLC_LATCH_RELEASED", {
      machineId: id,
      reason,
      heldMs,
      cycleToken: entry.cycleToken,
      partId: entry.partId,
      stationNo: entry.stationNo,
    });

    this.latches.delete(id);
  }

  /**
   * Check if machine has an active latch.
   * Callers that want to write 0 must check this first.
   */
  isLatched(machineId) {
    return this.latches.has(Number(machineId));
  }

  /**
   * Check if a specific register write is blocked by the latch.
   * Returns true if the write should be BLOCKED (latch is active for that register).
   */
  isRegisterWriteBlocked(machineId, register, value) {
    const id = Number(machineId);
    const entry = this.latches.get(id);
    if (!entry) return false;

    const reg = Number(register);
    const val = Number(value);

    // Block: writing 0 to the latched start/block register while latch is active
    const isStartReg = reg === entry.startRegister;
    const isBlockReg = entry.blockRegister !== null && reg === entry.blockRegister;

    if ((isStartReg || isBlockReg) && val === 0) {
      logWarn("PLC_LATCH_WRITE_BLOCKED", {
        machineId: id,
        register: reg,
        attemptedValue: val,
        latchedValue: entry.activeValue,
        cycleToken: entry.cycleToken,
        reason: "Latch active — refusing premature 0-write (pulse prevention)",
      });
      return true;
    }

    return false;
  }

  /**
   * Get the current latch state for a machine (for diagnostics).
   */
  getLatchState(machineId) {
    return this.latches.get(Number(machineId)) || null;
  }

  /**
   * Mark that RUNNING state has been detected for the current latch.
   */
  markRunningSeen(machineId) {
    const id = Number(machineId);
    const entry = this.latches.get(id);
    if (entry) {
      entry.runningSeen = true;
    }
  }

  /**
   * Check if RUNNING state was already detected during the current latch.
   */
  hasSeenRunning(machineId) {
    const entry = this.latches.get(Number(machineId));
    return entry ? !!entry.runningSeen : false;
  }

  /**
   * Get all active latches (for system health dashboard).
   */
  getAllLatches() {
    const result = {};
    for (const [machineId, entry] of this.latches.entries()) {
      result[machineId] = {
        ...entry,
        heldMs: Date.now() - entry.latchedAtMs,
      };
    }
    return result;
  }

  /**
   * Force-release all latches (emergency use / server restart only).
   */
  forceReleaseAll(reason = "EMERGENCY_RELEASE") {
    const count = this.latches.size;
    logWarn("PLC_LATCH_FORCE_RELEASE_ALL", { count, reason });
    this.latches.clear();
    return count;
  }
}

module.exports = new PlcLatchManager();
