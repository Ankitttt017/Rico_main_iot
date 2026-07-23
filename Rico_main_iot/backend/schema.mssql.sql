-- RICO IoT backend - SQL Server schema for IoT/master-data API tables.
-- Run this against the database configured in backend/.env.
-- The script is idempotent: it creates missing objects, adds required columns,
-- and merges the application's baseline master data without dropping tables.

SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.iot_plants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_plants (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF COL_LENGTH('dbo.iot_plants', 'is_active') IS NULL
  ALTER TABLE dbo.iot_plants ADD is_active BIT NOT NULL CONSTRAINT df_iot_plants_is_active DEFAULT 1;
IF COL_LENGTH('dbo.iot_plants', 'updated_at') IS NULL
  ALTER TABLE dbo.iot_plants ADD updated_at DATETIME2 NOT NULL CONSTRAINT df_iot_plants_updated_at DEFAULT SYSUTCDATETIME();

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

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_iot_departments_code_plant' AND object_id = OBJECT_ID(N'dbo.iot_departments'))
  DROP INDEX ux_iot_departments_code_plant ON dbo.iot_departments;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_iot_departments_code_name_plant' AND object_id = OBJECT_ID(N'dbo.iot_departments'))
  CREATE UNIQUE INDEX ux_iot_departments_code_name_plant ON dbo.iot_departments (code, name, plant_code);

IF OBJECT_ID(N'dbo.line_master', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.line_master (
    line_id INT IDENTITY(1,1) PRIMARY KEY,
    line_code VARCHAR(50) UNIQUE NOT NULL,
    line_name NVARCHAR(200) NOT NULL,
    plant NVARCHAR(100) NULL,
    plant_code VARCHAR(20) NULL,
    division NVARCHAR(100) NULL,
    description NVARCHAR(MAX) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    part_code VARCHAR(40) NULL,
    part_name NVARCHAR(200) NULL,
    customer_name NVARCHAR(200) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

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

IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_users (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_app_users PRIMARY KEY,
    username NVARCHAR(80) NOT NULL CONSTRAINT UQ_app_users_username UNIQUE,
    display_name NVARCHAR(120) NULL,
    full_name NVARCHAR(160) NULL,
    employee_id NVARCHAR(60) NULL,
    email NVARCHAR(160) NULL,
    department NVARCHAR(120) NULL,
    role NVARCHAR(40) NOT NULL,
    password_hash NVARCHAR(256) NOT NULL,
    permissions_json NVARCHAR(MAX) NULL,
    landing_path NVARCHAR(160) NULL,
    failed_attempts INT NOT NULL CONSTRAINT DF_app_users_failed_attempts DEFAULT 0,
    locked_until DATETIME2 NULL,
    force_password_change BIT NOT NULL CONSTRAINT DF_app_users_force_pwd DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_app_users_is_active DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_app_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_app_users_updated_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.audit_log', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.audit_log (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_log PRIMARY KEY,
    action NVARCHAR(80) NOT NULL,
    performed_by NVARCHAR(120) NULL,
    target_user NVARCHAR(120) NULL,
    details NVARCHAR(MAX) NULL,
    timestamp DATETIME2 NOT NULL CONSTRAINT DF_audit_log_timestamp DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.workstation_downtime_events', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.workstation_downtime_events (
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
END;

IF OBJECT_ID(N'dbo.iot_materials', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_materials (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    material_code VARCHAR(40) UNIQUE NOT NULL,
    description NVARCHAR(MAX) NULL,
    plant_code VARCHAR(20) NULL,
    storage_location VARCHAR(20) NULL,
    unit_of_measure VARCHAR(10) NULL,
    material_type VARCHAR(20) NULL,
    material_group VARCHAR(30) NULL,
    cycle_time_sec DECIMAL(10,2) NULL,
    box_quantity INT DEFAULT 0,
    customer VARCHAR(100) NULL,
    opn_number VARCHAR(50) NULL,
    final_opn_code VARCHAR(50) NULL,
    manufacturing_type VARCHAR(50) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.iot_parts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_parts (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    sl_no INT NULL,
    material_code VARCHAR(40) UNIQUE NOT NULL,
    description NVARCHAR(MAX) NULL,
    plant_code VARCHAR(20) NULL,
    storage_location VARCHAR(20) NULL,
    unit_of_measure VARCHAR(10) NULL,
    material_group VARCHAR(30) NULL,
    cycle_time_sec DECIMAL(10,2) NULL,
    box_quantity INT DEFAULT 0,
    customer VARCHAR(100) NULL,
    opn_number VARCHAR(50) NULL,
    final_opn_code VARCHAR(50) NULL,
    manufacturing_type VARCHAR(50) NULL,
    total_produced INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ENABLED',
    version VARCHAR(50) NULL,
    registered_on VARCHAR(30) NULL,
    registered_by VARCHAR(100) NULL,
    revision_date VARCHAR(30) NULL,
    revised_by VARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.iot_operations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_operations (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    part_code VARCHAR(40) NOT NULL,
    sr_no INT NULL,
    name NVARCHAR(MAX) NULL,
    type VARCHAR(50) NULL,
    label VARCHAR(50) NULL,
    rework VARCHAR(100) DEFAULT 'No rework assigned',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_operations_part FOREIGN KEY (part_code)
      REFERENCES dbo.iot_parts(material_code) ON DELETE CASCADE
  );
END;

IF OBJECT_ID(N'dbo.iot_part_plants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_part_plants (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    part_code VARCHAR(40) NOT NULL,
    plant_code VARCHAR(20) NOT NULL,
    storage_location VARCHAR(20) NULL,
    unit_of_measure VARCHAR(20) NULL,
    material_type VARCHAR(50) NULL,
    material_group VARCHAR(50) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_part_plants_part FOREIGN KEY (part_code)
      REFERENCES dbo.iot_parts(material_code) ON DELETE CASCADE
  );
END;

IF OBJECT_ID(N'dbo.iot_process_flow_diagrams', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_process_flow_diagrams (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    part_code VARCHAR(40) NOT NULL,
    upload_date VARCHAR(30) NULL,
    version VARCHAR(20) NULL,
    file_name VARCHAR(200) NULL,
    file_path VARCHAR(500) NULL,
    updated_by VARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_process_flow_part FOREIGN KEY (part_code)
      REFERENCES dbo.iot_parts(material_code) ON DELETE CASCADE
  );
END;

IF OBJECT_ID(N'dbo.iot_inspection_sheets', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_inspection_sheets (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    part_code VARCHAR(40) NOT NULL,
    upload_date VARCHAR(30) NULL,
    version VARCHAR(20) NULL,
    file_name VARCHAR(200) NULL,
    file_path VARCHAR(500) NULL,
    updated_by VARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_inspection_part FOREIGN KEY (part_code)
      REFERENCES dbo.iot_parts(material_code) ON DELETE CASCADE
  );
END;

IF OBJECT_ID(N'dbo.iot_control_plan_charts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_control_plan_charts (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    part_code VARCHAR(40) NOT NULL,
    upload_date VARCHAR(30) NULL,
    version VARCHAR(20) NULL,
    file_name VARCHAR(200) NULL,
    file_path VARCHAR(500) NULL,
    updated_by VARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_control_plan_part FOREIGN KEY (part_code)
      REFERENCES dbo.iot_parts(material_code) ON DELETE CASCADE
  );
END;

IF OBJECT_ID(N'dbo.iot_parts_master_raw', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_parts_master_raw (
    sl_no VARCHAR(50) NULL,
    material VARCHAR(80) NULL,
    material_description NVARCHAR(MAX) NULL,
    plant VARCHAR(20) NULL,
    storage_location VARCHAR(20) NULL,
    base_unit_of_measure VARCHAR(20) NULL,
    material_group VARCHAR(50) NULL,
    cycle_time VARCHAR(50) NULL,
    customer VARCHAR(100) NULL,
    manufacturing_type VARCHAR(50) NULL,
    old_equipment NVARCHAR(MAX) NULL,
    s4hana NVARCHAR(MAX) NULL,
    description NVARCHAR(MAX) NULL,
    plant_code NVARCHAR(MAX) NULL,
    asset NVARCHAR(MAX) NULL,
    cost_center NVARCHAR(MAX) NULL
  );
END;

IF OBJECT_ID(N'dbo.iot_machine_master_raw', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_machine_master_raw (
    old_equipment NVARCHAR(MAX) NULL,
    s4hana NVARCHAR(MAX) NULL,
    description NVARCHAR(MAX) NULL,
    plant_code NVARCHAR(MAX) NULL,
    asset NVARCHAR(MAX) NULL,
    cost_center NVARCHAR(MAX) NULL
  );
END;

IF OBJECT_ID(N'dbo.iot_machines', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_machines (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_code VARCHAR(80) UNIQUE NOT NULL,
    name VARCHAR(200) NULL,
    category VARCHAR(80) NULL,
    plant_code VARCHAR(20) NULL,
    asset NVARCHAR(MAX) NULL,
    cost_center NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

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
IF COL_LENGTH('dbo.iot_machines', 'is_active') IS NULL
  ALTER TABLE dbo.iot_machines ADD is_active BIT NOT NULL CONSTRAINT df_iot_machines_is_active DEFAULT 1;

IF OBJECT_ID(N'dbo.iot_machine_status', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_machine_status (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'IDLE',
    part_code VARCHAR(40) NULL,
    operation_no VARCHAR(50) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_machine_status_machine FOREIGN KEY (machine_id)
      REFERENCES dbo.iot_machines(id) ON DELETE CASCADE
  );
END;

IF OBJECT_ID(N'dbo.iot_machine_operations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.iot_machine_operations (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    machine_id BIGINT NOT NULL,
    part_code VARCHAR(40) NOT NULL,
    operation_id BIGINT NULL,
    operation_no VARCHAR(50) NOT NULL,
    is_primary BIT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_iot_machine_operations_machine FOREIGN KEY (machine_id)
      REFERENCES dbo.iot_machines(id) ON DELETE CASCADE,
    CONSTRAINT fk_iot_machine_operations_part FOREIGN KEY (part_code)
      REFERENCES dbo.iot_parts(material_code),
    CONSTRAINT fk_iot_machine_operations_operation FOREIGN KEY (operation_id)
      REFERENCES dbo.iot_operations(id)
  );
END;

IF OBJECT_ID(N'dbo.parts_master', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.iot_parts_master_raw)
BEGIN
  INSERT INTO dbo.iot_parts_master_raw (
    sl_no, material, material_description, plant, storage_location,
    base_unit_of_measure, material_group, cycle_time, customer,
    manufacturing_type
  )
  SELECT
    CONVERT(VARCHAR(50), Sl_No),
    CONVERT(VARCHAR(80), Material),
    Material_Description,
    CONVERT(VARCHAR(20), Plant),
    CONVERT(VARCHAR(20), Storage_Location),
    Base_Unit_of_Measure,
    Material_Group,
    Cycle_time_In_Sec,
    Cutomer,
    Manufacturing_Type
  FROM dbo.parts_master;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_materials_plant')
  CREATE INDEX idx_iot_materials_plant ON dbo.iot_materials (plant_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_materials_group')
  CREATE INDEX idx_iot_materials_group ON dbo.iot_materials (material_group);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_parts_plant')
  CREATE INDEX idx_iot_parts_plant ON dbo.iot_parts (plant_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_parts_group')
  CREATE INDEX idx_iot_parts_group ON dbo.iot_parts (material_group);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_iot_part_plants_part_plant')
  CREATE UNIQUE INDEX ux_iot_part_plants_part_plant
    ON dbo.iot_part_plants (part_code, plant_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_part_plants_plant')
  CREATE INDEX idx_iot_part_plants_plant ON dbo.iot_part_plants (plant_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_operations_part')
  CREATE INDEX idx_iot_operations_part ON dbo.iot_operations (part_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_machines_plant')
  CREATE INDEX idx_iot_machines_plant ON dbo.iot_machines (plant_code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_machine_status_machine_updated')
  CREATE INDEX idx_iot_machine_status_machine_updated
    ON dbo.iot_machine_status (machine_id, updated_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_machine_operations_machine')
  CREATE INDEX idx_iot_machine_operations_machine
    ON dbo.iot_machine_operations (machine_id, is_active, updated_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_iot_machine_operations_part_operation')
  CREATE INDEX idx_iot_machine_operations_part_operation
    ON dbo.iot_machine_operations (part_code, operation_no, is_active);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ux_iot_machine_operations_active')
  CREATE UNIQUE INDEX ux_iot_machine_operations_active
    ON dbo.iot_machine_operations (machine_id, part_code, operation_no)
    WHERE is_active = 1;

MERGE dbo.iot_departments AS target
USING (
  SELECT 'HPDC' AS code, 'HPDC' AS name, NULL AS plant_code, 'High Pressure Die Casting' AS description
  UNION ALL SELECT 'MACHINING', 'Machining', NULL, 'Machine shop and CNC operations'
) AS source
ON target.code = source.code AND (
  target.plant_code = source.plant_code OR (target.plant_code IS NULL AND source.plant_code IS NULL)
) AND target.name = source.name
WHEN NOT MATCHED THEN
  INSERT (code, name, plant_code, description)
  VALUES (source.code, source.name, source.plant_code, source.description);

MERGE dbo.iot_parts AS target
USING (
  SELECT sl_no, material_code, material_description, plant, storage_location,
         base_unit_of_measure, material_group, cycle_time_sec, customer, manufacturing_type
  FROM (
    SELECT
      TRY_CONVERT(INT, NULLIF(sl_no, '')) AS sl_no,
      NULLIF(material, '') AS material_code,
      material_description,
      plant,
      storage_location,
      base_unit_of_measure,
      material_group,
      TRY_CONVERT(DECIMAL(10,2), NULLIF(cycle_time, '')) AS cycle_time_sec,
      customer,
      manufacturing_type,
      ROW_NUMBER() OVER (
        PARTITION BY NULLIF(material, '')
        ORDER BY CASE WHEN NULLIF(material_description, '') IS NULL THEN 1 ELSE 0 END,
                 TRY_CONVERT(INT, NULLIF(sl_no, ''))
      ) AS rn
    FROM dbo.iot_parts_master_raw
    WHERE NULLIF(material, '') IS NOT NULL
  ) deduped_parts
  WHERE rn = 1
) AS source
ON target.material_code = source.material_code
WHEN NOT MATCHED THEN
  INSERT (
    sl_no, material_code, description, plant_code, storage_location, unit_of_measure,
    material_group, cycle_time_sec, customer, manufacturing_type, status
  )
  VALUES (
    source.sl_no, source.material_code, source.material_description, source.plant,
    source.storage_location, source.base_unit_of_measure, source.material_group,
    source.cycle_time_sec, source.customer, source.manufacturing_type, 'ENABLED'
  );

MERGE dbo.iot_part_plants AS target
USING (
  SELECT part_code, plant_code, storage_location, unit_of_measure, material_type, material_group
  FROM (
    SELECT
      NULLIF(material, '') AS part_code,
      NULLIF(plant, '') AS plant_code,
      storage_location,
      base_unit_of_measure AS unit_of_measure,
      CAST(NULL AS VARCHAR(50)) AS material_type,
      material_group,
      ROW_NUMBER() OVER (
        PARTITION BY NULLIF(material, ''), NULLIF(plant, '')
        ORDER BY CASE WHEN NULLIF(material_description, '') IS NULL THEN 1 ELSE 0 END,
                 TRY_CONVERT(INT, NULLIF(sl_no, ''))
      ) AS rn
    FROM dbo.iot_parts_master_raw
    WHERE NULLIF(material, '') IS NOT NULL
      AND NULLIF(plant, '') IS NOT NULL
  ) deduped_part_plants
  WHERE rn = 1
) AS source
ON target.part_code = source.part_code AND target.plant_code = source.plant_code
WHEN MATCHED THEN
  UPDATE SET
    storage_location = source.storage_location,
    unit_of_measure = source.unit_of_measure,
    material_group = source.material_group,
    updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
  INSERT (part_code, plant_code, storage_location, unit_of_measure, material_type, material_group)
  VALUES (source.part_code, source.plant_code, source.storage_location, source.unit_of_measure, source.material_type, source.material_group);

MERGE dbo.iot_plants AS target
USING (
  SELECT DISTINCT plant_code AS code, CONCAT(plant_code, ' Plant') AS name
  FROM dbo.iot_parts
  WHERE plant_code IS NOT NULL AND plant_code <> ''
) AS source
ON target.code = source.code
WHEN NOT MATCHED THEN INSERT (code, name) VALUES (source.code, source.name);

MERGE dbo.iot_machines AS target
USING (
  SELECT machine_code, name, category, plant_code, asset, cost_center
  FROM (
    SELECT
      COALESCE(NULLIF(old_equipment, ''), NULLIF(s4hana, '')) AS machine_code,
      COALESCE(NULLIF(description, ''), COALESCE(NULLIF(old_equipment, ''), NULLIF(s4hana, ''))) AS name,
      'Machine' AS category,
      NULLIF(CONVERT(VARCHAR(20), plant_code), '') AS plant_code,
      NULLIF(asset, '') AS asset,
      NULLIF(cost_center, '') AS cost_center,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(NULLIF(old_equipment, ''), NULLIF(s4hana, ''))
        ORDER BY CASE WHEN NULLIF(description, '') IS NULL THEN 1 ELSE 0 END, description
      ) AS rn
    FROM dbo.iot_machine_master_raw
    WHERE COALESCE(NULLIF(old_equipment, ''), NULLIF(s4hana, '')) IS NOT NULL
  ) deduped_machines
  WHERE rn = 1
) AS source
ON target.machine_code = source.machine_code
WHEN MATCHED THEN
  UPDATE SET
    name = source.name,
    plant_code = source.plant_code,
    asset = source.asset,
    cost_center = source.cost_center
WHEN NOT MATCHED THEN
  INSERT (machine_code, name, category, plant_code, asset, cost_center)
  VALUES (source.machine_code, source.name, source.category, source.plant_code, source.asset, source.cost_center);

MERGE dbo.iot_machine_operations AS target
USING (
  SELECT
    ms.machine_id,
    ms.part_code,
    ms.operation_no,
    MIN(o.id) AS operation_id,
    MAX(CASE WHEN latest.rn = 1 THEN 1 ELSE 0 END) AS is_primary,
    MAX(ms.updated_at) AS updated_at
  FROM (
    SELECT
      machine_status.*,
      ROW_NUMBER() OVER (
        PARTITION BY machine_id
        ORDER BY
          CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END,
          updated_at DESC,
          id DESC
      ) AS rn
    FROM dbo.iot_machine_status machine_status
    WHERE NULLIF(part_code, '') IS NOT NULL
      AND NULLIF(operation_no, '') IS NOT NULL
  ) latest
  INNER JOIN dbo.iot_machine_status ms ON ms.id = latest.id
  LEFT JOIN dbo.iot_operations o
    ON o.part_code = ms.part_code
   AND (
      UPPER(TRIM(ms.operation_no)) = UPPER(TRIM(o.label))
      OR UPPER(TRIM(ms.operation_no)) = UPPER(TRIM(CAST(o.sr_no AS VARCHAR(50))))
      OR REPLACE(REPLACE(UPPER(TRIM(ms.operation_no)), 'OP-', ''), 'OP', '') =
         REPLACE(REPLACE(UPPER(TRIM(COALESCE(o.label, CAST(o.sr_no AS VARCHAR(50))))), 'OP-', ''), 'OP', '')
    )
  GROUP BY ms.machine_id, ms.part_code, ms.operation_no
) AS source
ON target.machine_id = source.machine_id
 AND target.part_code = source.part_code
 AND target.operation_no = source.operation_no
WHEN MATCHED THEN
  UPDATE SET
    operation_id = COALESCE(target.operation_id, source.operation_id),
    is_primary = CASE WHEN source.is_primary = 1 THEN 1 ELSE target.is_primary END,
    is_active = 1,
    updated_at = COALESCE(source.updated_at, SYSUTCDATETIME())
WHEN NOT MATCHED THEN
  INSERT (machine_id, part_code, operation_id, operation_no, is_primary, is_active, updated_at)
  VALUES (source.machine_id, source.part_code, source.operation_id, source.operation_no, source.is_primary, 1, COALESCE(source.updated_at, SYSUTCDATETIME()));

IF OBJECT_ID(N'dbo.PlcCycleReadingsIdSeq', N'SO') IS NULL
BEGIN
  EXEC(N'CREATE SEQUENCE dbo.PlcCycleReadingsIdSeq AS BIGINT START WITH 1 INCREMENT BY 1');
END;

IF OBJECT_ID(N'dbo.PlcCycleReadings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PlcCycleReadings (
    [id] BIGINT NOT NULL CONSTRAINT [DF_PlcCycleReadings_id] DEFAULT NEXT VALUE FOR dbo.PlcCycleReadingsIdSeq,
    [recorded_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcCycleReadings_recorded_at] DEFAULT SYSDATETIME(),
    [created_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcCycleReadings_created_at] DEFAULT SYSUTCDATETIME(),
    [machine_key] NVARCHAR(80) NULL,
    [machine_name] NVARCHAR(100) NULL,
    [plc_ip] NVARCHAR(45) NULL,
    [plc_port] INT NULL,
    [part_name] NVARCHAR(100) NULL,
    [shot_year] NVARCHAR(2) NULL,
    [shot_month] NVARCHAR(2) NULL,
    [shot_day] NVARCHAR(2) NULL,
    [shot_date] DATE NULL,
    [shot_hour] NVARCHAR(2) NULL,
    [shot_minute] NVARCHAR(2) NULL,
    [shot_second] NVARCHAR(2) NULL,
    [shot_datetime] DATETIME2(0) NULL,
    [Counter] INT NULL,
    [raw_readings_json] NVARCHAR(MAX) NULL,
    [shot_number] INT NULL,
    [ok_shot] INT NULL,
    [ng_counter] INT NULL,
    [cycle_start_time] DATETIME2(3) NULL,
    [cycle_end_time] DATETIME2(3) NULL,
    [minor_stoppage_machine] DECIMAL(18,2) NULL,
    [machine_breakdown] DECIMAL(18,2) NULL,
    [minor_stoppage_start_time] DATETIME2(3) NULL,
    [minor_stoppage_end_time] DATETIME2(3) NULL,
    [minor_stoppage_bit] INT NULL,
    [stoppage_duration_sec] DECIMAL(18,2) NULL,
    [stoppage_type] NVARCHAR(40) NULL,
    [cycle_time] DECIMAL(18,2) NULL,
    [minor_stoppage] DECIMAL(18,2) NULL,
    [cycle_end] INT NULL,
    [Cycle Start] INT NULL,
    [die_close_core_in_time] DECIMAL(18,2) NULL,
    [pouring_time] DECIMAL(18,2) NULL,
    [shot_fwd_time] DECIMAL(18,2) NULL,
    [curing_time] DECIMAL(18,2) NULL,
    [die_open_core_out_time] DECIMAL(18,2) NULL,
    [ejector_time] DECIMAL(18,2) NULL,
    [extract_time] DECIMAL(18,2) NULL,
    [spray_time] DECIMAL(18,2) NULL,
    [v1_speed] DECIMAL(18,2) NULL,
    [v2_speed] DECIMAL(18,2) NULL,
    [v3_speed] DECIMAL(18,2) NULL,
    [v4_speed] DECIMAL(18,2) NULL,
    [metal_pressure] DECIMAL(18,2) NULL,
    [furnace_metal_temp] DECIMAL(18,2) NULL,
    [cooling_water_mov] DECIMAL(18,2) NULL,
    [cooling_water_sta] DECIMAL(18,2) NULL,
    [accel_point] DECIMAL(18,2) NULL,
    [accel_point_upper_limit] DECIMAL(18,2) NULL,
    [accel_point_lower_limit] DECIMAL(18,2) NULL,
    [deaccel_point] DECIMAL(18,2) NULL,
    [intensification_time] DECIMAL(18,2) NULL,
    [biscuit_thickness] DECIMAL(18,2) NULL,
    [jet_cooling_pressure] DECIMAL(18,2) NULL,
    [clamp_tonnage_he_low_pct] DECIMAL(18,2) NULL,
    [clamp_tonnage_he_low_mn] DECIMAL(18,2) NULL,
    [clamp_tonnage_op_up_pct] DECIMAL(18,2) NULL,
    [clamp_tonnage_op_low_pct] DECIMAL(18,2) NULL,
    [clamp_tonnage_he_up_pct] DECIMAL(18,2) NULL,
    [vacuum_pressure] DECIMAL(18,2) NULL,
    [plant_temperature] DECIMAL(18,2) NULL,
    [plant_humidity] DECIMAL(18,2) NULL,
    [clamp_force_pct] DECIMAL(18,2) NULL,
    [clamp_tonnage] DECIMAL(18,2) NULL,
    [shot_acc_pressure] DECIMAL(18,2) NULL,
    [intensification_acc_pressure] DECIMAL(18,2) NULL,
    [fixed_die_temp_f1] DECIMAL(18,2) NULL,
    [fixed_die_temp_f2] DECIMAL(18,2) NULL,
    [moving_die_temp_m1] DECIMAL(18,2) NULL,
    [moving_die_temp_m2] DECIMAL(18,2) NULL,
    [slide_temp_s1] DECIMAL(18,2) NULL,
    [fix_1_flow] DECIMAL(18,2) NULL,
    [fix_2_flow] DECIMAL(18,2) NULL,
    [fix_3_flow] DECIMAL(18,2) NULL,
    [mov_1_flow] DECIMAL(18,2) NULL,
    [mov_2_flow] DECIMAL(18,2) NULL,
    [mov_3_flow] DECIMAL(18,2) NULL,
    [vacuum_pressure_mmhg] DECIMAL(18,2) NULL,
    [average_die_clamp_tonnage_count] INT NULL,
    [time_for_stroke] INT NULL,
    [stroke] DECIMAL(18,2) NULL,
    [shot_status] INT NULL,
    CONSTRAINT [PK_PlcCycleReadings] PRIMARY KEY CLUSTERED ([id] DESC)
  );
END;

IF COL_LENGTH('dbo.PlcCycleReadings', 'raw_readings_json') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [raw_readings_json] NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'machine_key') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [machine_key] NVARCHAR(80) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_year') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_year] NVARCHAR(2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_month') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_month] NVARCHAR(2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_day') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_day] NVARCHAR(2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_date') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_date] DATE NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_hour') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_hour] NVARCHAR(2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_minute') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_minute] NVARCHAR(2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_second') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_second] NVARCHAR(2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_datetime') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_datetime] DATETIME2(0) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'Counter') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [Counter] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_number') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_number] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'ok_shot') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [ok_shot] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'ng_counter') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [ng_counter] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'cycle_start_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [cycle_start_time] DATETIME2(3) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'cycle_end_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [cycle_end_time] DATETIME2(3) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'cycle_end') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [cycle_end] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'minor_stoppage_machine') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [minor_stoppage_machine] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'machine_breakdown') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [machine_breakdown] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'minor_stoppage_start_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [minor_stoppage_start_time] DATETIME2(3) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'minor_stoppage_end_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [minor_stoppage_end_time] DATETIME2(3) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'minor_stoppage_bit') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [minor_stoppage_bit] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'stoppage_duration_sec') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [stoppage_duration_sec] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'stoppage_type') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [stoppage_type] NVARCHAR(40) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'cycle_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [cycle_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'minor_stoppage') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [minor_stoppage] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'Cycle Start') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [Cycle Start] INT NULL;

DECLARE @dropPlcLimitStatusColumns NVARCHAR(MAX) = N'';
SELECT @dropPlcLimitStatusColumns = @dropPlcLimitStatusColumns + N'
ALTER TABLE dbo.PlcCycleReadings DROP COLUMN ' + QUOTENAME(column_name) + N';'
FROM (VALUES
  (N'die_close_core_in_time_status'),
  (N'pouring_time_status'),
  (N'shot_fwd_time_status'),
  (N'curing_time_status'),
  (N'die_open_core_out_time_status'),
  (N'ejector_time_status'),
  (N'extract_time_status'),
  (N'spray_time_status'),
  (N'v1_speed_status'),
  (N'v2_speed_status'),
  (N'v3_speed_status'),
  (N'v4_speed_status'),
  (N'metal_pressure_status'),
  (N'furnace_metal_temp_status'),
  (N'cooling_water_mov_status'),
  (N'cooling_water_sta_status'),
  (N'accel_point_status'),
  (N'deaccel_point_status'),
  (N'intensification_time_status'),
  (N'biscuit_thickness_status'),
  (N'jet_cooling_pressure_status'),
  (N'clamp_tonnage_he_low_pct_status'),
  (N'clamp_tonnage_he_low_mn_status'),
  (N'clamp_tonnage_op_up_pct_status'),
  (N'clamp_tonnage_op_low_pct_status'),
  (N'clamp_tonnage_he_up_pct_status'),
  (N'vacuum_pressure_status')
) AS status_columns(column_name)
WHERE COL_LENGTH('dbo.PlcCycleReadings', column_name) IS NOT NULL;
IF @dropPlcLimitStatusColumns <> N'' EXEC sp_executesql @dropPlcLimitStatusColumns;

IF COL_LENGTH('dbo.PlcCycleReadings', 'die_close_core_in_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [die_close_core_in_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'pouring_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [pouring_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_fwd_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_fwd_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'curing_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [curing_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'die_open_core_out_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [die_open_core_out_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'ejector_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [ejector_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'extract_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [extract_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'spray_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [spray_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'v1_speed') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [v1_speed] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'v2_speed') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [v2_speed] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'v3_speed') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [v3_speed] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'v4_speed') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [v4_speed] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'metal_pressure') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [metal_pressure] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'furnace_metal_temp') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [furnace_metal_temp] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'cooling_water_mov') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [cooling_water_mov] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'cooling_water_sta') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [cooling_water_sta] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'accel_point') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [accel_point] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'accel_point_upper_limit') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [accel_point_upper_limit] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'accel_point_lower_limit') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [accel_point_lower_limit] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'deaccel_point') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [deaccel_point] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'intensification_time') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [intensification_time] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'biscuit_thickness') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [biscuit_thickness] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'jet_cooling_pressure') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [jet_cooling_pressure] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_tonnage_he_low_pct') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_tonnage_he_low_pct] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_tonnage_he_low_mn') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_tonnage_he_low_mn] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_tonnage_op_up_pct') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_tonnage_op_up_pct] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_tonnage_op_low_pct') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_tonnage_op_low_pct] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_tonnage_he_up_pct') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_tonnage_he_up_pct] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'vacuum_pressure') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [vacuum_pressure] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'plant_temperature') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [plant_temperature] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'plant_humidity') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [plant_humidity] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_force_pct') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_force_pct] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'clamp_tonnage') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [clamp_tonnage] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_acc_pressure') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_acc_pressure] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'intensification_acc_pressure') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [intensification_acc_pressure] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'fixed_die_temp_f1') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [fixed_die_temp_f1] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'fixed_die_temp_f2') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [fixed_die_temp_f2] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'moving_die_temp_m1') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [moving_die_temp_m1] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'moving_die_temp_m2') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [moving_die_temp_m2] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'slide_temp_s1') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [slide_temp_s1] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'fix_1_flow') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [fix_1_flow] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'fix_2_flow') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [fix_2_flow] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'fix_3_flow') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [fix_3_flow] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'mov_1_flow') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [mov_1_flow] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'mov_2_flow') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [mov_2_flow] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'mov_3_flow') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [mov_3_flow] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'vacuum_pressure_mmhg') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [vacuum_pressure_mmhg] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'average_die_clamp_tonnage_count') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [average_die_clamp_tonnage_count] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'time_for_stroke') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [time_for_stroke] INT NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'stroke') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [stroke] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.PlcCycleReadings', 'shot_status') IS NULL
  ALTER TABLE dbo.PlcCycleReadings ADD [shot_status] INT NULL;

