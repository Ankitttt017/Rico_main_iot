// UPGRADE COMPLETE — Part Journey API: GET /api/parts/:partId/journey
const Machine      = require("../models/Machine");
const OperationLog = require("../models/OperationLog");
const ProductionLog = require("../models/ProductionLog");
const Part         = require("../models/Part");

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
      attributes: ["id", "machine_name", "station_no", "operation_no", "sequence_no", "line_name"],
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
      // Most recent first — take first (latest) per machine
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
        const qrResult = String(latest.result || "").toUpperCase();
        if (["PASS", "OK", "ALLOW", "ACCEPT"].includes(qrResult)) qrVerification = "PASS";
        else if (["FAIL", "NG", "BLOCK", "REJECT"].includes(qrResult)) qrVerification = "FAIL";
        else if (hasActivity) qrVerification = "RUN";

        // Operation: from plc_status
        const plcSt = String(latest.plc_status || "").toUpperCase();
        if (["ENDED_OK", "PASSED"].includes(plcSt)) operation = "PASS";
        else if (["ENDED_NG", "INTERLOCKED", "BLOCKED"].includes(plcSt)) operation = "FAIL";
        else if (["STARTED", "PENDING", "IN_PROGRESS"].includes(plcSt)) operation = "RUN";
        else if (["PLC_COMM_ERROR"].includes(plcSt)) operation = "FAIL";

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
        rejectionConfirmation = "PASS";
      } else if (operation === "FAIL") {
        qualityCheck = "FAIL";
        rejectionConfirmation = "FAIL";
      }

      // Station overall status
      if (prod || operation === "PASS") {
        stationStatus = "COMPLETED";
      } else if (hasActivity && (operation === "RUN" || qrVerification === "RUN" || (qrVerification === "PASS" && operation === "WAIT"))) {
        stationStatus = "IN_PROGRESS";
      } else if (hasActivity) {
        // Has data but might be failed/incomplete
        stationStatus = operation === "FAIL" ? "COMPLETED" : "IN_PROGRESS";
      } else {
        stationStatus = "PENDING";
      }

      return {
        stationNo:             machine.station_no   || machine.operation_no || `STATION_${idx + 1}`,
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
