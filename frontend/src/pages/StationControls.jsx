import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Settings2, Activity, Monitor } from "lucide-react";
import { machineApi, stationSettingsApi } from "../api/services";
import GlobalPopup from "../components/GlobalPopup";
import { getMachineStage } from "../utils/machineFields";
import {
  DEFAULT_STATION_FEATURES,
  getStationFeatureSettings,
  mergeStationFeatureSettings,
  normalizeStationKey,
  saveStationFeatureSettings,
} from "../utils/stationSettings";

const StationControl = () => {
  const [machines, setMachines] = useState([]);
  const [stationSettings, setStationSettings] = useState(() => getStationFeatureSettings());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [popup, setPopup] = useState(null);

  // PLC values per station
  const [plcValues, setPlcValues] = useState({});

  const stationRows = useMemo(() => {
    const grouped = new Map();
    for (const machine of machines) {
      const stationNo = normalizeStationKey(getMachineStage(machine));
      if (!stationNo) continue;
      if (!grouped.has(stationNo)) {
        grouped.set(stationNo, {
          stationNo,
          lineNames: new Set(),
          sequenceNo: Number(machine.sequenceNo || 9999),
          machines: [],
        });
      }
      const row = grouped.get(stationNo);
      row.lineNames.add(String(machine.lineName || "-").trim() || "-");
      row.machines.push({
        id: machine.id,
        machineName: machine.machineName || `Machine ${machine.id}`,
        sequenceNo: Number(machine.sequenceNo || 9999),
        operationNo: getMachineStage(machine),
      });
      row.sequenceNo = Math.min(row.sequenceNo, Number(machine.sequenceNo || 9999));
    }
    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        lineNames: Array.from(row.lineNames).sort((a, b) => a.localeCompare(b)),
        machines: [...row.machines].sort((a, b) => a.sequenceNo - b.sequenceNo),
      }))
      .sort((a, b) => a.sequenceNo - b.sequenceNo);
  }, [machines]);

  const stationKeys = useMemo(() => stationRows.map((entry) => entry.stationNo), [stationRows]);
  const normalizedSettings = useMemo(
    () => mergeStationFeatureSettings(stationKeys, stationSettings),
    [stationKeys, stationSettings]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        machineApi.list(),
        stationSettingsApi.list().catch(() => null),
      ]);
      setMachines(m || []);
      if (s) setStationSettings(s);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveSettings = async () => {
    try {
      await stationSettingsApi.save(normalizedSettings);
      setPopup({
        type: "SUCCESS",
        title: "Settings Saved",
        message: "Station protocols have been synchronized.",
      });
    } catch (error) {
      setPopup({
        type: "ERROR",
        title: "Save Error",
        message: error.response?.data?.error || "Unable to save station configuration.",
      });
    }
  };

  // Simulate reading PLC value – replace with actual API call
  const fetchPlcValue = async (stationNo) => {
    // e.g., const res = await plcApi.read(stationNo);
    return new Promise((resolve) => {
      setTimeout(() => resolve(Math.floor(Math.random() * 1000)), 500);
    });
  };

  const handleRefreshPlc = async (stationNo) => {
    try {
      const value = await fetchPlcValue(stationNo);
      setPlcValues((prev) => ({ ...prev, [stationNo]: value }));
    } catch (error) {
      console.error(`Failed to read PLC for ${stationNo}`, error);
      setPlcValues((prev) => ({ ...prev, [stationNo]: "Error" }));
    }
  };

  const handleRefreshAll = () => {
    stationRows.forEach((row) => handleRefreshPlc(row.stationNo));
  };

  return (
    <div className="space-y-6 rise-in">
      <GlobalPopup popup={popup} onClose={() => setPopup(null)} />

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
            <Settings2 className="text-primary" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-text-main tracking-tight uppercase">
              Station Control
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge badge-info uppercase">Logic Engine</span>
              <p className="text-text-muted text-sm font-medium tracking-tight">
                Configure station protocols & read live PLC data
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveSettings}
            className="h-10 px-5 rounded-xl bg-primary text-on-strong font-black uppercase tracking-widest flex items-center gap-2 hover:brightness-110 shadow-lg shadow-primary/20 transition-all"
          >
            <Save size={16} /> Save Settings
          </button>
        </div>
      </div>

      {loading ? (
        <div className="industrial-card p-20 flex flex-col items-center justify-center text-text-muted/20">
          <RefreshCw size={48} className="animate-spin mb-4" />
          <p className="text-xs font-black uppercase tracking-widest">Loading station data...</p>
        </div>
      ) : (
        <div className="industrial-card p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-bg-dark/40 flex items-center justify-between">
            <h2 className="text-sm font-black text-text-main uppercase tracking-widest">
              Station Protocol Engine
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleRefreshAll}
                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-border hover:border-primary transition-all bg-bg-card flex items-center gap-1"
              >
                <Activity size={12} /> Refresh All PLC
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-left">
              <thead className="bg-bg-dark/60 text-[9px] font-black text-text-muted uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-6 py-4">Station ID</th>
                  <th className="px-6 py-4 text-center">QR Check</th>
                  <th className="px-6 py-4 text-center">OP Validation</th>
                  <th className="px-6 py-4 text-center">PLC Handshake</th>
                  <th className="px-6 py-4 text-center">Rework Bin</th>
                  <th className="px-6 py-4 text-center">Pcs/Cycle</th>
                  <th className="px-6 py-4 text-center">Final Exit</th>
                  <th className="px-6 py-4 text-center">PLC Readout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-xs">
                {stationRows.map((row) => {
                  const config = normalizedSettings[row.stationNo] || DEFAULT_STATION_FEATURES;
                  const plcValue = plcValues[row.stationNo] ?? "—";
                  return (
                    <tr key={row.stationNo} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-black text-primary font-mono text-sm uppercase">
                          {row.stationNo}
                        </p>
                        <p className="text-[9px] text-text-muted leading-tight mt-0.5">
                          SEQ: {row.sequenceNo}
                        </p>
                      </td>
                      {["qr", "operation", "plcConfirmation", "rejectionBin"].map((key) => (
                        <td key={key} className="px-6 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={config[key]}
                            onChange={(e) => {
                              const next = {
                                ...stationSettings,
                                [row.stationNo]: {
                                  ...(stationSettings[row.stationNo] || {}),
                                  [key]: e.target.checked,
                                },
                              };
                              setStationSettings(next);
                            }}
                            className="w-4 h-4 accent-primary cursor-pointer"
                          />
                        </td>
                      ))}
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          value={config.plcPartCount || 1}
                          onChange={(e) => {
                            const next = {
                              ...stationSettings,
                              [row.stationNo]: {
                                ...(stationSettings[row.stationNo] || {}),
                                plcPartCount: Number(e.target.value),
                              },
                            };
                            setStationSettings(next);
                          }}
                          className="w-14 bg-bg-dark border border-border rounded px-2 py-1 text-center font-mono font-bold"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={config.finalPacking}
                          onChange={(e) => {
                            const next = {
                              ...stationSettings,
                              [row.stationNo]: {
                                ...(stationSettings[row.stationNo] || {}),
                                finalPacking: e.target.checked,
                              },
                            };
                            setStationSettings(next);
                          }}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-mono font-bold bg-bg-dark/50 px-2 py-1 rounded">
                            {plcValue}
                          </span>
                          <button
                            onClick={() => handleRefreshPlc(row.stationNo)}
                            className="p-1 rounded hover:bg-primary/20 transition-colors"
                            title="Read from PLC"
                          >
                            <RefreshCw size={12} className="text-primary" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StationControl;