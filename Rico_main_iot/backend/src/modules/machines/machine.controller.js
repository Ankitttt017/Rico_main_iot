const db = require("../../config/db");

const TABLES = {
  parts: "iot_parts",
  operations: "iot_operations",
  machines: "iot_machines",
  machineStatus: "iot_machine_status",
  machineOperations: "iot_machine_operations",
};

const allowedStatuses = new Set(["RUNNING", "STOPPED", "IDLE"]);

function cleanStatus(status) {
  const normalized = String(status || "IDLE").trim().toUpperCase();
  return allowedStatuses.has(normalized) ? normalized : "IDLE";
}

function cleanMachine(row) {
  return {
    id: row.id,
    machine_code: row.machine_code || null,
    name: row.name || "Unknown machine",
    category: row.category || "Uncategorized",
    plant_code: row.plant_code || null,
    line_id: row.line_id || null,
    line_code: row.line_code || null,
    line_name: row.line_name || null,
    line_division: row.line_division || null,
    cost_center: row.cost_center || null,
    status: cleanStatus(row.status),
    part: row.part || "No part assigned",
    part_code: row.part_code || null,
    operation_no: row.operation_no || null,
    assigned_operation_count: Number(row.assigned_operation_count || 0),
    last_updated: row.last_updated || null,
  };
}

// GET /api/machines
const getMachines = async (req, res) => {
  try {
    const { plant } = req.query;
    const params = [];
    const where = plant ? "WHERE plant_code = ?" : "";
    if (plant) params.push(plant);

    const { rows } = await db.query(`
      WITH filtered_machines AS (
        SELECT
          id,
          machine_code,
          name,
          category,
          plant_code,
          line_id,
          line_code,
          line_name,
          line_division,
          cost_center
        FROM (
          SELECT
            m.id,
            m.machine_code,
            m.name,
            m.category,
            m.plant_code,
            m.line_id,
            lm.line_code,
            lm.line_name,
            lm.division AS line_division,
            m.cost_center
          FROM ${TABLES.machines} m
          LEFT JOIN dbo.line_master lm ON lm.line_id = m.line_id
        ) machine_rows
        ${where}
      ),
      latest_status AS (
        SELECT
          machine_id,
          status,
          part_code,
          operation_no,
          updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY machine_id
            ORDER BY
              CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END,
              updated_at DESC,
              CASE WHEN created_at IS NULL THEN 1 ELSE 0 END,
              created_at DESC,
              id DESC
          ) AS rn
        FROM ${TABLES.machineStatus}
        WHERE machine_id IN (SELECT id FROM filtered_machines)
      ),
      primary_operation AS (
        SELECT
          machine_id,
          part_code,
          operation_no,
          updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY machine_id
            ORDER BY is_primary DESC, updated_at DESC, id DESC
          ) AS rn
        FROM ${TABLES.machineOperations}
        WHERE is_active = 1
          AND machine_id IN (SELECT id FROM filtered_machines)
      ),
      operation_counts AS (
        SELECT machine_id, COUNT(*) AS assigned_operation_count
        FROM ${TABLES.machineOperations}
        WHERE is_active = 1
          AND machine_id IN (SELECT id FROM filtered_machines)
        GROUP BY machine_id
      )
      SELECT
        m.id,
        m.machine_code,
        COALESCE(m.name, m.machine_code, CONCAT('Machine ', m.id)) AS name,
        COALESCE(m.category, 'Uncategorized') AS category,
        m.plant_code,
        m.line_id,
        m.line_code,
        m.line_name,
        m.line_division,
        m.cost_center,
        COALESCE(ms.status, 'IDLE') AS status,
        COALESCE(po.part_code, ms.part_code) AS part_code,
        COALESCE(p.description, po.part_code, ms.part_code, 'No part assigned') AS part,
        COALESCE(po.operation_no, ms.operation_no) AS operation_no,
        COALESCE(oc.assigned_operation_count, 0) AS assigned_operation_count,
        COALESCE(po.updated_at, ms.updated_at) AS last_updated
      FROM filtered_machines m
      LEFT JOIN latest_status ms ON ms.machine_id = m.id AND ms.rn = 1
      LEFT JOIN primary_operation po ON po.machine_id = m.id AND po.rn = 1
      LEFT JOIN operation_counts oc ON oc.machine_id = m.id
      LEFT JOIN ${TABLES.parts} p ON p.material_code = COALESCE(po.part_code, ms.part_code)
      ORDER BY COALESCE(m.name, m.machine_code, CONCAT('Machine ', m.id)) ASC
    `, params);

    res.json(rows.map(cleanMachine));
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Unable to load machines",
      error: err.message,
    });
  }
};

