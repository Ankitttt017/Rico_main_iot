const db = require('../config/db');

const OPERATION_MASTER = [
  ['OP-10', 'Incoming Inspection (Aluminium Alloy Ingots)'],
  ['OP-20A', 'Melting of Aluminium Alloy Ingots'],
  ['OP-20B', 'Degassing & Metal Treatment of Molten Metal'],
  ['OP-20C', 'Holding of Molten Metal for Casting'],
  ['OP-30', 'Die Casting'],
  ['OP-40', 'Trimming'],
  ['OP-50', 'Shot Blasting'],
  ['OP-50B', 'Final Inspection (Casting)'],
  ['OP-60', 'Face Milling, Drilling, Reaming, Tapping & Boring'],
  ['OP-70', 'Pre-Inspection'],
  ['OP-80', 'Marking (Dot Marking)'],
  ['OP-90', 'Leak Testing'],
  ['OP-100', 'Ultrasonic Washing'],
  ['OP-110', 'Final Inspection / Visual Inspection'],
  ['OP-120', 'Packaging'],
].map(([operation_no, operation_name]) => ({ operation_no, operation_name }));

const operationMap = new Map(OPERATION_MASTER.map((operation) => [operation.operation_no, operation.operation_name]));

const PROTOCOLS = {
  SLMP: 'SLMP',
  TCP_IP: 'TCP/IP',
};

let lineSchemaReadyPromise = null;

function ensureLineSchema() {
  if (!lineSchemaReadyPromise) {
    lineSchemaReadyPromise = db.run(`
      IF COL_LENGTH('dbo.line_master', 'part_code') IS NULL
        ALTER TABLE dbo.line_master ADD part_code VARCHAR(40) NULL;
      IF COL_LENGTH('dbo.line_master', 'part_name') IS NULL
        ALTER TABLE dbo.line_master ADD part_name NVARCHAR(200) NULL;
      IF COL_LENGTH('dbo.line_master', 'customer_name') IS NULL
        ALTER TABLE dbo.line_master ADD customer_name NVARCHAR(200) NULL;
      IF COL_LENGTH('dbo.line_master', 'description') IS NULL
        ALTER TABLE dbo.line_master ADD description NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.line_master', 'is_active') IS NULL
        ALTER TABLE dbo.line_master ADD is_active BIT NOT NULL CONSTRAINT df_line_master_is_active DEFAULT 1;
      IF COL_LENGTH('dbo.line_master', 'created_at') IS NULL
        ALTER TABLE dbo.line_master ADD created_at DATETIME2 NOT NULL CONSTRAINT df_line_master_created_at DEFAULT SYSUTCDATETIME();
      IF COL_LENGTH('dbo.line_master', 'updated_at') IS NULL
        ALTER TABLE dbo.line_master ADD updated_at DATETIME2 NOT NULL CONSTRAINT df_line_master_updated_at DEFAULT SYSUTCDATETIME();

      IF COL_LENGTH('dbo.iot_machines', 'line_id') IS NULL
        ALTER TABLE dbo.iot_machines ADD line_id INT NULL;
      IF COL_LENGTH('dbo.iot_machines', 'operation_no') IS NULL
        ALTER TABLE dbo.iot_machines ADD operation_no VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.iot_machines', 'operation_name') IS NULL
        ALTER TABLE dbo.iot_machines ADD operation_name NVARCHAR(200) NULL;
      IF COL_LENGTH('dbo.iot_machines', 'ip_address') IS NULL
        ALTER TABLE dbo.iot_machines ADD ip_address VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.iot_machines', 'port') IS NULL
        ALTER TABLE dbo.iot_machines ADD port VARCHAR(20) NULL;
      IF COL_LENGTH('dbo.iot_machines', 'protocol') IS NULL
        ALTER TABLE dbo.iot_machines ADD protocol VARCHAR(30) NULL;
      IF COL_LENGTH('dbo.iot_machines', 'part_name') IS NULL
        ALTER TABLE dbo.iot_machines ADD part_name NVARCHAR(200) NULL;
    `).catch((err) => {
      lineSchemaReadyPromise = null;
      throw err;
    });
  }
  return lineSchemaReadyPromise;
}

function normalizeOperation(operationNo) {
  const operation_no = String(operationNo || '').trim();
  if (!operation_no) return { operation_no: null, operation_name: null };
  return {
    operation_no,
    operation_name: operationMap.get(operation_no) || null,
  };
}

function normalizeProtocol(protocol) {
  const value = String(protocol || '').trim();
  const compact = value.replace(/[\s_-]+/g, '').toUpperCase();
  if (!compact) return null;
  if (compact === 'SLMP') return PROTOCOLS.SLMP;
  if (compact === 'TCP/IP' || compact === 'TCPIP' || compact === 'TCPMODBUS' || compact === 'MODBUSTCP') return PROTOCOLS.TCP_IP;
  return value;
}

