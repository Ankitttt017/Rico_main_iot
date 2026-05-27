const db = require('./backend/rico-iot/src/config/db');

async function check() {
  try {
    const parts = await db.query("SELECT DISTINCT manufacturing_type, material_group FROM dbo.iot_parts");
    console.dir(parts[0], {depth: null});
    const machines = await db.query("SELECT DISTINCT category FROM dbo.iot_machines");
    console.dir(machines[0], {depth: null});
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
check();