// POST /api/machines
const createMachine = async (req, res) => {
  try {
    const {
      machine_code,
      name,
      category,
      plant_code = "1002",
      line_id = null,
      asset = null,
      cost_center = null,
    } = req.body;

    const code = String(machine_code || "").trim();
    if (!code || !String(name || "").trim()) {
      return res.status(400).json({ success: false, message: "Machine code and name are required" });
    }

    const { rows } = await db.run(
      `INSERT INTO ${TABLES.machines}
        (machine_code, name, category, plant_code, line_id, asset, cost_center)
       OUTPUT INSERTED.id
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, String(name).trim(), category || null, plant_code, line_id || null, asset, cost_center]
    );

    res.status(201).json({ success: true, id: rows[0]?.id, message: "Machine created" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to create machine", error: err.message });
  }
};

// PUT /api/machines/:id
const updateMachine = async (req, res) => {
  try {
    const fields = ["machine_code", "name", "category", "plant_code", "line_id", "asset", "cost_center"];
    const updates = fields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!updates.length) {
      return res.status(400).json({ success: false, message: "No machine fields supplied" });
    }

    await db.run(
      `UPDATE ${TABLES.machines}
       SET ${updates.map((field) => `${field} = ?`).join(", ")}
       WHERE id = ?`,
      [...updates.map((field) => req.body[field] === "" ? null : req.body[field]), req.params.id]
    );

    res.json({ success: true, message: "Machine updated" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to update machine", error: err.message });
  }
};

// DELETE /api/machines/:id
const deleteMachine = async (req, res) => {
  try {
    await db.run(`DELETE FROM ${TABLES.machineStatus} WHERE machine_id = ?`, [req.params.id]);
    await db.run(`DELETE FROM ${TABLES.machineOperations} WHERE machine_id = ?`, [req.params.id]);
    await db.run(`DELETE FROM ${TABLES.machines} WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: "Machine deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to delete machine", error: err.message });
  }
};

