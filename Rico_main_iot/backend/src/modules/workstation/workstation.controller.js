"use strict";

const db = require("../../config/db");

const PLC_TABLE = "dbo.PlcCycleReadings";
const DOWNTIME_TABLE = "dbo.workstation_downtime_events";

let schemaReadyPromise = null;

const DOWNTIME_REASONS = [
  "Machine Breakdown",
  "Management Loss",
  "Die Breakdown",
  "Robot Breakdown",
  "Planned Downtime",
  "Process Loss",
  "HPDC Machine Accessories",
];

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function localDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${dateOnly(safe)} ${pad2(safe.getHours())}:${pad2(safe.getMinutes())}:${pad2(safe.getSeconds())}`;
}

function buildSlots(shiftDate) {
  const slots = [];
  const start = new Date(`${shiftDate}T06:00:00`);
  const slotLengths = [60, 60, 60, 60, 60, 60, 60, 60, 30];
  let cursor = start;
  for (const minutes of slotLengths) {
    const end = new Date(cursor.getTime() + minutes * 60000);
    slots.push({
      label: `${pad2(cursor.getHours())}:${pad2(cursor.getMinutes())}-${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
      start: localDateTime(cursor),
      end: localDateTime(end),
      minutes,
    });
    cursor = end;
  }
  return slots;
}

function secondsToHHMM(totalSeconds = 0) {
  const totalMinutes = Math.max(0, Math.floor(Number(totalSeconds || 0) / 60));
  return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(999, Math.round(number)));
}

async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = db.run(`
IF OBJECT_ID(N'${DOWNTIME_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${DOWNTIME_TABLE} (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workstation_downtime_events PRIMARY KEY,
    machine_key NVARCHAR(120) NULL,
    machine_name NVARCHAR(160) NULL,
    plc_ip VARCHAR(50) NULL,
    line_id INT NULL,
    operator_name NVARCHAR(120) NULL,
    reason NVARCHAR(120) NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_workstation_downtime_status DEFAULT 'open',
    started_at DATETIME2 NOT NULL CONSTRAINT DF_workstation_downtime_started_at DEFAULT SYSDATETIME(),
    ended_at DATETIME2 NULL,
    remarks NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_workstation_downtime_created_at DEFAULT SYSUTCDATETIME()
  );
END`).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function findMachineContext({ machine_key, plc_ip, machine_id }) {
  const params = [];
  const filters = [];
  if (machine_id) { filters.push("m.id = ?"); params.push(machine_id); }
  if (plc_ip) { filters.push("m.ip_address = ?"); params.push(plc_ip); }
  if (machine_key) {
    filters.push("(pc.machine_key = ? OR m.machine_code = ? OR m.ip_address = ?)");
    params.push(machine_key, machine_key, machine_key);
  }
  if (!filters.length) return {};
  const orderMachineKey = machine_key || "";

  const { rows } = await db.query(
    `SELECT TOP 1
       m.id AS machine_id,
       m.machine_code,
       COALESCE(m.name, pc.machine_name, m.machine_code) AS machine_name,
       COALESCE(pc.machine_key, m.ip_address, m.machine_code) AS machine_key,
       COALESCE(pc.ip_address, m.ip_address) AS plc_ip,
       m.port,
       m.line_id,
       COALESCE(mo.part_code, m.part_name) AS part_code,
       p.description AS part_name,
       p.cycle_time_sec,
       mo.operation_no
     FROM dbo.iot_machines m
     LEFT JOIN dbo.plc_machine_configs pc
       ON pc.machine_id = m.id OR pc.ip_address = m.ip_address
     OUTER APPLY (
       SELECT TOP 1 part_code, operation_no
       FROM dbo.iot_machine_operations
       WHERE machine_id = m.id AND is_active = 1
       ORDER BY is_primary DESC, updated_at DESC, id DESC
     ) mo
     LEFT JOIN dbo.iot_parts p ON p.material_code = COALESCE(mo.part_code, m.part_name)
     WHERE ${filters.join(" OR ")}
     ORDER BY
       CASE WHEN pc.machine_id = m.id THEN 0 ELSE 1 END,
       CASE WHEN pc.machine_key = ? THEN 0 ELSE 1 END,
       CASE WHEN m.plant_code IS NULL OR m.line_id IS NULL THEN 1 ELSE 0 END,
       m.id DESC`,
    [...params, orderMachineKey]
  );
  return rows[0] || {};
}