IF OBJECT_ID(N'dbo.PlcConnectionEventsIdSeq', N'SO') IS NULL
BEGIN
  EXEC(N'CREATE SEQUENCE dbo.PlcConnectionEventsIdSeq AS BIGINT START WITH 1 INCREMENT BY 1');
END;

IF OBJECT_ID(N'dbo.PlcConnectionEvents', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PlcConnectionEvents (
    [id] BIGINT NOT NULL CONSTRAINT [DF_PlcConnectionEvents_id] DEFAULT NEXT VALUE FOR dbo.PlcConnectionEventsIdSeq,
    [machine_key] NVARCHAR(80) NULL,
    [machine_name] NVARCHAR(100) NULL,
    [plc_ip] NVARCHAR(45) NULL,
    [plc_port] INT NULL,
    [event_type] NVARCHAR(40) NOT NULL,
    [started_at] DATETIME2(3) NOT NULL,
    [ended_at] DATETIME2(3) NULL,
    [duration_seconds] INT NULL,
    [reason] NVARCHAR(400) NULL,
    [created_at] DATETIME2(3) NOT NULL CONSTRAINT [DF_PlcConnectionEvents_created_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_PlcConnectionEvents] PRIMARY KEY CLUSTERED ([id] DESC)
  );
END;

IF OBJECT_ID(N'dbo.Leaktest', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Leaktest (
    [Id] INT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_Leaktest] PRIMARY KEY,
    [Machine] NVARCHAR(100) NOT NULL,
    [PLC_IP] NVARCHAR(50) NOT NULL,
    [Status] NVARCHAR(50) NOT NULL,
    [Cycle_End_Time] DATETIME NOT NULL,
    [Part_QR_Code] NVARCHAR(100) NULL,
    [Result] NVARCHAR(20) NULL,
    [Body_Leak_Value] FLOAT NULL,
    [Gall_1] FLOAT NULL,
    [Gall_2] FLOAT NULL,
    [Cycle_Time] INT NULL,
    [Running_Mode] NVARCHAR(40) NULL,
    [Manual] BIT NULL,
    [Dry] BIT NULL,
    [Wey] BIT NULL,
    [Both] BIT NULL
  );
END;

IF OBJECT_ID(N'dbo.Gauge', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Gauge (
    [Id] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_Gauge] PRIMARY KEY,
    [Recorded_At] DATETIME2(3) NOT NULL CONSTRAINT [DF_Gauge_Recorded_At] DEFAULT SYSUTCDATETIME(),
    [Machine_Key] NVARCHAR(80) NULL,
    [Machine_Name] NVARCHAR(160) NULL,
    [PLC_IP] NVARCHAR(45) NULL,
    [PLC_Port] INT NULL,
    [Part_Scan_Data] NVARCHAR(120) NULL,
    [Cycle_Time_In_Sec] DECIMAL(18,2) NULL,
    [Gauge_Status] NVARCHAR(50) NULL,
    [Gauge_Judgement] NVARCHAR(50) NULL,
    [Cycle_Mode_Auto_Manual] NVARCHAR(30) NULL,
    [Cycle_Start] INT NULL,
    [Cycle_Complete] INT NULL
  );
END;

IF COL_LENGTH('dbo.Gauge', 'Recorded_At') IS NULL
  ALTER TABLE dbo.Gauge ADD [Recorded_At] DATETIME2(3) NOT NULL CONSTRAINT [DF_Gauge_Recorded_At] DEFAULT SYSUTCDATETIME();
IF COL_LENGTH('dbo.Gauge', 'Machine_Key') IS NULL
  ALTER TABLE dbo.Gauge ADD [Machine_Key] NVARCHAR(80) NULL;
IF COL_LENGTH('dbo.Gauge', 'Machine_Name') IS NULL
  ALTER TABLE dbo.Gauge ADD [Machine_Name] NVARCHAR(160) NULL;
IF COL_LENGTH('dbo.Gauge', 'PLC_IP') IS NULL
  ALTER TABLE dbo.Gauge ADD [PLC_IP] NVARCHAR(45) NULL;
IF COL_LENGTH('dbo.Gauge', 'PLC_Port') IS NULL
  ALTER TABLE dbo.Gauge ADD [PLC_Port] INT NULL;
IF COL_LENGTH('dbo.Gauge', 'Part_Scan_Data') IS NULL
  ALTER TABLE dbo.Gauge ADD [Part_Scan_Data] NVARCHAR(120) NULL;
IF COL_LENGTH('dbo.Gauge', 'Cycle_Time_In_Sec') IS NULL
  ALTER TABLE dbo.Gauge ADD [Cycle_Time_In_Sec] DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.Gauge', 'Gauge_Status') IS NULL
  ALTER TABLE dbo.Gauge ADD [Gauge_Status] NVARCHAR(50) NULL;
IF COL_LENGTH('dbo.Gauge', 'Gauge_Judgement') IS NULL
  ALTER TABLE dbo.Gauge ADD [Gauge_Judgement] NVARCHAR(50) NULL;
IF COL_LENGTH('dbo.Gauge', 'Cycle_Mode_Auto_Manual') IS NULL
  ALTER TABLE dbo.Gauge ADD [Cycle_Mode_Auto_Manual] NVARCHAR(30) NULL;
IF COL_LENGTH('dbo.Gauge', 'Cycle_Start') IS NULL
  ALTER TABLE dbo.Gauge ADD [Cycle_Start] INT NULL;
IF COL_LENGTH('dbo.Gauge', 'Cycle_Complete') IS NULL
  ALTER TABLE dbo.Gauge ADD [Cycle_Complete] INT NULL;

IF OBJECT_ID(N'dbo.Gauge', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_Gauge_machine_recorded_desc'
       AND object_id = OBJECT_ID(N'dbo.Gauge')
   )
  CREATE INDEX [IX_Gauge_machine_recorded_desc]
    ON dbo.Gauge ([PLC_IP], [Machine_Key], [Recorded_At] DESC, [Id] DESC);

IF OBJECT_ID(N'dbo.Gauge', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_Gauge_report_filters'
       AND object_id = OBJECT_ID(N'dbo.Gauge')
   )
  CREATE INDEX [IX_Gauge_report_filters]
    ON dbo.Gauge ([PLC_IP], [Recorded_At] DESC, [Id] DESC)
    INCLUDE ([Machine_Key], [Part_Scan_Data], [Cycle_Time_In_Sec], [Gauge_Status], [Gauge_Judgement], [Cycle_Mode_Auto_Manual]);

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.plc_machine_configs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    machine_key NVARCHAR(80) NOT NULL UNIQUE,
    machine_name NVARCHAR(160) NOT NULL,
    machine_type NVARCHAR(40) NOT NULL DEFAULT 'generic',
    machine_id BIGINT NULL,
    plant_code NVARCHAR(40) NULL,
    ip_address VARCHAR(50) NOT NULL,
    port INT NOT NULL DEFAULT 5002,
    protocol NVARCHAR(30) NOT NULL DEFAULT 'SLMP',
    sequence_no INT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    register_config_json NVARCHAR(MAX) NULL,
    notes NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.plc_machine_configs', 'machine_type') IS NULL
BEGIN
  ALTER TABLE dbo.plc_machine_configs ADD machine_type NVARCHAR(40) NULL;
  UPDATE dbo.plc_machine_configs SET machine_type = N'generic' WHERE machine_type IS NULL;
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.plc_machine_configs', 'machine_id') IS NULL
  ALTER TABLE dbo.plc_machine_configs ADD machine_id BIGINT NULL;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.plc_machine_configs', 'plant_code') IS NULL
  ALTER TABLE dbo.plc_machine_configs ADD plant_code NVARCHAR(40) NULL;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.plc_machine_configs', 'register_config_json') IS NOT NULL
BEGIN
  UPDATE dbo.plc_machine_configs
  SET register_config_json = N'[]'
  WHERE ISJSON(register_config_json) = 1
    AND ISNULL(machine_type, N'') <> N'ube'
    AND (
      JSON_VALUE(register_config_json, '$[0].id') = N'Sr. No-0'
      OR JSON_VALUE(register_config_json, '$[0].name') = N'Sr. No'
      OR JSON_VALUE(register_config_json, '$[0].name') = N'part_qr_code'
    );
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
BEGIN
  UPDATE pc
  SET machine_key = pc.ip_address,
      machine_type = N'ube',
      updated_at = SYSUTCDATETIME()
  FROM dbo.plc_machine_configs pc
  WHERE pc.ip_address IN ('192.168.117.200', '192.168.117.201', '192.168.117.202', '192.168.117.203')
    AND NOT EXISTS (
      SELECT 1
      FROM dbo.plc_machine_configs other
      WHERE other.id <> pc.id
        AND other.machine_key = pc.ip_address
    );
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_plc_machine_configs_ip_address'
       AND object_id = OBJECT_ID(N'dbo.plc_machine_configs')
   )
  CREATE INDEX IX_plc_machine_configs_ip_address
    ON dbo.plc_machine_configs (ip_address);

