require('dotenv').config({ path: './backend/rico-iot/.env' });
const db = require('./backend/rico-iot/src/config/db');

async function alter() {
  try {
    // Add columns to line_master
    await db.run(`IF COL_LENGTH('dbo.line_master', 'part_code') IS NULL ALTER TABLE dbo.line_master ADD part_code VARCHAR(40) NULL`);
    await db.run(`IF COL_LENGTH('dbo.line_master', 'part_name') IS NULL ALTER TABLE dbo.line_master ADD part_name NVARCHAR(200) NULL`);
    await db.run(`IF COL_LENGTH('dbo.line_master', 'customer_name') IS NULL ALTER TABLE dbo.line_master ADD customer_name NVARCHAR(200) NULL`);
    
    // Add columns to iot_machines
    await db.run(`IF COL_LENGTH('dbo.iot_machines', 'ip_address') IS NULL ALTER TABLE dbo.iot_machines ADD ip_address VARCHAR(50) NULL`);
    
    console.log("DB altered successfully");
  } catch (e) {
    console.error("Error altering DB:", e);
  } finally {
    process.exit();
  }
}
alter();