async function getLatestReading(machineKey, plcIp) {
  const { rows } = await db.query(
    `SELECT TOP 1 *
     FROM ${PLC_TABLE}
     WHERE (? IS NOT NULL AND machine_key = ?)
        OR (? IS NOT NULL AND plc_ip = ?)
     ORDER BY COALESCE(shot_datetime, recorded_at, created_at) DESC, id DESC`,
    [machineKey, machineKey, plcIp, plcIp]
  );
  return rows[0] || null;
}

async function countSlot({ machineKey, plcIp, start, end }) {
  const { rows } = await db.query(
    `SELECT
       COUNT(DISTINCT COALESCE(CAST(shot_number AS NVARCHAR(50)), CAST(id AS NVARCHAR(50)))) AS actual,
       MIN(TRY_CONVERT(INT, ng_counter)) AS ng_min,
       MAX(TRY_CONVERT(INT, ng_counter)) AS ng_max
     FROM ${PLC_TABLE}
     WHERE ((? IS NOT NULL AND machine_key = ?) OR (? IS NOT NULL AND plc_ip = ?))
       AND COALESCE(shot_datetime, recorded_at, created_at) >= ?
       AND COALESCE(shot_datetime, recorded_at, created_at) < ?`,
    [machineKey, machineKey, plcIp, plcIp, start, end]
  );
  const row = rows[0] || {};
  const rejection = Math.max(0, Number(row.ng_max || 0) - Number(row.ng_min || 0));
  return {
    actual: Number(row.actual || 0),
    rejection,
  };
}

async function getDowntimeTotals({ machineKey, plcIp, shiftStart, shiftEnd }) {
  const { rows } = await db.query(
    `SELECT
       SUM(DATEDIFF(second, started_at, COALESCE(ended_at, SYSDATETIME()))) AS downtime_sec,
       SUM(CASE WHEN reason = 'Planned Downtime' THEN DATEDIFF(second, started_at, COALESCE(ended_at, SYSDATETIME())) ELSE 0 END) AS planned_sec,
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count
     FROM ${DOWNTIME_TABLE}
     WHERE ((? IS NOT NULL AND machine_key = ?) OR (? IS NOT NULL AND plc_ip = ?))
       AND started_at < ?
       AND COALESCE(ended_at, SYSDATETIME()) >= ?`,
    [machineKey, machineKey, plcIp, plcIp, shiftEnd, shiftStart]
  );
  return rows[0] || {};
}

