const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "y"].includes(String(value).trim().toLowerCase());
}

function isTrustedConnection() {
  return parseBool(process.env.DB_TRUSTED_CONNECTION, false);
}

function buildSqlServerName(host, instanceName, port) {
  if (instanceName) return `${host}\\${instanceName}`;
  if (port) return `${host},${port}`;
  return host;
}

let sqlServer = require("mssql");
let driverLoadError = null;

if (isTrustedConnection()) {
  try {
    sqlServer = require("mssql/msnodesqlv8");
  } catch (error) {
    driverLoadError = error;
  }
}

function getSqlServerConfig() {
  const host = process.env.DB_SERVER || process.env.DB_HOST || "localhost";
  const database = process.env.DB_DATABASE || process.env.DB_NAME || "IOT_Trace";
  const instanceName = process.env.DB_INSTANCE_NAME || "";
  const port = process.env.DB_PORT && !instanceName ? Number(process.env.DB_PORT) : undefined;
  const pool = {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: Number(process.env.DB_POOL_MIN || 0),
    idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT || 30000),
  };
  const options = {
    encrypt: parseBool(process.env.DB_ENCRYPT, false),
    trustServerCertificate: parseBool(process.env.DB_TRUST_SERVER_CERT, true),
    enableArithAbort: true,
  };

  if (instanceName) {
    options.instanceName = instanceName;
  }

  if (isTrustedConnection()) {
    const connectionString = process.env.DB_CONNECTION_STRING || [
      `Driver={${process.env.DB_ODBC_DRIVER || "ODBC Driver 18 for SQL Server"}}`,
      `Server=${buildSqlServerName(host, instanceName, port)}`,
      `Database=${database}`,
      "Trusted_Connection=Yes",
      `Encrypt=${options.encrypt ? "Yes" : "No"}`,
      `TrustServerCertificate=${options.trustServerCertificate ? "Yes" : "No"}`,
    ].join(";");

    return {
      connectionString,
      pool,
    };
  }

  const config = {
    server: host,
    database,
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD || process.env.DB_PASS,
    options,
    pool,
  };

  if (port) {
    config.port = port;
  }

  return config;
}

const config = getSqlServerConfig();
const pool = new sqlServer.ConnectionPool(config);
let poolConnect;

function getPool() {
  if (driverLoadError) {
    throw new Error(
      "DB_TRUSTED_CONNECTION=true requires the optional msnodesqlv8 driver. " +
      "Install it in backend or use SQL auth with DB_USER, DB_PASSWORD, and DB_TRUSTED_CONNECTION=false. " +
      `Original error: ${driverLoadError.message}`
    );
  }

  if (!poolConnect) {
    poolConnect = pool.connect();
  }
  return poolConnect;
}

function bindParams(request, params) {
  params.forEach((value, index) => {
    request.input(`p${index + 1}`, value);
  });
}

function toSqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function prepareSql(sql, params, { inlineParams = false } = {}) {
  let index = 0;
  const prepared = sql.replace(/\?/g, () => {
    index += 1;
    return inlineParams ? toSqlLiteral(params[index - 1]) : `@p${index}`;
  });

  if (index !== params.length) {
    throw new Error(`SQL parameter mismatch: expected ${index}, received ${params.length}`);
  }

  return prepared;
}

async function execute(sql, params = []) {
  const connection = await getPool();
  const request = connection.request();
  request.timeout = Number(process.env.DB_QUERY_TIMEOUT || 120000);
  const inlineParams = isTrustedConnection();
  if (!inlineParams) {
    bindParams(request, params);
  }
  const result = await request.query(prepareSql(sql, params, { inlineParams }));
  return result;
}

async function query(sql, params = []) {
  const result = await execute(sql, params);
  return {
    rows: result.recordset || [],
    rowCount: result.rowsAffected?.[0] || result.recordset?.length || 0,
  };
}

async function run(sql, params = []) {
  const result = await execute(sql, params);
  return {
    rows: result.recordset || [],
    rowCount: result.rowsAffected?.[0] || 0,
    changes: result.rowsAffected?.[0] || 0,
    insertId: result.recordset?.[0]?.insertId,
  };
}

async function initializeSchema(schemaPath = path.resolve(__dirname, "../../schema.mssql.sql")) {
  if (!fs.existsSync(schemaPath)) return;

  const script = fs.readFileSync(schemaPath, "utf8");
  const batches = script
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);

  for (const batch of batches) {
    await run(batch);
  }
}

module.exports = {
  query,
  run,
  pool,
  initializeSchema,
  getSqlServerConfig,
  isTrustedConnection,
};
