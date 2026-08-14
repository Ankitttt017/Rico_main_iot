"use strict";

const db = require("../../config/db");

async function ensureShiftsTable() {
  await db.query(`
    IF OBJECT_ID('dbo.shifts', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.shifts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        shift_code NVARCHAR(50) NOT NULL UNIQUE,
        shift_name NVARCHAR(100) NOT NULL,
        start_time NVARCHAR(10) NOT NULL,
        end_time NVARCHAR(10) NOT NULL,
        break_1_name NVARCHAR(100) NULL,
        break_1_start NVARCHAR(10) NULL,
        break_1_end NVARCHAR(10) NULL,
        break_2_name NVARCHAR(100) NULL,
        break_2_start NVARCHAR(10) NULL,
        break_2_end NVARCHAR(10) NULL,
        grace_period_mins INT DEFAULT 10,
        overtime_allowed BIT DEFAULT 1,
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      );
    END
    ELSE
    BEGIN
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'shift_code', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD shift_code NVARCHAR(50) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'shift_name', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD shift_name NVARCHAR(100) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'start_time', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD start_time NVARCHAR(10) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'end_time', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD end_time NVARCHAR(10) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'break_1_name', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD break_1_name NVARCHAR(100) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'break_1_start', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD break_1_start NVARCHAR(10) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'break_1_end', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD break_1_end NVARCHAR(10) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'break_2_name', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD break_2_name NVARCHAR(100) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'break_2_start', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD break_2_start NVARCHAR(10) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'break_2_end', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD break_2_end NVARCHAR(10) NULL;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'grace_period_mins', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD grace_period_mins INT DEFAULT 10;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'overtime_allowed', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD overtime_allowed BIT DEFAULT 1;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'is_active', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD is_active BIT DEFAULT 1;
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'created_at', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD created_at DATETIME DEFAULT GETDATE();
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'updated_at', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD updated_at DATETIME DEFAULT GETDATE();
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'breaks_json', 'ColumnId') IS NULL ALTER TABLE dbo.shifts ADD breaks_json NVARCHAR(MAX) NULL;

      -- Fix legacy camelCase NOT NULL columns if they exist in pre-existing table
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'createdAt', 'ColumnId') IS NOT NULL
      BEGIN
        ALTER TABLE dbo.shifts ALTER COLUMN createdAt DATETIME NULL;
      END
      IF COLUMNPROPERTY(OBJECT_ID('dbo.shifts'), 'updatedAt', 'ColumnId') IS NOT NULL
      BEGIN
        ALTER TABLE dbo.shifts ALTER COLUMN updatedAt DATETIME NULL;
      END
    END
  `);

  const { rows: countRows } = await db.query("SELECT COUNT(*) AS total FROM dbo.shifts");
  if (Number(countRows[0]?.total || 0) === 0) {
    const defaultBreaksA = JSON.stringify([
      { id: 1, name: "Tea Break 1", start_time: "09:00", end_time: "09:15", type: "tea" },
      { id: 2, name: "Lunch Break", start_time: "11:30", end_time: "12:00", type: "meal" },
    ]);
    const defaultBreaksB = JSON.stringify([
      { id: 1, name: "Tea Break 2", start_time: "17:00", end_time: "17:15", type: "tea" },
      { id: 2, name: "Dinner Break", start_time: "19:30", end_time: "20:00", type: "meal" },
    ]);
    const defaultBreaksC = JSON.stringify([
      { id: 1, name: "Night Tea", start_time: "01:00", end_time: "01:15", type: "tea" },
      { id: 2, name: "Snack Break", start_time: "04:00", end_time: "04:30", type: "meal" },
    ]);

    await db.query(`
      INSERT INTO dbo.shifts (shift_code, shift_name, start_time, end_time, break_1_name, break_1_start, break_1_end, break_2_name, break_2_start, break_2_end, grace_period_mins, overtime_allowed, is_active, breaks_json)
      VALUES 
      ('SHIFT_A', 'Shift A (Morning)', '06:00', '14:00', 'Tea Break 1', '09:00', '09:15', 'Lunch Break', '11:30', '12:00', 10, 1, 1, '${defaultBreaksA}'),
      ('SHIFT_B', 'Shift B (Evening)', '14:00', '22:00', 'Tea Break 2', '17:00', '17:15', 'Dinner Break', '19:30', '20:00', 10, 1, 1, '${defaultBreaksB}'),
      ('SHIFT_C', 'Shift C (Night)',   '22:00', '06:00', 'Night Tea',   '01:00', '01:15', 'Snack Break',  '04:00', '04:30', 10, 1, 1, '${defaultBreaksC}')
    `);
  }
}

