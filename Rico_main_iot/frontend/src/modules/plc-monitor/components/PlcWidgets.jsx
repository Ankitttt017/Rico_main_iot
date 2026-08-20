import { getDisplayLabel, getReadingValue } from "../utils/plcFormatters";

export function Spark({ data, color = "#22d3ee" }) {
  if (!data) return null;

  const values = data.map(Number).filter(Number.isFinite);
  if (values.length === 0) return null;
  if (values.length < 2) return <div className="spark-empty" />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 76;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="spark">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CycleRunIcon({ type = "running" }) {
  if (type === "running") {
    return (
      <span className="cycle-anim-wrap cycle-running-icon" title="Cycle Running">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="bike-svg">
          <circle cx="5.5" cy="17.5" r="3.5" className="wheel-spin-1" strokeDasharray="3 2" />
          <circle cx="18.5" cy="17.5" r="3.5" className="wheel-spin-2" strokeDasharray="3 2" />
          <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
          <path d="M12 17.5V14l-3-3 4-3 2 3h3" />
          <path d="M8.5 17.5l2.5-6" />
        </svg>
      </span>
    );
  }
  if (type === "wait") {
    return (
      <span className="cycle-anim-wrap cycle-waiting-icon" title="Waiting for Cycle">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="wait-pulse-svg">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
    );
  }
  return (
    <span className="cycle-anim-wrap cycle-stopped-icon" title="Stopped">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <rect x="9" y="9" width="6" height="6" fill="currentColor" />
      </svg>
    </span>
  );
}

export const STATUS_CFG = {
  idle: { label: "Waiting for Cycle", cls: "status-idle", iconType: "wait" },
  running: { label: "Cycle Running", cls: "status-running", iconType: "running" },
  complete: { label: "Cycle Complete", cls: "status-running", iconType: "running" },
  stopped: { label: "Stopped", cls: "status-stopped", iconType: "stopped" },
};

export function formatValue(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value.toLocaleString();
  if (typeof value === "number" && !Number.isInteger(value)) {
    return Number(value.toFixed(2));
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "value")) return formatValue(value.value, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "raw")) return formatValue(value.raw, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "numeric_value")) return formatValue(value.numeric_value, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "text_value")) return formatValue(value.text_value, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "bool_value")) return formatValue(value.bool_value, fallback);
    if (Object.prototype.hasOwnProperty.call(value, "data")) return formatValue(value.data, fallback);
    return fallback;
  }

  return value;
}

export function hasReadableValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value).trim() !== "-";
}

export function ValueCard({ name, label, unit, value, history, accentColor }) {
  const hasValue = value !== null && value !== undefined;
  const displayValue = formatValue(value);

  return (
    <div className="vcard" style={{ "--accent": accentColor }}>
      <div className="vcard-top">
        <div className="vcard-name" title={name}>
          {label || getDisplayLabel(name)}
        </div>
        <span className="vcard-led" />
      </div>
      <div className="vcard-bottom">
        <div className="vcard-readout">
          <span className="vcard-val">{hasValue ? displayValue : "-"}</span>
          {hasValue && unit && <span className="vcard-unit">{unit}</span>}
        </div>
        <Spark data={history} color={accentColor} />
      </div>
    </div>
  );
}

export function MetricTile({ label, value, unit, tone = "cyan" }) {
  const isMachine = label === "Machine" || label === "Part Name";
  const displayValue = formatValue(value);

  return (
    <div className={`metric metric-${tone} ${isMachine ? "metric-machine" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" title={displayValue || ""}>
        {displayValue}
        {value !== null && value !== undefined && unit && (
          <span className="metric-unit">{unit}</span>
        )}
      </div>
    </div>
  );
}

export function MachineStatusCard({
  machineName,
  machineKind,
  plcConfig,
  socketConnected,
  monitoringRunning,
  selectedMachineStatus,
  readings,
  lastTimestamp,
}) {
  const isLeakTest = machineKind === "leaktest";
  const counter = readings.shot_number?.value ?? null;
  const highShot = readings.ok_shot?.value ?? null;
  const partQrCode = readings.part_qr_code?.value ?? null;
  const leakResult = readings.result?.value ?? null;
  const bodyLeak = readings.body_leak_value?.value ?? null;
  const gall1 = readings.gall_1?.value ?? null;
  const gall2 = readings.gall_2?.value ?? null;
  const manualMode = isLeakTest ? readings.manual?.value ?? null : null;
  const emergencyStop = readings.emergency_stop?.value ?? readings["EMG. STOP -step value (sec)"]?.value ?? null;
  const oilLevelLow = readings.hyd_oil_level_low?.value ?? readings["HYD.OIL LEVEL LOW LIMIT -step value (sec)"]?.value ?? null;
  const isOnline = Boolean(selectedMachineStatus.connected);
  const stateText = isOnline ? "ONLINE" : socketConnected ? "WAITING" : "OFFLINE";

  const detailItems = isLeakTest
    ? [
        ["Monitor", monitoringRunning ? "RUNNING" : "STOPPED"],
        ["Part QR", formatValue(partQrCode)],
        ["Result", formatValue(leakResult)],
        ["Body Leak", formatValue(bodyLeak)],
        ["GALL-1", formatValue(gall1)],
        ["GALL-2", formatValue(gall2)],
        ["Manual", formatValue(manualMode)],
      ]
    : [
        ["Monitor", monitoringRunning ? "RUNNING" : "STOPPED"],
        ["E-Stop", formatValue(emergencyStop)],
        ["Hyd. Oil Low", formatValue(oilLevelLow)],
      ];

  return (
    <div className={`machine-status-card ${isOnline ? "is-online" : ""}`}>
      <div className="msc-head">
        <div>
          <div className="msc-label">Running Machine</div>
          <div className="msc-title">{machineName}</div>
        </div>
        <span className={`msc-pill ${isOnline ? "online" : "offline"}`}>{stateText}</span>
      </div>
      <div className="msc-grid">
        {detailItems.map(([label, value]) => (
          <div className="msc-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="msc-foot">
        {isLeakTest ? "Cycle end" : "Last cycle"}: {lastTimestamp ? lastTimestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "No cycle yet"}
        {selectedMachineStatus.error && <span>{selectedMachineStatus.error}</span>}
      </div>
    </div>
  );
}

export function ParameterTable({ groups, readings }) {
  return (
    <div className="param-table-wrap">
      <table className="param-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap(group =>
            group.keys.map(({ name, unit, label }) => {
              const value = getReadingValue(readings, name);
              return (
                <tr key={name}>
                  <td title={name}>{label || getDisplayLabel(name)}</td>
                  <td className="table-value">
                    {formatValue(value)}
                    {value !== null && value !== undefined && unit && (
                      <span className="table-unit">{unit}</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

