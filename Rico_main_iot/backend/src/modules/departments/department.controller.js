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
      IF OBJECT_ID(N'dbo.iot_departments', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.iot_departments (
          id BIGINT IDENTITY(1,1) PRIMARY KEY,
          code VARCHAR(40) NOT NULL,
          name NVARCHAR(160) NOT NULL,
          plant_code VARCHAR(20) NULL,
          description NVARCHAR(300) NULL,
          is_active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
      END;
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_iot_departments_code_plant')
        CREATE UNIQUE INDEX ux_iot_departments_code_plant ON dbo.iot_departments (code, plant_code);
    `).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function listDepartments(req, res) {
  try {
    await ensureSchema();
    const params = [];
    const where = [];
    if (req.query.plant) {
      where.push("(plant_code = ? OR plant_code IS NULL)");
      params.push(req.query.plant);
    }
    if (req.query.active === "1" || req.query.active === "true") where.push("is_active = 1");

    const { rows } = await db.query(`
      SELECT id, code, name, plant_code, description, is_active, created_at, updated_at
      FROM dbo.iot_departments
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY name
    `, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createDepartment(req, res) {
  try {
    await ensureSchema();
    const code = cleanCode(req.body.code);
    const name = cleanText(req.body.name);
    if (!code || !name) {
      return res.status(400).json({ success: false, message: "Department code and name are required" });
    }
    const result = await db.run(`
      INSERT INTO dbo.iot_departments (code, name, plant_code, description, is_active)
      OUTPUT INSERTED.id
      VALUES (?, ?, ?, ?, ?)
    `, [code, name, cleanText(req.body.plant_code), cleanText(req.body.description), req.body.is_active === false ? 0 : 1]);
    res.status(201).json({ success: true, id: result.rows[0]?.id, message: "Department created" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateDepartment(req, res) {
  try {
    await ensureSchema();
    const allowed = ["code", "name", "plant_code", "description", "is_active"];
    const updates = allowed.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!updates.length) return res.status(400).json({ success: false, message: "No department fields supplied" });
    const values = updates.map((field) => {
      if (field === "code") return cleanCode(req.body[field]);
      if (field === "is_active") return req.body[field] === false || req.body[field] === 0 ? 0 : 1;
      return cleanText(req.body[field]);
    });
    await db.run(`
      UPDATE dbo.iot_departments
      SET ${updates.map((field) => `${field} = ?`).join(", ")}, updated_at = SYSUTCDATETIME()
      WHERE id = ?
    `, [...values, req.params.id]);
    res.json({ success: true, message: "Department updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteDepartment(req, res) {
  try {
    await ensureSchema();
    const { rows } = await db.query("SELECT TOP 1 code, name FROM dbo.iot_departments WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Department not found" });
    const department = rows[0];

    await db.run(`
      IF OBJECT_ID(N'dbo.line_master', N'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.line_master', 'updated_at') IS NOT NULL
          EXEC sp_executesql
            N'UPDATE dbo.line_master SET division = NULL, updated_at = SYSUTCDATETIME() WHERE division = @code OR division = @name',
            N'@code VARCHAR(40), @name NVARCHAR(160)',
            @code = ?, @name = ?;
        ELSE
          EXEC sp_executesql
            N'UPDATE dbo.line_master SET division = NULL WHERE division = @code OR division = @name',
            N'@code VARCHAR(40), @name NVARCHAR(160)',
            @code = ?, @name = ?;
      END;

      IF OBJECT_ID(N'dbo.iot_machines', N'U') IS NOT NULL AND COL_LENGTH('dbo.iot_machines', 'category') IS NOT NULL
        EXEC sp_executesql
          N'UPDATE dbo.iot_machines SET category = NULL WHERE category = @code OR category = @name',
          N'@code VARCHAR(40), @name NVARCHAR(160)',
          @code = ?, @name = ?;
    `, [department.code, department.name, department.code, department.name, department.code, department.name]);

    await db.run("DELETE FROM dbo.iot_departments WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Department deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  ensureSchema,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
};
