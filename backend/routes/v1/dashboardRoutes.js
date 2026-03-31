const express = require("express");
const traceabilityController = require("../../controllers/traceabilityController");
const { verifyToken } = require("../../middleware/authMiddleware");
const { getOeeMetrics } = require("../../controllers/oeeController");

const router = express.Router();

router.get("/dashboard/summary", verifyToken, traceabilityController.getDashboardSummary);
router.get("/dashboard/trends", verifyToken, traceabilityController.getDashboardTrends);
router.get("/dashboard/report", verifyToken, traceabilityController.getDashboardReport);
router.get("/dashboard/report/export", verifyToken, traceabilityController.exportDashboardReportCsv);
router.get("/dashboard/oee", verifyToken, getOeeMetrics); // UPGRADE 7 — OEE metrics

module.exports = router;

