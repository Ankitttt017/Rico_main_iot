const db = require('../../config/db');
const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const TABLES = {
  plants: 'iot_plants',
  materials: 'iot_materials',
  parts: 'iot_parts',
  partPlants: 'iot_part_plants',
  operations: 'iot_operations',
  machines: 'iot_machines',
  machineStatus: 'iot_machine_status',
  machineOperations: 'iot_machine_operations',
  processFlow: 'iot_process_flow_diagrams',
  inspection: 'iot_inspection_sheets',
  controlPlan: 'iot_control_plan_charts',
};

function nullSafeEquals(column, placeholder = '?') {
  return `EXISTS (SELECT ${column} INTERSECT SELECT ${placeholder})`;
}

// GET /api/plants
const getAllPlants = async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM ${TABLES.plants} ORDER BY name`);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/parts?plant=GURUGRAM&search=brake&group=FINISHED&status=ENABLED&page=1&limit=50
const getPartsByPlant = async (req, res) => {
  try {
    const { plant, search, group, status, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];

    let whereClauses = [];
    const typeWhereClauses = [];
    const typeParams = [];

    if (plant) {
      const clause = 'COALESCE(pp.plant_code, p.plant_code) = ?';
      whereClauses.push(clause);
      typeWhereClauses.push(clause);
      params.push(plant);
      typeParams.push(plant);
    }
    if (search) {
      const clause = '(LOWER(p.description) LIKE ? OR p.material_code LIKE ?)';
      const values = [`%${search.toLowerCase()}%`, `%${search}%`];
      whereClauses.push(clause);
      typeWhereClauses.push(clause);
      params.push(...values);
      typeParams.push(...values);
    }
    if (group) {
      whereClauses.push('COALESCE(pp.material_group, p.material_group) = ?');
      params.push(group);
    }
    if (status) {
      const clause = 'UPPER(COALESCE(p.status, ?)) = ?';
      const values = ['ENABLED', String(status).toUpperCase()];
      whereClauses.push(clause);
      typeWhereClauses.push(clause);
      params.push(...values);
      typeParams.push(...values);
    }

    const where = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const typeWhere = typeWhereClauses.length ? 'WHERE ' + typeWhereClauses.join(' AND ') : '';

    // Fetch parts
    const { rows } = await db.query(
      `SELECT
        p.id,
        p.sl_no,
        p.material_code,
        p.description,
        COALESCE(pp.plant_code, p.plant_code) AS plant_code,
        COALESCE(pp.storage_location, p.storage_location) AS storage_location,
        COALESCE(pp.unit_of_measure, p.unit_of_measure) AS unit_of_measure,
        COALESCE(pp.material_group, p.material_group) AS material_group,
        p.cycle_time_sec,
        p.box_quantity,
        p.customer,
        p.opn_number,
        p.final_opn_code,
        p.manufacturing_type,
        p.total_produced,
        p.status,
        p.version,
        p.registered_on,
        p.registered_by,
        p.revision_date,
        p.revised_by,
        p.created_at,
        (SELECT COUNT(*) FROM ${TABLES.operations} o WHERE o.part_code = p.material_code) AS operation_count
       FROM ${TABLES.parts} p
       LEFT JOIN ${TABLES.partPlants} pp ON pp.part_code = p.material_code
       ${where}
       ORDER BY p.sl_no ASC
       OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
      [...params, offset, parseInt(limit)]
    );

    // Count totals
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total
       FROM ${TABLES.parts} p
       LEFT JOIN ${TABLES.partPlants} pp ON pp.part_code = p.material_code
       ${where}`, params
    );

    // Stats
    const { rows: statsRows } = await db.query(
      `SELECT 
         COUNT(DISTINCT COALESCE(pp.material_group, p.material_group)) as part_types,
         SUM(CASE WHEN COALESCE(operation_counts.operation_count, 0) > 0 THEN 1 ELSE 0 END) as linked,
         SUM(CASE WHEN COALESCE(operation_counts.operation_count, 0) = 0 THEN 1 ELSE 0 END) as unlinked
       FROM ${TABLES.parts} p
       LEFT JOIN ${TABLES.partPlants} pp ON pp.part_code = p.material_code
       LEFT JOIN (
         SELECT part_code, COUNT(*) AS operation_count
         FROM ${TABLES.operations}
         GROUP BY part_code
       ) operation_counts ON operation_counts.part_code = p.material_code
       ${where}`,
      params
    );

    const { rows: groupRows } = await db.query(
      `SELECT
         COALESCE(pp.material_group, p.material_group) AS value,
         COUNT(*) AS total
       FROM ${TABLES.parts} p
       LEFT JOIN ${TABLES.partPlants} pp ON pp.part_code = p.material_code
       ${typeWhere}
       GROUP BY COALESCE(pp.material_group, p.material_group)
       HAVING COALESCE(pp.material_group, p.material_group) IS NOT NULL
          AND COALESCE(pp.material_group, p.material_group) <> ''
       ORDER BY value`,
      typeParams
    );

    res.json({
      success: true,
      data: rows,
      total: countRows[0]?.total || 0,
      stats: statsRows[0] || { part_types: 0, linked: 0, unlinked: 0 },
      groups: groupRows,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/parts/:id
const getPartById = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLES.parts} WHERE material_code = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Part not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/parts/:id
const updatePartById = async (req, res) => {
  try {
    const allowedFields = [
      'final_opn_code',
      'opn_number',
      'customer',
      'plant_code',
      'manufacturing_type',
      'status',
    ];
    const updates = allowedFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No editable fields supplied' });
    }

    const params = updates.map((field) => {
      if (field === 'status') {
        return String(req.body[field] || 'ENABLED').toUpperCase() === 'DISABLED' ? 'DISABLED' : 'ENABLED';
      }
      return req.body[field] || null;
    });
    await db.run(
      `UPDATE ${TABLES.parts} SET ${updates.map((field) => `${field} = ?`).join(', ')} WHERE material_code = ?`,
      [...params, req.params.id]
    );

    const { rows } = await db.query(`SELECT * FROM ${TABLES.parts} WHERE material_code = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Part not found' });

    res.json({ success: true, data: rows[0], message: 'Part updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/parts/:id/operations
const getPartOperations = async (req, res) => {
  try {
    const { rows } = await db.query(
      `WITH status_operations AS (
         SELECT
           part_code,
           operation_no,
           MIN(id) AS status_id,
           MAX(updated_at) AS last_seen
         FROM ${TABLES.machineStatus}
         WHERE part_code = ?
           AND NULLIF(TRIM(operation_no), '') IS NOT NULL
         GROUP BY part_code, operation_no
       ),
       assigned_operations AS (
         SELECT
           part_code,
           operation_no,
           MIN(id) AS assignment_id,
           MAX(updated_at) AS last_seen
         FROM ${TABLES.machineOperations}
         WHERE part_code = ?
           AND is_active = 1
           AND NULLIF(TRIM(operation_no), '') IS NOT NULL
         GROUP BY part_code, operation_no
       ),
       deduped_operations AS (
         SELECT
           MIN(id) AS id,
           part_code,
           sr_no,
           name,
           type,
           label,
           rework,
           MIN(created_at) AS created_at
         FROM ${TABLES.operations}
         WHERE part_code = ?
         GROUP BY part_code, sr_no, name, type, label, rework
       ),
       operation_keys AS (
         SELECT
           o.part_code,
           COALESCE(o.label, CAST(o.sr_no AS VARCHAR(50)), CONCAT('OP-', o.id)) AS operation_no,
           o.id AS source_id,
           o.created_at AS last_seen
         FROM deduped_operations o
         UNION
         SELECT part_code, operation_no, status_id, last_seen FROM status_operations
         UNION
         SELECT part_code, operation_no, assignment_id, last_seen FROM assigned_operations
       ),
       ranked_operations AS (
         SELECT
           COALESCE(o.id, ok.source_id) AS id,
           ok.part_code,
           o.sr_no,
           COALESCE(o.name, CONCAT('Operation ', ok.operation_no)) AS name,
           COALESCE(o.type, 'RECORDED') AS type,
           COALESCE(o.label, ok.operation_no) AS label,
           COALESCE(o.rework, 'No rework assigned') AS rework,
           ok.operation_no,
           ok.last_seen,
           o.created_at,
           ROW_NUMBER() OVER (
             PARTITION BY ok.operation_no
             ORDER BY CASE WHEN o.sr_no IS NULL THEN 1 ELSE 0 END, o.sr_no, o.id
           ) AS rn
         FROM operation_keys ok
         LEFT JOIN deduped_operations o
           ON o.part_code = ok.part_code
          AND (
            UPPER(TRIM(ok.operation_no)) = UPPER(TRIM(o.label))
            OR UPPER(TRIM(ok.operation_no)) = UPPER(TRIM(CAST(o.sr_no AS VARCHAR(50))))
            OR REPLACE(REPLACE(UPPER(TRIM(ok.operation_no)), 'OP-', ''), 'OP', '') =
               REPLACE(REPLACE(UPPER(TRIM(COALESCE(o.label, CAST(o.sr_no AS VARCHAR(50))))), 'OP-', ''), 'OP', '')
          )
       ),
       mapped_operations AS (
         SELECT id, part_code, sr_no, name, type, label, rework, operation_no, last_seen, created_at
         FROM ranked_operations
         WHERE rn = 1
       )
       SELECT
         o.*,
         ISNULL(machine_json.machines, '[]') AS machines
       FROM mapped_operations o
       OUTER APPLY (
         SELECT
           m.id,
           m.machine_code AS machineCode,
           COALESCE(m.name, m.machine_code) AS name,
           ms.status,
           ms.updated_at AS lastSeen
         FROM ${TABLES.machineOperations} mo
         LEFT JOIN ${TABLES.machines} m ON m.id = mo.machine_id
         OUTER APPLY (
           SELECT TOP 1 status, updated_at
           FROM ${TABLES.machineStatus}
           WHERE machine_id = mo.machine_id
           ORDER BY
             CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END,
             updated_at DESC,
             id DESC
         ) ms
         WHERE m.id IS NOT NULL
           AND mo.is_active = 1
           AND mo.part_code = o.part_code
           AND (
             UPPER(TRIM(mo.operation_no)) = UPPER(TRIM(o.operation_no))
             OR UPPER(TRIM(mo.operation_no)) = UPPER(TRIM(o.label))
             OR REPLACE(REPLACE(UPPER(TRIM(mo.operation_no)), 'OP-', ''), 'OP', '') =
                REPLACE(REPLACE(UPPER(TRIM(o.label)), 'OP-', ''), 'OP', '')
           )
         FOR JSON PATH
       ) machine_json(machines)
       ORDER BY
         CASE WHEN o.last_seen IS NULL THEN 1 ELSE 0 END,
         o.last_seen DESC,
         CASE WHEN o.sr_no IS NULL THEN 1 ELSE 0 END,
         o.sr_no,
         CASE WHEN o.label IS NULL THEN 1 ELSE 0 END,
         o.label,
         o.id`,
      [req.params.id, req.params.id, req.params.id]
    );
    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        machines: normalizeMachinesJson(row.machines),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/operations?plant=1002&part=80000000&search=die&page=1&limit=10
const getOperationMaster = async (req, res) => {
  try {
    const { plant, part, search, page = 1, limit = 10 } = req.query;
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNumber - 1) * pageSize;
    const params = [];
    const whereClauses = [];

    if (plant) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM ${TABLES.partPlants} pp
        WHERE pp.part_code = p.material_code AND pp.plant_code = ?
      )`);
      params.push(plant);
    }
    if (part) {
      whereClauses.push('o.part_code = ?');
      params.push(part);
    }
    if (search) {
      whereClauses.push(`(
        LOWER(COALESCE(o.name, '')) LIKE ?
        OR LOWER(COALESCE(o.label, '')) LIKE ?
        OR LOWER(COALESCE(o.type, '')) LIKE ?
        OR LOWER(COALESCE(p.description, '')) LIKE ?
        OR LOWER(COALESCE(o.part_code, '')) LIKE ?
      )`);
      const term = `%${String(search).toLowerCase()}%`;
      params.push(term, term, term, term, term);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const baseQuery = `
      WITH filtered_operations AS (
        SELECT
          MIN(o.id) AS id,
          o.part_code,
          o.sr_no,
          o.label AS operation_id,
          o.name AS operation_name,
          o.type,
          o.rework,
          MIN(o.created_at) AS created_at
        FROM ${TABLES.operations} o
        LEFT JOIN ${TABLES.parts} p ON p.material_code = o.part_code
        ${where}
        GROUP BY o.part_code, o.sr_no, o.label, o.name, o.type, o.rework
      )
    `;

    const { rows: countRows } = await db.query(
      `${baseQuery} SELECT COUNT(*) AS total FROM filtered_operations`,
      params
    );

    const { rows: statsRows } = await db.query(
      `${baseQuery}
       SELECT
         COUNT(*) AS total,
         COUNT(DISTINCT CASE WHEN type IS NOT NULL AND type <> '' THEN type END) AS types,
         SUM(CASE WHEN part_code IS NOT NULL AND part_code <> '' THEN 1 ELSE 0 END) AS linked,
         0 AS unlinked
       FROM filtered_operations`,
      params
    );

    const { rows } = await db.query(
      `${baseQuery}
       SELECT
         d.id,
         d.sr_no,
         d.operation_id,
         d.operation_name,
         d.type,
         d.rework,
         d.part_code,
         p.description AS linked_part,
         COALESCE(pp.plant_code, p.plant_code) AS plant_code,
         d.created_at AS modified_at,
         COALESCE(machine_counts.machine_count, 0) AS machine_count
       FROM filtered_operations d
       LEFT JOIN ${TABLES.parts} p ON p.material_code = d.part_code
       LEFT JOIN ${TABLES.partPlants} pp
         ON pp.part_code = p.material_code
        AND ${plant ? 'pp.plant_code = ?' : '1 = 1'}
       LEFT JOIN (
         SELECT part_code, operation_no, COUNT(DISTINCT machine_id) AS machine_count
         FROM ${TABLES.machineOperations}
         WHERE is_active = 1
         GROUP BY part_code, operation_no
       ) machine_counts
         ON machine_counts.part_code = d.part_code
       AND (
          UPPER(TRIM(machine_counts.operation_no)) = UPPER(TRIM(d.operation_id))
          OR UPPER(TRIM(machine_counts.operation_no)) = UPPER(TRIM(CAST(d.sr_no AS VARCHAR(50))))
          OR REPLACE(REPLACE(UPPER(TRIM(machine_counts.operation_no)), 'OP-', ''), 'OP', '') =
             REPLACE(REPLACE(UPPER(TRIM(COALESCE(d.operation_id, CAST(d.sr_no AS VARCHAR(50))))), 'OP-', ''), 'OP', '')
        )
       ORDER BY
         CASE WHEN d.sr_no IS NULL THEN 1 ELSE 0 END,
         d.sr_no,
         CASE WHEN d.operation_id IS NULL THEN 1 ELSE 0 END,
         d.operation_id,
         d.id
       OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
      [...params, ...(plant ? [plant] : []), offset, pageSize]
    );

    res.json({
      success: true,
      data: rows,
      total: Number(countRows[0]?.total || 0),
      stats: {
        total: Number(statsRows[0]?.total || 0),
        types: Number(statsRows[0]?.types || 0),
        linked: Number(statsRows[0]?.linked || 0),
        unlinked: Number(statsRows[0]?.unlinked || 0),
      },
      page: pageNumber,
      limit: pageSize,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/parts/:id/operations/:operationId
const updatePartOperation = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLES.operations} WHERE id = ? AND part_code = ?`,
      [req.params.operationId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Operation not found' });

    const current = rows[0];
    const next = {
      sr_no: req.body.sr_no === '' || req.body.sr_no == null ? null : Number(req.body.sr_no),
      name: req.body.name || null,
      type: req.body.type || null,
      label: req.body.label || null,
      rework: req.body.rework || 'No rework assigned',
    };

    await db.run(
      `UPDATE ${TABLES.operations}
       SET sr_no = ?, name = ?, type = ?, label = ?, rework = ?
       WHERE part_code = ?
         AND ${nullSafeEquals('sr_no')}
         AND ${nullSafeEquals('name')}
         AND ${nullSafeEquals('type')}
         AND ${nullSafeEquals('label')}
         AND ${nullSafeEquals('rework')}`,
      [
        next.sr_no,
        next.name,
        next.type,
        next.label,
        next.rework,
        req.params.id,
        current.sr_no,
        current.name,
        current.type,
        current.label,
        current.rework,
      ]
    );

    res.json({ success: true, message: 'Operation updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/parts/:id/operations/:operationId
const deletePartOperation = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM ${TABLES.operations} WHERE id = ? AND part_code = ?`,
      [req.params.operationId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Operation not found' });

    const current = rows[0];
    await db.run(
      `DELETE FROM ${TABLES.operations}
       WHERE part_code = ?
         AND ${nullSafeEquals('sr_no')}
         AND ${nullSafeEquals('name')}
         AND ${nullSafeEquals('type')}
         AND ${nullSafeEquals('label')}
         AND ${nullSafeEquals('rework')}`,
      [req.params.id, current.sr_no, current.name, current.type, current.label, current.rework]
    );

    res.json({ success: true, message: 'Operation removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const sheetTables = {
  processFlow: TABLES.processFlow,
  inspection: TABLES.inspection,
  controlPlan: TABLES.controlPlan,
};

const sheetSelect = `
  SELECT
    id,
    upload_date AS uploadDate,
    version,
    file_name AS fileName,
    file_path AS filePath,
    updated_by AS updatedBy
`;

function safeFileName(fileName) {
  return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function saveUploadedFile(partCode, type, fileName, fileData) {
  if (!fileData) return null;

  const base64 = String(fileData).includes(',')
    ? String(fileData).split(',').pop()
    : String(fileData);
  const dir = path.join(UPLOAD_ROOT, partCode, type);
  fs.mkdirSync(dir, { recursive: true });

  const storedName = `${Date.now()}-${safeFileName(fileName)}`;
  const fullPath = path.join(dir, storedName);
  fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
  return path.relative(path.join(__dirname, '../..'), fullPath).replace(/\\/g, '/');
}

function normalizeMachinesJson(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((machine) => machine && machine.id);
  } catch (_error) {
    return [];
  }
}

// GET /api/parts/:id/sheets
const getPartSheets = async (req, res) => {
  try {
    const result = {};
    for (const [key, table] of Object.entries(sheetTables)) {
      const { rows } = await db.query(
        `${sheetSelect} FROM ${table} WHERE part_code = ? ORDER BY id DESC`,
        [req.params.id]
      );
      result[key] = rows;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/parts/:id/sheets/:type
const uploadPartSheet = async (req, res) => {
  try {
    const table = sheetTables[req.params.type];
    if (!table) return res.status(400).json({ success: false, message: 'Invalid sheet type' });

    const { fileName, version, updatedBy, fileData } = req.body;
    if (!fileName) return res.status(400).json({ success: false, message: 'File name is required' });

    const uploadDate = new Date().toISOString().slice(0, 10);
    const filePath = saveUploadedFile(req.params.id, req.params.type, fileName, fileData);
    await db.run(
      `INSERT INTO ${table} (part_code, upload_date, version, file_name, file_path, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, uploadDate, version || 'V1', fileName, filePath, updatedBy || 'Admin']
    );

    const { rows } = await db.query(
      `${sheetSelect} FROM ${table} WHERE part_code = ? ORDER BY id DESC`,
      [req.params.id]
    );

    res.status(201).json({ success: true, data: rows, message: 'Sheet uploaded' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/parts/:id/sheets/:type/:sheetId/download
const downloadPartSheet = async (req, res) => {
  try {
    const table = sheetTables[req.params.type];
    if (!table) return res.status(400).json({ success: false, message: 'Invalid sheet type' });

    const { rows } = await db.query(
      `SELECT file_name, file_path FROM ${table} WHERE id = ? AND part_code = ?`,
      [req.params.sheetId, req.params.id]
    );
    if (!rows.length || !rows[0].file_path) {
      return res.status(404).json({ success: false, message: 'Sheet file not found' });
    }

    const fullPath = path.resolve(path.join(__dirname, '../..'), rows[0].file_path);
    if (!fullPath.startsWith(path.resolve(path.join(__dirname, '../..', 'uploads')))) {
      return res.status(400).json({ success: false, message: 'Invalid sheet path' });
    }

    res.download(fullPath, rows[0].file_name);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/parts/:id/configuration
const getPartConfiguration = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT cycle_time_sec, box_quantity, manufacturing_type, total_produced FROM ${TABLES.parts} WHERE material_code = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Part not found' });
    const p = rows[0];
    res.json({
      success: true,
      data: {
        hourlyTarget: p.cycle_time_sec ? Math.floor(3600 / p.cycle_time_sec) : 0,
        cycletime: p.cycle_time_sec || 0,
        boxQuantity: p.box_quantity || 0,
        manufacturingType: p.manufacturing_type || '',
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/parts/:id/configuration
const updatePartConfiguration = async (req, res) => {
  try {
    const { cycletime, hourlyTarget, boxQuantity, manufacturingType } = req.body;
    const nextCycleTime = cycletime || (hourlyTarget ? Math.round(3600 / Number(hourlyTarget)) : 0);
    await db.run(
      `UPDATE ${TABLES.parts} SET cycle_time_sec = ?, box_quantity = ?, manufacturing_type = ? WHERE material_code = ?`,
      [nextCycleTime, boxQuantity || 0, manufacturingType, req.params.id]
    );
    res.json({ success: true, message: 'Configuration updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/materials?plant=GURUGRAM&group=RAWMAT
const getMaterials = async (req, res) => {
  try {
    const { plant, group, search, limit = 50 } = req.query;
    const params = [];
    let whereClauses = [];

    if (plant) { whereClauses.push('plant_code = ?'); params.push(plant); }
    if (group) { whereClauses.push('material_group = ?'); params.push(group); }
    if (search) {
      whereClauses.push('(LOWER(description) LIKE ? OR material_code LIKE ?)');
      params.push(`%${search.toLowerCase()}%`, `%${search}%`);
    }

    const where = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT * FROM ${TABLES.materials} ${where} ORDER BY material_code OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY`,
      [...params, parseInt(limit)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/stats?plant=GURUGRAM
const getStats = async (req, res) => {
  try {
    const { plant } = req.query;
    const params = plant ? [plant] : [];
    const partWhere = plant ? 'WHERE COALESCE(pp.plant_code, p.plant_code) = ?' : '';
    const materialWhere = plant ? 'WHERE plant_code = ?' : '';

    const { rows: partStats } = await db.query(
      `SELECT 
         COUNT(*) as total_parts,
         COUNT(DISTINCT COALESCE(pp.material_group, p.material_group)) as material_groups,
         COUNT(DISTINCT customer) as customers,
         COUNT(DISTINCT manufacturing_type) as mfg_types
       FROM ${TABLES.parts} p
       LEFT JOIN ${TABLES.partPlants} pp ON pp.part_code = p.material_code
       ${partWhere}`, params
    );
    const { rows: matStats } = await db.query(
      `SELECT COUNT(*) as total_materials FROM ${TABLES.materials} ${materialWhere}`, params
    );
    const { rows: machineStats } = await db.query(
      `SELECT COUNT(*) as total_machines FROM ${TABLES.machines} ${materialWhere}`, params
    );
    const { rows: lineStats } = await db.query(
      `SELECT COUNT(*) as total_lines FROM dbo.line_master ${materialWhere}`, params
    );
    const { rows: mfgBreakdown } = await db.query(
      `SELECT p.manufacturing_type, COUNT(*) as count 
       FROM ${TABLES.parts} p
       LEFT JOIN ${TABLES.partPlants} pp ON pp.part_code = p.material_code
       ${partWhere}
       GROUP BY p.manufacturing_type ORDER BY count DESC`, params
    );

    res.json({
      success: true,
      data: {
        ...partStats[0],
        total_materials: matStats[0]?.total_materials || 0,
        total_machines: machineStats[0]?.total_machines || 0,
        total_lines: lineStats[0]?.total_lines || 0,
        manufacturing_breakdown: mfgBreakdown,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllPlants, getPartsByPlant, getPartById, updatePartById,
  getOperationMaster,
  getPartOperations, updatePartOperation, deletePartOperation,
  getPartConfiguration, updatePartConfiguration,
  getPartSheets, uploadPartSheet, downloadPartSheet,
  getMaterials, getStats,
};