IF OBJECT_ID(N'dbo.plc_registers', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.plc_registers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    profile_key NVARCHAR(80) NOT NULL,
    parameter_name NVARCHAR(200) NOT NULL,
    display_label NVARCHAR(200) NULL,
    device NVARCHAR(50) NULL,
    device_type NVARCHAR(40) NULL,
    data_type NVARCHAR(40) NOT NULL DEFAULT N'int',
    scale_factor DECIMAL(18,6) NOT NULL DEFAULT 1,
    unit NVARCHAR(40) NULL,
    group_name NVARCHAR(80) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    string_length INT NULL,
    computed_key NVARCHAR(80) NULL,
    show_live BIT NOT NULL DEFAULT 1,
    save_db BIT NOT NULL DEFAULT 1,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.plc_registers', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'UX_plc_registers_profile_parameter'
       AND object_id = OBJECT_ID(N'dbo.plc_registers')
   )
  CREATE UNIQUE INDEX UX_plc_registers_profile_parameter
    ON dbo.plc_registers (profile_key, parameter_name);

IF OBJECT_ID(N'dbo.PlcCycleReadings', N'U') IS NOT NULL
  UPDATE dbo.PlcCycleReadings
  SET machine_key = plc_ip
  WHERE plc_ip IN ('192.168.117.200', '192.168.117.201', '192.168.117.202', '192.168.117.203');

