"use strict";

const { AppError } = require("./errors.js");
const { SqliteStore } = require("./sqlite-store.js");

async function createStore(config, initialState) {
  if (!config.storageDriver) {
    throw new AppError(
      "Не задан PLAN_FACT_STORAGE_DRIVER; в production хранилище выбирается только явно",
      500,
      "storage_driver_required"
    );
  }
  if (config.deploymentProfile === "postgres-only" && config.storageDriver !== "postgres") {
    throw new AppError(
      "Этот образ поддерживает только PLAN_FACT_STORAGE_DRIVER=postgres",
      500,
      "storage_driver_not_available"
    );
  }
  if (config.storageDriver === "sqlite") {
    return new SqliteStore(config.databasePath, { initialState });
  }
  if (config.storageDriver === "postgres") {
    if (!config.databaseUrl) {
      throw new AppError("Не задан PLAN_FACT_DATABASE_URL", 500, "postgres_storage_not_configured");
    }
    const { PostgresStore } = require("./postgres-store.js");
    return PostgresStore.create(config, { initialState });
  }
  throw new AppError(`Неизвестный PLAN_FACT_STORAGE_DRIVER: ${config.storageDriver}`, 500, "storage_driver_invalid");
}

module.exports = { createStore };
