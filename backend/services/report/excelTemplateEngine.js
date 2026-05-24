/**
 * excelTemplateEngine.js
 * Industrial-grade Excel template engine using ExcelJS.
 * No external date dependencies — uses reportFormatter utilities.
 */

const ExcelJS = require("exceljs");
const { formatIndustrialTimestamp, resolveIndustrialResult } = require("./reportFormatter");

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function generateIndustrialExcel(res, {
  rows = [],
  metrics = {},
  filters = {},
  reportConfig = {},
  sheetName = "Production Report",
  filePrefix = "PROD_REPORT"
}) {
  const workbook  = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const NAVY = "FF1A3A7C";
  const RED = "FFC8191E";
  const TEAL = "FF0D9488";
  const GRAY = "FF4B5563";
  const WHITE = "FFFFFFFF";
  const LTGRAY = "FFF9FAFB";
  const BORDER = "FFD1D5DB";

  worksheet.getRow(1).height = 65;
  worksheet.mergeCells("A1:K1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = (reportConfig.headerLine1 || reportConfig.companyName || "Industrial Traceability System").toUpperCase();
  titleCell.font = { bold: true, size: 20, color: { argb: WHITE }, name: "Calibri" };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

  if (reportConfig.logoUrl && reportConfig.showLogo) {
    try {
      let base64Data = reportConfig.logoUrl;
      if (base64Data.includes(",")) base64Data = base64Data.split(",")[1];
      if (base64Data && base64Data.length > 50) {
        const imageId = workbook.addImage({ base64: base64Data, extension: "png" });
        worksheet.addImage(imageId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 90, height: 55 } });
      }
    } catch (e) {
      console.warn("Logo addition failed:", e.message);
    }
  }

  worksheet.getRow(2).height = 32;
  worksheet.mergeCells("A2:K2");
  const subTitleCell = worksheet.getCell("A2");
  let subText = reportConfig.headerLine2 || "TRACEABILITY PRODUCTION REPORT";
  if (filters.machineId) subText += ` - MACHINE: ${filters.machineId}`;
  else if (filters.lineName) subText += ` - LINE: ${filters.lineName}`;
  subTitleCell.value = subText.toUpperCase();
  subTitleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  subTitleCell.alignment = { horizontal: "center", vertical: "middle" };
  subTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D5BA3" } };

  worksheet.getColumn(1).width = 18;
  worksheet.getColumn(4).width = 18;

  const metaRows = [
    ["Report Type", sheetName, "Generated At", formatIndustrialTimestamp(new Date())],
    ["Line", filters.lineName || "All Lines", "Date From", formatIndustrialTimestamp(filters.dateFrom)],
    ["Machine", filters.machineId || "All Machines", "Date To", formatIndustrialTimestamp(filters.dateTo)],
    ["Shift", filters.shiftCode || "All Shifts", "Plant", reportConfig.plantName || "-"],
    ["Department", reportConfig.department || "-", "Prepared By", reportConfig.preparedBy || "-"],
  ];

  metaRows.forEach((r, i) => {
    const rowNum = i + 4;
    worksheet.getRow(rowNum).height = 20;
    const set = (col, val, bold) => {
      const c = worksheet.getCell(`${col}${rowNum}`);
      c.value = val;
      c.font = bold ? { bold: true, size: 10, color: { argb: NAVY } } : { size: 10 };
      c.alignment = { vertical: "middle" };
      c.border = {
        top: { style: "thin", color: { argb: BORDER } },
        bottom: { style: "thin", color: { argb: BORDER } },
        left: { style: "thin", color: { argb: BORDER } },
        right: { style: "thin", color: { argb: BORDER } },
      };
    };
    set("A", r[0], true); set("B", r[1], false); set("D", r[2], true); set("E", r[3], false);
    const emptyC = worksheet.getCell(`C${rowNum}`);
    emptyC.border = { top:{style:"thin",color:{argb:BORDER}}, bottom:{style:"thin",color:{argb:BORDER}}, left:{style:"thin",color:{argb:BORDER}}, right:{style:"thin",color:{argb:BORDER}} };
  });

  const summaryStart = 10;
  worksheet.mergeCells(`A${summaryStart}:K${summaryStart}`);
  const sumHeader = worksheet.getCell(`A${summaryStart}`);
  sumHeader.value = "PRODUCTION SUMMARY";
  sumHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  sumHeader.font = { bold: true, size: 10, color: { argb: NAVY } };
  sumHeader.alignment = { horizontal: "left", indent: 1 };
  sumHeader.border = { bottom: { style: "medium", color: { argb: NAVY } } };

  const summaryCards = [
    { label: "Total Production", value: metrics.totalProduction || 0, color: NAVY },
    { label: "Total OK", value: metrics.totalOK || 0, color: "FF059669" },
    { label: "Total NG", value: metrics.totalNG || 0, color: RED },
    { label: "Validation Rejects", value: metrics.validationRejects || 0, color: "FFD97706" },
    { label: "Pass Rate", value: `${metrics.passRate || 0}%`, color: TEAL },
  ];

  summaryCards.forEach((card, i) => {
    const col = i * 2 + 1;
    worksheet.getCell(summaryStart + 1, col).value = card.label;
    worksheet.getCell(summaryStart + 1, col).font = { bold: true, size: 8, color: { argb: GRAY } };
    worksheet.getCell(summaryStart + 1, col).alignment = { horizontal: "center" };
    worksheet.getCell(summaryStart + 2, col).value = card.value;
    worksheet.getCell(summaryStart + 2, col).font = { bold: true, size: 14, color: { argb: card.color } };
    worksheet.getCell(summaryStart + 2, col).alignment = { horizontal: "center" };
  });

  const stationOrder = [...new Set(rows.map((r) => String(r.operation_no || r.operationNo || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const stationLabelByOperation = stationOrder.reduce((acc, operationNo) => {
    const machineNames = [...new Set(
      rows
        .filter((row) => String(row.operation_no || row.operationNo || "").trim() === operationNo)
        .map((row) => String(row.machineName || row.machine_name || row?.Machine?.machine_name || "").trim())
        .filter(Boolean)
    )];
    acc[operationNo] = machineNames.length > 0 ? `${operationNo} - ${machineNames.join(" / ")}` : operationNo;
    return acc;
  }, {});

  const grouped = new Map();
  rows.forEach((row) => {
    const partSerial = row.part_id || row.partId || "-";
    if (!grouped.has(partSerial)) {
      grouped.set(partSerial, {
        partSerial,
        shift: row.shift_code || row.shiftCode || "-",
        machineName: row.machineName || "-",
        modelCode: row.modelCode || "-",
        modelName: row.qrFormatName || "-",
        lineName: row.lineName || "-",
        cycleStart: row.cycleStartTime || "-",
        cycleEnd: row.cycleEndTime || "-",
        cycleTime: row.cycleTime || "0.00",
        reason: row.interlock_reason || row.reason || "-",
        stationResults: {},
        stationCycleTimes: {},
        plcReading: {},
      });
    }
    const bucket = grouped.get(partSerial);
    const op = String(row.operation_no || row.operationNo || "").trim();
    const resolved = row.industrialResult ? { status: row.industrialResult } : resolveIndustrialResult(row);
    const status = String(resolved.status || "").toUpperCase();
    if (op) {
      bucket.stationResults[op] = status === "OK" || status === "NG" ? status : "-";
      bucket.stationCycleTimes[op] = row.cycleTime || "-";
    }
    Object.assign(bucket.plcReading, row.plcReading || {});
  });

  const matrixRows = [...grouped.values()];

  const tableHeaderRow = 14;
  const baseColumns = [
    { header: "SR NO", width: 8 },
    { header: "Part Serial No", width: 28 },
    { header: "Shift", width: 12 },
    { header: "Machine Name", width: 22 },
    { header: "Model Code", width: 16 },
    { header: "Model Name", width: 22 },
    { header: "Overall Result", width: 16 },
    { header: "Reason", width: 34 },
    { header: "Cycle Start", width: 24 },
    { header: "Cycle End", width: 24 },
    { header: "Cycle Time (s)", width: 16 },
    { header: "Line No", width: 14 },
  ];
  const stationColumns = stationOrder.map((op) => ({ header: stationLabelByOperation[op] || op, width: 24 }));
  const stationCycleColumns = stationOrder.map((op) => ({ header: `${stationLabelByOperation[op] || op} CYCLE(S)`, width: 20 }));
  const plcKeys = [...new Set(rows.flatMap((r) => Object.keys(r.plcReading || {})))]
    .sort((a, b) => a.localeCompare(b));
  const plcColumns = plcKeys.map((key) => ({
    header: `PLC ${String(key).replaceAll("_", " ")}`.toUpperCase(),
    key,
    width: Math.min(Math.max(String(key).length + 6, 14), 28),
  }));
  const columns = [...baseColumns, ...stationColumns, ...stationCycleColumns, ...plcColumns];

  columns.forEach((col, i) => {
    worksheet.getColumn(i + 1).width = col.width;
    const cell = worksheet.getCell(tableHeaderRow, i + 1);
    cell.value = col.header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = { bold: true, color: { argb: WHITE }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "medium", color: { argb: TEAL } } };
  });

  matrixRows.forEach((row, i) => {
    const stationResults = stationOrder.map((op) => row.stationResults[op] || "-");
    const stationCycles = stationOrder.map((op) => row.stationCycleTimes[op] || "-");
    const overall = stationResults.includes("NG") ? "NG" : stationResults.includes("OK") ? "OK" : "-";
    const plc = row.plcReading || {};
    const values = [
      i + 1,
      row.partSerial,
      row.shift,
      row.machineName,
      row.modelCode,
      row.modelName,
      overall,
      row.reason,
      row.cycleStart,
      row.cycleEnd,
      row.cycleTime,
      row.lineName,
      ...stationResults,
      ...stationCycles,
      ...plcColumns.map((c) => {
        const v = plc[c.key];
        return v === undefined || v === null || v === "" ? "-" : v;
      }),
    ];

    const rowIndex = tableHeaderRow + 1 + i;
    worksheet.getRow(rowIndex).values = values;
    if (i % 2 !== 0) worksheet.getRow(rowIndex).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LTGRAY } };

    values.forEach((_, ci) => {
      const cell = worksheet.getCell(rowIndex, ci + 1);
      cell.border = {
        top: { style: "thin", color: { argb: BORDER } },
        bottom: { style: "thin", color: { argb: BORDER } },
        left: { style: "thin", color: { argb: BORDER } },
        right: { style: "thin", color: { argb: BORDER } },
      };
      cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      if (!cell.font || !cell.font.bold) cell.font = { size: 9 };
    });

    const overallCell = worksheet.getCell(rowIndex, 7);
    if (overall === "OK") overallCell.font = { bold: true, size: 9, color: { argb: "FF059669" } };
    if (overall === "NG") overallCell.font = { bold: true, size: 9, color: { argb: RED } };

    stationOrder.forEach((_, sIdx) => {
      const stationCell = worksheet.getCell(rowIndex, baseColumns.length + sIdx + 1);
      const v = String(stationCell.value || "").toUpperCase();
      if (v === "OK") stationCell.font = { bold: true, size: 9, color: { argb: "FF059669" } };
      if (v === "NG") stationCell.font = { bold: true, size: 9, color: { argb: RED } };
    });
  });

  worksheet.views = [{ state: "frozen", ySplit: tableHeaderRow }];
  worksheet.autoFilter = { from: { row: tableHeaderRow, column: 1 }, to: { row: tableHeaderRow, column: columns.length } };

  const footerRow = tableHeaderRow + matrixRows.length + 2;
  worksheet.mergeCells(footerRow, 1, footerRow, columns.length);
  const footer = worksheet.getCell(footerRow, 1);
  footer.value = `${reportConfig.footerText || "Industrial Document - Controlled Copy"}  ·  Records: ${matrixRows.length}  ·  Exported: ${formatIndustrialTimestamp(new Date())}`;
  footer.font = { italic: true, size: 8, color: { argb: GRAY } };
  footer.alignment = { horizontal: "center" };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${filePrefix}_${nowStamp()}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.byteLength);
  res.send(Buffer.from(buffer));
}

module.exports = { generateIndustrialExcel };
