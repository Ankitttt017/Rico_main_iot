"use strict";

const db = require("../src/config/db");

async function main() {
  const { rows } = await db.query(`
SELECT
  r.session_id,
  r.status,
  r.command,
  r.wait_type,
  r.blocking_session_id,
  r.total_elapsed_time,
  DB_NAME(r.database_id) AS database_name,
  SUBSTRING(t.text, (r.statement_start_offset / 2) + 1,
    ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text) ELSE r.statement_end_offset END - r.statement_start_offset) / 2) + 1
  ) AS statement_text
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.database_id = DB_ID()
ORDER BY r.total_elapsed_time DESC;
`);

  console.log(JSON.stringify(rows, null, 2));
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
