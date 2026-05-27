# Rico IoT Platform

This project now runs only the Rico IoT/master-data app. The old combined backend has been removed.

## Project Structure

```text
Rico_main_iot/
  frontend/              React + Vite frontend
  backend/
    rico-iot/            Express API and SQL Server data access
```

## Database

Configure SQL Server in `backend/rico-iot/.env`:

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

If you want Windows authentication, set `DB_TRUSTED_CONNECTION=true` and install the optional driver in `backend/rico-iot`:

```bash
npm install msnodesqlv8
```

The IoT schema is in `backend/rico-iot/schema.mssql.sql`. To let the backend run the non-destructive schema check on startup, set:

```env
DB_AUTO_MIGRATE=true
```

## How To Run

Backend:

```bash
cd backend/rico-iot
npm start
```

Frontend:

```bash
cd frontend
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api/*` to the backend on `http://localhost:5000`.
