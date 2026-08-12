"use strict";

const db = require("../../config/db");

async function ensureShiftsTable() {
  const { rows } = await db.query(
    "SELECT CASE WHEN OBJECT_ID('dbo.shifts', 'U') IS NULL THEN 0 ELSE 1 END AS table_exists"
  );
  if (Number(rows[0]?.table_exists || 0) === 0) {
    await db.query(`
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
      )
    `);

    // Insert Default 3 Industrial Shifts
    await db.query(`
      INSERT INTO dbo.shifts (shift_code, shift_name, start_time, end_time, break_1_name, break_1_start, break_1_end, break_2_name, break_2_start, break_2_end, grace_period_mins, overtime_allowed, is_active)
      VALUES 
      ('SHIFT_A', 'Shift A (Morning)', '06:00', '14:00', 'Tea Break 1', '09:00', '09:15', 'Lunch Break', '11:30', '12:00', 10, 1, 1),
      ('SHIFT_B', 'Shift B (Evening)', '14:00', '22:00', 'Tea Break 2', '17:00', '17:15', 'Dinner Break', '19:30', '20:00', 10, 1, 1),
      ('SHIFT_C', 'Shift C (Night)',   '22:00', '06:00', 'Night Tea',   '01:00', '01:15', 'Snack Break',  '04:00', '04:30', 10, 1, 1)
    `);
  }
}

function calculateShiftDuration(start, end) {
  if (!start || !end) return "8h 00m";
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  let startMins = sH * 60 + sM;
  let endMins = eH * 60 + eM;
  if (endMins <= startMins) {
    endMins += 24 * 60; // Next day shift
  }
  const diff = endMins - startMins;
  const hrs = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hrs}h ${mins > 0 ? `${mins}m` : "00m"}`;
}

function isCurrentShift(start, end) {
  if (!start || !end) return false;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  const startMins = sH * 60 + sM;
  let endMins = eH * 60 + eM;

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
             grace_period_mins, overtime_allowed, is_active,
             created_at, updated_at
      FROM dbo.shifts WITH (NOLOCK)
      ORDER BY id ASC
    `);

    const shifts = rows.map((shift) => ({
      ...shift,
      duration: calculateShiftDuration(shift.start_time, shift.end_time),
      is_current: isCurrentShift(shift.start_time, shift.end_time) && Boolean(shift.is_active),
    }));

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

    await db.query(`
      INSERT INTO dbo.shifts (shift_code, shift_name, start_time, end_time, break_1_name, break_1_start, break_1_end, break_2_name, break_2_start, break_2_end, grace_period_mins, overtime_allowed, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      codeUpper,
      String(shift_name).trim(),
      String(start_time).trim(),
      String(end_time).trim(),
      break_1_name ? String(break_1_name).trim() : null,
      break_1_start ? String(break_1_start).trim() : null,
      break_1_end ? String(break_1_end).trim() : null,
      break_2_name ? String(break_2_name).trim() : null,
      break_2_start ? String(break_2_start).trim() : null,
      break_2_end ? String(break_2_end).trim() : null,
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
      break_1_name ? String(break_1_name).trim() : null,
      break_1_start ? String(break_1_start).trim() : null,
      break_1_end ? String(break_1_end).trim() : null,
      break_2_name ? String(break_2_name).trim() : null,
      break_2_start ? String(break_2_start).trim() : null,
      break_2_end ? String(break_2_end).trim() : null,
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
