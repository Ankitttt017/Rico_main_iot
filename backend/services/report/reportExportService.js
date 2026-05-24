/**
 * reportExportService.js
 * Main entry point for the reporting system.
 * Orchestrates database queries, metrics calculation, and file generation.
 */

const { Op } = require("sequelize");
const sequelize = require("../../config/db");
const OperationLog = require("../../models/OperationLog");
const Machine = require("../../models/Machine");
const Part = require("../../models/Part");
const QrFormatRule = require("../../models/QrFormatRule");
const { calculateProductionMetrics } = require("./reportMetricsService");
const { generateIndustrialExcel } = require("./excelTemplateEngine");
const { resolveIndustrialResult } = require("./reportFormatter");
const PLC_READING_TABLE = "PlcCycleReadings";

const PLC_PART_ID_CANDIDATE_COLUMNS = [
  "part_id",
  "partid",
  "part_serial_no",
  "part_serial",
  "part_no",
  "part_number",
  "barcode",
  "qr_code",
  "component_code",
];

const PLC_SHOT_CANDIDATE_COLUMNS = [
  "shot_number",
  "shotnumber",
  "sequence_no",
  "seq_no",
];

const NON_PRODUCTION_REASONS = new Set([
  "DUPLICATE_SCAN",
  "DUPLICATE_SCAN_IN_FLIGHT",
  "ALREADY_COMPLETED",
  "ALREADY_SCANNED",
  "PREVIOUS_STATION_NOT_COMPLETED",
  "INVALID_QR_FORMAT",
  "QR_RULE_CONFIG_ERROR",
  "STATION_NOT_CONFIGURED",
  "PART_NOT_FOUND",
  "CUSTOMER_CODE_INVALID",
  "CUSTOMER_CODE_RULE_INVALID",
  "INVALID_INPUT",
  "VALIDATION_ERROR",
]);

function isProductionReportLog(log) {
  if (!log) return false;

  const status = String(log.plc_status || "").trim().toUpperCase();
  const reason = String(log.interlock_reason || "").trim().toUpperCase();
  const result = String(log.result || "").trim().toUpperCase();
  const validationResult = String(log.validation_result || "").trim().toUpperCase();

  if (status === "RESET" || status === "VALIDATION_ONLY") return false;
  if (NON_PRODUCTION_REASONS.has(reason)) return false;
  if (result === "BLOCK") return false;

  if (status === "INTERLOCKED") {
    if (validationResult === "DUPLICATE" || validationResult === "BLOCKED") return false;
    if (reason && NON_PRODUCTION_REASONS.has(reason)) return false;
  }

  return true;
}

function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

