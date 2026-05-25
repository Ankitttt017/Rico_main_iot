# MES Acquisition + Quality Integration Verification Guide

## Scope
This document defines the industrial verification process for Machine "Acquisition + Quality Integration" in MES traceability.

## Target Flow (OP120 Laser Example)
1. Operator scans Part ID at OP120.
2. MES validates Part ID with existing station rules.
3. Acquisition profile reads additional customer marking/QR from configured protocol.
4. MES maps and stores:
   - `partId`
   - `customerMarkingValue` / `customerQR`
   - `qualityResult` (OK/NG)
   - `timestamp`
   - `stationId`
   - `machineId`
5. Save to quality/acquisition record linked to operation log.

## Protocol Rule
- Only one active protocol profile per machine/station at a time.
- Validation must be protocol-scoped (no PLC validation for TCP/USB/etc).

## Supported Protocols
- TCP Client
- TCP Server / IP Push
- USB Scanner / Keyboard Wedge
- Serial COM
- PLC SLMP
- Modbus TCP
- File Watcher
- HTTP Push
- Simulation

## Config Contract (spcConfig)
```json
{
  "enabled": true,
  "activeProtocol": "TCP_CLIENT",
  "mode": "TCP_CLIENT",
  "protocolConfig": {
    "sourceIp": "192.168.1.50",
    "sourcePort": 9000
  },
  "parser": {
    "mode": "JSON",
    "delimiter": ",",
    "regex": ""
  },
  "fieldMappings": [
    {
      "label": "Customer Marking",
      "sourceKey": "MARKING",
      "saveAs": "customerMarkingValue",
      "dataType": "string",
      "required": true
    }
  ],
  "reliability": {
    "timeoutMs": 5000,
    "retryCount": 3,
    "retryDelayMs": 1000,
    "autoReconnect": true
  }
}
```

## Protocol Validation Matrix
### TCP Client
- Required: source IP, source port
- Must not show/validate PLC register fields
- Test: connect -> read packet -> parse -> preview

### TCP Server / IP Push
- Required: listener port
- Optional: listener IP, allowed source IP
- Test: bind listener -> receive payload -> parse preview

### USB Scanner
- Required: scanner mode/input behavior
- Must not require IP/Port
- Test: focus capture input -> scan preview -> regex/length validation

### Serial COM
- Required: COM port
- Optional: baud/parity/stop bits/data bits/delimiter
- Test: open COM -> read sample -> parse

### PLC SLMP / Modbus
- Required: PLC IP/Port + register info
- PLC port errors must only appear in PLC modes
- Test: connect -> read register(s) -> parse

### File Watcher
- Required: folder path
- Optional: pattern/read mode/archive
- Test: path access -> sample file read -> parse

### HTTP Push
- Required: endpoint/listener config
- Test: receive payload -> parse

### Simulation
- No physical endpoint required
- Test: synthetic payload parse

## Loophole Checklist
1. TCP mode showing PLC required error -> FAIL
2. USB mode requiring IP/Port -> FAIL
3. PLC mode without register validation -> FAIL
4. Multiple active protocols simultaneously -> FAIL
5. Mapping table fixed/hardcoded to RESULT only -> FAIL
6. Missing save preview JSON in test output -> FAIL
7. OP120 additional customer field not linked to partId -> FAIL
8. GlobalPopup regression (scan flow interruptions) -> FAIL

## Dry-Run Test Cases
- TC01 TCP_CLIENT_OK
- TC02 TCP_CLIENT_MISSING_PORT
- TC03 USB_NO_IP_REQUIRED
- TC04 PLC_PORT_REQUIRED_ONLY_IN_PLC
- TC05 FILE_WATCHER_PATH_REQUIRED
- TC06 SERIAL_COM_FORMAT_CHECK
- TC07 OP120_PARTID_PLUS_CUSTOMER_MARKING_MAP

## Execution Plan (Before Report Work)
1. Implement protocol-driven acquisition UI.
2. Validate save payload contract.
3. Validate backend test endpoint behavior per protocol.
4. Validate operator scan flow unaffected.
5. Validate GlobalPopup unaffected.
6. Freeze acquisition scope.
7. Start report work after acquisition sign-off.
