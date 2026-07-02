# PLC Dynamic Machine Architecture

The PLC module should be configuration-driven. New machines should not require
hardcoded machine names, parameter names, or report columns in source code.

## Source Of Truth

- `dbo.plc_machine_configs` stores each machine connection and its `machine_type`.
- `register_config_json` stores the machine's parameter/register definition.
- `dbo.plc_machine_readings` stores one generic reading snapshot per machine event.
- `dbo.plc_machine_reading_values` stores parameter values for each snapshot.

## Machine Setup Flow

1. Add a machine in Machine Manager or PLC machine config.
2. Save the machine type, IP, port, protocol, and register configuration.
3. The backend monitor reads that register configuration.
4. Readings are saved to generic PLC reading tables.
5. Monitor and report pages should build their fields from DB metadata and returned rows.

## Rules

- Do not add new machine-specific parameter lists in code.
- Do not infer machine behavior from names such as UBE, Gauge, or Leak Test.
- Use `machine_type` only as metadata or to select a protocol/trigger strategy.
- Prefer generic reading tables over creating one physical table per machine.
- Legacy tables such as `PlcCycleReadings`, `Leaktest`, and `Gauge` remain only for backward compatibility until reports are fully migrated.

## Why Not One Table Per Machine?

Creating a physical table for every machine makes reports, indexes, migrations,
permissions, and backups harder to manage. A generic readings table keeps all
machines queryable with the same API while still allowing different parameters
per machine.