async function getWorkstationSummary(req, res) {
  try {
    await ensureSchema();
    const input = {
      machine_key: cleanText(req.query.machine_key),
      plc_ip: cleanText(req.query.plc_ip || req.query.ip),
      machine_id: cleanText(req.query.machine_id),
    };
    const shiftDate = dateOnly(req.query.date || new Date());
    const context = await findMachineContext(input);
    const machineKey = context.machine_key || input.machine_key || input.plc_ip;
    const plcIp = context.plc_ip || input.plc_ip;
    if (!machineKey && !plcIp) {
      return res.status(400).json({ success: false, message: "machine_key or plc_ip is required." });
    }

    const latest = await getLatestReading(machineKey, plcIp);
    const cycleTarget = Number(context.cycle_time_sec || latest?.target_cycle_time || latest?.standard_cycle_time || 72);
    const targetPerHour = cycleTarget > 0 ? Math.floor(3600 / cycleTarget) : 0;
    const slots = buildSlots(shiftDate);
    const hourly = [];
    for (const slot of slots) {
      const counts = await countSlot({ machineKey, plcIp, start: slot.start, end: slot.end });
      const target = Math.round(targetPerHour * (slot.minutes / 60));
      hourly.push({
        slot: slot.label,
        target,
        actual: counts.actual,
        rejection: counts.rejection,
        efficiency_percent: target ? percent((counts.actual / target) * 100) : 0,
      });
    }

    const totals = hourly.reduce((acc, row) => ({
      target: acc.target + row.target,
      actual: acc.actual + row.actual,
      rejection: acc.rejection + row.rejection,
    }), { target: 0, actual: 0, rejection: 0 });
    const shiftStart = slots[0].start;
    const shiftEnd = slots[slots.length - 1].end;
    const downtime = await getDowntimeTotals({ machineKey, plcIp, shiftStart, shiftEnd });
    const cycleActual = Number(latest?.cycle_time || 0);
    const productionSeconds = totals.actual * (cycleActual || cycleTarget || 0);
    const downtimeSeconds = Number(downtime.downtime_sec || 0);
    const shiftElapsedSeconds = Math.max(1, Math.min(
      (new Date(`${shiftDate}T14:30:00`).getTime() - new Date(`${shiftDate}T06:00:00`).getTime()) / 1000,
      (Date.now() - new Date(`${shiftDate}T06:00:00`).getTime()) / 1000
    ));
    const idleSeconds = Math.max(0, shiftElapsedSeconds - productionSeconds - downtimeSeconds);

    res.json({
      success: true,
      data: {
        machine: {
          machine_id: context.machine_id || null,
          machine_key: machineKey,
          machine_name: context.machine_name || latest?.machine_name || machineKey,
          plc_ip: plcIp,
          line_id: context.line_id || null,
        },
        operator: {
          name: cleanText(req.query.operator_name) || null,
        },
        part: {
          part_code: context.part_code || latest?.part_name || null,
          part_name: context.part_name || latest?.part_name || null,
          cycle_time_sec: cycleTarget,
          target_per_hour: targetPerHour,
          die_no: cleanText(req.query.die_no) || null,
        },
        live: {
          shot_number: latest?.shot_number ?? null,
          cycle_time: cycleActual || null,
          minor_stoppage: latest?.minor_stoppage ?? null,
          shot_datetime: latest?.shot_datetime || latest?.recorded_at || null,
          ok_count: latest?.ok_shot ?? null,
          ng_count: latest?.ng_counter ?? null,
        },
        kpi: {
          mu_percent: percent((productionSeconds / Math.max(1, shiftElapsedSeconds - downtimeSeconds)) * 100),
          pu_percent: percent(totals.target ? (totals.actual / totals.target) * 100 : 0),
          average_efficiency: percent(totals.target ? (totals.actual / totals.target) * 100 : 0),
          downtime: secondsToHHMM(downtimeSeconds),
          idle: secondsToHHMM(idleSeconds),
          load_unload_time: "00:00",
          line_stop: "00:00",
          emergency_stop: "00:00",
          open_downtime_count: Number(downtime.open_count || 0),
        },
        hourly,
        totals,
        downtimeReasons: DOWNTIME_REASONS,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to load workstation summary.", error: error.message });
  }
}

async function listDowntimeEvents(req, res) {
  try {
    await ensureSchema();
    const machineKey = cleanText(req.query.machine_key);
    const plcIp = cleanText(req.query.plc_ip || req.query.ip);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const filters = [];
    const params = [];
    if (machineKey) { filters.push("machine_key = ?"); params.push(machineKey); }
    if (plcIp) { filters.push("plc_ip = ?"); params.push(plcIp); }
    const where = filters.length ? `WHERE ${filters.join(" OR ")}` : "";
    const { rows } = await db.query(
      `SELECT TOP (${limit}) *
       FROM ${DOWNTIME_TABLE}
       ${where}
       ORDER BY started_at DESC, id DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to load downtime events.", error: error.message });
  }
}

async function createDowntimeEvent(req, res) {
  try {
    await ensureSchema();
    const reason = cleanText(req.body.reason);
    if (!reason) return res.status(400).json({ success: false, message: "Downtime reason is required." });
    const { rows } = await db.query(
      `INSERT INTO ${DOWNTIME_TABLE}
        (machine_key, machine_name, plc_ip, line_id, operator_name, reason, remarks, started_at)
       OUTPUT INSERTED.*
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(TRY_CONVERT(DATETIME2, ?), SYSDATETIME()))`,
      [
        cleanText(req.body.machine_key),
        cleanText(req.body.machine_name),
        cleanText(req.body.plc_ip),
        req.body.line_id || null,
        cleanText(req.body.operator_name),
        reason,
        cleanText(req.body.remarks),
        cleanText(req.body.started_at),
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to declare downtime.", error: error.message });
  }
}

async function closeDowntimeEvent(req, res) {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      `UPDATE ${DOWNTIME_TABLE}
       SET status = 'closed',
           ended_at = COALESCE(TRY_CONVERT(DATETIME2, ?), SYSDATETIME()),
           remarks = COALESCE(?, remarks)
       OUTPUT INSERTED.*
       WHERE id = ?`,
      [cleanText(req.body.ended_at), cleanText(req.body.remarks), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Downtime event not found." });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to close downtime.", error: error.message });
  }
}

module.exports = {
  createDowntimeEvent,
  closeDowntimeEvent,
  getWorkstationSummary,
  listDowntimeEvents,
};