function formatTimeString(val) {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) {
    const hrs = String(val.getHours()).padStart(2, "0");
    const mins = String(val.getMinutes()).padStart(2, "0");
    return `${hrs}:${mins}`;
  }
  const str = String(val).trim();
  if (str.includes("T")) {
    const timePart = str.split("T")[1];
    if (timePart) return timePart.substring(0, 5);
  }
  return str.substring(0, 5);
}

function calculateShiftDuration(start, end) {
  const startStr = formatTimeString(start);
  const endStr = formatTimeString(end);
  if (!startStr || !endStr || !startStr.includes(":") || !endStr.includes(":")) return "8h 00m";
  const [sH, sM] = startStr.split(":").map(Number);
  const [eH, eM] = endStr.split(":").map(Number);
  let startMins = (sH || 0) * 60 + (sM || 0);
  let endMins = (eH || 0) * 60 + (eM || 0);
  if (endMins <= startMins) {
    endMins += 24 * 60; // Next day shift
  }
  const diff = endMins - startMins;
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hrs}h ${mins > 0 ? `${mins}m` : "00m"}`;
}

function isCurrentShift(start, end) {
  const startStr = formatTimeString(start);
  const endStr = formatTimeString(end);
  if (!startStr || !endStr || !startStr.includes(":") || !endStr.includes(":")) return false;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = startStr.split(":").map(Number);
  const [eH, eM] = endStr.split(":").map(Number);
  const startMins = (sH || 0) * 60 + (sM || 0);
  let endMins = (eH || 0) * 60 + (eM || 0);

  if (endMins < startMins) {
    // Overnight shift (e.g. 22:00 to 06:00)
    return currentMins >= startMins || currentMins < endMins;
  }
  return currentMins >= startMins && currentMins < endMins;
}

async function getAllShifts(_req, res) {
  try {
    await ensureShiftsTable();
    const { rows } = await db.query(`
      SELECT id, shift_code, shift_name, start_time, end_time,
             break_1_name, break_1_start, break_1_end,
             break_2_name, break_2_start, break_2_end,
             breaks_json, grace_period_mins, overtime_allowed, is_active,
             created_at, updated_at
      FROM dbo.shifts WITH (NOLOCK)
      ORDER BY id ASC
    `);

    const shifts = rows.map((shift) => {
      const startTime = formatTimeString(shift.start_time);
      const endTime = formatTimeString(shift.end_time);

      let breaks = [];
      if (shift.breaks_json) {
        try {
          breaks = typeof shift.breaks_json === "string" ? JSON.parse(shift.breaks_json) : shift.breaks_json;
        } catch {
          breaks = [];
        }
      }

      if (!Array.isArray(breaks) || breaks.length === 0) {
        if (shift.break_1_name) {
          breaks.push({
            id: 1,
            name: shift.break_1_name,
            start_time: formatTimeString(shift.break_1_start),
            end_time: formatTimeString(shift.break_1_end),
            type: "tea",
          });
        }
        if (shift.break_2_name) {
          breaks.push({
            id: 2,
            name: shift.break_2_name,
            start_time: formatTimeString(shift.break_2_start),
            end_time: formatTimeString(shift.break_2_end),
            type: "meal",
          });
        }
      } else {
        breaks = breaks.map((b, idx) => ({
          ...b,
          id: b.id || idx + 1,
          start_time: formatTimeString(b.start_time),
          end_time: formatTimeString(b.end_time),
        }));
      }

      return {
        ...shift,
        shift_code: shift.shift_code || `SHIFT_${shift.id}`,
        shift_name: shift.shift_name || `Shift ${shift.id}`,
        start_time: startTime,
        end_time: endTime,
        breaks,
        duration: calculateShiftDuration(startTime, endTime),
        is_current: isCurrentShift(startTime, endTime) && Boolean(shift.is_active),
      };
    });

    const activeShift = shifts.find((s) => s.is_current) || null;

    res.json({
      success: true,
      data: shifts,
      activeShift,
    });
  } catch (error) {
    console.error("Error fetching shifts:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to fetch shifts" });
  }
}

async function createShift(req, res) {
  try {
    await ensureShiftsTable();
    const {
      shift_code,
      shift_name,
      start_time,
      end_time,
      breaks = [],
      break_1_name,
      break_1_start,
      break_1_end,
      break_2_name,
      break_2_start,
      break_2_end,
      grace_period_mins = 10,
      overtime_allowed = true,
      is_active = true,
    } = req.body;

    if (!shift_code || !shift_name || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "Shift Code, Name, Start Time, and End Time are required.",
      });
    }

    const codeUpper = String(shift_code).trim().toUpperCase();

    const { rows: existing } = await db.query(
      "SELECT id FROM dbo.shifts WHERE shift_code = ?",
      [codeUpper]
    );
    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Shift code '${codeUpper}' already exists.`,
      });
    }

    const breaksArr = Array.isArray(breaks) ? breaks : [];
    const b1 = breaksArr[0] || {};
    const b2 = breaksArr[1] || {};

    const b1Name = b1.name || break_1_name || null;
    const b1Start = b1.start_time || break_1_start || null;
    const b1End = b1.end_time || break_1_end || null;

    const b2Name = b2.name || break_2_name || null;
    const b2Start = b2.start_time || break_2_start || null;
    const b2End = b2.end_time || break_2_end || null;

    const breaksJsonStr = JSON.stringify(breaksArr);

    await db.query(`
      INSERT INTO dbo.shifts (
        shift_code, shift_name, start_time, end_time,
        break_1_name, break_1_start, break_1_end,
        break_2_name, break_2_start, break_2_end,
        breaks_json, grace_period_mins, overtime_allowed, is_active,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE())
    `, [
      codeUpper,
      String(shift_name).trim(),
      String(start_time).trim(),
      String(end_time).trim(),
      b1Name,
      b1Start,
      b1End,
      b2Name,
      b2Start,
      b2End,
      breaksJsonStr,
      Number(grace_period_mins) || 10,
      overtime_allowed ? 1 : 0,
      is_active ? 1 : 0,
    ]);

    res.status(201).json({
      success: true,
      message: "Shift created successfully.",
    });
  } catch (error) {
    console.error("Error creating shift:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to create shift" });
  }
}

