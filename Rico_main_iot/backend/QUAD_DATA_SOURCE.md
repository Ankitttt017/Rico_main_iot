# QUAD gateway (MQTT) data source

A machine with **Data Source = QUAD Gateway** and a **QUAD IP Address** in Machine Config
(or listed in `QUAD_MACHINES`) gets its shots from the QUAD edge gateway over MQTT
instead of a direct PLC (SLMP) connection. Everything else works as before: shots are saved
in `PlcCycleReadings` with the same columns and units, the Real Time Monitor and the
Production Reports show them, and all other machines keep their direct PLC connection.

```
PLC -> QUAD (Pi) --MQTT--> Mosquitto --> Rico backend --> PlcCycleReadings + Real Time Monitor
                  <-- ACK (after the DB save) --
```

## Settings (`backend/.env`, never committed)

| Variable | Example | Meaning |
|---|---|---|
| `QUAD_MACHINES` | `192.168.117.201=UBE-850T-02` | Only for QUADs that send no `gateway_ip`: `<machine key or PLC IP>=<QUAD machine_id>`, comma separated |
| `MQTT_URL` | `mqtt://localhost:1883` | Broker. On production the broker runs on the same server. |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | `rico_backend` / ... | Broker login |
| `MQTT_CLIENT_ID` | `rico-iot-backend` (default) | Fixed id = persistent session. Never use `quad-bridge-01`. |
| `QUAD_RUNNING_WINDOW_MS` | `180000` (default) | Machine State shows RUNNING this long after the last shot |
| `QUAD_LIVE_MAX_AGE_MS` | `300000` (default) | Older shots (QUAD backlog) are saved but not pushed to the live screen |
| `PLC_DIRECT_POLLING_ENABLED` | `false` | **Local testing only**: no direct PLC connections at all |

The MQTT subscriber starts when `MQTT_URL` is set.

## Which machine a message belongs to

- Message with `gateway_ip` (IP of the QUAD Pi): the machine whose Machine Config has
  Data Source = QUAD Gateway and that QUAD IP. Matched **only** by IP: a Pi whose IP is not
  configured is never saved under another machine, even with the same `machine_id`.
- Message without `gateway_ip`: the machine whose `QUAD_MACHINES` entry has the topic `machine_id`.
- No match: nothing is saved and no ACK is sent (log: `not acknowledged: machine-not-on-quad`);
  QUAD keeps the shot and resends it.
- Rows are saved under the machine's own name and PLC IP (`machine_key`, `plc_ip`), as with
  the direct connection; the QUAD IP is only used for the match.

## Switch a machine to QUAD (Machine Config)

1. The QUAD Pi is connected to the broker (online) and sends `gateway_ip`; its old backlog is
   marked SYNCED so it does not resend shots the direct connection already saved.
2. Machine Config -> edit the machine -> Data Source = QUAD Gateway (MQTT), QUAD IP Address =
   the Pi's IP -> Save. One QUAD IP belongs to one machine.
3. Within 15 s the direct PLC connection closes. Log:
   `[QUAD] <machine>: direct PLC connection skipped; data source is QUAD <QUAD IP>`.
4. Check the Real Time Monitor and that new shot numbers appear in the Production Report.

Roll back: Data Source = Direct PLC -> Save. The direct connection starts again within 15 s.
No restart.

## Switch a machine to QUAD (`QUAD_MACHINES`, QUADs without `gateway_ip`)

1. Stop the QUAD Bridge (`python -m server.quad_bridge`) if it is running; otherwise every shot
   is saved twice.
2. Add the machine to `QUAD_MACHINES` and set the `MQTT_*` values in the server `.env`.
3. `pm2 restart rico-main-iot-backend --update-env`
4. Check the log: `[QUAD] <machine>: direct PLC connection skipped`, `[QUAD] MQTT connected`,
   `[QUAD] Subscribed to quad/+/telemetry and quad/+/status`.
5. Check the Real Time Monitor (Machine State ONLINE/RUNNING) and that new shot numbers appear
   in the Production Report without gaps.

## Roll back a `QUAD_MACHINES` machine to the direct PLC connection

Remove the machine from `QUAD_MACHINES` (or remove the line) and restart the backend.
No code change and no DB change is needed. QUAD keeps buffering shots it cannot deliver.

## How shots are handled

- Topics: `quad/<machine_id>/telemetry` (shots), `quad/<machine_id>/status` (online/offline,
  retained), `quad/<machine_id>/ack` (written by this backend).
- Values: QUAD's `raw_value` (the unscaled PLC number) goes through the machine's own register
  config and `scaleValue()`, exactly like a direct PLC read. `quality = BAD` -> NULL.
- Limits: read only from each register's Min PLC Address / Max PLC Address in Machine Config.
  A register with neither stores no limits, and QUAD must send those addresses.
- Shot time = the PLC shot time QUAD sends (`shot.shot_time`), the time the HMI shows, always.
  `acquired_at` (when QUAD read the shot) is used only when the message has no readable PLC time.
  Production day starts at 06:00.
- ACK `SAVED` after the DB insert; `DUPLICATE` when the shot is already stored (or the save
  rules reject it, e.g. incomplete cycle time); `ERROR` when the DB insert fails (QUAD resends
  in about 60 s). Unreadable messages get no ACK (QUAD resends after 300 s).
- Duplicate check: same as direct mode (machine + shot number + time), plus the last 5000
  `event_uuid`s in memory.
- Not available from QUAD: `ok_shot` (D947) and `ng_counter` (D955) stay NULL unless QUAD adds
  those registers.
- Plant temperature/humidity are read from the environment PLC for live shots only.

## Local test

1. Mosquitto on `localhost:1883`, a test DB in `.env`, and `PLC_DIRECT_POLLING_ENABLED=false`.
2. `npm test` (mapping, ACK, duplicates, bad messages).
3. Publish a sample shot:
   `mosquitto_pub -h 127.0.0.1 -u rico_backend -P <password> -t quad/UBE-850T-02/telemetry -q 1 -f test/fixtures/quad_sample_shot.json`
   and watch the ACK: `mosquitto_sub -h 127.0.0.1 -u rico_backend -P <password> -t "quad/+/ack" -v`
