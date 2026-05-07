// UPGRADE COMPLETE — Part Journey API: GET /api/parts/:partId/journey
const Machine      = require("../models/Machine");
const OperationLog = require("../models/OperationLog");
const ProductionLog = require("../models/ProductionLog");
const Part         = require("../models/Part");

const NON_QUALITY_AUDIT_REASONS = new Set([
  "DUPLICATE_SCAN",
  "ALREADY_COMPLETED",
  "PREVIOUS_STATION_NOT_COMPLETED",
  "STATION_NOT_CONFIGURED",
  "INVALID_QR_FORMAT",
  "QR_RULE_CONFIG_ERROR",
  "PART_INTERLOCKED",
  "RESET_REQUIRED_AFTER_PLC_COMM_ERROR",
  "INVALID_INPUT",
]);

function toUpper(value) {
  return String(value || "").trim().toUpperCase();
}

function isQualityOutcomeLog(log) {
  const reason = String(log?.ng_reason || "").trim().toUpperCase();
  return !NON_QUALITY_AUDIT_REASONS.has(reason);
}

/**
 * GET /api/parts/:partId/journey
 * Returns the full traceability timeline for a part — all stations,
 * their check statuses, and timestamps, ordered by machine sequence_no.
 */
async function getPartJourney(req, res) {
  try {
    const partId = String(req.params.partId || "").trim();
    if (!partId) {
      return res.status(400).json({ error: "partId is required" });
    }

    // 1. Get all machines (ordered by sequence), to know the full route
    const allMachines = await Machine.findAll({
      where: { is_active: true },
      order: [["sequence_no", "ASC"]],
      attributes: ["id", "machine_name", "operation_no", "sequence_no", "line_name"],
      raw: true,
    });

    // 2. Get all OperationLogs for this part (contains QR, PLC, and rejection state)
    const opLogs = await OperationLog.findAll({
      where: { part_id: partId },
      order: [["createdAt", "ASC"]],
      raw: true,
    });

    // 3. Get all ProductionLogs for this part (final OK/NG verdict per machine)
    const prodLogs = await ProductionLog.findAll({
      where: { part_id: partId },
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    // Index by machine_id for fast lookup
    const opByMachine  = new Map();
    const prodByMachine = new Map();

    for (const log of opLogs) {
      if (!opByMachine.has(log.machine_id)) opByMachine.set(log.machine_id, []);
      opByMachine.get(log.machine_id).push(log);
    }
    for (const log of prodLogs) {
      // Most recent first — take first quality-relevant verdict per machine.
      if (!isQualityOutcomeLog(log)) continue;
      if (!prodByMachine.has(log.machine_id)) prodByMachine.set(log.machine_id, log);
    }

    // 4. Determine which machine IDs actually have activity
    const activeMachineIds = new Set([...opByMachine.keys(), ...prodByMachine.keys()]);

    // 5. Build station entries
    const stations = allMachines.map((machine, idx) => {
      const ops  = opByMachine.get(machine.id) || [];
      const prod = prodByMachine.get(machine.id) || null;
      const hasActivity = activeMachineIds.has(machine.id);

      // Determine qrVerification from most recent op log result
      let qrVerification = "WAIT";
      let operation      = "WAIT";
      let qualityCheck   = "WAIT";
      let rejectionConfirmation = "PENDING";
      let stationStatus  = "PENDING";
      let completedAt    = null;

      if (ops.length > 0) {
        const latest = ops[ops.length - 1];

        // QR Verification: based on result field
        const qrResult = toUpper(latest.result);
        const plcSt = toUpper(latest.plc_status);
        if (["PASS", "OK", "ALLOW", "ACCEPT"].includes(qrResult)) qrVerification = "PASS";
        else if (["FAIL", "NG", "BLOCK", "REJECT"].includes(qrResult)) qrVerification = "FAIL";
        else if (["PENDING", "STARTED", "IN_PROGRESS", "ENDED_OK", "ENDED_NG", "INTERLOCKED", "PLC_COMM_ERROR"].includes(plcSt)) {
          qrVerification = "PASS";
        } else if (hasActivity) {
          qrVerification = "RUN";
        }

        // Operation: from plc_status
        if (["ENDED_OK", "PASSED"].includes(plcSt)) operation = "PASS";
        else if (["ENDED_NG", "INTERLOCKED", "BLOCKED"].includes(plcSt)) operation = "FAIL";
        else if (["STARTED", "IN_PROGRESS"].includes(plcSt)) operation = "RUN";
        else if (["PLC_COMM_ERROR"].includes(plcSt)) operation = "COMM";
        else if (["PENDING", "RETRY", "RESET"].includes(plcSt)) operation = "WAIT";

        // completedAt from plc_end_at or plc_end_time
        if (latest.plc_end_at) completedAt = latest.plc_end_at;
        else if (latest.plc_end_time) completedAt = latest.plc_end_time;
        else if (latest.updatedAt && plcSt === "ENDED_OK") completedAt = latest.updatedAt;
      }

      // Quality Check: from ProductionLog verdict
      if (prod) {
        qualityCheck = prod.status === "OK" ? "PASS" : "FAIL";
        rejectionConfirmation = prod.status === "OK" ? "PASS" : "FAIL";
        if (!completedAt) completedAt = prod.createdAt;
      } else if (operation === "PASS") {
        qualityCheck   = "PASS";
      } else if (operation === "FAIL") {
        qualityCheck = "FAIL";
        rejectionConfirmation = "FAIL";
      } else if (operation === "COMM") {
        qualityCheck = "WAIT";
        rejectionConfirmation = "PENDING";
      }

      // Station overall status
      if (qualityCheck === "FAIL" || operation === "FAIL" || operation === "COMM") {
        stationStatus = "FAILED";
      } else if (prod || (operation === "PASS" && qualityCheck === "PASS")) {
        stationStatus = "COMPLETED";
      } else if (
        hasActivity &&
        (operation === "RUN" || qrVerification === "RUN" || (qrVerification === "PASS" && operation === "WAIT"))
      ) {
        stationStatus = "IN_PROGRESS";
      } else if (hasActivity) {
        stationStatus = "PENDING";
      } else {
        stationStatus = "PENDING";
      }

      return {
        stationNo:             machine.operation_no || `STATION_${idx + 1}`,
        stationName:           machine.machine_name || `Operation ${idx + 1}`,
        lineName:              machine.line_name    || null,
        sequence:              machine.sequence_no  || (idx + 1),
        machineId:             machine.id,
        status:                stationStatus,
        qrVerification,
        operation,
        qualityCheck,
        rejectionConfirmation,
        completedAt:           completedAt ? new Date(completedAt).toISOString() : null,
      };
    });

    // 6. Trim trailing PENDING stations (only show up to first pending after last active)
    const lastActiveIdx = stations.map((s) => s.status !== "PENDING").lastIndexOf(true);
    const visibleStations = lastActiveIdx >= 0
      ? stations.slice(0, Math.min(lastActiveIdx + 3, stations.length))  // show 2 upcoming
      : stations.slice(0, 3); // fallback: show first 3

    // 7. Overall status
    const hasNg      = stations.some((s) => s.qualityCheck === "FAIL" || s.operation === "FAIL");
    const hasRunning = stations.some((s) => s.status === "IN_PROGRESS");
    const allDone    = allMachines.length > 0 && stations.slice(0, allMachines.length).every((s) => s.status === "COMPLETED");
    const overallStatus = hasNg ? "NG" : allDone ? "COMPLETED" : hasRunning ? "IN_PROGRESS" : activeMachineIds.size > 0 ? "IN_PROGRESS" : "PENDING";

    res.json({
      partId,
      overallStatus,
      totalStations: allMachines.length,
      stations: visibleStations,
    });
  } catch (error) {
    console.error("[PartJourney] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { getPartJourney };
