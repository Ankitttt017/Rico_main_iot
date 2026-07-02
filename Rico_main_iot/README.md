# Rico IoT Platform

Rico IoT is a single full-stack application with an Express/Socket.IO backend,
SQL Server persistence, and a React + Vite frontend.

For the full folder guide, see [`../docs/PROJECT_STRUCTURE.md`](../docs/PROJECT_STRUCTURE.md).

## Project Structure

```text
Rico_main_iot/
  backend/               Express API, SQL Server access, PLC monitor services
    scripts/             Database and diagnostic helper scripts
    src/config/          Backend configuration
    src/modules/         Feature-based API modules
    schema.mssql.sql     SQL Server schema
  frontend/              React + Vite frontend
    src/components/      Shared UI components
    src/modules/         Feature-based UI modules
    src/pages/           Top-level routed pages
    src/services/        API client and endpoint definitions
  ecosystem.config.js    PM2 process config
  package.json           Project-level helper scripts
```

## Database

Configure SQL Server in `backend/.env`:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=1433
DB_NAME=IOT_Trace
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true
DB_TRUSTED_CONNECTION=false
DB_USER=your_sql_user
DB_PASSWORD=your_sql_password
```

For a named instance such as `SQLEXPRESS`, set `DB_INSTANCE_NAME=SQLEXPRESS` and leave `DB_PORT` empty.

If you want Windows authentication, set `DB_TRUSTED_CONNECTION=true` and install the optional driver in `backend`:

```bash
npm install msnodesqlv8
```

The IoT schema is in `backend/schema.mssql.sql`. To let the backend apply it on startup, set:

```env
DB_AUTO_MIGRATE=true
```

For a new database, prefer an explicit one-time initialization while the backend is stopped:

```bash
npm --prefix backend run db:init
```

This applies `backend/schema.mssql.sql` in a transaction and verifies the tables,
critical CRUD columns, and indexes expected by the application. Keep
`DB_AUTO_MIGRATE=false` in production after initialization. Run a read-only check at
any time with:

```bash
npm --prefix backend run db:verify
```

## How To Run

Backend:

```bash
npm run backend:dev
```

Frontend:

```bash
npm run frontend:dev
```

The frontend runs on `http://localhost:5173` and proxies `/api/*` to the backend on `http://localhost:5000`.

If port `5000` is already in use, stop the existing backend process before running another backend instance.
