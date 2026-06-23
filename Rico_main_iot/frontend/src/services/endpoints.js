function getSameHostBackendUrl(path) {
  if (typeof window === "undefined") return path;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5000${path}`;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const API_FALLBACK_BASE_URL =
  import.meta.env.VITE_API_FALLBACK_BASE_URL ||
  (!import.meta.env.DEV && API_BASE_URL === "/api" ? getSameHostBackendUrl("/api") : "");

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : getSameHostBackendUrl(""));

export const ENDPOINTS = {
  plants: "/plants",
  locations: "/locations",
  location: (id) => `/locations/${id}`,
  departments: "/departments",
  department: (id) => `/departments/${id}`,
  parts: "/parts",
  part: (id) => `/parts/${id}`,
  partOperations: (id) => `/parts/${id}/operations`,
  partOperation: (partId, operationId) => `/parts/${partId}/operations/${operationId}`,
  partSheets: (id) => `/parts/${id}/sheets`,
  partSheetUpload: (id, type) => `/parts/${id}/sheets/${type}`,
  partSheetDownload: (partId, type, sheetId) => `/parts/${partId}/sheets/${type}/${sheetId}/download`,
  partConfiguration: (id) => `/parts/${id}/configuration`,
  operations: "/operations",
  stats: "/stats",
  machines: "/machines",
  machine: (id) => `/machines/${id}`,
  machineOperations: (id) => `/machines/${id}/operations`,
  machineOperation: (id) => `/machines/${id}/operation`,
  machineStatusHistory: (id) => `/machines/${id}/status-history`,
  lines: "/lines",
  line: (id) => `/lines/${id}`,
  lineOperations: "/lines/operations/list",
  lineRawMasterData: "/lines/raw-master-data",
  lineMachines: (id) => `/lines/${id}/machines`,
  lineMachine: (lineId, machineId) => `/lines/${lineId}/machines/${machineId}`,
  plcLatestReadings: "/plc-monitor/readings/latest",
  plcReadingHistory: "/plc-monitor/readings/history",
  plcReadingHistoryExport: "/plc-monitor/readings/history/export",
  plcConnectionEvents: "/plc-monitor/connection-events",
  plcConnectionEventsExport: "/plc-monitor/connection-events/export",
  plcMachineConfigs: "/plc-machine-configs",
  plcMachineConfig: (id) => `/plc-machine-configs/${id}`,
  plcMachineConfigTest: "/plc-machine-configs/test-connection",
  authLogin: "/auth/login",
  authRoles: "/auth/roles",
  authUsers: "/auth/users",
  authUser: (id) => `/auth/users/${id}`,
  authUserToggle: (id) => `/auth/users/${id}/toggle`,
  authUserResetPassword: (id) => `/auth/users/${id}/reset-password`,
  authCheckUsername: "/auth/users/check-username",
  workstationSummary: "/workstation/summary",
  workstationDowntimeEvents: "/workstation/downtime-events",
  workstationDowntimeEventClose: (id) => `/workstation/downtime-events/${id}/close`,
};

export function buildApiUrl(path, query) {
  const base = API_BASE_URL.replace(/\/$/, "");
  const endpoint = String(path || "").startsWith("/") ? path : `/${path}`;
  const url = `${base}${endpoint}`;
  if (!query) return url;

  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query);
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}
