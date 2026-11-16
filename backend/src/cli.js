#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { accessCodesDirectory, loadConfig } = require("./config.js");
const { RealtimeHub } = require("./realtime.js");
const { PlanFactService } = require("./service.js");
const { createStore } = require("./store-factory.js");
const { normalizeStaffLogin } = require("./identity-provider.js");

function assertLocalAccessManagement(config) {
  if (config.authMode === "corporate-idm") throw new Error("Доступ в корпоративном режиме выдаётся и отзывается только в IDM");
}

async function visiblePrompt(label, fallback = "") {
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await terminal.question(`${label}${fallback ? ` [${fallback}]` : ""}: `)).trim() || fallback;
  } finally {
    terminal.close();
  }
}

async function bootstrapSuperadmin() {
  const config = loadConfig();
  assertLocalAccessManagement(config);
  const store = await createStore(config, PlanFactService.initialState);
  try {
    const staffLogin = process.env.PLAN_FACT_BOOTSTRAP_STAFF_LOGIN || await visiblePrompt("Staff login superadmin");
    const name = process.env.PLAN_FACT_BOOTSTRAP_DISPLAY_NAME || await visiblePrompt("Отображаемое имя", staffLogin);
    const service = new PlanFactService({ store, config, realtime: new RealtimeHub() });
    const account = await service.provisionSuperadmin({ staffLogin, name });
    stdout.write(`Создан superadmin: ${account.staffLogin}\n`);
  } finally {
    await store.close();
  }
}

function staffLoginList(value) {
  return [...new Set(String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeStaffLogin))];
}

function staffProvisioningPlan(env = process.env) {
  const superadmins = staffLoginList(env.PLAN_FACT_STAFF_SUPERADMINS);
  const users = staffLoginList(env.PLAN_FACT_STAFF_USERS);
  if (!superadmins.length && !users.length) {
    throw new Error("Задайте PLAN_FACT_STAFF_SUPERADMINS и/или PLAN_FACT_STAFF_USERS");
  }
  const superadminSet = new Set(superadmins);
  const overlap = users.filter((login) => superadminSet.has(login));
  if (overlap.length) throw new Error(`Staff login указан в двух ролях: ${overlap.join(", ")}`);
  return [
    ...superadmins.map((staffLogin) => ({ staffLogin, name: staffLogin, role: "superadmin" })),
    ...users.map((staffLogin) => ({ staffLogin, name: staffLogin, role: "user" }))
  ];
}

async function provisionStaffAccess() {
  const config = loadConfig();
  assertLocalAccessManagement(config);
  const store = await createStore(config, PlanFactService.initialState);
  try {
    const service = new PlanFactService({ store, config, realtime: new RealtimeHub() });
    const results = await service.provisionStaffAccounts(staffProvisioningPlan());
    for (const result of results) {
      stdout.write(`${result.created ? "Создан" : "Уже настроен"} ${result.account.role}: ${result.account.staffLogin}\n`);
    }
    stdout.write(`Provisioning завершён: создано ${results.filter((item) => item.created).length}, уже было ${results.filter((item) => !item.created).length}\n`);
  } finally {
    await store.close();
  }
}

// Логин становится именем файла, поэтому проверка строгая: только допустимые для логина символы
// (без «/» и «\»), без «..». Файл не может оказаться вне каталога кодов.
function accessCodeLogin(value) {
  const login = normalizeStaffLogin(value);
  if (login.includes("..")) throw new Error("Некорректный логин: «..» в логине недопустимо");
  return login;
}

function accessCodeFilePath(directory, login) {
  const file = path.join(directory, `${login}.txt`);
  if (path.dirname(file) !== directory) throw new Error("Некорректный логин: имя файла выходит за каталог кодов");
  return file;
}

// Каталог кодов открывает только владелец: создаём с правами 700, а если он уже был с другими — исправляем.
function ensureAccessCodesDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if ((fs.statSync(directory).mode & 0o777) !== 0o700) fs.chmodSync(directory, 0o700);
}

// Атомарная запись: временный файл с правами 600 в том же каталоге, затем rename. Читатель видит
// либо прежний файл, либо готовый новый, но не половину.
function writeAccessCodeFile(directory, login, code) {
  const target = accessCodeFilePath(directory, login);
  const temporary = path.join(directory, `.${login}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  const text = `${code}\nЛичный код доступа к тестовому стенду «План Факт» для ${login}. Никому не пересылайте.\n`;
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, text);
    fs.fsyncSync(descriptor);
  } catch (error) {
    fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  fs.closeSync(descriptor);
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return target;
}

// На экран выводится только путь к файлу с кодом, сам код — никогда.
async function issueAccessCodeCommand(rawLogin, { env = process.env, output = stdout } = {}) {
  if (!rawLogin) throw new Error("Укажите логин: issue-access-code <login>");
  const login = accessCodeLogin(rawLogin);
  const directory = accessCodesDirectory(env);
  const config = loadConfig(env);
  assertLocalAccessManagement(config);
  if (config.storageDriver !== "sqlite") {
    throw new Error("Коды доступа работают только с хранилищем SQLite (PLAN_FACT_STORAGE_DRIVER=sqlite)");
  }
  const store = await createStore(config, PlanFactService.initialState);
  try {
    const service = new PlanFactService({ store, config, realtime: new RealtimeHub() });
    // Каталог готовим до выдачи: иначе из-за ошибки прав прежний код уже перестал бы работать, а нового нет.
    ensureAccessCodesDirectory(directory);
    const issued = await service.issueAccessCode(login);
    let file;
    try {
      file = writeAccessCodeFile(directory, issued.login, issued.code);
    } catch (error) {
      throw new Error(
        `Не удалось записать файл с кодом (${error.code || "ошибка записи"}). Прежний код уже недействителен: выполните команду ещё раз`
      );
    }
    output.write(`${file}\n`);
  } finally {
    await store.close();
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "bootstrap-superadmin") return bootstrapSuperadmin();
  if (argv[0] === "provision-staff-access") return provisionStaffAccess();
  if (argv[0] === "issue-access-code") {
    if (argv.length !== 2) throw new Error("Укажите один логин: issue-access-code <login>");
    return issueAccessCodeCommand(argv[1]);
  }
  throw new Error("Команды: bootstrap-superadmin | provision-staff-access | issue-access-code <login>");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  accessCodeLogin,
  accessCodesDirectory,
  bootstrapSuperadmin,
  ensureAccessCodesDirectory,
  issueAccessCodeCommand,
  main,
  provisionStaffAccess,
  staffLoginList,
  staffProvisioningPlan,
  visiblePrompt,
  writeAccessCodeFile
};
