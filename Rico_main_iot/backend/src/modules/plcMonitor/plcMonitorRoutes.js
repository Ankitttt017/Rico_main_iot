const express = require("express");

function createPlcMonitorRoutes(service) {
  const router = express.Router();

  router.get("/status", (_req, res) => {
    res.json({ success: true, data: service.getStatus() });
  });

  router.get("/readings/latest", async (_req, res) => {
    try {
      const data = await service.getLatestReadings();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load latest PLC readings.",
        error: error.message,
      });
    }
  });

  router.get("/readings/history", async (req, res) => {
    try {
      const data = await service.getReadingHistory({
        ip: req.query.ip,
        limit: req.query.limit,
        from: req.query.from,
        to: req.query.to,
        page: req.query.page,
        pageSize: req.query.pageSize,
        shotNumber: req.query.shotNumber,
        shift: req.query.shift,
        shotResult: req.query.shotResult,
      });
      if (data && !Array.isArray(data) && Array.isArray(data.rows)) {
        res.json({
          success: true,
          data: data.rows,
          pagination: {
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
            totalPages: Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 1))),
          },
          kpis: data.kpis || {},
        });
        return;
      }
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load PLC reading history.",
        error: error.message,
      });
    }
  });

  router.get("/readings/history/export", async (req, res) => {
    try {
      const rows = await service.getReadingHistory({
        ip: req.query.ip,
        limit: req.query.limit || 2000,
        from: req.query.from,
        to: req.query.to,
      });
      const workbook = service.buildReadingsExcelXml(rows, {
        ip: req.query.ip,
        from: req.query.from,
        to: req.query.to,
      });
      const ipLabel = String(req.query.ip || "all-machines").replace(/[^a-zA-Z0-9.-]/g, "-");
      const fromLabel = String(req.query.from || "all").replace(/[^a-zA-Z0-9-]/g, "-");
      const toLabel = String(req.query.to || "latest").replace(/[^a-zA-Z0-9-]/g, "-");

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="rico-plc-report-${ipLabel}-${fromLabel}-to-${toLabel}.xls"`);
      res.send(workbook);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to export PLC reading history.",
        error: error.message,
      });
    }
  });

  router.get("/connection-events", async (req, res) => {
    try {
      const data = await service.getConnectionEvents({
        ip: req.query.ip,
        limit: req.query.limit,
        from: req.query.from,
        to: req.query.to,
      });
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load PLC connection events.",
        error: error.message,
      });
    }
  });

  router.get("/connection-events/export", async (req, res) => {
    try {
      const rows = await service.getConnectionEvents({
        ip: req.query.ip,
        limit: req.query.limit || 2000,
        from: req.query.from,
        to: req.query.to,
      });
      const workbook = service.buildConnectionEventsExcelXml(rows, {
        ip: req.query.ip,
        from: req.query.from,
        to: req.query.to,
      });
      const ipLabel = String(req.query.ip || "all-machines").replace(/[^a-zA-Z0-9.-]/g, "-");
      const fromLabel = String(req.query.from || "all").replace(/[^a-zA-Z0-9-]/g, "-");
      const toLabel = String(req.query.to || "latest").replace(/[^a-zA-Z0-9-]/g, "-");

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="rico-plc-connectivity-${ipLabel}-${fromLabel}-to-${toLabel}.xls"`);
      res.send(workbook);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to export PLC connection events.",
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = createPlcMonitorRoutes;
