import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { reportApi, machineApi } from '../../api/services';
import { loadReportConfig } from '../../utils/reportConfig';
import { toDatetimeLocal } from '../../utils/time';
import ReportFilters from './ReportFilters';
import ReportSummaryCards from './ReportSummaryCards';
import ReportTable from './ReportTable';
import ExportButtons from './ExportButtons';
import { FileText, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const ReportsPage = () => {
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [machines, setMachines] = useState([]);
  const [data, setData] = useState({ rows: [], metrics: {} });
  
  const [filters, setFilters] = useState({
    dateFrom: toDatetimeLocal(new Date(new Date().setHours(0,0,0,0))),
    dateTo: toDatetimeLocal(new Date(new Date().setHours(23,59,59,999))),
    machineId: '',
    lineName: '',
    shiftCode: '',
    status: '',
    station: '',
    barcode: '',
    customerCode: '',
    operatorId: '',
    resultType: '',
    modelCode: '',
    operationNo: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reportApi.getData(filters);
      setData({ rows: response.rows || [], metrics: response.metrics || {} });
    } catch (e) {
      console.error(e);
      toast.error("Failed to load production analytics");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    machineApi.list().then(setMachines).catch(console.error);
    fetchData();
  }, []);

  const handleExport = async (type) => {
    setExportLoading(true);
    const toastId = toast.loading(`Preparing ${type.toUpperCase()} report...`);
    try {
      const reportConfig = loadReportConfig();
      let blob;

      // Pass filters and reportConfig as separate args — services.js builds the body correctly
      if (type === 'full')  blob = await reportApi.exportFull(filters, reportConfig);
      else if (type === 'ng')    blob = await reportApi.exportNG(filters, reportConfig);
      else if (type === 'parts') blob = await reportApi.exportParts(filters, reportConfig);
      else if (type === 'audit') blob = await reportApi.exportAudit(filters, reportConfig);

      if (!blob) throw new Error("Empty response from export engine");

      const url  = window.URL.createObjectURL(new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement('a');
      link.href  = url;
      const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.setAttribute('download', `${type.toUpperCase()}_REPORT_${ts}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded successfully", { id: toastId });
    } catch (e) {
      console.error("Export failed:", e);
      toast.error(e?.response?.data?.error || "Export failed — check console", { id: toastId });
    } finally {
      setExportLoading(false);
    }
  };

  const reportTable = useMemo(() => {
    const sourceRows = data.rows || [];
    const stationOrder = [...new Set(sourceRows.map((r) => String(r.operationNo || r.stationNo || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    const stationLabelMap = stationOrder.reduce((acc, operationNo) => {
      const machineNames = [...new Set(
        sourceRows
          .filter((row) => String(row.operationNo || row.stationNo || "").trim() === operationNo)
          .map((row) => String(row.machineName || "").trim())
          .filter(Boolean)
      )];
      acc[operationNo] = machineNames.length > 0 ? `${operationNo} - ${machineNames.join(" / ")}` : operationNo;
      return acc;
    }, {});
    const plcKeys = [...new Set(sourceRows.flatMap((r) => Object.keys(r.plcReading || {})))].sort((a, b) => a.localeCompare(b));
    const grouped = new Map();

    sourceRows.forEach((row) => {
      const key = String(row.partId || row.part_id || "").trim();
      if (!key) return;
      if (!grouped.has(key)) {
        grouped.set(key, {
          barcode: key,
          customerCode: row.customerCode || "-",
          stationResults: {},
          stationCycleTimes: {},
          overallStatus: row.industrialResult || row.statusLabel || "UNKNOWN",
          verifyStatus: String(row.validation_result || row.validationResult || "-").toUpperCase(),
          ngReason: row.reason || row.interlock_reason || "-",
          bypassStatus: row.bypassStatus ? "Yes" : "No",
          plcData: {},
        });
      }
      const bucket = grouped.get(key);
      const stationKey = String(row.operationNo || row.stationNo || "").trim();
      if (stationKey) {
        bucket.stationResults[stationKey] = String(row.industrialResult || row.statusLabel || "-").toUpperCase();
        bucket.stationCycleTimes[stationKey] = row.cycleTime || "-";
      }
      bucket.customerCode = row.customerCode || bucket.customerCode;
      bucket.overallStatus = String(row.industrialResult || bucket.overallStatus || "UNKNOWN").toUpperCase();
      if (!bucket.verifyStatus || bucket.verifyStatus === "-") {
        bucket.verifyStatus = String(row.validation_result || row.validationResult || "-").toUpperCase();
      }
      bucket.ngReason = row.reason || row.interlock_reason || bucket.ngReason || "-";
      bucket.bypassStatus = row.bypassStatus ? "Yes" : bucket.bypassStatus;
      Object.assign(bucket.plcData, row.plcReading || {});
    });

    const dynamicColumns = [
      { key: "srNo", label: "Sr No" },
      { key: "barcode", label: "Barcode" },
      { key: "customerCode", label: "Customer Code" },
      ...stationOrder.map((station) => ({ key: `station_${station}`, label: stationLabelMap[station] || station })),
      ...stationOrder.map((station) => ({ key: `cycle_${station}`, label: `${stationLabelMap[station] || station} Cycle(s)` })),
      { key: "verifyStatus", label: "Verify" },
      { key: "overallStatus", label: "Status" },
      { key: "ngReason", label: "NG Reason" },
      { key: "bypassStatus", label: "Bypass" },
      ...plcKeys.map((key) => ({ key: `plc_${key}`, label: key })),
    ];

    const dynamicRows = Array.from(grouped.values()).map((row, idx) => {
      const shaped = {
        srNo: idx + 1,
        barcode: row.barcode,
        customerCode: row.customerCode,
        verifyStatus: row.verifyStatus || "-",
        overallStatus: row.overallStatus,
        ngReason: row.ngReason,
        bypassStatus: row.bypassStatus,
      };
      stationOrder.forEach((station) => {
        shaped[`station_${station}`] = row.stationResults[station] || "-";
        shaped[`cycle_${station}`] = row.stationCycleTimes[station] || "-";
      });
      plcKeys.forEach((key) => {
        shaped[`plc_${key}`] = row.plcData[key] ?? "-";
      });
      return shaped;
    });

    return { columns: dynamicColumns, rows: dynamicRows };
  }, [data.rows]);

  return (
    <div className="space-y-6 pb-20 rise-in">
      {/* Page Header */}
      <div className="db-header-card mb-6">
        <div className="db-header-gradient-bar" />
        <div className="db-header-inner">
          <div className="db-header-title-group">
            <div className="db-header-icon-box">
              <FileText size={22} />
            </div>
            <div>
              <h1 className="db-header-title text-text-main">Production Analytics & Reports</h1>
              <p className="db-header-subtitle">Standardized MES Traceability Reporting Engine</p>
            </div>
          </div>
          <div className="bg-bg-dark/50 border border-border rounded-lg px-4 py-2 flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Database State</span>
              <span className="text-[11px] font-bold text-green-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live Ready
              </span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Compliance</span>
              <span className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                <Download size={10} /> Audit Validated
              </span>
            </div>
          </div>
        </div>
      </div>

      <ExportButtons onExport={handleExport} loading={exportLoading} />
      
      <ReportFilters 
        filters={filters} 
        onFilterChange={setFilters} 
        onApply={fetchData}
        onClear={() => setFilters({
          dateFrom: toDatetimeLocal(new Date(new Date().setHours(0,0,0,0))),
          dateTo: toDatetimeLocal(new Date(new Date().setHours(23,59,59,999))),
          machineId: '', lineName: '', shiftCode: '', status: '', station: '', barcode: '', customerCode: '', operatorId: '', resultType: '', modelCode: '', operationNo: ''
        })}
        machines={machines}
      />

      <ReportSummaryCards metrics={data.metrics} />

      <ReportTable rows={reportTable.rows} columns={reportTable.columns} loading={loading} />
    </div>
  );
};

export default ReportsPage;
