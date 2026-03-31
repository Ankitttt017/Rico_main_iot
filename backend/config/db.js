const { Sequelize } = require("sequelize");

const isTest = process.env.NODE_ENV === "test";

const sequelize = isTest
  ? new Sequelize("sqlite::memory:", { logging: false })
  : new Sequelize(
      process.env.DB_NAME || "tracebility",
      process.env.DB_USER || "root",
      process.env.DB_PASS || "",
      {
        host: process.env.DB_HOST || "localhost",
        dialect: "mysql",
        logging: false,
      }
    );

module.exports = sequelize;