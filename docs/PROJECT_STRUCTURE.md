# Rico Main IoT Project Structure

This repository is organized around one deployable application in `Rico_main_iot/`.
Keep production code inside the app folder and keep local runtime data out of git.

```text
Rico_Main_Iot/
  .github/
    workflows/              CI and production deployment pipelines
  docs/
    PLC_DYNAMIC_MACHINE_ARCHITECTURE.md
    PROJECT_STRUCTURE.md    Repository organization guide
  Rico_main_iot/
    backend/
      server.js             Express and Socket.IO entry point
      schema.mssql.sql      SQL Server schema used by DB initialization
      scripts/              Database and operational helper scripts
      src/
        config/             Database and environment configuration
        modules/            Backend feature modules
          auth/
          departments/
          lines/
          locations/
          machines/
          parts/
          plcMachineConfigs/
          plcMonitor/
          workstation/
    frontend/
      index.html            Vite HTML entry
      src/
        App.jsx             React route shell
        assets/             Static UI assets
        components/         Shared UI components
        config/             UI navigation/configuration
        context/            React providers
        modules/            Frontend feature modules
        pages/              Top-level app pages
        services/           API clients and endpoint definitions
        utils/              Shared frontend utilities
    ecosystem.config.js     PM2 process definition
    package.json            Root app scripts
```

## Placement Rules

- Put backend business logic in `backend/src/modules/<feature>/`.
- Put frontend feature code in `frontend/src/modules/<feature>/`.
- Put reusable frontend UI in `frontend/src/components/`.
- Put API wrappers and endpoint names in `frontend/src/services/`.
- Put one-off database or diagnostic commands in `backend/scripts/`.
- Do not commit generated files such as `node_modules/`, `dist/`, logs, uploads, `.env`, or deployment archives.

## Cleaned Up

- Removed old backend `src/controllers` and `src/routes` compatibility shims.
- Removed unused backend mock data from `src/mock`.
- Removed the empty frontend `Ankit.js` placeholder.
- Removed generated deployment tarballs from the repository root.
