"use strict";

const db = require("../src/config/db");

async function main() {
  console.log("Applying Gauge schema migration...");

  await db.run(`
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
`);

  await db.run(`
IF OBJECT_ID(N'dbo.Gauge', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_Gauge_machine_recorded_desc'
       AND object_id = OBJECT_ID(N'dbo.Gauge')
   )
  CREATE INDEX [IX_Gauge_machine_recorded_desc]
    ON dbo.Gauge ([PLC_IP], [Machine_Key], [Recorded_At] DESC, [Id] DESC);
`);

  const { rows } = await db.query(`
SELECT c.name AS column_name
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.Gauge')
  AND c.name IN (N'Recorded_At', N'Machine_Key', N'Machine_Name', N'PLC_IP', N'PLC_Port')
ORDER BY c.column_id;
`);
  console.log(`Gauge metadata columns present: ${rows.map((row) => row.column_name).join(", ")}`);
  console.log("Gauge schema migration applied.");
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.pool.close();
    } catch {
      // Ignore close errors.
    }
  });