IF OBJECT_ID(N'dbo.PlcConnectionEvents', N'U') IS NOT NULL
  UPDATE dbo.PlcConnectionEvents
  SET machine_key = plc_ip
  WHERE plc_ip IN ('192.168.117.200', '192.168.117.201', '192.168.117.202', '192.168.117.203');

IF OBJECT_ID(N'dbo.plc_machine_readings', N'U') IS NOT NULL
  UPDATE dbo.plc_machine_readings
  SET machine_key = plc_ip
  WHERE plc_ip IN ('192.168.117.200', '192.168.117.201', '192.168.117.202', '192.168.117.203');

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.Leaktest', N'U') IS NOT NULL
BEGIN
  UPDATE lt
  SET lt.Machine = pc.machine_name
  FROM dbo.Leaktest lt
  INNER JOIN dbo.plc_machine_configs pc
    ON pc.ip_address = lt.PLC_IP
  WHERE ISNULL(lt.Machine, N'') <> ISNULL(pc.machine_name, N'');
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.Gauge', N'U') IS NOT NULL
BEGIN
  UPDATE g
  SET g.Machine_Name = pc.machine_name
  FROM dbo.Gauge g
  INNER JOIN dbo.plc_machine_configs pc
    ON pc.ip_address = g.PLC_IP OR pc.machine_key = g.Machine_Key
  WHERE ISNULL(g.Machine_Name, N'') <> ISNULL(pc.machine_name, N'');
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.PlcCycleReadings', N'U') IS NOT NULL
BEGIN
  UPDATE r
  SET r.machine_name = pc.machine_name
  FROM dbo.PlcCycleReadings r
  INNER JOIN dbo.plc_machine_configs pc
    ON pc.ip_address = r.plc_ip OR pc.machine_key = r.machine_key
  WHERE ISNULL(r.machine_name, N'') <> ISNULL(pc.machine_name, N'');
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.PlcConnectionEvents', N'U') IS NOT NULL
BEGIN
  UPDATE e
  SET e.machine_name = pc.machine_name
  FROM dbo.PlcConnectionEvents e
  INNER JOIN dbo.plc_machine_configs pc
    ON pc.ip_address = e.plc_ip OR pc.machine_key = e.machine_key
  WHERE ISNULL(e.machine_name, N'') <> ISNULL(pc.machine_name, N'');
