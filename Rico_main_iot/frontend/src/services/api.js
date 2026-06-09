import axios from 'axios';
import { API_BASE_URL, ENDPOINTS, buildApiUrl } from './endpoints';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000,
});

const responseCache = new Map();
const DEFAULT_CACHE_TTL = 30000;
const LIVE_CACHE_TTL = 5000;

function cacheKey(url, params) {
  const search = new URLSearchParams();
  Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => search.set(key, String(value)));
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

function cloneResponse(response) {
  return {
    ...response,
    data: typeof structuredClone === "function"
      ? structuredClone(response.data)
      : JSON.parse(JSON.stringify(response.data)),
  };
}

function cachedGet(url, { params, ttl = DEFAULT_CACHE_TTL, staleWhileRefresh = true } = {}) {
  const key = cacheKey(url, params);
  const cached = responseCache.get(key);
  const now = Date.now();

  if (cached && now - cached.time < ttl) {
    return Promise.resolve(cloneResponse(cached.response));
  }

  if (cached && staleWhileRefresh) {
    api.get(url, { params })
      .then((response) => {
        responseCache.set(key, { time: Date.now(), response: cloneResponse(response) });
      })
      .catch(() => {});
    return Promise.resolve(cloneResponse(cached.response));
  }

  return api.get(url, { params }).then((response) => {
    responseCache.set(key, { time: Date.now(), response: cloneResponse(response) });
    return response;
  });
}

function clearApiCache() {
  responseCache.clear();
}

async function mutate(request) {
  const response = await request;
  clearApiCache();
  return response;
}

export const getPlants      = ()        => cachedGet(ENDPOINTS.plants, { ttl: 300000 });
export const getParts       = (params)  => cachedGet(ENDPOINTS.parts, { params });
export const getPartById    = (id)      => cachedGet(ENDPOINTS.part(id));
export const updatePart     = (id, d)   => mutate(api.put(ENDPOINTS.part(id), d));
export const getOperations  = (id)      => cachedGet(ENDPOINTS.partOperations(id));
export const getOperationMaster = (params) => cachedGet(ENDPOINTS.operations, { params });
export const updateOperation = (partId, operationId, d) => mutate(api.put(ENDPOINTS.partOperation(partId, operationId), d));
export const deleteOperation = (partId, operationId) => mutate(api.delete(ENDPOINTS.partOperation(partId, operationId)));
export const getSheets      = (id)      => cachedGet(ENDPOINTS.partSheets(id));
export const uploadSheet    = (id, type, d) => mutate(api.post(ENDPOINTS.partSheetUpload(id, type), d));
export const getConfig      = (id)      => cachedGet(ENDPOINTS.partConfiguration(id));
export const updateConfig   = (id, d)   => mutate(api.put(ENDPOINTS.partConfiguration(id), d));
export const getStats       = (params)  => cachedGet(ENDPOINTS.stats, { params });
export const getMachines    = (params)  => cachedGet(ENDPOINTS.machines, { params });
export const createMachine  = (data)    => mutate(api.post(ENDPOINTS.machines, data));
export const updateMachine  = (id, d)   => mutate(api.put(ENDPOINTS.machine(id), d));
export const deleteMachine  = (id)      => mutate(api.delete(ENDPOINTS.machine(id)));
export const getMachineOperations = (id, params) => cachedGet(ENDPOINTS.machineOperations(id), { params });
export const assignMachineOperation = (id, data) => mutate(api.put(ENDPOINTS.machineOperation(id), data));
export const getMachineStatusHistory = (id) => cachedGet(ENDPOINTS.machineStatusHistory(id), { ttl: LIVE_CACHE_TTL, staleWhileRefresh: false });
export const getLines       = (params)  => cachedGet(ENDPOINTS.lines, { params });
export const getLineOperations = ()     => cachedGet(ENDPOINTS.lineOperations, { ttl: 300000 });
export const getRawMasterData = (params) => cachedGet(ENDPOINTS.lineRawMasterData, { params });
export const createLine     = (data)    => mutate(api.post(ENDPOINTS.lines, data));
export const updateLine     = (id, d)   => mutate(api.put(ENDPOINTS.line(id), d));
export const deleteLine     = (id)      => mutate(api.delete(ENDPOINTS.line(id)));
export const getLineMachines = (id)     => cachedGet(ENDPOINTS.lineMachines(id));
export const createLineMachine = (id, data) => mutate(api.post(ENDPOINTS.lineMachines(id), data));
export const updateLineMachine = (lineId, machineId, data) => mutate(api.put(ENDPOINTS.lineMachine(lineId, machineId), data));
export const removeLineMachine = (lineId, machineId, params) => mutate(api.delete(ENDPOINTS.lineMachine(lineId, machineId), { params }));
export const getPlcLatestReadings = () => api.get(ENDPOINTS.plcLatestReadings, { params: { _: Date.now() } });
export const getPlcReadingHistory = (params) => cachedGet(ENDPOINTS.plcReadingHistory, { params, ttl: LIVE_CACHE_TTL, staleWhileRefresh: false });
export const getPlcConnectionEvents = (params) => cachedGet(ENDPOINTS.plcConnectionEvents, { params, ttl: LIVE_CACHE_TTL, staleWhileRefresh: false });
export const getPlcMachineConfigs = () => cachedGet(ENDPOINTS.plcMachineConfigs, { ttl: LIVE_CACHE_TTL, staleWhileRefresh: false });
export const savePlcMachineConfig = (data) => mutate(api.post(ENDPOINTS.plcMachineConfigs, data));
export const deletePlcMachineConfig = (id) => mutate(api.delete(ENDPOINTS.plcMachineConfig(id)));
export const testPlcMachineConfig = (data) => api.post(ENDPOINTS.plcMachineConfigTest, data);
export const getPartSheetDownloadUrl = (partId, type, sheetId) => buildApiUrl(ENDPOINTS.partSheetDownload(partId, type, sheetId));
export const getPlcHistoryExportUrl = ({ ip, limit = 2000, from, to } = {}) => {
  const params = new URLSearchParams();
  if (ip) params.set('ip', ip);
  if (limit) params.set('limit', String(limit));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('_', String(Date.now()));
  return buildApiUrl(ENDPOINTS.plcReadingHistoryExport, params);
};
export const getPlcConnectionEventsExportUrl = ({ ip, limit = 2000, from, to } = {}) => {
  const params = new URLSearchParams();
  if (ip) params.set('ip', ip);
  if (limit) params.set('limit', String(limit));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('_', String(Date.now()));
  return buildApiUrl(ENDPOINTS.plcConnectionEventsExport, params);
};

export default api;
