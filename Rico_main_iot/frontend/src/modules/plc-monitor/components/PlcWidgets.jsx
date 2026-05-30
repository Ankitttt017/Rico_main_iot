import { getDisplayLabel } from "../utils/plcFormatters";

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

export const STATUS_CFG = {
  idle: { label: "Waiting for Cycle", cls: "status-idle" },
  complete: { label: "Cycle Complete", cls: "status-complete" },
};

export function formatValue(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" && !Number.isInteger(value)) {
    return Number(value.toFixed(2));
  }

  return value;
}

export function hasReadableValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value).trim() !== "-";
}

export function ValueCard({ name, label, unit, value, history, accentColor }) {
  const hasValue = value !== null && value !== undefined;

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
          <span className="vcard-val">{hasValue ? value : "-"}</span>
          {hasValue && unit && <span className="vcard-unit">{unit}</span>}
        </div>
        <Spark data={history} color={accentColor} />
      </div>
    </div>
  );
}

export function MetricTile({ label, value, unit, tone = "cyan" }) {
  const isMachine = label === "Machine" || label === "Part Name";

  return (
    <div className={`metric metric-${tone} ${isMachine ? "metric-machine" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" title={value || ""}>
        {formatValue(value)}
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
              const value = readings[name]?.value ?? null;
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

