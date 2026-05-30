# Project Structure

This workspace keeps Rico IoT as the main project. The live production copy is separate and should not be edited manually.

```text
Rico_main_iot/
  backend/
    src/
      config/                 Database and backend configuration
      modules/
        lines/                Line Master routes/controllers
        machines/             Machine Master routes/controllers
        parts/                Part Master routes/controllers
        plcMonitor/           PLC polling, live readings, reports API
          config/             Trial machine config and register maps
          polling/            Future polling manager/per-machine workers
          protocols/          Future PLC protocol clients
          repositories/       Future SQL persistence/query layer
          socket/             Future Socket.IO gateway
      routes/                 Compatibility route re-exports
      controllers/            Compatibility controller re-exports
    server.js

  frontend/
    src/
      assets/
      components/
        common/               Shared layout/navigation/UI
        partmaster/           Compatibility re-exports
        partprofile/          Compatibility re-exports
      config/
        navigation.js         Sidebar navigation and external app links
      context/
      modules/
        lines/
          pages/
          components/
          utils/
          constants.js
        machine/
          pages/
          components/
        operations/
          pages/
        parts/
          pages/
          components/
          utils/
          constants.js
        plc-monitor/
          pages/
          components/
          utils/
          constants.js
        plc-report/
          pages/
        workstation/
          pages/
      pages/                  Route compatibility wrappers
      services/               Shared API client/endpoints
```

External Traceability app link is configured in:

```text
Rico_main_iot/frontend/src/config/navigation.js
```

Traceability itself is a separate project served by Nginx on port `9090`; it is not part of this Rico IoT source tree.
