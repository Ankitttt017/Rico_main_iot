export default function PlcMonitorStyles() {
  return (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; }
        * { margin: 0; padding: 0; }

        :root {
          --bg: #eef3ff;
          --panel: #f9fbfe;
          --panel-2: #eef4fb;
          --panel-3: #20224a;
          --line: rgba(28, 63, 104, 0.13);
          --line-strong: rgba(28, 63, 104, 0.24);
          --text: #102b46;
          --muted: #5f7288;
          --faint: #8a98ad;
          --green: #22c55e;
          --red: #f3797e;
          --amber: #e17a00;
          --cyan: #1474b8;
          --overview-card-height: 112px;
          --mono: 'IBM Plex Sans', system-ui, sans-serif;
          --sans: 'IBM Plex Sans', system-ui, sans-serif;
        }

        body {
          background: var(--bg);
          color: var(--text);
        }

        .dash {
          min-height: 0;
          background: transparent;
          font-family: var(--sans);
        }

        .theme-dark {
          --bg: #070b12;
          --panel: #101722;
          --panel-2: #141d2a;
          --panel-3: #0c111a;
          --line: rgba(148, 163, 184, 0.16);
          --line-strong: rgba(148, 163, 184, 0.28);
          --text: #e5edf7;
          --muted: #7f8ea3;
          --faint: #4d5b6e;
          --cyan: #22d3ee;
          --overview-card-height: 108px;
          background:
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px) 0 0 / 36px 36px,
            linear-gradient(0deg, rgba(255,255,255,0.02) 1px, transparent 1px) 0 0 / 36px 36px,
            radial-gradient(circle at 18% -12%, rgba(34,211,238,0.12), transparent 34%),
            linear-gradient(180deg, #0b111b 0%, #070b12 45%, #05070c 100%);
        }

        .shell {
          width: 100%;
          margin: 0;
        }

        .header {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          background: linear-gradient(135deg, #f8fbff 0%, #edf4ff 100%);
          box-shadow: 0 16px 34px rgba(75,73,172,0.11);
        }

        .plant-tag {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--cyan);
          letter-spacing: 1.8px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text);
          font-family: var(--mono);
          font-size: clamp(20px, 2.4vw, 30px);
          font-weight: 700;
          letter-spacing: 0;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 4px rgba(34,197,94,0.12);
        }

        .status-dot.off {
          background: var(--red);
          box-shadow: 0 0 0 4px rgba(239,68,68,0.12);
        }

        .header-sub {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 12px;
          margin-top: 6px;
        }

        .header-controls {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px 14px;
          align-items: center;
          min-width: min(520px, 42vw);
        }

        .plc-form {
          display: grid;
          grid-template-columns: minmax(180px, 280px);
          gap: 8px;
          align-items: end;
          justify-content: end;
        }

        .field {
          display: grid;
          gap: 5px;
          min-width: 0;
        }

        .field span {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .field input,
        .field select {
          width: 100%;
          height: 36px;
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          background: #ffffff;
          color: var(--text);
          font-family: var(--mono);
          font-size: 12px;
          outline: none;
          padding: 0 10px;
        }

        .field select {
          appearance: auto;
          background: #ffffff;
          color: var(--text);
        }

        .field select option {
          background: #ffffff;
          color: var(--text);
        }

        .field input:focus,
        .field select:focus {
          border-color: var(--cyan);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }

        .apply-btn,
        .run-btn {
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--line-strong);
          background: #ffffff;
          color: var(--text);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.5px;
          padding: 0 12px;
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        }

        .apply-btn:hover,
        .run-btn:hover {
          transform: translateY(-1px);
          border-color: rgba(75,73,172,0.38);
        }

        .run-btn {
          background: var(--green);
          border-color: rgba(34,197,94,0.65);
          color: #07120b;
        }

        .run-btn.is-running {
          background: #ef4444;
          border-color: rgba(239,68,68,0.72);
          color: #ffffff;
        }

        .apply-btn:disabled {
          cursor: wait;
          opacity: 0.7;
          transform: none;
        }

        .config-line {
          grid-column: 1 / -1;
          color: #aab3c0;
          font-family: var(--mono);
          font-size: 11px;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          min-height: 16px;
        }

        .config-line span {
          color: var(--cyan);
        }

        .overview {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
          grid-auto-rows: minmax(92px, auto);
          gap: 10px;
          margin: 10px 0;
        }

        .process-state {
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff, #f2f6fb);
          padding: 9px 11px;
          min-height: 92px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          gap: 7px;
          box-shadow: 0 10px 22px rgba(19,75,143,0.06);
          overflow: hidden;
        }

        .state-top {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 10px;
          min-width: 0;
          width: 100%;
        }

        .state-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .state-value {
          margin-top: 0;
          font-size: clamp(16px, 1.05vw, 19px);
          font-weight: 600;
          font-family: var(--mono);
          color: var(--text);
          line-height: 1.12;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
          word-break: break-word;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }

        .state-sub {
          margin-top: 0;
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.35;
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .status-chip {
          border-radius: 999px;
          padding: 5px 9px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          border: 1px solid rgba(255,255,255,0.22);
          color: #d8dde5;
          background: rgba(255,255,255,0.08);
          flex: 0 1 auto;
          line-height: 1.15;
          max-width: 104px;
          text-align: center;
          white-space: normal;
        }

        .status-complete .status-chip {
          color: #16a34a;
          border-color: rgba(34,197,94,0.46);
          background: rgba(34,197,94,0.13);
        }

        .status-idle .status-chip {
          color: #ea580c;
          border-color: rgba(249,115,22,0.42);
          background: rgba(249,115,22,0.12);
        }

        .metric {
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: linear-gradient(180deg, #ffffff, #f2f6fb);
          padding: 9px 12px;
          min-height: 92px;
          min-width: 0;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 22px rgba(19,75,143,0.06);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 10px;
          text-align: center;
        }

        .metric::before {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: var(--metric-color, var(--cyan));
        }

        .metric-cyan { --metric-color: var(--cyan); }
        .metric-green { --metric-color: var(--green); }
        .metric-amber { --metric-color: var(--amber); }
        .metric-slate { --metric-color: #94a3b8; }

        .metric-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          line-height: 1.25;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .metric-value {
          margin-top: 0;
          color: var(--text);
          font-family: var(--mono);
          font-size: clamp(17px, 1.15vw, 22px);
          font-weight: 600;
          line-height: 1.12;
          font-variant-numeric: tabular-nums;
          white-space: normal;
          overflow: hidden;
          text-overflow: ellipsis;
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          text-align: center;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .metric-unit {
          margin-left: 6px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }

        .metric-machine .metric-value {
          font-size: clamp(15px, 1vw, 18px);
          line-height: 1.15;
          overflow-wrap: anywhere;
          white-space: normal;
          display: -webkit-box;
          overflow: hidden;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .dashboard-content {
          width: 100%;
          margin-top: 6px;
        }

        .content-main {
          min-width: 0;
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fbff, #edf4ff);
          overflow: hidden;
          box-shadow: 0 14px 30px rgba(28,48,90,0.08);
        }

        .info-card {
          background: linear-gradient(180deg, #f8fbff, #edf4ff);
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          padding: 11px 13px;
          box-shadow: 0 10px 22px rgba(28,48,90,0.06);
        }

        .info-card-title {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 8px;
        }

        .info-time {
          font-family: var(--mono);
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }

        .info-date {
          color: var(--faint);
          font-family: var(--mono);
          font-size: 12px;
          margin-top: 4px;
        }

        .info-ct {
          margin-top: 9px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          border: 1px solid rgba(8,145,178,0.26);
          border-radius: 6px;
          color: var(--cyan);
          background: rgba(8,145,178,0.06);
          padding: 6px 9px;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
        }

        .info-none {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 13px;
          padding: 12px 0;
        }

        .hist-row {
          display: grid;
          grid-template-columns: 1fr 84px;
          align-items: center;
          gap: 12px;
          padding: 7px 0;
          border-bottom: 1px solid var(--line);
          font-family: var(--mono);
          font-size: 12px;
        }

        .hist-row:last-child { border-bottom: 0; }
        .hist-time { color: var(--text); }
        .hist-ct { color: var(--green); text-align: right; font-weight: 700; }
        .hist-ct.old { color: var(--muted); font-weight: 500; }

        .history-card {
          max-height: 190px;
          overflow: hidden;
        }

        .history-scroll {
          max-height: 140px;
          overflow-y: auto;
          padding-right: 6px;
          scrollbar-width: thin;
          scrollbar-color: var(--line-strong) transparent;
        }

        .history-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .history-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .history-scroll::-webkit-scrollbar-thumb {
          background: var(--line-strong);
          border-radius: 999px;
        }

        .machine-status-card {
          border: 1px solid var(--line-strong);
          border-radius: 14px;
          background: linear-gradient(180deg, #f8fbff, #edf4ff);
          padding: 11px 13px;
          box-shadow: 0 10px 22px rgba(28,48,90,0.06);
          width: 100%;
        }

        .table-side-card {
          align-self: start;
        }

        .msc-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .msc-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .msc-title {
          margin-top: 4px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 17px;
          font-weight: 700;
          line-height: 1.15;
        }

        .msc-pill {
          border: 1px solid rgba(239,68,68,0.34);
          border-radius: 999px;
          color: var(--red);
          background: rgba(239,68,68,0.08);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 800;
          padding: 6px 9px;
          white-space: nowrap;
        }

        .msc-pill.online {
          border-color: rgba(34,197,94,0.36);
          color: var(--green);
          background: rgba(34,197,94,0.09);
        }

        .msc-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }

        .msc-item {
          border: 1px solid var(--line-strong);
          border-radius: 6px;
          padding: 7px 9px;
          font-family: var(--mono);
          background: rgba(255,255,255,0.44);
        }

        .msc-item span {
          display: block;
          color: var(--muted);
          font-size: 10px;
          text-transform: uppercase;
        }

        .msc-item strong {
          display: block;
          margin-top: 4px;
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
        }

        .msc-item.is-off-shot {
          border-color: rgba(245,158,11,0.46);
          background: rgba(245,158,11,0.1);
        }

        .msc-item.is-off-shot strong {
          color: var(--amber);
        }

        .msc-foot {
          margin-top: 11px;
          color: var(--muted);
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-family: var(--mono);
          font-size: 11px;
        }

        .msc-foot span {
          color: var(--red);
          overflow-wrap: anywhere;
        }

        .view-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0;
          width: 100%;
          padding: 10px;
          border-bottom: 1px solid var(--line-strong);
          background: rgba(237,244,255,0.92);
        }

        .group-tabs {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin: 0;
        }

        .report-btn {
          height: 34px;
          min-width: 86px;
          border: 1px solid rgba(34,197,94,0.36);
          border-radius: 7px;
          background: rgba(34,197,94,0.12);
          color: var(--green);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 800;
        }

        .report-btn:hover {
          background: rgba(34,197,94,0.18);
        }

        .report-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .report-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(17,24,39,0.7);
          padding: 22px;
          backdrop-filter: blur(10px);
        }

        .report-modal {
          width: min(1340px, 100%);
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(15,23,42,0.36);
        }

        .report-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--line-strong);
        }

        .report-kicker,
        .preview-kicker {
          color: #22d3ee;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .report-title {
          margin-top: 6px;
          color: #111827;
          font-size: 24px;
          font-weight: 900;
          line-height: 1.05;
        }

        .report-sub {
          margin-top: 8px;
          color: #64748b;
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
        }

        .report-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 9px;
          flex-wrap: wrap;
        }

        .report-date {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #6b7280;
          font-size: 13px;
          font-weight: 800;
        }

        .report-date input {
          height: 42px;
          width: 174px;
          border: 1px solid #c8d8ff;
          border-radius: 7px;
          background: #f8fbff;
          color: #111827;
          font-size: 16px;
          font-weight: 800;
          padding: 0 12px;
          outline: none;
        }

        .preview-btn,
        .download-btn,
        .close-btn {
          height: 42px;
          border-radius: 7px;
          border: 1px solid transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 900;
          text-decoration: none;
          white-space: nowrap;
        }

        .preview-btn {
          border-color: #c8d8ff;
          background: #edf4ff;
          color: #2563eb;
          padding: 0 14px;
        }

        .download-btn {
          background: #10b981;
          color: #05130e;
          padding: 0 18px;
        }

        .download-warn {
          background: #f59e0b;
          color: #241600;
        }

        .close-btn {
          width: 42px;
          border-color: #c8d8ff;
          background: #f8fbff;
          color: #64748b;
          font-size: 28px;
          line-height: 1;
        }

        .report-body {
          min-height: 0;
          flex: 1;
          display: grid;
          grid-template-columns: 1.12fr 0.88fr;
          overflow: hidden;
        }

        .report-pane {
          min-width: 0;
          overflow: auto;
        }

        .report-parameters {
          border-right: 1px solid var(--line-strong);
        }

        .report-table {
          width: 100%;
          min-width: 650px;
          border-collapse: collapse;
          text-align: left;
          font-size: 14px;
        }

        .report-table th {
          position: sticky;
          top: 0;
          z-index: 2;
          border-bottom: 1px solid var(--line-strong);
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.7px;
          padding: 13px 16px;
          text-transform: uppercase;
        }

        .report-table td {
          border-bottom: 1px solid #e9eef7;
          color: #334155;
          font-weight: 700;
          padding: 13px 16px;
        }

        .report-table td strong {
          color: #020617;
          font-size: 16px;
        }

        .report-group {
          background: #f8fafc;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .report-unit {
          margin-left: 6px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }

        .preview-head {
          position: sticky;
          top: 0;
          z-index: 3;
          border-bottom: 1px solid var(--line-strong);
          background: #ffffff;
          padding: 16px;
        }

        .connection-head {
          position: static;
          border-top: 1px solid var(--line-strong);
          margin-top: 12px;
        }

        .preview-kicker {
          color: #10b981;
        }

        .preview-count {
          margin-top: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 800;
        }

        .history-preview th {
          top: 64px;
        }

        .cycle-cell {
          color: #10b981 !important;
          font-weight: 900 !important;
        }

        .preview-loading,
        .empty-preview {
          color: #64748b;
          font-weight: 800;
          padding: 34px 16px !important;
          text-align: center;
        }

        .preview-error {
          margin: 14px;
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 7px;
          background: rgba(239,68,68,0.08);
          color: #b91c1c;
          font-weight: 800;
          padding: 10px 12px;
        }

        .tab {
          border: 1px solid var(--line);
          border-radius: 6px;
          background: #ffffff;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.5px;
          min-height: 34px;
          padding: 0 12px;
          transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease;
        }

        .tab:hover {
          color: #111111;
          border-color: var(--line-strong);
          background: #f3f4f6;
        }

        .tab.active {
          color: #ffffff;
          background: #111111;
        }

        .group-section {
          margin: 12px 0 18px;
          padding: 0 12px;
        }

        .group-header {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .group-icon {
          border: 1px solid color-mix(in srgb, var(--group-color) 45%, transparent);
          border-radius: 4px;
          color: var(--group-color);
          background: color-mix(in srgb, var(--group-color) 8%, transparent);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          padding: 3px 6px;
        }

        .group-label {
          color: var(--group-color);
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 1.4px;
          text-transform: uppercase;
        }

        .group-line {
          height: 1px;
          background: linear-gradient(90deg, color-mix(in srgb, var(--group-color) 45%, transparent), var(--line));
        }

        .group-count {
          color: var(--faint);
          font-family: var(--mono);
          font-size: 10px;
          text-transform: uppercase;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
          gap: 10px;
        }

        .param-table-wrap {
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          overflow: auto;
          max-height: 610px;
          width: 100%;
        }

        .param-table {
          width: 100%;
          min-width: 480px;
          border-collapse: collapse;
          font-family: var(--mono);
          font-size: 12px;
          table-layout: fixed;
        }

        .param-table th,
        .param-table td {
          border-bottom: 1px solid var(--line);
          padding: 8px 14px;
          text-align: left;
          color: var(--text);
          height: 36px;
        }

        .param-table th:first-child,
        .param-table td:first-child {
          width: 58%;
        }

        .param-table th:last-child,
        .param-table td:last-child {
          width: 42%;
        }

        .param-table th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #f8fafc;
          color: var(--muted);
          font-size: 10px;
          letter-spacing: 1.1px;
          text-transform: uppercase;
        }

        .param-table tbody tr:hover td {
          background: rgba(8,145,178,0.045);
        }

        .param-table tr:last-child td {
          border-bottom: 0;
        }

        .table-value {
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .table-unit {
          margin-left: 6px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
        }

        .table-value.status-off {
          color: var(--amber);
        }

        .table-value.status-high {
          color: var(--green);
        }

        .vcard {
          background:
            linear-gradient(180deg, #ffffff, #f3f7fb);
          border: 1px solid var(--line-strong);
          border-left: 3px solid var(--accent);
          border-radius: 10px;
          min-height: 72px;
          padding: 8px 10px;
          box-shadow: 0 8px 18px rgba(19,75,143,0.055);
          transition: border-color 0.16s ease, transform 0.16s ease, background 0.16s ease;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 8px;
          position: relative;
          text-align: center;
        }

        .vcard:hover {
          border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
          background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, #f8fbff), #edf4ff);
          transform: translateY(-1px);
        }

        .vcard-top {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 0;
          width: 100%;
        }

        .vcard-name {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          line-height: 1.25;
          min-width: 0;
          overflow-wrap: anywhere;
          text-transform: uppercase;
          white-space: normal;
        }

        .vcard-led {
          position: absolute;
          top: 11px;
          right: 11px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 10px var(--accent);
          flex: 0 0 auto;
          opacity: 0.9;
        }

        .vcard-bottom {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
        }

        .vcard-readout {
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-align: center;
        }

        .vcard-val {
          color: var(--text);
          font-family: var(--mono);
          font-size: clamp(15px, 1vw, 19px);
          font-weight: 600;
          line-height: 1.16;
          font-variant-numeric: tabular-nums;
          display: inline-block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: bottom;
          white-space: nowrap;
        }

        .vcard-unit {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 600;
          margin-left: 5px;
        }

        .spark {
          position: absolute;
          right: 10px;
          bottom: 7px;
          opacity: 0.72;
          width: min(54px, 30%);
          pointer-events: none;
        }

        .spark-empty {
          position: absolute;
          right: 10px;
          bottom: 9px;
          width: min(54px, 30%);
          height: 24px;
          border-bottom: 1px solid rgba(16,43,70,0.16);
          flex: 0 0 auto;
        }

        .no-data {
          margin: 20px 0 26px;
          border: 1px dashed var(--line-strong);
          border-radius: 8px;
          background: rgba(248,251,255,0.9);
          color: var(--muted);
          font-family: var(--mono);
          padding: 34px 18px;
          text-align: center;
        }

        .no-data-title {
          color: #111111;
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .no-data-text {
          font-size: 12px;
        }

        .footer {
          margin-top: 38px;
          color: #8a929e;
          font-family: var(--mono);
          font-size: 11px;
          text-align: center;
        }

        .theme-dark .metric,
        .theme-dark .info-card,
        .theme-dark .machine-status-card,
        .theme-dark .vcard,
        .theme-dark .process-state {
          background: linear-gradient(180deg, rgba(20,29,42,0.94), rgba(9,13,20,0.96));
          box-shadow: 0 12px 30px rgba(0,0,0,0.22);
        }

        .theme-dark .header {
          background:
            linear-gradient(135deg, rgba(18,28,42,0.98), rgba(9,14,23,0.98));
          border-color: rgba(148,163,184,0.24);
          box-shadow: 0 18px 40px rgba(0,0,0,0.3);
        }

        .theme-dark .header-title {
          color: #f6fbff;
        }

        .theme-dark .field input,
        .theme-dark .field select {
          background: rgba(11,17,27,0.92);
          border-color: rgba(148,163,184,0.22);
          color: #dbe7f6;
        }

        .theme-dark .field select option {
          background: #101722;
          color: #dbe7f6;
        }

        .theme-dark .config-line {
          color: #8fa0b7;
        }

        .theme-dark .content-main {
          background: linear-gradient(180deg, rgba(13,20,31,0.96), rgba(8,12,19,0.98));
          box-shadow: 0 16px 34px rgba(0,0,0,0.24);
        }

        .theme-dark .view-bar {
          background: rgba(14,22,34,0.92);
        }

        .theme-dark .param-table-wrap {
          background: transparent;
          box-shadow: none;
        }

        .theme-dark .metric-value,
        .theme-dark .info-time,
        .theme-dark .msc-title,
        .theme-dark .msc-item strong,
        .theme-dark .vcard-val,
        .theme-dark .no-data-title,
        .theme-dark .state-value,
        .theme-dark .table-value {
          color: #ffffff;
        }

        .theme-dark .param-table th {
          background: #101722;
          color: #8fb1d8;
        }

        .theme-dark .param-table td {
          color: #dbe7f6;
        }

        .theme-dark .param-table tbody tr:hover td {
          background: rgba(34,211,238,0.045);
        }

        .theme-dark .msc-item {
          background: rgba(10,15,23,0.72);
        }

        .theme-dark .tab {
          background: rgba(10,15,23,0.8);
        }

        .theme-dark .tab:hover {
          color: #ffffff;
          background: rgba(20,29,42,0.94);
        }

        .theme-dark .tab.active {
          color: #ffffff;
          background: rgba(20,29,42,0.98);
        }

        .theme-dark .no-data {
          background: rgba(12,17,26,0.76);
        }

        .theme-dark .spark-empty {
          border-bottom-color: rgba(148,163,184,0.16);
        }

        @media (max-width: 1100px) {
          .overview {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .dashboard-content {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .header {
            grid-template-columns: 1fr;
          }

          .header-controls {
            min-width: 0;
            grid-template-columns: 1fr;
          }

          .plc-form {
            grid-template-columns: 1fr 90px;
          }

          .field:first-child,
          .run-btn {
            grid-column: 1 / -1;
          }

          .overview,
          .dashboard-content {
            grid-template-columns: 1fr;
          }

          .view-bar {
            align-items: stretch;
            flex-direction: column;
          }

          .report-btn {
            width: 100%;
          }

          .report-head {
            align-items: stretch;
            flex-direction: column;
          }

          .report-actions {
            justify-content: stretch;
          }

          .report-date,
          .preview-btn,
          .download-btn,
          .close-btn {
            flex: 1 1 145px;
          }

          .report-date input {
            width: 100%;
          }

          .report-body {
            grid-template-columns: 1fr;
          }

          .hist-row {
            grid-template-columns: 1fr 70px;
          }

          .cards-grid {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 10px;
          }
        }

    `}</style>
  );
}
