import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, QrCode, RefreshCw, Save, Settings2 } from "lucide-react";
import { packingApi } from "../api/services";
import GlobalPopup from "../components/GlobalPopup";

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function toBars(value) {
  const CODE_39 = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    A: "wnnnnwnnw",
    B: "nnwnnwnnw",
    C: "wnwnnwnnn",
    D: "nnnnwwnnw",
    E: "wnnnwwnnn",
    F: "nnwnwwnnn",
    G: "nnnnnwwnw",
    H: "wnnnnwwnn",
    I: "nnwnnwwnn",
    J: "nnnnwwwnn",
    K: "wnnnnnnww",
    L: "nnwnnnnww",
    M: "wnwnnnnwn",
    N: "nnnnwnnww",
    O: "wnnnwnnwn",
    P: "nnwnwnnwn",
    Q: "nnnnnnwww",
    R: "wnnnnnwwn",
    S: "nnwnnnwwn",
    T: "nnnnwnwwn",
    U: "wwnnnnnnw",
    V: "nwwnnnnnw",
    W: "wwwnnnnnn",
    X: "nwnnwnnnw",
    Y: "wwnnwnnnn",
    Z: "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    $: "nwnwnwnnn",
    "/": "nwnwnnnwn",
    "+": "nwnnnwnwn",
    "%": "nnnwnwnwn",
    "*": "nwnnwnwnn",
  };

  const sanitized = String(value || "EMPTY")
    .toUpperCase()
    .replace(/[^0-9A-Z\-\.\$\/\+\% ]/g, "");
  const encoded = `*${sanitized || "EMPTY"}*`;
  const segments = [{ isBar: false, width: 10 }];

  for (let charIndex = 0; charIndex < encoded.length; charIndex += 1) {
    const pattern = CODE_39[encoded[charIndex]];
    if (!pattern) {
      continue;
    }
    for (let index = 0; index < pattern.length; index += 1) {
      segments.push({
        isBar: index % 2 === 0,
        width: pattern[index] === "w" ? 3 : 1,
      });
    }
    if (charIndex < encoded.length - 1) {
      segments.push({ isBar: false, width: 1 });
    }
  }

  segments.push({ isBar: false, width: 10 });
  return segments;
}

function BarcodePreview({ value }) {
  const bars = useMemo(() => toBars(value), [value]);
  const width = bars.reduce((sum, entry) => sum + entry.width, 0);
  let cursor = 0;

  return (
    <svg viewBox={`0 0 ${width} 70`} className="w-full h-16 rounded-lg bg-white p-1">
      {bars.map((entry, index) => {
        const x = cursor;
        cursor += entry.width;
        return entry.isBar ? <rect key={`${x}-${entry.width}-${index}`} x={x} y={0} width={entry.width} height={70} fill="#000" /> : null;
      })}
    </svg>
  );
}

