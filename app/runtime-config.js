// Локальная поставка всегда остаётся автономной. При раздаче через backend
// этот URL перехватывается сервером и mode меняется на "server".
globalThis.PLAN_FACT_RUNTIME = Object.freeze({ mode: "local" });
