const express = require('express');
const router  = express.Router();
const {
  getAllPlants, getPartsByPlant, getPartById,
  getPartOperations, getPartConfiguration, updatePartConfiguration,
  updatePartById, getPartSheets, uploadPartSheet, downloadPartSheet,
  updatePartOperation, deletePartOperation,
  getOperationMaster, getMaterials, getStats,
} = require('./part.controller');

router.get('/plants',                        getAllPlants);
router.get('/parts',                         getPartsByPlant);
router.get('/operations',                    getOperationMaster);
router.get('/parts/:id',                     getPartById);
router.put('/parts/:id',                     updatePartById);
router.get('/parts/:id/operations',          getPartOperations);
router.put('/parts/:id/operations/:operationId', updatePartOperation);
router.delete('/parts/:id/operations/:operationId', deletePartOperation);
router.get('/parts/:id/sheets',              getPartSheets);
router.post('/parts/:id/sheets/:type',       uploadPartSheet);
router.get('/parts/:id/sheets/:type/:sheetId/download', downloadPartSheet);
router.get('/parts/:id/configuration',       getPartConfiguration);
router.put('/parts/:id/configuration',       updatePartConfiguration);
router.get('/materials',                     getMaterials);
router.get('/stats',                         getStats);

module.exports = router;
