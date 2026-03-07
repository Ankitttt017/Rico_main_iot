const StationFeatureSetting = require("../models/StationFeatureSetting");

function normalizeStation(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizePlcPartCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function normalizeInputMap(rawSettings = {}) {
  if (!rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
    return {};
  }

  return Object.entries(rawSettings).reduce((acc, [rawKey, rawValue]) => {
    const stationNo = normalizeStation(rawKey);
    if (!stationNo || !rawValue || typeof rawValue !== "object") {
      return acc;
    }

    acc[stationNo] = {
      qr: rawValue.qr !== false,
      operation: rawValue.operation !== false,
      rejectionBin: rawValue.rejectionBin !== false,
      plcConfirmation: rawValue.plcConfirmation !== false,
      manualResult: rawValue.manualResult === true,
      plcPartCount: normalizePlcPartCount(rawValue.plcPartCount ?? rawValue.plc_part_count),
      finalPacking: rawValue.finalPacking === true,
    };
    return acc;
  }, {});
}

function rowsToMap(rows = []) {
  return rows.reduce((acc, row) => {
    const stationNo = normalizeStation(row.station_no);
    if (!stationNo) {
      return acc;
    }
    acc[stationNo] = {
      qr: Boolean(row.qr_enabled),
      operation: Boolean(row.operation_enabled),
      rejectionBin: Boolean(row.rejection_bin_enabled),
      plcConfirmation: row.plc_confirmation_enabled !== false,
      manualResult: row.manual_result_enabled === true,
      plcPartCount: normalizePlcPartCount(row.plc_part_count),
      finalPacking: row.final_packing_enabled === true,
    };
    return acc;
  }, {});
}

exports.getSettings = async (_req, res) => {
  try {
    const rows = await StationFeatureSetting.findAll({
      order: [["station_no", "ASC"]],
    });
    res.json(rowsToMap(rows));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.saveSettings = async (req, res) => {
  try {
    const payload = normalizeInputMap(req.body?.settings || req.body);
    const stations = Object.keys(payload);

    if (stations.length === 0) {
      return res.status(400).json({ error: "At least one station setting is required" });
    }

    await Promise.all(
      stations.map((stationNo) =>
        StationFeatureSetting.upsert({
          station_no: stationNo,
          qr_enabled: payload[stationNo].qr,
          operation_enabled: payload[stationNo].operation,
          rejection_bin_enabled: payload[stationNo].rejectionBin,
          plc_confirmation_enabled: payload[stationNo].plcConfirmation,
          manual_result_enabled: payload[stationNo].manualResult === true,
          plc_part_count: payload[stationNo].plcPartCount,
          final_packing_enabled: payload[stationNo].finalPacking === true,
          updated_by: req.user?.id || null,
        })
      )
    );

    const rows = await StationFeatureSetting.findAll({
      where: { station_no: stations },
      order: [["station_no", "ASC"]],
    });

    res.json({
      message: "Station settings saved",
      settings: rowsToMap(rows),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
