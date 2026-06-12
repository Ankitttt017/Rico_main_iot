"use strict";

const db = require("../../config/db");

let schemaReadyPromise = null;

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = db.run(`
      IF OBJECT_ID(N'dbo.iot_plants', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.iot_plants (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          code VARCHAR(20) UNIQUE NOT NULL,
          name VARCHAR(100) NOT NULL,
          location VARCHAR(200) NULL,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;
      IF COL_LENGTH('dbo.iot_plants', 'is_active') IS NULL
        ALTER TABLE dbo.iot_plants ADD is_active BIT NOT NULL CONSTRAINT df_iot_plants_is_active DEFAULT 1;
      IF COL_LENGTH('dbo.iot_plants', 'updated_at') IS NULL
        ALTER TABLE dbo.iot_plants ADD updated_at DATETIME2 NOT NULL CONSTRAINT df_iot_plants_updated_at DEFAULT SYSUTCDATETIME();
    `).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function listLocations(req, res) {
  try {
    await ensureSchema();
    const active = String(req.query.active ?? "").trim().toLowerCase();
    const where = active === "1" || active === "true"
      ? "WHERE COALESCE(is_active, 1) = 1"
      : active === "0" || active === "false"
        ? "WHERE COALESCE(is_active, 1) = 0"
        : "";
    const { rows } = await db.query(`
      SELECT id, code, name, location, is_active, created_at, updated_at
      FROM dbo.iot_plants
      ${where}
      ORDER BY name
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createLocation(req, res) {
  try {
    await ensureSchema();
    const code = cleanCode(req.body.code);
    const name = cleanText(req.body.name);
    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Location code and name are required" });
    }

    const result = await db.run(`
      INSERT INTO dbo.iot_plants (code, name, location, is_active)
      OUTPUT INSERTED.id
      VALUES (?, ?, ?, ?)
    `, [code, name, cleanText(req.body.location), req.body.is_active === false ? 0 : 1]);

    res.status(201).json({ success: true, id: result.rows[0]?.id, message: "Location created" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateLocation(req, res) {
  try {
    await ensureSchema();
    const allowed = ["code", "name", "location", "is_active"];
    const updates = allowed.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!updates.length) {
      return res.status(400).json({ success: false, message: "No location fields supplied" });
    }

    const values = updates.map((field) => {
      if (field === "code") return cleanCode(req.body[field]);
      if (field === "is_active") return req.body[field] === false || req.body[field] === 0 ? 0 : 1;
      return cleanText(req.body[field]);
    });

    await db.run(`
      UPDATE dbo.iot_plants
      SET ${updates.map((field) => `${field} = ?`).join(", ")},
          updated_at = SYSUTCDATETIME()
      WHERE id = ?
    `, [...values, req.params.id]);

    res.json({ success: true, message: "Location updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteLocation(req, res) {
  try {
    await ensureSchema();
    const { rows } = await db.query(
      "SELECT TOP 1 id FROM dbo.iot_plants WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Location not found" });

    await db.run(`
      DECLARE @plantCode VARCHAR(20);
      SELECT @plantCode = code FROM dbo.iot_plants WHERE id = ?;

      IF OBJECT_ID(N'dbo.line_master', N'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.line_master', 'updated_at') IS NOT NULL
          EXEC sp_executesql
            N'UPDATE dbo.line_master SET plant = NULL, plant_code = NULL, updated_at = SYSUTCDATETIME() WHERE plant_code = @code',
            N'@code VARCHAR(20)',
            @plantCode;
        ELSE
          EXEC sp_executesql
            N'UPDATE dbo.line_master SET plant = NULL, plant_code = NULL WHERE plant_code = @code',
            N'@code VARCHAR(20)',
            @plantCode;
      END;

      IF OBJECT_ID(N'dbo.iot_machines', N'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.iot_machines', 'line_id') IS NOT NULL
          EXEC sp_executesql
            N'UPDATE dbo.iot_machines SET plant_code = NULL, line_id = NULL WHERE plant_code = @code',
            N'@code VARCHAR(20)',
            @plantCode;
        ELSE
          EXEC sp_executesql
            N'UPDATE dbo.iot_machines SET plant_code = NULL WHERE plant_code = @code',
            N'@code VARCHAR(20)',
            @plantCode;
      END;

      IF OBJECT_ID(N'dbo.iot_departments', N'U') IS NOT NULL
        UPDATE dbo.iot_departments
        SET plant_code = NULL
        WHERE plant_code = @plantCode;

      DELETE FROM dbo.iot_plants WHERE id = ?;
    `, [req.params.id, req.params.id]);
    res.json({ success: true, message: "Location deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
};