// GET /api/machines/:id/operations
const getMachineOperations = async (req, res) => {
  try {
    const { rows: currentRows } = await db.query(
      `SELECT TOP 1
         m.id AS machine_id,
         COALESCE(ms.status, 'IDLE') AS status,
         COALESCE(mo.part_code, ms.part_code) AS part_code,
         COALESCE(mo.operation_no, ms.operation_no) AS operation_no,
         COALESCE(mo.updated_at, ms.updated_at) AS updated_at
       FROM ${TABLES.machines} m
       OUTER APPLY (
         SELECT TOP 1 status, part_code, operation_no, updated_at
         FROM ${TABLES.machineStatus}
         WHERE machine_id = m.id
         ORDER BY
           CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END,
           updated_at DESC,
           id DESC
       ) ms
       OUTER APPLY (
         SELECT TOP 1 part_code, operation_no, updated_at
         FROM ${TABLES.machineOperations}
         WHERE machine_id = m.id AND is_active = 1
         ORDER BY is_primary DESC, updated_at DESC, id DESC
       ) mo
       WHERE m.id = ?`,
      [req.params.id]
    );

    const current = currentRows[0] || null;
    const params = [];
    let where = "WHERE 1 = 1";
    if (current?.part_code) {
      where += " AND o.part_code = ?";
      params.push(current.part_code);
    } else {
      where += " AND p.plant_code = ?";
      params.push(req.query.plant || "1002");
    }

    const { rows } = await db.query(
      `WITH candidates AS (
         SELECT TOP 100
           MIN(o.id) AS id,
           o.part_code,
           COALESCE(o.label, CAST(o.sr_no AS VARCHAR(50)), CONCAT('OP-', MIN(o.id))) AS operation_no,
           COALESCE(o.name, CONCAT('Operation ', COALESCE(o.label, CAST(o.sr_no AS VARCHAR(50))))) AS operation_name,
           COALESCE(o.type, 'Operation') AS type,
           p.description AS part_name
         FROM ${TABLES.operations} o
         LEFT JOIN ${TABLES.parts} p ON p.material_code = o.part_code
         ${where}
         GROUP BY o.part_code, o.label, o.sr_no, o.name, o.type, p.description
       )
       SELECT
         c.*,
         CASE WHEN mo.id IS NULL THEN 0 ELSE 1 END AS assigned,
         COALESCE(mo.is_primary, 0) AS is_primary
       FROM candidates c
       LEFT JOIN ${TABLES.machineOperations} mo
         ON mo.machine_id = ?
        AND mo.part_code = c.part_code
        AND UPPER(TRIM(mo.operation_no)) = UPPER(TRIM(c.operation_no))
        AND mo.is_active = 1
       ORDER BY COALESCE(mo.is_primary, 0) DESC, c.part_code, c.operation_no`,
      [...params, req.params.id]
    );

    res.json({ success: true, current, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to load machine operations", error: err.message });
  }
};

// PUT /api/machines/:id/operation
const assignMachineOperation = async (req, res) => {
  try {
    const operationNo = String(req.body.operation_no || "").trim();
    if (!operationNo) {
      return res.status(400).json({ success: false, message: "Operation is required" });
    }
    const partCode = String(req.body.part_code || "").trim();

    const { rows: latestRows } = await db.query(
      `SELECT TOP 1 status, part_code
       FROM ${TABLES.machineStatus}
       WHERE machine_id = ?
       ORDER BY
         CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END,
         updated_at DESC,
         id DESC`,
      [req.params.id]
    );

    const latest = latestRows[0] || {};
    const nextPartCode = partCode || latest.part_code || null;
    const { rows: operationRows } = nextPartCode
      ? await db.query(
        `SELECT TOP 1 id
         FROM ${TABLES.operations}
         WHERE part_code = ?
           AND (
             UPPER(TRIM(?)) = UPPER(TRIM(label))
             OR UPPER(TRIM(?)) = UPPER(TRIM(CAST(sr_no AS VARCHAR(50))))
             OR REPLACE(REPLACE(UPPER(TRIM(?)), 'OP-', ''), 'OP', '') =
                REPLACE(REPLACE(UPPER(TRIM(COALESCE(label, CAST(sr_no AS VARCHAR(50))))), 'OP-', ''), 'OP', '')
           )
         ORDER BY CASE WHEN sr_no IS NULL THEN 1 ELSE 0 END, sr_no, id`,
        [nextPartCode, operationNo, operationNo, operationNo]
      )
      : { rows: [] };

    if (nextPartCode) {
      await db.run(
        `UPDATE ${TABLES.machineOperations}
         SET is_primary = 0, updated_at = SYSUTCDATETIME()
         WHERE machine_id = ? AND is_active = 1`,
        [req.params.id]
      );

      await db.run(
        `MERGE ${TABLES.machineOperations} AS target
         USING (
           SELECT
             ? AS machine_id,
             ? AS part_code,
             ? AS operation_id,
             ? AS operation_no
         ) AS source
         ON target.machine_id = source.machine_id
          AND target.part_code = source.part_code
          AND target.operation_no = source.operation_no
         WHEN MATCHED THEN
           UPDATE SET operation_id = source.operation_id, is_primary = 1, is_active = 1, updated_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN
           INSERT (machine_id, part_code, operation_id, operation_no, is_primary, is_active)
           VALUES (source.machine_id, source.part_code, source.operation_id, source.operation_no, 1, 1);`,
        [req.params.id, nextPartCode, operationRows[0]?.id || null, operationNo]
      );
    }

    await db.run(
      `INSERT INTO ${TABLES.machineStatus} (machine_id, status, part_code, operation_no, updated_at)
       VALUES (?, ?, ?, ?, SYSUTCDATETIME())`,
      [
        req.params.id,
        cleanStatus(req.body.status || latest.status || "IDLE"),
        nextPartCode,
        operationNo,
      ]
    );

    res.json({ success: true, message: "Machine operation assigned" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Unable to assign operation", error: err.message });
  }
};

// GET /api/machines/:id/status-history
const getMachineStatusHistory = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         id,
         machine_id,
         status,
         part_code,
         operation_no,
         updated_at,
         created_at
       FROM ${TABLES.machineStatus}
       WHERE machine_id = ?
       ORDER BY
         CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END,
         updated_at ASC,
         CASE WHEN created_at IS NULL THEN 1 ELSE 0 END,
         created_at ASC,
         id ASC`,
      [req.params.id]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Unable to load machine status history",
      error: err.message,
    });
  }
};

module.exports = {
  getMachines,
  createMachine,
  updateMachine,
  deleteMachine,
  getMachineOperations,
  assignMachineOperation,
  getMachineStatusHistory,
};
