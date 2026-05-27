import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

export const getPlants      = ()        => api.get('/plants');
export const getParts       = (params)  => api.get('/parts', { params });
export const getPartById    = (id)      => api.get(`/parts/${id}`);
export const updatePart     = (id, d)   => api.put(`/parts/${id}`, d);
export const getOperations  = (id)      => api.get(`/parts/${id}/operations`);
export const getOperationMaster = (params) => api.get('/operations', { params });
export const updateOperation = (partId, operationId, d) => api.put(`/parts/${partId}/operations/${operationId}`, d);
export const deleteOperation = (partId, operationId) => api.delete(`/parts/${partId}/operations/${operationId}`);
export const getSheets      = (id)      => api.get(`/parts/${id}/sheets`);
export const uploadSheet    = (id, type, d) => api.post(`/parts/${id}/sheets/${type}`, d);
export const getConfig      = (id)      => api.get(`/parts/${id}/configuration`);
export const updateConfig   = (id, d)   => api.put(`/parts/${id}/configuration`, d);
export const getStats       = (params)  => api.get('/stats', { params });
export const getMachines    = (params)  => api.get('/machines', { params });
export const createMachine  = (data)    => api.post('/machines', data);
export const updateMachine  = (id, d)   => api.put(`/machines/${id}`, d);
export const deleteMachine  = (id)      => api.delete(`/machines/${id}`);
export const getMachineOperations = (id, params) => api.get(`/machines/${id}/operations`, { params });
export const assignMachineOperation = (id, data) => api.put(`/machines/${id}/operation`, data);
export const getMachineStatusHistory = (id) => api.get(`/machines/${id}/status-history`);
export const getLines       = (params)  => api.get('/lines', { params });
export const getLineOperations = ()     => api.get('/lines/operations/list');
export const getRawMasterData = (params) => api.get('/lines/raw-master-data', { params });
export const createLine     = (data)    => api.post('/lines', data);
export const updateLine     = (id, d)   => api.put(`/lines/${id}`, d);
export const deleteLine     = (id)      => api.delete(`/lines/${id}`);
export const getLineMachines = (id)     => api.get(`/lines/${id}/machines`);
export const createLineMachine = (id, data) => api.post(`/lines/${id}/machines`, data);
export const updateLineMachine = (lineId, machineId, data) => api.put(`/lines/${lineId}/machines/${machineId}`, data);
export const removeLineMachine = (lineId, machineId, params) => api.delete(`/lines/${lineId}/machines/${machineId}`, { params });
export const getPlcLatestReadings = () => api.get('/plc-monitor/readings/latest');
export const getPlcReadingHistory = (params) => api.get('/plc-monitor/readings/history', { params });
export const getPlcConnectionEvents = (params) => api.get('/plc-monitor/connection-events', { params });
export const getPlcHistoryExportUrl = ({ ip, limit = 2000, from, to } = {}) => {
  const params = new URLSearchParams();
  if (ip) params.set('ip', ip);
  if (limit) params.set('limit', String(limit));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('_', String(Date.now()));
  return `${api.defaults.baseURL}/plc-monitor/readings/history/export?${params.toString()}`;
};
export const getPlcConnectionEventsExportUrl = ({ ip, limit = 2000, from, to } = {}) => {
  const params = new URLSearchParams();
  if (ip) params.set('ip', ip);
  if (limit) params.set('limit', String(limit));
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('_', String(Date.now()));
  return `${api.defaults.baseURL}/plc-monitor/connection-events/export?${params.toString()}`;
};

export default api;