async function getPlcReadingColumns() {
  try {
    const [rows] = await sequelize.query(
      `
        SELECT LOWER(COLUMN_NAME) AS column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = :tableName
      `,
      { replacements: { tableName: PLC_READING_TABLE } }
    );
    return new Set((rows || []).map((row) => String(row.column_name || "").trim()).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

function pickFirstAvailableColumn(columnSet, candidates) {
  for (const column of candidates) {
    if (columnSet.has(String(column).toLowerCase())) return column;
  }
  return null;
}

async function fetchLatestPlcReadingsByColumn(columnName, values = []) {
  const map = new Map();
  for (const value of values) {
    const normalized = normalizeKey(value);
    if (!normalized || map.has(normalized)) continue;
    try {
      const [rows] = await sequelize.query(
        `SELECT TOP 1 * FROM ${PLC_READING_TABLE} WHERE [${columnName}] = :value ORDER BY recorded_at DESC`,
        { replacements: { value: String(value).trim() } }
      );
      if (rows && rows[0]) map.set(normalized, rows[0]);
    } catch (_) {
      // Keep report resilient even when schema differs on some installations.
    }
  }
  return map;
}

async function runIndustrialExport(res, { filters, reportConfig, type = "full" }) {
  // 1. Resolve Data
  const rows = await fetchProductionData(filters);

  // 2. Calculate Metrics
  const metrics = calculateProductionMetrics(rows);

  // 3. Generate File
  await generateIndustrialExcel(res, {
    rows,
    metrics,
    filters,
    reportConfig,
    sheetName: type === "ng" ? "NG Report" : "Production Report",
    filePrefix: type === "ng" ? "NG_REPORT" : "FULL_REPORT"
  });
}

/**
 * Fetches and joins data for the report
 */
async function fetchProductionData(filters = {}) {
  const {
    dateFrom, dateTo,
    machineId, lineName,
    shiftCode, modelCode,
    operationNo, resultType,
    barcode, customerCode, station, operatorId, status
  } = filters;

  // Safe date defaults — always query last 24 hours if nothing specified
  const now = new Date();
  const from = dateFrom ? new Date(dateFrom) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const to   = dateTo   ? new Date(dateTo)   : now;

  // Guard invalid dates
  const safeFrom = isNaN(from.getTime()) ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : from;
  const safeTo   = isNaN(to.getTime())   ? now : to;

  const where = {
    createdAt: {
      [Op.gte]: safeFrom,
      [Op.lte]: safeTo
    }
  };

  if (machineId)   where.machine_id   = machineId;
  if (operationNo) where.operation_no = operationNo;
  if (shiftCode) where.shift_code = shiftCode;
  if (operatorId) where.user_id = operatorId;
  if (barcode) {
    where.part_id = { [Op.like]: `%${String(barcode).trim()}%` };
  }
  if (station) {
    const stationToken = String(station).trim().toUpperCase();
    where[Op.or] = [
      { operation_no: stationToken },
      { station_no: stationToken },
    ];
  }

  // Note: Sequelize joins for lineName would be better if we have associations,
  // but for reliability we can fetch scoped machine IDs first.
  if (lineName) {
    const machines = await Machine.findAll({ where: { line_name: lineName }, attributes: ["id"] });
    const ids = machines.map(m => m.id);
    where.machine_id = { [Op.in]: ids };
  }

  const logs = await OperationLog.findAll({
    where,
    include: [
      {
        model: Machine,
        attributes: ["machine_name", "line_name", "operation_no"]
      }
    ],
    order: [["createdAt", "DESC"]],
    raw: true,
    nest: true
  });

  // Keep only production-relevant rows. Validation-noise attempts
  // (duplicate/sequence/format/config blocks) are excluded from reports.
  const productionLogs = logs.filter(isProductionReportLog);

  // Fetch Part & QR Info (Flattening for performance)
  const partIds = [...new Set(productionLogs.map(l => l.part_id))];
  const parts = await Part.findAll({
    where: { part_id: { [Op.in]: partIds } },
    attributes: ["part_id", "qr_format_name"],
    raw: true
  });

  const partMap = parts.reduce((acc, p) => {
    acc[p.part_id] = p;
    return acc;
  }, {});

  const qrRules = await QrFormatRule.findAll({ attributes: ["format_name", "model_code"], raw: true });
  const qrMap = qrRules.reduce((acc, q) => {
    acc[q.format_name] = q.model_code;
    return acc;
  }, {});

  // Deduplicate: per (part_id + operation_no) keep only the best outcome log.
  // Priority: ENDED_OK > ENDED_NG > everything else.
  const bestByPartStation = new Map();
  for (const log of productionLogs) {
    const key = `${log.part_id}||${log.operation_no || log.station_no}`;
    const existing = bestByPartStation.get(key);
    if (!existing) {
      bestByPartStation.set(key, log);
    } else {
      const existStatus = String(existing.plc_status || "").toUpperCase();
      const newStatus   = String(log.plc_status || "").toUpperCase();
      // Prefer ENDED_OK; then ENDED_NG; then most recent
      const rank = (s) => s === "ENDED_OK" ? 2 : s === "ENDED_NG" ? 1 : 0;
      if (rank(newStatus) > rank(existStatus)) {
        bestByPartStation.set(key, log);
      } else if (rank(newStatus) === rank(existStatus)) {
        // Same rank: keep the most recent
        if (new Date(log.createdAt) > new Date(existing.createdAt)) {
          bestByPartStation.set(key, log);
        }
      }
    }
  }
  const deduplicatedLogs = [...bestByPartStation.values()];

  // Attach PLC cycle readings from DB table (PlcCycleReadings):
  // 1) Prefer part-id style columns (if available in current schema)
  // 2) Fallback to shot_number style columns
  const plcColumns = await getPlcReadingColumns();
  const partLookupColumn = pickFirstAvailableColumn(plcColumns, PLC_PART_ID_CANDIDATE_COLUMNS);
  const shotLookupColumn = pickFirstAvailableColumn(plcColumns, PLC_SHOT_CANDIDATE_COLUMNS);
  const partIdsForPlcLookup = [...new Set(
    deduplicatedLogs
      .map((log) => String(log.part_id || "").trim())
      .filter(Boolean)
  )];
  const shotNumbers = [...new Set(
    deduplicatedLogs
      .map((log) => String(log.shot_number || log.shotNumber || "").trim())
      .filter(Boolean)
  )];
  const plcByPartId = partLookupColumn
    ? await fetchLatestPlcReadingsByColumn(partLookupColumn, partIdsForPlcLookup)
    : new Map();
  const plcByShot = shotLookupColumn
    ? await fetchLatestPlcReadingsByColumn(shotLookupColumn, shotNumbers)
    : new Map();

  // Enrich & Standardize
  const enriched = deduplicatedLogs.map((log, index) => {
    const part = partMap[log.part_id] || {};
    const { status: industrialResult, category } = resolveIndustrialResult({
      result: log.result,
      plc_status: log.plc_status,
      interlock_reason: log.interlock_reason
    });

    // Cycle times: scan time (createdAt of PENDING = QR scan) ? PLC end time
    const cycleStartTime = log.plc_start_at || log.createdAt || null;
    const cycleEndTime   = log.plc_end_at   || null;

    let cycleTime = log.cycle_time;
    if (!cycleTime && cycleStartTime && cycleEndTime) {
      const start = new Date(cycleStartTime);
      const end   = new Date(cycleEndTime);
      cycleTime = Math.max(0, (end.getTime() - start.getTime()) / 1000);
    }

    const partIdValue = String(log.part_id || "").trim();
    const normalizedPartId = partIdValue.toUpperCase();
    const derivedCustomerCode = normalizedPartId.includes("-")
      ? normalizedPartId.split("-")[0]
      : normalizedPartId.slice(0, 8) || "-";

    const partLookupKey = normalizeKey(partIdValue);
    const shotLookupKey = normalizeKey(log.shot_number || log.shotNumber || "");
    const plcReadingFromDb = plcByPartId.get(partLookupKey) || plcByShot.get(shotLookupKey) || null;

    return {
      ...log,
      srNo: index + 1,
      partId:      partIdValue || "-",
      customerCode: derivedCustomerCode,
      machineName: log.Machine?.machine_name || "-",
      lineName:    log.Machine?.line_name    || "-",
      operationNo: log.operation_no || log.Machine?.operation_no || "-",
      stationNo: log.station_no || log.operation_no || "-",
      qrFormatName: part.qr_format_name || "-",
      modelCode:    qrMap[part.qr_format_name] || "-",
      shiftCode:    log.shift_code || "A",
      cycleStartTime: cycleStartTime ? new Date(cycleStartTime).toLocaleString() : "-",
      cycleEndTime:   cycleEndTime   ? new Date(cycleEndTime).toLocaleString()   : "-",
      cycleTime:    cycleTime ? Number(cycleTime).toFixed(2) : "0.00",
      industrialResult,
      category,
      statusLabel: industrialResult,
      bypassStatus: Boolean(log.is_bypassed),
      reason: log.interlock_reason || "-",
      plcReading: plcReadingFromDb
    };
  });

  let filtered = enriched;

  if (customerCode) {
    const cc = String(customerCode).trim().toUpperCase();
    filtered = filtered.filter((row) => String(row.customerCode || "").toUpperCase().includes(cc));
  }

  const normalizedStatus = String(status || resultType || "").trim().toUpperCase();
  if (normalizedStatus) {
    if (normalizedStatus === "VALIDATION") {
      filtered = filtered.filter((row) => row.category === "VALIDATION");
    } else if (normalizedStatus === "BYPASS") {
      filtered = filtered.filter((row) => row.bypassStatus === true);
    } else if (normalizedStatus === "PENDING") {
      filtered = filtered.filter((row) => String(row.statusLabel || "").toUpperCase() === "UNKNOWN");
    } else {
      filtered = filtered.filter((row) => String(row.industrialResult || "").toUpperCase() === normalizedStatus);
    }
  }

  return filtered;
}

module.exports = {
  runIndustrialExport,
  fetchProductionData
};
