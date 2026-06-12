"use strict";

const express = require("express");
const {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} = require("./department.controller");

const router = express.Router();

router.get("/", listDepartments);
router.post("/", createDepartment);
router.put("/:id", updateDepartment);
router.delete("/:id", deleteDepartment);

module.exports = router;
