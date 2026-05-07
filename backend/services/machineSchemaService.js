const sequelize = require("../config/db");

const FILTERED_QR_SCANNER_INDEX = "UX_Machines_qr_scanner_ip_not_blank";

function quoteIdentifier(name) {
  return `[${String(name || "").replace(/]/g, "]]")}]`;
}

async function getUniqueQrScannerIndexes(transaction) {
  const [rows] = await sequelize.query(
    `
    SELECT
      i.name AS index_name,
      CAST(i.is_unique_constraint AS bit) AS is_unique_constraint
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic
      ON ic.object_id = i.object_id
      AND ic.index_id = i.index_id
      AND ic.is_included_column = 0
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id
      AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.Machines')
      AND i.is_unique = 1
    GROUP BY i.object_id, i.index_id, i.name, i.is_unique_constraint
    HAVING COUNT(*) = 1
      AND SUM(CASE WHEN c.name = 'qr_scanner_ip' THEN 1 ELSE 0 END) = 1;
    `,
    { transaction }
  );
  return rows || [];
}

async function ensureMachineQrScannerUniqueness() {
  const isMssql = typeof sequelize.getDialect === "function" && sequelize.getDialect() === "mssql";
  if (!isMssql) return;

  const [tableRows] = await sequelize.query(
    "SELECT OBJECT_ID(N'dbo.Machines', N'U') AS table_id;"
  );
  if (!tableRows?.[0]?.table_id) return;

  const transaction = await sequelize.transaction();
  try {
    const indexes = await getUniqueQrScannerIndexes(transaction);
    for (const index of indexes) {
      const name = quoteIdentifier(index.index_name);
      if (index.is_unique_constraint) {
        await sequelize.query(`ALTER TABLE [dbo].[Machines] DROP CONSTRAINT ${name};`, { transaction });
      } else {
        await sequelize.query(`DROP INDEX ${name} ON [dbo].[Machines];`, { transaction });
      }
    }

    await sequelize.query(
      `
      UPDATE [dbo].[Machines]
      SET [qr_scanner_ip] = NULL
      WHERE [qr_scanner_ip] IS NOT NULL
        AND LTRIM(RTRIM([qr_scanner_ip])) = '';
      `,
      { transaction }
    );

    await sequelize.query(
      `
      IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.Machines')
          AND name = N'${FILTERED_QR_SCANNER_INDEX}'
      )
      BEGIN
        CREATE UNIQUE NONCLUSTERED INDEX [${FILTERED_QR_SCANNER_INDEX}]
        ON [dbo].[Machines]([qr_scanner_ip])
        WHERE [qr_scanner_ip] IS NOT NULL
          AND [qr_scanner_ip] <> '';
      END;
      `,
      { transaction }
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  ensureMachineQrScannerUniqueness,
  FILTERED_QR_SCANNER_INDEX,
};
