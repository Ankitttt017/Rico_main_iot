/*
  Report performance indexes.
  Run on RICO_IOT when report pages become slow for long date ranges.
*/

IF OBJECT_ID(N'dbo.PlcCycleReadings', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_PlcCycleReadings_machine_report_filters'
       AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
   )
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_machine_report_filters]
    ON dbo.PlcCycleReadings ([machine_key], [shot_date] DESC, [recorded_at] DESC, [id] DESC)
    INCLUDE ([plc_ip], [shot_number], [shot_status], [shot_hour], [shot_minute]);
END;

IF OBJECT_ID(N'dbo.PlcCycleReadings', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_PlcCycleReadings_ip_report_filters'
       AND [object_id] = OBJECT_ID(N'dbo.PlcCycleReadings')
   )
BEGIN
  CREATE INDEX [IX_PlcCycleReadings_ip_report_filters]
    ON dbo.PlcCycleReadings ([plc_ip], [shot_date] DESC, [recorded_at] DESC, [id] DESC)
    INCLUDE ([machine_key], [shot_number], [shot_status], [shot_hour], [shot_minute]);
END;

IF OBJECT_ID(N'dbo.Leaktest', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_Leaktest_report_filters'
       AND [object_id] = OBJECT_ID(N'dbo.Leaktest')
   )
BEGIN
  CREATE INDEX [IX_Leaktest_report_filters]
    ON dbo.Leaktest ([PLC_IP], [Cycle_End_Time] DESC, [Id] DESC)
    INCLUDE ([Part_QR_Code], [Result], [Cycle_Time], [Running_Mode]);
END;

IF OBJECT_ID(N'dbo.Gauge', N'U') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sys.indexes
     WHERE [name] = N'IX_Gauge_report_filters'
       AND [object_id] = OBJECT_ID(N'dbo.Gauge')
   )
BEGIN
  CREATE INDEX [IX_Gauge_report_filters]
    ON dbo.Gauge ([PLC_IP], [Recorded_At] DESC, [Id] DESC)
    INCLUDE ([Machine_Key], [Part_Scan_Data], [Cycle_Time_In_Sec], [Gauge_Status], [Gauge_Judgement], [Cycle_Mode_Auto_Manual]);
END;
