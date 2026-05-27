import axios from 'axios';
import { API_BASE_URL, ENDPOINTS, buildApiUrl } from './endpoints';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const getPlants      = ()        => api.get(ENDPOINTS.plants);
export const getParts       = (params)  => api.get(ENDPOINTS.parts, { params });
export const getPartById    = (id)      => api.get(ENDPOINTS.part(id));
export const updatePart     = (id, d)   => api.put(ENDPOINTS.part(id), d);
export const getOperations  = (id)      => api.get(ENDPOINTS.partOperations(id));
export const getOperationMaster = (params) => api.get(ENDPOINTS.operations, { params });
export const updateOperation = (partId, operationId, d) => api.put(ENDPOINTS.partOperation(partId, operationId), d);
export const deleteOperation = (partId, operationId) => api.delete(ENDPOINTS.partOperation(partId, operationId));
export const getSheets      = (id)      => api.get(ENDPOINTS.partSheets(id));
export const uploadSheet    = (id, type, d) => api.post(ENDPOINTS.partSheetUpload(id, type), d);
export const getConfig      = (id)      => api.get(ENDPOINTS.partConfiguration(id));
export const updateConfig   = (id, d)   => api.put(ENDPOINTS.partConfiguration(id), d);
export const getStats       = (params)  => api.get(ENDPOINTS.stats, { params });
export const getMachines    = (params)  => api.get(ENDPOINTS.machines, { params });
export const createMachine  = (data)    => api.post(ENDPOINTS.machines, data);
export const updateMachine  = (id, d)   => api.put(ENDPOINTS.machine(id), d);
export const deleteMachine  = (id)      => api.delete(ENDPOINTS.machine(id));
export const getMachineOperations = (id, params) => api.get(ENDPOINTS.machineOperations(id), { params });
export const assignMachineOperation = (id, data) => api.put(ENDPOINTS.machineOperation(id), data);
export const getMachineStatusHistory = (id) => api.get(ENDPOINTS.machineStatusHistory(id));
export const getLines       = (params)  => api.get(ENDPOINTS.lines, { params });
export const getLineOperations = ()     => api.get(ENDPOINTS.lineOperations);
export const getRawMasterData = (params) => api.get(ENDPOINTS.lineRawMasterData, { params });
export const createLine     = (data)    => api.post(ENDPOINTS.lines, data);
export const updateLine     = (id, d)   => api.put(ENDPOINTS.line(id), d);
export const deleteLine     = (id)      => api.delete(ENDPOINTS.line(id));
export const getLineMachines = (id)     => api.get(ENDPOINTS.lineMachines(id));
export const createLineMachine = (id, data) => api.post(ENDPOINTS.lineMachines(id), data);
export const updateLineMachine = (lineId, machineId, data) => api.put(ENDPOINTS.lineMachine(lineId, machineId), data);
export const removeLineMachine = (lineId, machineId, params) => api.delete(ENDPOINTS.lineMachine(lineId, machineId), { params });
export const getPlcLatestReadings = () => api.get(ENDPOINTS.plcLatestReadings);
export const getPlcReadingHistory = (params) => api.get(ENDPOINTS.plcReadingHistory, { params });
export const getPlcConnectionEvents = (params) => api.get(ENDPOINTS.plcConnectionEvents, { params });
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
