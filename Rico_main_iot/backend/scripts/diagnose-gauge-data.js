"use strict";

const db = require("../src/config/db");

async function main() {
  const { rows: configs } = await db.query(`
SELECT TOP 10
  id, machine_key, machine_name, machine_type, ip_address, port, register_config_json
FROM dbo.plc_machine_configs
WHERE machine_type = N'gauge' OR machine_name LIKE N'%GAUGE%'
ORDER BY id DESC;
`);

  console.log("Gauge configs:");
  for (const row of configs) {
    let registers = [];
    try {
      registers = JSON.parse(row.register_config_json || "[]");
    } catch {
      registers = [];
    }
    console.log(JSON.stringify({
      id: row.id,
      machine_key: row.machine_key,
      machine_name: row.machine_name,
      machine_type: row.machine_type,
      ip_address: row.ip_address,
      port: row.port,
      registers,
    }, null, 2));
  }

  const { rows: gaugeRows } = await db.query(`
SELECT TOP 10
  Id, Recorded_At, Machine_Key, Machine_Name, PLC_IP, PLC_Port,
  Part_Scan_Data, Cycle_Time_In_Sec, Gauge_Status, Gauge_Judgement,
  Cycle_Mode_Auto_Manual, Cycle_Start, Cycle_Complete
FROM dbo.Gauge
ORDER BY Id DESC;
`);
  console.log("Latest Gauge rows:");
  for (const row of gaugeRows) {
    console.log(JSON.stringify(row, null, 2));
  }
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
