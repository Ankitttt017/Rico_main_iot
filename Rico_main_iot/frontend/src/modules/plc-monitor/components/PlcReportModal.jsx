import { Fragment, useCallback, useEffect, useState } from "react";
import { getPlcConnectionEvents, getPlcConnectionEventsExportUrl, getPlcHistoryExportUrl, getPlcReadingHistory } from "../../../services/api";
import { MACHINE_NAMES, REGISTER_GROUPS } from "../constants";
import { buildShotDateFromRow, buildShotTimeFromRow, formatDateOnly, formatDateTime, formatDuration, formatTimeOnly, getDisplayLabel, todayInput } from "../utils/plcFormatters";
import { formatValue } from "./PlcWidgets";

function getReportParameterRows(readings, machineKind = "ube") {
  const machineGroups = REGISTER_GROUPS.filter((group) => group.kind === machineKind);

  return machineGroups.flatMap((group) =>
    group.keys.map(({ name, unit, label }) => ({
      group: group.label,
      groupColor: group.color,
      name,
      label: label || getDisplayLabel(name),
      unit,
      value: readings[name]?.value ?? null,
    }))
  );
}

export default function PlcReportModal({ reading, readings, onClose }) {
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [historyRows, setHistoryRows] = useState([]);
  const [connectionRows, setConnectionRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const reportMachineId = reading.machine_key || reading.plc_ip;
  const isLeakTestReport = reading.kind === "leaktest";
  const parameterRows = getReportParameterRows(readings, isLeakTestReport ? "leaktest" : "ube");

  const loadReportPreview = useCallback(async () => {
    if (!reportMachineId) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await getPlcReadingHistory({
        ip: reportMachineId,
        from: fromDate,
        to: toDate,
        limit: 300,
      });
      const connectionResponse = await getPlcConnectionEvents({
        ip: reportMachineId,
        from: fromDate,
        to: toDate,
        limit: 300,
      });
      setHistoryRows(Array.isArray(response.data?.data) ? response.data.data : []);
      setConnectionRows(Array.isArray(connectionResponse.data?.data) ? connectionResponse.data.data : []);
    } catch {
      setHistoryRows([]);
      setConnectionRows([]);
      setHistoryError("Unable to load report preview.");
    } finally {
      setHistoryLoading(false);
    }
  }, [fromDate, reportMachineId, toDate]);

  useEffect(() => {
    loadReportPreview();
  }, [loadReportPreview]);

  const reportUrl = getPlcHistoryExportUrl({
    ip: reportMachineId,
    from: fromDate,
    to: toDate,
    limit: 5000,
  });
  const connectionReportUrl = getPlcConnectionEventsExportUrl({
    ip: reportMachineId,
    from: fromDate,
    to: toDate,
    limit: 5000,
  });

  return (
    <div className="report-backdrop">
      <section className="report-modal">
        <div className="report-head">
          <div>
            <div className="report-kicker">PLC Monitor Table</div>
            <h2 className="report-title">{reading.machine_name || MACHINE_NAMES[reading.plc_ip] || reading.plc_ip}</h2>
            <div className="report-sub">
              {reading.plc_ip || "-"}:{reading.plc_port || "-"} | {isLeakTestReport ? "Cycle End" : "Latest"}: {formatDateTime(reading.cycle_end_time || reading.recorded_at)}
            </div>
          </div>

          <div className="report-actions">
            <label className="report-date">
              <span>From</span>
              <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label className="report-date">
              <span>To</span>
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
            <button type="button" className="preview-btn" onClick={loadReportPreview}>
              ↻ Preview
            </button>
            <a className="download-btn" href={reportUrl}>
              ↓ Download Excel
            </a>
            <a className="download-btn download-warn" href={connectionReportUrl}>
              Connectivity Excel
            </a>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close report">
              ×
            </button>
          </div>
        </div>

        <div className="report-body">
          <div className="report-pane report-parameters">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {parameterRows.map((row, index) => {
                  const previous = parameterRows[index - 1];
                  const showGroup = !previous || previous.group !== row.group;
                  return (
                    <Fragment key={`${row.group}-${row.name}`}>
                      {showGroup && (
                        <tr>
                          <td colSpan={2} className="report-group" style={{ color: row.groupColor }}>
                            {row.group}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td>{row.label}</td>
                        <td>
                          <strong>{formatValue(row.value)}</strong>
                          {row.value !== null && row.value !== undefined && row.unit && (
                            <span className="report-unit">{row.unit}</span>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="report-pane">
            <div className="preview-head">
              <div className="preview-kicker">Historical Report Preview</div>
              <div className="preview-count">{historyRows.length} records from selected date range</div>
            </div>
            {historyError && <div className="preview-error">{historyError}</div>}
            {historyLoading ? (
              <div className="preview-loading">Loading report preview...</div>
            ) : (
              <>
                <table className="report-table history-preview">
                  <thead>
                    <tr>
                      <th>{isLeakTestReport ? "Cycle End Time" : "Recorded At"}</th>
                      {!isLeakTestReport && <th>Shot Date</th>}
                      {!isLeakTestReport && <th>Shot Time</th>}
                      <th>{isLeakTestReport ? "Result" : "Shot"}</th>
                      <th>{isLeakTestReport ? "Part QR Code" : "Part"}</th>
                      <th>Cycle</th>
                      {!isLeakTestReport && <th>Minor Stoppage</th>}
                      <th>{isLeakTestReport ? "Body Leak" : "OK"}</th>
                      <th>{isLeakTestReport ? "GALL" : "NG"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.id || `${row.plc_ip}-${row.recorded_at}`}>
                        <td>{formatDateTime(isLeakTestReport ? row.cycle_end_time || row.recorded_at : row.recorded_at)}</td>
                        {!isLeakTestReport && <td>{formatDateOnly(row.shot_date || buildShotDateFromRow(row)) || "-"}</td>}
                        {!isLeakTestReport && <td>{formatTimeOnly(row.shot_time || buildShotTimeFromRow(row)) || "-"}</td>}
                        <td><strong>{formatValue(isLeakTestReport ? row.result : row.shot_number)}</strong></td>
                        <td>{formatValue(isLeakTestReport ? row.part_qr_code || row.scan_data || row.part_name : row.part_name)}</td>
                        <td className="cycle-cell">{formatValue(row.cycle_time)}s</td>
                        {!isLeakTestReport && <td className="cycle-cell">{formatValue(row.minor_stoppage)}s</td>}
                        <td>{formatValue(isLeakTestReport ? row.body_leak_value : row.ok_shot)}</td>
                        <td>{formatValue(isLeakTestReport ? [row.gall_1, row.gall_2].filter(value => value !== null && value !== undefined).join(" / ") : row.ok_shot)}</td>
                      </tr>
                    ))}
                    {!historyRows.length && (
                      <tr>
                        <td colSpan={isLeakTestReport ? 6 : 9} className="empty-preview">No records found for this date range</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="preview-head connection-head">
                  <div className="preview-kicker">PLC / Server Connectivity</div>
                  <div className="preview-count">{connectionRows.length} events from selected date range</div>
                </div>
                <table className="report-table history-preview connection-preview">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Duration</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connectionRows.map((row) => (
                      <tr key={row.id || `${row.event_type}-${row.started_at}`}>
                        <td><strong>{formatValue(row.event_type)}</strong></td>
                        <td>{formatDateTime(row.started_at)}</td>
                        <td>{row.ended_at ? formatDateTime(row.ended_at) : "Running"}</td>
                        <td className="cycle-cell">{formatDuration(row.duration_seconds)}</td>
                        <td>{formatValue(row.reason)}</td>
                      </tr>
                    ))}
                    {!connectionRows.length && (
                      <tr>
                        <td colSpan={5} className="empty-preview">No connectivity events found for this date range</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