async function updateShift(req, res) {
  try {
    await ensureShiftsTable();
    const { id } = req.params;
    const {
      shift_code,
      shift_name,
      start_time,
      end_time,
      breaks = [],
      break_1_name,
      break_1_start,
      break_1_end,
      break_2_name,
      break_2_start,
      break_2_end,
      grace_period_mins,
      overtime_allowed,
      is_active,
    } = req.body;

    const codeUpper = String(shift_code).trim().toUpperCase();

    const breaksArr = Array.isArray(breaks) ? breaks : [];
    const b1 = breaksArr[0] || {};
    const b2 = breaksArr[1] || {};

    const b1Name = b1.name || break_1_name || null;
    const b1Start = b1.start_time || break_1_start || null;
    const b1End = b1.end_time || break_1_end || null;

    const b2Name = b2.name || break_2_name || null;
    const b2Start = b2.start_time || break_2_start || null;
    const b2End = b2.end_time || break_2_end || null;

    const breaksJsonStr = JSON.stringify(breaksArr);

    await db.query(`
      UPDATE dbo.shifts
      SET shift_code = ?,
          shift_name = ?,
          start_time = ?,
          end_time = ?,
          break_1_name = ?,
          break_1_start = ?,
          break_1_end = ?,
          break_2_name = ?,
          break_2_start = ?,
          break_2_end = ?,
          breaks_json = ?,
          grace_period_mins = ?,
          overtime_allowed = ?,
          is_active = ?,
          updated_at = GETDATE()
      WHERE id = ?
    `, [
      codeUpper,
      String(shift_name).trim(),
      String(start_time).trim(),
      String(end_time).trim(),
      b1Name,
      b1Start,
      b1End,
      b2Name,
      b2Start,
      b2End,
      breaksJsonStr,
      Number(grace_period_mins) || 10,
      overtime_allowed ? 1 : 0,
      is_active ? 1 : 0,
      id,
    ]);

    res.json({
      success: true,
      message: "Shift updated successfully.",
    });
  } catch (error) {
    console.error("Error updating shift:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update shift" });
  }
}

async function toggleShiftStatus(req, res) {
  try {
    await ensureShiftsTable();
    const { id } = req.params;
    await db.query(`
      UPDATE dbo.shifts
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
          updated_at = GETDATE()
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      message: "Shift status updated successfully.",
    });
  } catch (error) {
    console.error("Error toggling shift status:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to toggle status" });
  }
}

async function deleteShift(req, res) {
  try {
    await ensureShiftsTable();
    const { id } = req.params;
    await db.query("DELETE FROM dbo.shifts WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Shift deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting shift:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to delete shift" });
  }
}

module.exports = {
  getAllShifts,
  createShift,
  updateShift,
  toggleShiftStatus,
  deleteShift,
};