function getPlantCode(plant = '') {
  const value = String(plant || '').trim();
  if (value === '1008' || /bawal/i.test(value)) return '1008';
  if (value === '1002' || /gurugram|gurgaon/i.test(value)) return '1002';
  return value || '1002';
}

function getDivisionPattern(division = '') {
  const value = String(division || '').trim().toLowerCase();
  if (!value) return '';
  if (value.includes('hpdc')) return '%HPDC%';
  if (value.includes('machine') || value.includes('machining') || value.includes('mcs')) return '%MCS%';
  return `%${division}%`;
}

const getAllLines = async (req, res) => {
  try {
    await ensureLineSchema();
    const { plant = '1002', division, status, protocol, search } = req.query;
    const params = [];
    const whereParts = [];

    if (plant) {
      whereParts.push('lm.plant_code = ?');
      params.push(getPlantCode(plant));
    }
    if (division) {
      const divLower = String(division).toLowerCase();
      if (divLower.includes('machining') || divLower.includes('machine')) {
        whereParts.push(`(
          LOWER(COALESCE(lm.division, '')) LIKE ?
          OR LOWER(COALESCE(lm.division, '')) LIKE ?
          OR LOWER(COALESCE(lm.division, '')) LIKE ?
        )`);
        params.push('%machining%', '%machine%', '%mcs%');
      } else {
        whereParts.push('LOWER(COALESCE(lm.division, \'\')) LIKE ?');
        params.push(`%${divLower}%`);
      }
    }
    if (status === 'active' || status === '1') {
      whereParts.push('lm.is_active = 1');
    } else if (status === 'inactive' || status === '0') {
      whereParts.push('lm.is_active = 0');
    }
    const normalizedProtocol = normalizeProtocol(protocol);
    if (normalizedProtocol) {
      whereParts.push('UPPER(REPLACE(REPLACE(COALESCE(m.protocol, \'\'), \' \', \'\'), \'/\', \'\')) = ?');
      params.push(normalizedProtocol.replace(/[\s/]+/g, '').toUpperCase());
    }
    if (search) {
      whereParts.push(`(
        LOWER(COALESCE(lm.line_name, '')) LIKE ?
        OR LOWER(COALESCE(lm.line_code, '')) LIKE ?
        OR LOWER(COALESCE(lm.division, '')) LIKE ?
      )`);
      const term = `%${String(search).toLowerCase()}%`;
      params.push(term, term, term);
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const { rows } = await db.query(`
      SELECT 
        lm.line_id, lm.line_code, lm.line_name,
        lm.division, lm.plant, lm.plant_code, lm.is_active,
        lm.part_code, lm.part_name, lm.customer_name,
        MIN(NULLIF(m.protocol, '')) AS primary_protocol,
        MAX(CASE WHEN UPPER(COALESCE(m.protocol, '')) = 'SLMP' THEN 1 ELSE 0 END) AS has_slmp,
        MAX(CASE WHEN UPPER(REPLACE(REPLACE(COALESCE(m.protocol, ''), ' ', ''), '/', '')) IN ('TCPIP', 'TCPMODBUS', 'MODBUSTCP') THEN 1 ELSE 0 END) AS has_tcp_modbus,
        COUNT(DISTINCT m.id) AS total_machines,
        COUNT(DISTINCT CASE WHEN NULLIF(lm.part_code, '') IS NOT NULL THEN lm.part_code END) AS total_parts
      FROM dbo.line_master lm
      LEFT JOIN dbo.iot_machines m  ON m.line_id  = lm.line_id
      ${where}
      GROUP BY lm.line_id, lm.line_code, lm.line_name,
               lm.division, lm.plant, lm.plant_code, lm.is_active,
               lm.part_code, lm.part_name, lm.customer_name
      ORDER BY lm.line_id
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLineById = async (req, res) => {
  try {
    await ensureLineSchema();
    const { rows } = await db.query(
      `SELECT * FROM dbo.line_master WHERE line_id = ?`,
      [req.params.id]
    );
    if (!rows[0])
      return res.status(404).json({ success: false, message: 'Line not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLinesMachines = async (req, res) => {
  try {
    await ensureLineSchema();
    const { rows } = await db.query(
      `SELECT id, machine_code, name, category, asset, cost_center, line_id,
              operation_no, operation_name, ip_address, port, protocol, part_name
       FROM dbo.iot_machines 
       WHERE line_id = ?
       ORDER BY name`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLinesParts = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
              p.sl_no AS Sl_No,
              p.material_code AS Material,
              p.description AS Material_Description,
              p.manufacturing_type AS Manufacturing_Type,
              p.material_group AS Material_Group
       FROM dbo.line_master lm
       INNER JOIN dbo.iot_parts p
          ON p.material_code = lm.part_code
          OR (NULLIF(lm.part_code, '') IS NULL AND p.plant_code = lm.plant_code)
       WHERE lm.line_id = ?
       ORDER BY p.description`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createLine = async (req, res) => {
  try {
    await ensureLineSchema();
    const { line_code, line_name, plant = 'Gurugram Plant', plant_code = '1002', division, description, part_code, part_name, customer_name, is_active = true } = req.body;
    if (!String(line_code || '').trim() || !String(line_name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Line code and name are required' });
    }
    const { rows } = await db.run(
      `INSERT INTO dbo.line_master 
        (line_code, line_name, plant, plant_code, division, description, is_active, part_code, part_name, customer_name)
       OUTPUT INSERTED.line_id
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [line_code, line_name, plant, getPlantCode(plant_code || plant), division, description || null, is_active ? 1 : 0, part_code || null, part_name || null, customer_name || null]
    );
    res.json({ success: true, line_id: rows[0]?.line_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateLine = async (req, res) => {
  try {
    await ensureLineSchema();
    const allowed = ['line_code', 'line_name', 'plant', 'plant_code', 'division', 'description', 'is_active', 'part_code', 'part_name', 'customer_name'];
    const updates = allowed.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!updates.length) return res.status(400).json({ success: false, message: 'No line fields supplied' });

    await db.run(
      `UPDATE dbo.line_master
       SET ${ updates.map((field) => `${field} = ?`).join(', ') },
      updated_at = GETDATE()
       WHERE line_id = ? `,
      [...updates.map((field) => req.body[field] === '' ? null : req.body[field]), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getLineOperations = async (_req, res) => {
  res.json({ success: true, data: OPERATION_MASTER });
};

const deleteLine = async (req, res) => {
  try {
    await ensureLineSchema();
    await db.run(`UPDATE dbo.iot_machines SET line_id = NULL WHERE line_id = ? `, [req.params.id]);
    await db.run(`DELETE FROM dbo.line_master WHERE line_id = ? `, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const addLineMachine = async (req, res) => {
  try {
    await ensureLineSchema();
    const { machine_code, name, category, asset, cost_center, ip_address, port, part_name } = req.body;
    const operation = normalizeOperation(req.body.operation_no);
    const protocol = normalizeProtocol(req.body.protocol);
    if (!String(machine_code || '').trim() || !String(name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Machine code and name are required' });
    }

    const { rows: lineRows } = await db.query(`SELECT plant_code FROM dbo.line_master WHERE line_id = ? `, [req.params.id]);
    if (!lineRows.length) return res.status(404).json({ success: false, message: 'Line not found' });

    const code = String(machine_code).trim();
    const machineName = String(name).trim();
    const plantCode = lineRows[0].plant_code || '1002';

    const { rows: existingRows } = await db.query(
      `SELECT TOP 1 id FROM dbo.iot_machines WHERE machine_code = ?`,
      [code]
    );

    if (existingRows[0]?.id) {
      await db.run(
        `UPDATE dbo.iot_machines
         SET name = ?, category = ?, plant_code = ?, line_id = ?, asset = ?, cost_center = ?,
             operation_no = ?, operation_name = ?, ip_address = ?, port = ?, protocol = ?, part_name = ?
         WHERE id = ?`,
        [
          machineName,
          category || null,
          plantCode,
          req.params.id,
          asset || null,
          cost_center || null,
          operation.operation_no,
          operation.operation_name,
          ip_address || null,
          port || null,
          protocol,
          part_name || null,
          existingRows[0].id,
        ]
      );

      return res.status(201).json({ success: true, id: existingRows[0].id });
    }

    const { rows } = await db.run(
      `INSERT INTO dbo.iot_machines
      (machine_code, name, category, plant_code, line_id, asset, cost_center, operation_no, operation_name, ip_address, port, protocol, part_name)
       OUTPUT INSERTED.id
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        machineName,
        category || null,
        plantCode,
        req.params.id,
        asset || null,
        cost_center || null,
        operation.operation_no,
        operation.operation_name,
        ip_address || null,
        port || null,
        protocol,
        part_name || null,
      ]
    );

    res.status(201).json({ success: true, id: rows[0]?.id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateLineMachine = async (req, res) => {
  try {
    await ensureLineSchema();
    const allowed = ['machine_code', 'name', 'category', 'cost_center', 'asset', 'line_id', 'operation_no', 'ip_address', 'port', 'protocol', 'part_name'];
    const updates = allowed.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (!updates.length) return res.status(400).json({ success: false, message: 'No machine fields supplied' });

    const normalizedBody = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(req.body, 'operation_no')) {
      const operation = normalizeOperation(req.body.operation_no);
      normalizedBody.operation_no = operation.operation_no;
      normalizedBody.operation_name = operation.operation_name;
      updates.push('operation_name');
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'protocol')) {
      normalizedBody.protocol = normalizeProtocol(req.body.protocol);
    }

    await db.run(
      `UPDATE dbo.iot_machines
       SET ${ updates.map((field) => `${field} = ?`).join(', ') }
       WHERE id = ? `,
      [...updates.map((field) => normalizedBody[field] === '' ? null : normalizedBody[field]), req.params.machineId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const removeLineMachine = async (req, res) => {
  try {
    await ensureLineSchema();
    const mode = req.query.mode || 'detach';
    if (mode === 'delete') {
      await db.run(`DELETE FROM dbo.iot_machine_status WHERE machine_id = ? `, [req.params.machineId]);
      await db.run(`DELETE FROM dbo.iot_machines WHERE id = ? `, [req.params.machineId]);
    } else {
      await db.run(`UPDATE dbo.iot_machines SET line_id = NULL WHERE id = ? `, [req.params.machineId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getRawMasterData = async (req, res) => {
  try {
    const { plant, type, division } = req.query;
    const plantCode = getPlantCode(plant);
    const isBawal = plantCode === '1008';

    if (type === 'parts') {
      if (isBawal) {
        try {
          const { rows } = await db.query(
            `SELECT DISTINCT material AS material_code, material_description AS description, material_group, material_type AS manufacturing_type
             FROM dbo.iot_parts_master_bawal_raw
             WHERE material IS NOT NULL
               AND (plant = ? OR ? = '')
             ORDER BY material_description`,
            [plantCode, plantCode]
          );
          return res.json({ success: true, data: rows });
        } catch(e) {
          // fallback to the common raw table below
        }
      }
      const { rows } = await db.query(
        `SELECT DISTINCT material AS material_code, material_description AS description, material_group, customer, manufacturing_type
         FROM dbo.iot_parts_master_raw
         WHERE material IS NOT NULL
           AND (plant = ? OR plant_code = ? OR ? = '')
         ORDER BY material_description`,
        [plantCode, plantCode, plantCode]
      );
      return res.json({ success: true, data: rows });
    }

    if (type === 'machines') {
      if (isBawal) {
        const params = [];
        let query = `SELECT DISTINCT equipment AS machine_code, description AS name, division AS category, cost_center, asset
                     FROM dbo.iot_machine_master_bawal_raw
                     WHERE equipment IS NOT NULL AND description IS NOT NULL
                       AND (
                         maint_plant = ?
                         OR planning_plant LIKE ?
                       )`;
        params.push(plantCode, `%${plantCode}%`);
        if (division) {
          const divPattern = getDivisionPattern(division);
          query += ` AND (plant_section LIKE ? OR functional_loc LIKE ? OR division LIKE ?)`;
          params.push(divPattern, divPattern, divPattern);
        }
        query += ` ORDER BY description`;
        const { rows } = await db.query(query, params);
        return res.json({ success: true, data: rows });
      } else {
        const params = [plantCode];
        let divFilter = '';
        if (division) {
          const divLower = division.toLowerCase();
          if (divLower.includes('hpdc')) {
            divFilter = ` AND (category LIKE '%HPDC%' OR category LIKE '%Die Cast%' OR cost_center LIKE '%110C%')`;
          } else if (divLower.includes('machine') || divLower.includes('machining')) {
            divFilter = ` AND (category LIKE '%Machine%' OR category LIKE '%MCS%' OR cost_center LIKE '%110M%')`;
          }
        }
        const query = `
          SELECT machine_code, name, category, cost_center, asset
          FROM (
            SELECT machine_code, name, category, cost_center, asset,
                   ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS rn
            FROM dbo.iot_machines
            WHERE plant_code = ? AND name IS NOT NULL${divFilter}
          ) t WHERE rn = 1
          ORDER BY name
        `;
        const { rows } = await db.query(query, params);
        return res.json({ success: true, data: rows });
      }
    }

    if (type === 'operations') {
      // Get from iot_operations table
      const { rows } = await db.query(
        `SELECT DISTINCT COALESCE(label, CAST(sr_no AS VARCHAR(50))) AS operation_no, name AS operation_name
         FROM dbo.iot_operations
         WHERE name IS NOT NULL
         ORDER BY operation_no`
      );
      if (rows.length > 0) return res.json({ success: true, data: rows });
      // fallback to OPERATION_MASTER constant
      return res.json({ success: true, data: OPERATION_MASTER });
    }

    return res.json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  OPERATION_MASTER,
  getAllLines,
  getLineById,
  getLineOperations,
  getLinesMachines,
  getLinesParts,
  createLine,
  updateLine,
  deleteLine,
  addLineMachine,
  updateLineMachine,
  removeLineMachine,
  getRawMasterData
};