END;

IF OBJECT_ID(N'dbo.plc_machine_configs', N'U') IS NOT NULL
   AND OBJECT_ID(N'dbo.plc_machine_readings', N'U') IS NOT NULL
BEGIN
  UPDATE r
  SET r.machine_name = pc.machine_name
  FROM dbo.plc_machine_readings r
  INNER JOIN dbo.plc_machine_configs pc
    ON pc.ip_address = r.plc_ip OR pc.machine_key = r.machine_key
  WHERE ISNULL(r.machine_name, N'') <> ISNULL(pc.machine_name, N'');
END;

EXEC(N'CREATE OR ALTER TRIGGER dbo.trg_PlcCycleReadings_ShotDate
ON dbo.PlcCycleReadings
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE target
  SET [shot_date] = COALESCE(target.[shot_date], TRY_CONVERT(date, CONCAT(
    CASE
      WHEN TRY_CONVERT(INT, target.[shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, target.[shot_year])
      ELSE TRY_CONVERT(INT, target.[shot_year])
    END,
    ''-'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_month]) AS VARCHAR(2)), 2),
    ''-'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_day]) AS VARCHAR(2)), 2)
  ))),
  [shot_datetime] = COALESCE(target.[shot_datetime], TRY_CONVERT(datetime2(0), CONCAT(
    CASE
      WHEN TRY_CONVERT(INT, target.[shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, target.[shot_year])
      ELSE TRY_CONVERT(INT, target.[shot_year])
    END,
    ''-'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_month]) AS VARCHAR(2)), 2),
    ''-'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_day]) AS VARCHAR(2)), 2),
    ''T'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_hour]) AS VARCHAR(2)), 2),
    '':'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_minute]) AS VARCHAR(2)), 2),
    '':'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_second]) AS VARCHAR(2)), 2)
  ))),
  [recorded_at] = COALESCE(TRY_CONVERT(datetime2(0), CONCAT(
    CASE
      WHEN TRY_CONVERT(INT, target.[shot_year]) < 100 THEN 2000 + TRY_CONVERT(INT, target.[shot_year])
      ELSE TRY_CONVERT(INT, target.[shot_year])
    END,
    ''-'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_month]) AS VARCHAR(2)), 2),
    ''-'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_day]) AS VARCHAR(2)), 2),
    ''T'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_hour]) AS VARCHAR(2)), 2),
    '':'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_minute]) AS VARCHAR(2)), 2),
    '':'',
    RIGHT(''00'' + CAST(TRY_CONVERT(INT, target.[shot_second]) AS VARCHAR(2)), 2)
  )), target.[recorded_at])
  FROM dbo.PlcCycleReadings target
  INNER JOIN inserted i ON i.[id] = target.[id]
  WHERE TRY_CONVERT(INT, target.[shot_year]) IS NOT NULL
    AND TRY_CONVERT(INT, target.[shot_month]) BETWEEN 1 AND 12
    AND TRY_CONVERT(INT, target.[shot_day]) BETWEEN 1 AND 31
    AND TRY_CONVERT(INT, target.[shot_hour]) BETWEEN 0 AND 23
    AND TRY_CONVERT(INT, target.[shot_minute]) BETWEEN 0 AND 59
    AND TRY_CONVERT(INT, target.[shot_second]) BETWEEN 0 AND 59;
END');

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_id_desc'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_id_desc] ON dbo.PlcCycleReadings ([id] DESC);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_machine_key_recorded_desc'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_machine_key_recorded_desc]
    ON dbo.PlcCycleReadings ([machine_key], [recorded_at] DESC, [id] DESC);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_plc_ip_recorded_desc'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_plc_ip_recorded_desc]
    ON dbo.PlcCycleReadings ([plc_ip], [recorded_at] DESC, [id] DESC);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_machine_shot_date_number'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  EXEC(N'CREATE INDEX [IX_PlcCycleReadings_machine_shot_date_number]
    ON dbo.PlcCycleReadings ([machine_key], [shot_date], [shot_number], [recorded_at] DESC, [id] DESC)');
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_ip_shot_date_number'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  EXEC(N'CREATE INDEX [IX_PlcCycleReadings_ip_shot_date_number]
    ON dbo.PlcCycleReadings ([plc_ip], [shot_date], [shot_number], [recorded_at] DESC, [id] DESC)');
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_machine_report_filters'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  EXEC(N'CREATE INDEX [IX_PlcCycleReadings_machine_report_filters]
    ON dbo.PlcCycleReadings ([machine_key], [shot_date] DESC, [recorded_at] DESC, [id] DESC)
    INCLUDE ([plc_ip], [shot_number], [shot_status], [shot_hour], [shot_minute])');
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcCycleReadings_ip_report_filters'
    AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
)
BEGIN
  EXEC(N'CREATE INDEX [IX_PlcCycleReadings_ip_report_filters]
    ON dbo.PlcCycleReadings ([plc_ip], [shot_date] DESC, [recorded_at] DESC, [id] DESC)
    INCLUDE ([machine_key], [shot_number], [shot_status], [shot_hour], [shot_minute])');
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_PlcConnectionEvents_started_at_desc'
    AND [object_id] = OBJECT_ID(N'dbo.PlcConnectionEvents')
)
BEGIN
  CREATE INDEX [IX_PlcConnectionEvents_started_at_desc]
    ON dbo.PlcConnectionEvents ([started_at] DESC, [id] DESC);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_Leaktest_ip_cycle_end_desc'
    AND [object_id] = OBJECT_ID(N'dbo.Leaktest')
)
BEGIN
  CREATE INDEX [IX_Leaktest_ip_cycle_end_desc]
    ON dbo.Leaktest ([PLC_IP], [Cycle_End_Time] DESC, [Id] DESC);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE [name] = N'IX_Leaktest_report_filters'
    AND [object_id] = OBJECT_ID(N'dbo.Leaktest')
)
BEGIN
  CREATE INDEX [IX_Leaktest_report_filters]
    ON dbo.Leaktest ([PLC_IP], [Cycle_End_Time] DESC, [Id] DESC)
    INCLUDE ([Part_QR_Code], [Result], [Cycle_Time], [Running_Mode]);
