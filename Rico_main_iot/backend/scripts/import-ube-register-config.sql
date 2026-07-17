/*
  One-time UBE PLC register import.

  Use this only when dbo.plc_machine_configs.register_config_json is empty
  for UBE machines. This stores the register map in the database so the
  monitor reads parameters from DB instead of runtime hardcoded code.
*/

DECLARE @ube_register_config NVARCHAR(MAX) = N'[
  {"name":"Sr. No","type":"int","computed":"serial","enabled":true,"show_on_monitor":false,"log_history":true,"group":"Production","unit":""},
  {"name":"SHOT TIME","type":"text","computed":"shotTime","enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":""},
  {"name":"SHOT NO.","device":"D1120","type":"int","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":""},
  {"name":"CYCLE TIME sec.","device":"D1127","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Production","unit":"sec"},
  {"name":"HIGH SHOT COUNT","device":"D947","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Production","unit":""},
  {"name":"NG COUNTER","device":"D955","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Production","unit":""},
  {"name":"DIE-CLOSE CORE IN TIME sec","device":"D1128","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"POURING TIME sec","device":"D1129","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"SHOT FWD TIME sec","device":"D1130","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"CURING TIME sec","device":"D1137","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"DIE OPEN CORE OUT TIME sec","device":"D1132","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"EJECTOR TIME sec","device":"D1133","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"EXTRACT TIME sec","device":"D1134","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"SPRAY TIME sec","device":"D1135","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Cycle Timings","unit":"sec"},
  {"name":"V1 m/sec","device":"D6900","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"V2 m/sec","device":"D6902","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"V3 m/sec","device":"D6904","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"V4 m/sec","device":"D6906","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"m/sec"},
  {"name":"ACCEL. POINT mm","device":"D6908","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"mm"},
  {"name":"DEACEL. POINT mm","device":"D6910","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"mm"},
  {"name":"INTEN. TIME msec","device":"D6914","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"msec"},
  {"name":"BISCUIT THICKNESS mm","device":"D6916","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Shot Setup","unit":"mm"},
  {"name":"METAL PRESS. Mpa","device":"D6912","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MPa"},
  {"name":"CLAMP TONNAGE(HE.LOW) %","device":"D6918","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE(HE.LOW) MN","device":"D6920","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MN"},
  {"name":"CLAMP TONNAGE(OP.UP) %","device":"D6922","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE(OP.LOW) %","device":"D6924","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE(HE.UP) %","device":"D6926","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP FORCE (%)","device":"D1044","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"%"},
  {"name":"CLAMP TONNAGE (T)","device":"D1045","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"T"},
  {"name":"SHOT ACC. PRESSURE","device":"D1700","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MPa"},
  {"name":"INTENSIFICATION ACC. PRESSURE","device":"D1701","type":"decimal","scale":0.01,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"MPa"},
  {"name":"JET COOLING PRESSURE kgf/cm2","device":"D6954","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"kgf/cm2"},
  {"name":"VACUUM PRESSURE mbar","device":"D6928","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Pressure & Tonnage","unit":"mbar"},
  {"name":"COOLING WATER FLOW RATE (MOV.) L/min","device":"D6930","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"L/min"},
  {"name":"COOLING WATER FLOW RATE (STA.) L/min","device":"D6932","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"L/min"},
  {"name":"FURNACE METAL TEMP. C","device":"D6934","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Fixed Die Temp (F-1)","device":"D1400","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Fixed Die Temp (F-2)","device":"D1401","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Moving Die Temp (M-1)","device":"D1402","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Moving Die Temp (M-2)","device":"D1403","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"Slide Temp -1 (S-1)","device":"D1404","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"C"},
  {"name":"FIX. 1 Flow (Lpm)","device":"D1410","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"FIX. 2 Flow (Lpm)","device":"D1411","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"FIX. 3 Flow (Lpm)","device":"D1412","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Mov. 1 Flow (Lpm)","device":"D1413","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Mov. 2 Flow (Lpm)","device":"D1414","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Mov. 3 Flow (Lpm)","device":"D1415","type":"decimal","scale":0.1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"Lpm"},
  {"name":"Vacuum pressure (mmHg)","device":"D1416","type":"decimal","scale":1,"enabled":true,"show_on_monitor":true,"log_history":true,"group":"Temperature & Flow","unit":"mmHg"},
  {"name":"Cycle Start","device":"M840","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""},
  {"name":"Cycle End","device":"M4598","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""},
  {"name":"AVERAGE DIE CLAMP TONNAGE COUNT","device":"D7472","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""},
  {"name":"Time for stroke(ms)","device":"D10470","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":"ms"},
  {"name":"Stroke (mm)","device":"D10356","type":"decimal","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":"mm"},
  {"name":"Shot Status","device":"D1301","type":"int","scale":1,"enabled":true,"show_on_monitor":false,"log_history":true,"group":"Machine Signals","unit":""}
]';

IF ISJSON(@ube_register_config) <> 1
  THROW 51000, 'Invalid UBE register JSON.', 1;

UPDATE dbo.plc_machine_configs
SET register_config_json = @ube_register_config,
    updated_at = SYSUTCDATETIME()
WHERE machine_type = N'ube'
  AND ip_address IN (
    '192.168.117.200',
    '192.168.117.201',
    '192.168.117.202',
    '192.168.117.203'
  );

SELECT
  pc.machine_name,
  pc.ip_address,
  COUNT(j.[key]) AS register_count
FROM dbo.plc_machine_configs pc
OUTER APPLY OPENJSON(pc.register_config_json) j
WHERE pc.machine_type = N'ube'
  AND pc.ip_address IN (
    '192.168.117.200',
    '192.168.117.201',
    '192.168.117.202',
    '192.168.117.203'
  )
GROUP BY pc.machine_name, pc.ip_address
ORDER BY pc.ip_address;
