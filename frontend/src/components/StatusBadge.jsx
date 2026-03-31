/**
 * StatusBadge — Reusable inline status badge component.
 * Used in GlobalPopup timeline, Dashboard, and Part Journey views.
 *
 * Props:
 *   status: "PASS" | "FAIL" | "RUN" | "WAIT" | "PENDING" | string
 *   size?:  "sm" | "md" (default "md")
 */
const STATUS_CONFIG = {
  PASS:    { bg: "#dcfce7", color: "#166534", dot: "#16a34a", label: "PASS" },
  FAIL:    { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626", label: "FAIL" },
  RUN:     { bg: "#fef3c7", color: "#92400e", dot: "#d97706", label: "RUN",  glow: true },
  WAIT:    { bg: "#f1f5f9", color: "#475569", dot: "#94a3b8", label: "WAIT" },
  PENDING: { bg: "#f1f5f9", color: "#475569", dot: "#94a3b8", label: "PENDING" },
};

const StatusBadge = ({ status = "WAIT", size = "md", label: overrideLabel }) => {
  const key     = String(status || "WAIT").toUpperCase();
  const config  = STATUS_CONFIG[key] || STATUS_CONFIG.WAIT;
  const label   = overrideLabel ?? config.label;
  const dotSize = size === "sm" ? 5 : 6;
  const padding = size === "sm" ? "2px 6px" : "3px 9px";
  const font    = size === "sm" ? "9px" : "10px";

  return (
    <span style={{
      display:        "inline-flex",
      alignItems:     "center",
      gap:            4,
      background:     config.bg,
      color:          config.color,
      padding,
      borderRadius:   999,
      fontSize:       font,
      fontWeight:     800,
      letterSpacing:  "0.07em",
      boxShadow:      config.glow ? `0 0 6px ${config.dot}66` : undefined,
      whiteSpace:     "nowrap",
    }}>
      <span style={{
        width:        dotSize,
        height:       dotSize,
        borderRadius: "50%",
        background:   config.dot,
        flexShrink:   0,
        boxShadow:    config.glow ? `0 0 4px ${config.dot}` : undefined,
      }}/>
      {label}
    </span>
  );
};

export default StatusBadge;