END;

IF OBJECT_ID(N'dbo.plc_machine_readings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.plc_machine_readings (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plc_machine_readings PRIMARY KEY,
    recorded_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_readings_recorded_at DEFAULT SYSUTCDATETIME(),
    machine_config_id INT NULL,
    machine_key NVARCHAR(80) NOT NULL,
    machine_name NVARCHAR(160) NULL,
    machine_type NVARCHAR(40) NULL,
    plc_ip NVARCHAR(45) NULL,
    plc_port INT NULL,
    part_name NVARCHAR(160) NULL,
    event_time DATETIME2(3) NULL,
    raw_readings_json NVARCHAR(MAX) NULL,
    created_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_readings_created_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.plc_machine_reading_values', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.plc_machine_reading_values (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plc_machine_reading_values PRIMARY KEY,
    reading_id BIGINT NOT NULL,
    parameter_key NVARCHAR(160) NOT NULL,
    parameter_label NVARCHAR(200) NULL,
    parameter_type NVARCHAR(40) NULL,
    parameter_unit NVARCHAR(40) NULL,
    numeric_value DECIMAL(18,4) NULL,
    text_value NVARCHAR(MAX) NULL,
    bool_value BIT NULL,
    raw_value NVARCHAR(MAX) NULL,
    created_at DATETIME2(3) NOT NULL CONSTRAINT DF_plc_machine_reading_values_created_at DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.plc_machine_readings', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_plc_machine_readings_machine_recorded_desc'
       AND object_id = OBJECT_ID(N'dbo.plc_machine_readings')
   )
  CREATE INDEX IX_plc_machine_readings_machine_recorded_desc
    ON dbo.plc_machine_readings (machine_key, recorded_at DESC, id DESC);

IF OBJECT_ID(N'dbo.plc_machine_reading_values', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_plc_machine_reading_values_reading_parameter'
       AND object_id = OBJECT_ID(N'dbo.plc_machine_reading_values')
   )
  CREATE INDEX IX_plc_machine_reading_values_reading_parameter
    ON dbo.plc_machine_reading_values (reading_id, parameter_key);

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
