const express = require('express');
const router = express.Router();
const {
  getAllLines,
  getLineById,
  getLineOperations,
  getLinesMachines,
  getLinesParts,
  createLine,
  updateLine,
  deleteLine,
  addLineMachine,
  updateLineMachine,
  removeLineMachine,
  getRawMasterData
} = require('./line.controller');

router.get('/',              getAllLines);
router.get('/raw-master-data', getRawMasterData);
router.get('/operations/list', getLineOperations);
router.get('/:id',           getLineById);
router.get('/:id/machines',  getLinesMachines);
router.get('/:id/parts',     getLinesParts);
router.post('/',             createLine);
router.put('/:id',           updateLine);
router.delete('/:id',        deleteLine);
router.post('/:id/machines', addLineMachine);
router.put('/:id/machines/:machineId', updateLineMachine);
router.delete('/:id/machines/:machineId', removeLineMachine);

module.exports = router;
