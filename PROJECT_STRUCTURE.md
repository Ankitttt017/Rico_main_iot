# Project Structure

This workspace now keeps only the Rico IoT project:

```text
Rico_main_iot/
  backend/
  frontend/
  ecosystem.config.js
  package.json
  README.md
```

The old Traceability project, temporary compatibility junctions, archived duplicate code, root dependency folder, and generated logs have been removed.

`uptime-kuma/` is left at the workspace root because it is a separate local monitoring service, not Rico IoT source code.