const PackingManagement = () => {
  const [settings, setSettings] = useState({
    boxPrefix: "BOX",
    boxSeparator: "-",
    serialPadding: 4,
    nextSerial: 1,
    defaultCapacity: 65,
    autoCreateNextBox: true,
    labelPrefix: "PKG",
    preview: "BOX-0001",
  });
  const [boxes, setBoxes] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, closed: 0 });
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [popup, setPopup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const previewCode = useMemo(() => settings.preview || "BOX-0001", [settings.preview]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsPayload, boxesPayload, statsPayload] = await Promise.all([
        packingApi.managementSettings(),
        packingApi.managementBoxes({ limit: 300, status: statusFilter === "ALL" ? undefined : statusFilter }),
        packingApi.managementBoxes({ limit: 1000 }),
      ]);

      setSettings((prev) => ({
        ...prev,
        ...settingsPayload,
      }));

      const rows = boxesPayload?.rows || [];
      const allRows = statsPayload?.rows || [];
      setBoxes(rows);
      setStats({
        total: Number(statsPayload?.total || allRows.length),
        open: allRows.filter((entry) => String(entry.status || "").toUpperCase() === "OPEN").length,
        closed: allRows.filter((entry) => String(entry.status || "").toUpperCase() === "CLOSED").length,
      });
    } catch (error) {
      const apiMessage = error.response?.data?.error || "";
      const normalized = String(apiMessage).toLowerCase();
      const statusCode = Number(error?.response?.status || 0);
      const setupHint =
        normalized.includes("doesn't exist") ||
        normalized.includes("unknown column") ||
        normalized.includes("no such table")
          ? "Packing management database schema not ready. Restart backend once to apply new tables/columns."
          : null;
      const routeHint =
        statusCode === 404
          ? "Packing management API routes are not available on running backend. Restart backend server from this project."
          : null;
      setPopup({
        type: "ERROR",
        title: "Load Failed",
        message: routeHint || setupHint || apiMessage || "Unable to load packing management",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const payload = {
        boxPrefix: String(settings.boxPrefix || "").trim().toUpperCase(),
        boxSeparator: String(settings.boxSeparator ?? "-"),
        serialPadding: toPositiveInt(settings.serialPadding, 4),
        nextSerial: toPositiveInt(settings.nextSerial, 1),
        defaultCapacity: Math.min(500, Math.max(1, toPositiveInt(settings.defaultCapacity, 65))),
        autoCreateNextBox: settings.autoCreateNextBox === true,
        labelPrefix: String(settings.labelPrefix || "").trim().toUpperCase(),
      };
      const response = await packingApi.updateManagementSettings(payload);
      setSettings((prev) => ({
        ...prev,
        ...(response.settings || {}),
      }));
      setPopup({
        type: "SUCCESS",
        title: "Settings Saved",
        message: "Packing box format and auto-increment settings updated.",
      });
      await loadData();
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0);
      setPopup({
        type: "ERROR",
        title: "Save Failed",
        message:
          statusCode === 404
            ? "Packing settings API not found (404). Restart backend server from this project and try again."
            : error.response?.data?.error || "Unable to save settings",
      });
    } finally {
      setSaving(false);
    }
  };

  const generateNextBox = async () => {
    setGenerating(true);
    try {
      const response = await packingApi.generateNext();
      setPopup({
        type: "SUCCESS",
        title: "Box Generated",
        message: `New box ${response?.box?.boxNumber || "-"} created successfully.`,
      });
      await loadData();
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0);
      setPopup({
        type: "ERROR",
        title: "Generate Failed",
        message:
          statusCode === 404
            ? "Box generation API not found (404). Restart backend server from this project and try again."
            : error.response?.data?.error || "Unable to generate next box",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <GlobalPopup popup={popup} onClose={() => setPopup(null)} simple />

      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Packing Setup</p>
            <h1 className="mt-1 text-2xl font-bold text-text-main">Packing Management</h1>
            <p className="text-sm text-text-muted mt-1">
              Define auto box-number format, serial increment, and monitor all generated packing boxes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm text-text-main hover:border-primary"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={saveSettings}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-bg-dark hover:brightness-110 disabled:opacity-60"
              disabled={saving}
            >
              <Save size={14} />
              Save Settings
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 industrial-card p-5">
          <h2 className="font-bold text-text-main mb-4 flex items-center gap-2">
            <Settings2 size={16} className="text-primary" />
            Auto Box Number Format
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-text-muted">Box Prefix</label>
              <input
                value={settings.boxPrefix || ""}
                onChange={(event) => updateField("boxPrefix", event.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-border bg-bg-dark px-3 py-2.5 text-text-main focus:border-primary focus:outline-none font-mono"
                placeholder="BOX"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-muted">Separator</label>
              <input
                value={settings.boxSeparator || "-"}
                onChange={(event) => updateField("boxSeparator", event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-dark px-3 py-2.5 text-text-main focus:border-primary focus:outline-none font-mono"
                placeholder="-"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-muted">Serial Padding</label>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.serialPadding || 4}
                onChange={(event) => updateField("serialPadding", event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-dark px-3 py-2.5 text-text-main focus:border-primary focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-muted">Next Serial</label>
              <input
                type="number"
                min={1}
                value={settings.nextSerial || 1}
                onChange={(event) => updateField("nextSerial", event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-dark px-3 py-2.5 text-text-main focus:border-primary focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-muted">Default Box Capacity</label>
              <input
                type="number"
                min={1}
                max={500}
                value={settings.defaultCapacity || 65}
                onChange={(event) => updateField("defaultCapacity", event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-bg-dark px-3 py-2.5 text-text-main focus:border-primary focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-text-muted">Label Prefix</label>
              <input
                value={settings.labelPrefix || "PKG"}
                onChange={(event) => updateField("labelPrefix", event.target.value.toUpperCase())}
                className="mt-1 w-full rounded-lg border border-border bg-bg-dark px-3 py-2.5 text-text-main focus:border-primary focus:outline-none font-mono"
                placeholder="PKG"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              id="auto-next-box"
              type="checkbox"
              checked={settings.autoCreateNextBox === true}
              onChange={(event) => updateField("autoCreateNextBox", event.target.checked)}
              className="h-4 w-4 accent-[var(--app-primary)]"
            />
            <label htmlFor="auto-next-box" className="text-sm text-text-main">
              Auto-create next box immediately after current box is full
            </label>
          </div>
        </div>

        <div className="industrial-card p-5">
          <h2 className="font-bold text-text-main mb-4 flex items-center gap-2">
            <QrCode size={16} className="text-primary" />
            Live Preview
          </h2>
          <div className="rounded-lg border border-border bg-bg-dark/70 p-3">
            <p className="text-xs uppercase text-text-muted">Next Box Number</p>
            <p className="text-lg font-mono text-primary mt-1">{previewCode}</p>
            <div className="mt-3">
              <BarcodePreview value={previewCode} />
            </div>
            <p className="mt-2 text-xs text-text-muted">
              This code is auto-generated serial-wise and increments after each generated box.
            </p>
          </div>
          <button
            onClick={generateNextBox}
            disabled={generating}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-bg-dark hover:brightness-110 disabled:opacity-60"
          >
            <Boxes size={14} />
            {generating ? "Generating..." : "Generate Next Box Now"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="industrial-card p-4">
          <p className="text-xs uppercase text-text-muted">Total Boxes</p>
          <p className="mt-2 text-2xl font-bold text-text-main">{stats.total}</p>
        </div>
        <div className="industrial-card p-4">
          <p className="text-xs uppercase text-amber-300">Open / Pending</p>
          <p className="mt-2 text-2xl font-bold text-amber-200">{stats.open}</p>
        </div>
        <div className="industrial-card p-4">
          <p className="text-xs uppercase text-emerald-300">Completed / Closed</p>
          <p className="mt-2 text-2xl font-bold text-emerald-200">{stats.closed}</p>
        </div>
      </div>

      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-bold text-text-main">Generated Box Registry</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-text-muted">Filter</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
            >
              <option value="ALL">All</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-bg-dark/70 text-text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Serial</th>
                <th className="px-3 py-2 text-left">Box Number</th>
                <th className="px-3 py-2 text-left">Capacity</th>
                <th className="px-3 py-2 text-left">Packed</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Label</th>
                <th className="px-3 py-2 text-left">Created At</th>
                <th className="px-3 py-2 text-left">Completed At</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-text-main">{row.serialNo || "-"}</td>
                  <td className="px-3 py-2 font-mono text-primary">{row.boxNumber}</td>
                  <td className="px-3 py-2 text-text-main">{row.capacity}</td>
                  <td className="px-3 py-2 text-text-main">{row.packedCount}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        String(row.status || "").toUpperCase() === "CLOSED"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {String(row.status || "").toUpperCase() === "OPEN" ? "PENDING" : row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-main">{row.generationSource || "-"}</td>
                  <td className="px-3 py-2 font-mono text-text-main">{row.labelCode || "-"}</td>
                  <td className="px-3 py-2 text-text-muted">{formatDateTime(row.createdAt)}</td>
                  <td className="px-3 py-2 text-text-muted">{formatDateTime(row.closedAt)}</td>
                </tr>
              ))}
              {!loading && boxes.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-text-muted" colSpan={9}>
                    No boxes found for selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PackingManagement;
