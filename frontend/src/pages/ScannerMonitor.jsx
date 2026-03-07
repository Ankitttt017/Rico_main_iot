import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { CheckCircle2, RefreshCw, ScanLine, Wifi, WifiOff } from "lucide-react";
import { scannerApi } from "../api/services";
import { formatMachineLabel } from "../utils/machineFields";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

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

const ScannerMonitor = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [testingId, setTestingId] = useState(null);
  const refreshTimerRef = useRef(null);

  const loadConnections = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const response = await scannerApi.listConnections();
      const configured = Array.isArray(response?.configured) ? response.configured : [];
      const unmanaged = Array.isArray(response?.unmanaged) ? response.unmanaged : [];
      setRows([...configured, ...unmanaged]);
      if (status.type === "error") {
        setStatus({ type: "", message: "" });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error.response?.data?.error || "Unable to load scanner connection status",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status.type]);

  useEffect(() => {
    loadConnections(true);
  }, [loadConnections]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
    });

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        return;
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        loadConnections(false);
      }, 250);
    };

    socket.on("scanner_connection", scheduleRefresh);
    socket.on("scanner_health", scheduleRefresh);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket.disconnect();
    };
  }, [loadConnections]);

  const handleTestConnection = async (row) => {
    if (!row?.id || String(row.id).startsWith("unmanaged-")) {
      setStatus({
        type: "error",
        message: "Connection test is available for configured scanners only.",
      });
      return;
    }

    setTestingId(row.id);
    setStatus({ type: "", message: "" });
    try {
      const result = await scannerApi.testConnection(row.id);
      setStatus({
        type: result?.reachable ? "success" : "error",
        message: result?.message || (result?.reachable ? "Scanner reachable" : "Scanner unreachable"),
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.response?.data?.error || "Scanner connection test failed",
      });
    } finally {
      setTestingId(null);
    }
  };

  const summary = useMemo(() => {
    const total = rows.length;
    const connected = rows.filter((row) => Boolean(row?.connection?.connected)).length;
    return { total, connected, disconnected: Math.max(total - connected, 0) };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
            <ScanLine className="text-primary" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-main">QR Scanner Monitor</h1>
            <p className="text-text-muted text-sm">Live scanner connectivity with per-machine mapping and connection timestamps.</p>
          </div>
        </div>

        <button
          onClick={() => loadConnections(false)}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm text-text-main hover:border-primary disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="industrial-card p-4">
          <p className="text-xs uppercase text-text-muted">Total</p>
          <p className="text-2xl font-bold text-text-main mt-1">{summary.total}</p>
        </div>
        <div className="industrial-card p-4">
          <p className="text-xs uppercase text-text-muted">Connected</p>
          <p className="text-2xl font-bold text-emerald-300 mt-1">{summary.connected}</p>
        </div>
        <div className="industrial-card p-4">
          <p className="text-xs uppercase text-text-muted">Disconnected</p>
          <p className="text-2xl font-bold text-rose-300 mt-1">{summary.disconnected}</p>
        </div>
      </section>

      {status.message && (
        <div
          className={`p-4 rounded-lg border flex items-center gap-2 ${
            status.type === "success"
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-danger/10 border-danger/30 text-danger"
          }`}
        >
          {status.type === "success" ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}
          <span>{status.message}</span>
        </div>
      )}

      <div className="industrial-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-dark/40 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase text-text-muted">Scanner</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase text-text-muted">IP:Port</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase text-text-muted">Mapped Machine</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase text-text-muted">Connection</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase text-text-muted">Connected At</th>
                <th className="px-6 py-3 text-left text-xs font-bold uppercase text-text-muted">Last Data At</th>
                <th className="px-6 py-3 text-right text-xs font-bold uppercase text-text-muted">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!loading &&
                rows.map((row) => {
                  const connected = Boolean(row?.connection?.connected);
                  const isUnmanaged = String(row.id).startsWith("unmanaged-");
                  return (
                    <tr key={row.id} className="hover:bg-bg-dark/30">
                      <td className="px-6 py-4">
                        <p className="font-medium text-text-main">{row.scannerName || "UNMAPPED_SCANNER"}</p>
                        <p className="text-xs text-text-muted">Source: {row?.connection?.source || "UNKNOWN"}</p>
                      </td>
                      <td className="px-6 py-4 font-mono text-primary">
                        {row.scannerIp || "-"}
                        {row.scannerPort ? `:${row.scannerPort}` : ""}
                      </td>
                      <td className="px-6 py-4 text-text-main">
                        {row.mappedMachine ? formatMachineLabel(row.mappedMachine) : isUnmanaged ? "-" : `Machine #${row.mappedMachineId || "-"}`}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                            connected
                              ? "bg-accent/10 text-accent border border-accent/20"
                              : "bg-danger/10 text-danger border border-danger/20"
                          }`}
                        >
                          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
                          {connected ? "CONNECTED" : "DISCONNECTED"}
                        </span>
                        <p className="text-[11px] text-text-muted mt-1">Open sockets: {row?.connection?.openSockets ?? 0}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-main">{formatDateTime(row?.connection?.connectedAt)}</td>
                      <td className="px-6 py-4 text-sm text-text-main">{formatDateTime(row?.connection?.lastDataAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleTestConnection(row)}
                          disabled={testingId === row.id || isUnmanaged}
                          className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50"
                        >
                          {testingId === row.id ? "Testing..." : "Test"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-text-muted">
                    No scanner connections found.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-text-muted">
                    Loading scanner connection status...
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

export default ScannerMonitor;
