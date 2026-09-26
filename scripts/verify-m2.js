#!/usr/bin/env node
/**
 * scripts/verify-m2.js
 * Milestone 2 Comprehensive Verification Runner
 * Validates syntax, date/time boundaries, UTF-8 Base64, Gemini tools/parser,
 * schedule mutations, and endpoint handlers with mock fetch.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

import {
  isValidDate,
  isValidTime,
  VALID_DAYS,
  validateAction,
  applyScheduleAction,
  validateScheduleStructure
} from "../functions/api/_lib/validation.js";

import {
  base64ToUtf8,
  utf8ToBase64,
  getGitHubHeaders,
  generateCommitMessage,
  fetchScheduleFromGitHub,
  commitScheduleToGitHub
} from "../functions/api/_lib/github.js";

import {
  getBrusselsDateTime,
  formatDateFr,
  formatDateEuro,
  parseDateEuro,
  translateDayFr,
  FRENCH_DAYS,
  BE_WEEKDAYS_MAP
} from "../functions/api/_lib/brussels.js";

import {
  GEMINI_TOOLS,
  buildSystemInstruction,
  formatGeminiContents,
  parseGeminiResponse,
  formatActionSummary,
  queryGemini
} from "../functions/api/_lib/gemini.js";

import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  optionsResponse
} from "../functions/api/_lib/http.js";

import { onRequestGet as statusGet, onRequestOptions as statusOptions } from "../functions/api/status.js";
import { onRequestPost as chatPost, onRequestOptions as chatOptions } from "../functions/api/chat.js";
import { onRequestPost as confirmPost, onRequestOptions as confirmOptions } from "../functions/api/confirm.js";

const rootDir = process.cwd();
console.log("=================================================");
console.log("🚆 RUNNING MILESTONE 2 COMPREHENSIVE VERIFICATION");
console.log("=================================================");

let failed = false;
let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failed = true;
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failed = true;
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// 1. Syntax Validation across functions/api/**/*.js and scripts/*.js
// ---------------------------------------------------------------------------
console.log("\n[1/6] Syntax Validation via `node --check`...");
function findJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(findJsFiles(full));
    } else if (file.endsWith(".js")) {
      results.push(full);
    }
  }
  return results;
}

const jsFiles = [
  ...findJsFiles(path.join(rootDir, "functions/api")),
  ...findJsFiles(path.join(rootDir, "scripts"))
];

for (const file of jsFiles) {
  runTest(`Syntax check: ${path.relative(rootDir, file)}`, () => {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
  });
}

// ---------------------------------------------------------------------------
// 2. Date & Time Validation Tests
// ---------------------------------------------------------------------------
console.log("\n[2/6] Date & Time Boundary Validation (isValidDate, isValidTime)...");

runTest("isValidDate accepts valid leap year date (2024-02-29)", () => {
  assert.equal(isValidDate("2024-02-29"), true);
});

runTest("isValidDate rejects non-leap year February 29 (2026-02-29)", () => {
  assert.equal(isValidDate("2026-02-29"), false);
});

runTest("isValidDate accepts non-leap year February last day (2026-02-28)", () => {
  assert.equal(isValidDate("2026-02-28"), true);
});

runTest("isValidDate accepts century leap year (2000-02-29)", () => {
  assert.equal(isValidDate("2000-02-29"), true);
});

runTest("isValidDate rejects century non-leap year (1900-02-29)", () => {
  assert.equal(isValidDate("1900-02-29"), false);
});

runTest("isValidDate rejects 30-day month overflow (2026-04-31)", () => {
  assert.equal(isValidDate("2026-04-31"), false);
});

runTest("isValidDate accepts 30-day month valid last day (2026-04-30)", () => {
  assert.equal(isValidDate("2026-04-30"), true);
});

runTest("isValidDate rejects June, September, November 31", () => {
  assert.equal(isValidDate("2026-06-31"), false);
  assert.equal(isValidDate("2026-09-31"), false);
  assert.equal(isValidDate("2026-11-31"), false);
});

runTest("isValidDate accepts 31-day months (January, May, December 31)", () => {
  assert.equal(isValidDate("2026-01-31"), true);
  assert.equal(isValidDate("2026-05-31"), true);
  assert.equal(isValidDate("2026-12-31"), true);
});

runTest("isValidDate rejects month zero, month 13, day zero, day 32", () => {
  assert.equal(isValidDate("2026-00-15"), false);
  assert.equal(isValidDate("2026-13-01"), false);
  assert.equal(isValidDate("2026-05-00"), false);
  assert.equal(isValidDate("2026-05-32"), false);
});

runTest("isValidDate rejects non-ISO strings, null, undefined, numbers", () => {
  assert.equal(isValidDate("14/05/2026"), false);
  assert.equal(isValidDate("2026-5-14"), false);
  assert.equal(isValidDate(""), false);
  assert.equal(isValidDate(null), false);
  assert.equal(isValidDate(undefined), false);
  assert.equal(isValidDate(20260514), false);
});

runTest("isValidTime accepts standard morning opening (06:50)", () => {
  assert.equal(isValidTime("06:50"), true);
});

runTest("isValidTime accepts midnight closed indicator (00:00)", () => {
  assert.equal(isValidTime("00:00"), true);
});

runTest("isValidTime accepts standard closing (14:10, 14:40)", () => {
  assert.equal(isValidTime("14:10"), true);
  assert.equal(isValidTime("14:40"), true);
});

runTest("isValidTime accepts end of day (23:59)", () => {
  assert.equal(isValidTime("23:59"), true);
});

runTest("isValidTime rejects midnight overflow (24:00, 24:01, 25:00)", () => {
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("24:01"), false);
  assert.equal(isValidTime("25:00"), false);
});

runTest("isValidTime rejects minute overflow (12:60, 06:61)", () => {
  assert.equal(isValidTime("12:60"), false);
  assert.equal(isValidTime("06:61"), false);
});

runTest("isValidTime rejects unpadded hour or minute (7:00, 07:5)", () => {
  assert.equal(isValidTime("7:00"), false);
  assert.equal(isValidTime("07:5"), false);
});

runTest("isValidTime rejects seconds (06:50:00) and garbage strings", () => {
  assert.equal(isValidTime("06:50:00"), false);
  assert.equal(isValidTime("ab:cd"), false);
  assert.equal(isValidTime(""), false);
  assert.equal(isValidTime(null), false);
});

// ---------------------------------------------------------------------------
// 3. Action Validation & Schedule Mutation Engine Tests
// ---------------------------------------------------------------------------
console.log("\n[3/6] Action Validation & Schedule Mutation Engine...");

runTest("validateAction validates propose_holiday with valid multi-day range", () => {
  const res = validateAction("propose_holiday", {
    start: "2026-05-14",
    end: "2026-05-17",
    description: "Pont de l'Ascension"
  });
  assert.equal(res.valid, true);
});

runTest("validateAction validates propose_holiday for single day (start === end)", () => {
  const res = validateAction("propose_holiday", {
    start: "2026-05-01",
    end: "2026-05-01"
  });
  assert.equal(res.valid, true);
});

runTest("validateAction rejects propose_holiday with inverted range (start > end)", () => {
  const res = validateAction("propose_holiday", {
    start: "2026-05-20",
    end: "2026-05-15"
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /antérieure ou égale/i);
});

runTest("validateAction rejects propose_holiday with invalid date (2026-02-29)", () => {
  const res = validateAction("propose_holiday", {
    start: "2026-02-29",
    end: "2026-03-01"
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /invalide/i);
});

runTest("validateAction validates propose_remove_holiday with valid range", () => {
  const res = validateAction("propose_remove_holiday", {
    start: "2026-05-14",
    end: "2026-05-17"
  });
  assert.equal(res.valid, true);
});

runTest("validateAction validates propose_whitelist with valid date", () => {
  const res = validateAction("propose_whitelist", {
    date: "2026-07-21",
    reason: "Fête nationale"
  });
  assert.equal(res.valid, true);
});

runTest("validateAction rejects propose_whitelist with invalid date (2026-04-31)", () => {
  const res = validateAction("propose_whitelist", { date: "2026-04-31" });
  assert.equal(res.valid, false);
  assert.match(res.error, /invalide/i);
});

runTest("validateAction validates propose_schedule_change for all valid days", () => {
  for (const day of VALID_DAYS) {
    const res = validateAction("propose_schedule_change", {
      day,
      on: "06:50",
      off: "14:10"
    });
    assert.equal(res.valid, true, `Failed for ${day}`);
  }
});

runTest("validateAction validates propose_schedule_change for closed day (00:00 - 00:00)", () => {
  const res = validateAction("propose_schedule_change", {
    day: "sunday",
    on: "00:00",
    off: "00:00"
  });
  assert.equal(res.valid, true);
});

runTest("validateAction rejects propose_schedule_change with French day or invalid day", () => {
  const res = validateAction("propose_schedule_change", {
    day: "lundi",
    on: "06:50",
    off: "14:10"
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /Jour invalide/i);
});

runTest("validateAction rejects propose_schedule_change with invalid time", () => {
  const res = validateAction("propose_schedule_change", {
    day: "monday",
    on: "24:00",
    off: "14:10"
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /invalide/i);
});

runTest("validateAction validates and rejects propose_special_schedule correctly", () => {
  const valid = validateAction("propose_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24",
    on: "08:00",
    off: "12:00",
    description: "Veille de Noël"
  });
  assert.equal(valid.valid, true);

  const inverted = validateAction("propose_special_schedule", {
    start: "2026-12-25",
    end: "2026-12-24",
    on: "08:00",
    off: "12:00"
  });
  assert.equal(inverted.valid, false);
  assert.match(inverted.error, /antérieure ou égale/i);

  const badTime = validateAction("propose_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24",
    on: "25:00",
    off: "12:00"
  });
  assert.equal(badTime.valid, false);

  const removeValid = validateAction("propose_remove_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24"
  });
  assert.equal(removeValid.valid, true);
});

runTest("applyScheduleAction maintains immutability and mutates correctly", () => {
  const base = {
    monday: { on: "06:50", off: "14:10" },
    tuesday: { on: "06:50", off: "14:10" },
    wednesday: { on: "06:50", off: "14:40" },
    thursday: { on: "06:50", off: "14:10" },
    friday: { on: "06:50", off: "14:10" },
    saturday: { on: "00:00", off: "00:00" },
    sunday: { on: "00:00", off: "00:00" },
    holidays: [{ start: "2026-01-01", end: "2026-01-02", description: "Nouvel An" }],
    whitelist: ["2026-07-21"]
  };

  // Add holiday
  const step1 = applyScheduleAction(base, "propose_holiday", {
    start: "2026-05-14",
    end: "2026-05-17",
    description: "Pont de l'Ascension"
  });
  assert.equal(base.holidays.length, 1, "Base schedule must remain immutable");
  assert.equal(step1.holidays.length, 2);
  assert.deepEqual(step1.holidays[1], {
    start: "2026-05-14",
    end: "2026-05-17",
    description: "Pont de l'Ascension"
  });

  // Duplicate holiday ignored
  const step2 = applyScheduleAction(step1, "propose_holiday", {
    start: "2026-05-14",
    end: "2026-05-17"
  });
  assert.equal(step2.holidays.length, 2, "Duplicate holiday must be ignored");

  // Remove holiday
  const step3 = applyScheduleAction(step2, "propose_remove_holiday", {
    start: "2026-01-01",
    end: "2026-01-02"
  });
  assert.equal(step3.holidays.length, 1);
  assert.equal(step3.holidays[0].start, "2026-05-14");

  // Add whitelist
  const step4 = applyScheduleAction(step3, "propose_whitelist", {
    date: "2026-11-11",
    reason: "Armistice"
  });
  assert.equal(step4.whitelist.length, 2);
  assert.ok(step4.whitelist.includes("2026-11-11"));

  // Duplicate whitelist ignored
  const step5 = applyScheduleAction(step4, "propose_whitelist", { date: "2026-07-21" });
  assert.equal(step5.whitelist.length, 2);

  // Update schedule
  const step6 = applyScheduleAction(step5, "propose_schedule_change", {
    day: "wednesday",
    on: "07:00",
    off: "15:00"
  });
  assert.deepEqual(step6.wednesday, { on: "07:00", off: "15:00" });
  assert.deepEqual(base.wednesday, { on: "06:50", off: "14:40" }, "Base must not be mutated");

  // Add special schedule
  const step6b = applyScheduleAction(step6, "propose_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24",
    on: "08:00",
    off: "12:00",
    description: "Veille de Noël"
  });
  assert.equal(step6b.special_schedules.length, 1);
  assert.deepEqual(step6b.special_schedules[0], {
    start: "2026-12-24",
    end: "2026-12-24",
    on: "08:00",
    off: "12:00",
    description: "Veille de Noël"
  });

  // Remove special schedule
  const step6c = applyScheduleAction(step6b, "propose_remove_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24"
  });
  assert.equal(step6c.special_schedules.length, 0);

  // Missing arrays initialized safely
  const step7 = applyScheduleAction({}, "propose_whitelist", { date: "2026-07-21" });
  assert.deepEqual(step7.whitelist, ["2026-07-21"]);
  assert.ok(Array.isArray(step7.holidays));
  assert.ok(Array.isArray(step7.special_schedules));
});

runTest("validateScheduleStructure verifies full schema", () => {
  const validSched = {
    monday: { on: "06:50", off: "14:10" },
    tuesday: { on: "06:50", off: "14:10" },
    wednesday: { on: "06:50", off: "14:40" },
    thursday: { on: "06:50", off: "14:10" },
    friday: { on: "06:50", off: "14:10" },
    saturday: { on: "00:00", off: "00:00" },
    sunday: { on: "00:00", off: "00:00" },
    holidays: [{ start: "2026-05-14", end: "2026-05-17" }],
    whitelist: ["2026-07-21"]
  };
  assert.equal(validateScheduleStructure(validSched).valid, true);

  const missingDay = { ...validSched };
  delete missingDay.monday;
  assert.equal(validateScheduleStructure(missingDay).valid, false);
});

// ---------------------------------------------------------------------------
// 4. UTF-8 Base64 & GitHub Helpers Tests
// ---------------------------------------------------------------------------
console.log("\n[4/6] UTF-8 Base64 Round-Trip & GitHub Helpers...");

runTest("UTF-8 Base64 round-trip handles ASCII, French diacritics, and Emojis", () => {
  const tests = [
    "Hello World!",
    "Fête de l'Ascension : fermeture du jeudi au dimanche inclus. À bientôt !",
    "é è ê ë à â î ï ô ù û ü ç œ æ É È Ê À Ç",
    "🚂 Train Station Genval ☕ 📡 🚀 🧐"
  ];
  for (const str of tests) {
    const b64 = utf8ToBase64(str);
    const decoded = base64ToUtf8(b64);
    assert.equal(decoded, str, `Roundtrip mismatch for: ${str}`);
  }
});

runTest("base64ToUtf8 strips embedded linebreaks and whitespace from GitHub API", () => {
  const original = "Planning de la gare de Genval 🚂";
  const rawB64 = utf8ToBase64(original);
  const formattedB64 = `${rawB64.slice(0, 8)}\n\r\n   ${rawB64.slice(8)} \n`;
  const decoded = base64ToUtf8(formattedB64);
  assert.equal(decoded, original);
});

runTest("getGitHubHeaders sets all required API headers", () => {
  const headers = getGitHubHeaders("ghp_secret_token");
  assert.equal(headers["Authorization"], "Bearer ghp_secret_token");
  assert.equal(headers["Accept"], "application/vnd.github+json");
  assert.equal(headers["User-Agent"], "TrainStation-ChatOps/0.1.0");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
});

runTest("generateCommitMessage produces informative French messages", () => {
  const m1 = generateCommitMessage("propose_holiday", {
    start: "2026-05-14",
    end: "2026-05-17",
    description: "Pont de l'Ascension"
  });
  assert.equal(m1, "Mise à jour des horaires : fermeture du 2026-05-14 au 2026-05-17 (Pont de l'Ascension)");

  const m1Single = generateCommitMessage("propose_holiday", {
    start: "2026-05-01",
    end: "2026-05-01"
  });
  assert.equal(m1Single, "Mise à jour des horaires : fermeture le 2026-05-01");

  const m2 = generateCommitMessage("propose_remove_holiday", {
    start: "2026-05-14",
    end: "2026-05-17"
  });
  assert.equal(m2, "Mise à jour des horaires : réouverture / suppression fermeture du 2026-05-14 au 2026-05-17");

  const m3 = generateCommitMessage("propose_whitelist", {
    date: "2026-07-21",
    reason: "Fête nationale"
  });
  assert.equal(m3, "Mise à jour des horaires : ouverture exceptionnelle le 2026-07-21 (Fête nationale)");

  const m4 = generateCommitMessage("propose_schedule_change", {
    day: "monday",
    on: "06:50",
    off: "14:10"
  });
  assert.equal(m4, "Mise à jour des horaires : monday (06:50 - 14:10)");

  const mSpecial = generateCommitMessage("propose_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24",
    on: "08:00",
    off: "12:00",
    description: "Veille de Noël"
  });
  assert.equal(mSpecial, "Mise à jour des horaires : horaire exceptionnel le 2026-12-24 (08:00 - 12:00) (Veille de Noël)");

  const mRemoveSpecial = generateCommitMessage("propose_remove_special_schedule", {
    start: "2026-12-24",
    end: "2026-12-24"
  });
  assert.equal(mRemoveSpecial, "Mise à jour des horaires : suppression horaire exceptionnel le 2026-12-24");

  const mAuthor = generateCommitMessage("propose_whitelist", { date: "2026-07-21" }, "user@example.com");
  assert.ok(mAuthor.includes("Demandé par : user@example.com"));
});

// ---------------------------------------------------------------------------
// 5. Brussels Intl & Gemini Tools / Parser Tests
// ---------------------------------------------------------------------------
console.log("\n[5/6] Brussels Clock & Gemini Tools / Parser...");

runTest("getBrusselsDateTime outputs expected properties and formats", () => {
  const info = getBrusselsDateTime();
  assert.match(info.isoDate, /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  assert.match(info.time, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.ok(info.weekday);
  assert.ok(info.fullFormatted);
});

runTest("getBrusselsDateTime correctly applies daylight saving time (CEST vs CET)", () => {
  // Summer time CEST (UTC+2)
  const summerUtc = new Date("2026-09-25T10:00:00Z");
  const summerInfo = getBrusselsDateTime(summerUtc);
  assert.equal(summerInfo.isoDate, "2026-09-25");
  assert.equal(summerInfo.time, "12:00");
  assert.equal(summerInfo.weekday.toLowerCase(), "vendredi");

  // Winter time CET (UTC+1)
  const winterUtc = new Date("2026-01-15T10:00:00Z");
  const winterInfo = getBrusselsDateTime(winterUtc);
  assert.equal(winterInfo.isoDate, "2026-01-15");
  assert.equal(winterInfo.time, "11:00");
  assert.equal(winterInfo.weekday.toLowerCase(), "jeudi");

  // Midnight rollover
  const rolloverUtc = new Date("2026-05-14T23:30:00Z");
  const rolloverInfo = getBrusselsDateTime(rolloverUtc);
  assert.equal(rolloverInfo.isoDate, "2026-05-15");
  assert.equal(rolloverInfo.time, "01:30");
});

runTest("formatDateFr and parseDateEuro format correctly", () => {
  assert.equal(formatDateFr("2026-05-14"), "14/05/2026");
  assert.equal(parseDateEuro("14/05/2026"), "2026-05-14");
});

runTest("GEMINI_TOOLS declares exactly 6 functions with required properties", () => {
  assert.equal(GEMINI_TOOLS.length, 1);
  const decls = GEMINI_TOOLS[0].functionDeclarations;
  assert.equal(decls.length, 6);

  const names = decls.map(d => d.name).sort();
  assert.deepEqual(names, [
    "propose_holiday",
    "propose_remove_holiday",
    "propose_schedule_change",
    "propose_whitelist",
    "propose_special_schedule",
    "propose_remove_special_schedule"
  ].sort());

  const holiday = decls.find(d => d.name === "propose_holiday");
  assert.deepEqual(holiday.parameters.required, ["start", "end"]);

  const change = decls.find(d => d.name === "propose_schedule_change");
  assert.deepEqual(change.parameters.required, ["day", "on", "off"]);
  assert.equal(change.parameters.properties.day.enum.length, 7);

  const special = decls.find(d => d.name === "propose_special_schedule");
  assert.deepEqual(special.parameters.required, ["start", "end", "on", "off"]);

  const removeSpecial = decls.find(d => d.name === "propose_remove_special_schedule");
  assert.deepEqual(removeSpecial.parameters.required, ["start", "end"]);
});

runTest("buildSystemInstruction includes Brussels context and current schedule", () => {
  const brusselsInfo = { fullFormatted: "vendredi 25/09/2026 à 12:48", isoDate: "2026-09-25" };
  const schedule = { monday: { on: "06:50", off: "14:10" } };
  const instruction = buildSystemInstruction(brusselsInfo, schedule);
  const text = instruction.parts[0].text;
  assert.ok(text.includes("vendredi 25/09/2026 à 12:48"));
  assert.ok(text.includes('"06:50"'));
  assert.ok(text.includes("Genval"));
});

runTest("formatGeminiContents normalizes history and current message", () => {
  const contents = formatGeminiContents("Ferme demain", [
    { role: "user", text: "Bonjour" },
    { role: "assistant", text: "Bonjour ! Comment puis-je vous aider ?" }
  ]);
  assert.equal(contents.length, 3);
  assert.equal(contents[0].role, "user");
  assert.equal(contents[0].parts[0].text, "Bonjour");
  assert.equal(contents[1].role, "model");
  assert.equal(contents[2].role, "user");
  assert.equal(contents[2].parts[0].text, "Ferme demain");
});

runTest("parseGeminiResponse parses text-only and functionCall responses", () => {
  // Text only
  const r1 = parseGeminiResponse({
    candidates: [{ content: { parts: [{ text: "Bonjour ! Comment puis-je vous aider ?" }] } }]
  });
  assert.equal(r1.reply, "Bonjour ! Comment puis-je vous aider ?");
  assert.equal(r1.proposedAction, null);

  // Function call with text
  const r2 = parseGeminiResponse({
    candidates: [{
      content: {
        parts: [
          { text: "Je vous propose de fermer la gare." },
          { functionCall: { name: "propose_holiday", args: { start: "2026-05-14", end: "2026-05-17", description: "Ascension" } } }
        ]
      }
    }]
  });
  assert.equal(r2.reply, "Je vous propose de fermer la gare.");
  assert.ok(r2.proposedAction);
  assert.equal(r2.proposedAction.name, "propose_holiday");
  assert.equal(r2.proposedAction.args.start, "2026-05-14");
  assert.match(r2.proposedAction.summary, /Fermeture du 14\/05\/2026 au 17\/05\/2026/);

  // Function call without text uses friendly French fallback
  const r3 = parseGeminiResponse({
    candidates: [{
      content: {
        parts: [
          { functionCall: { name: "propose_whitelist", args: { date: "2026-07-21", reason: "Fête nationale" } } }
        ]
      }
    }]
  });
  assert.ok(r3.reply.length > 0);
  assert.equal(r3.proposedAction.name, "propose_whitelist");
  assert.match(r3.proposedAction.summary, /Ouverture exceptionnelle le 21\/07\/2026/);
});

runTest("formatActionSummary formats summaries for all 6 tools", () => {
  assert.match(
    formatActionSummary("propose_holiday", { start: "2026-05-14", end: "2026-05-17", description: "Ascension" }),
    /Fermeture du 14\/05\/2026 au 17\/05\/2026/
  );
  assert.match(
    formatActionSummary("propose_whitelist", { date: "2026-07-21" }),
    /Ouverture exceptionnelle le 21\/07\/2026/
  );
  assert.match(
    formatActionSummary("propose_schedule_change", { day: "monday", on: "06:50", off: "14:10" }),
    /monday : 06:50 - 14:10/
  );
  assert.match(
    formatActionSummary("propose_remove_holiday", { start: "2026-05-14", end: "2026-05-17" }),
    /Suppression de la fermeture du 14\/05\/2026 au 17\/05\/2026/
  );
  assert.match(
    formatActionSummary("propose_special_schedule", { start: "2026-12-24", end: "2026-12-24", on: "08:00", off: "12:00", description: "Veille de Noël" }),
    /Horaire exceptionnel le 24\/12\/2026 : 08:00 - 12:00 \(Veille de Noël\)/
  );
  assert.match(
    formatActionSummary("propose_remove_special_schedule", { start: "2026-12-24", end: "2026-12-24" }),
    /Suppression de l'horaire exceptionnel le 24\/12\/2026/
  );
});

// ---------------------------------------------------------------------------
// 6. Endpoint Mock Integration Tests (status.js, chat.js, confirm.js)
// ---------------------------------------------------------------------------
console.log("\n[6/6] Endpoint Mock Integration Tests...");

const mockEnv = {
  GITHUB_TOKEN: "mock-gh-token",
  GITHUB_OWNER: "LoupiBe",
  GITHUB_REPO: "train-station-timetable",
  GITHUB_BRANCH: "main",
  GEMINI_API_KEY: "mock-gemini-key",
  GEMINI_MODEL: "gemini-2.0-flash"
};

const sampleSchedule = {
  monday: { on: "06:50", off: "14:10" },
  tuesday: { on: "06:50", off: "14:10" },
  wednesday: { on: "06:50", off: "14:40" },
  thursday: { on: "06:50", off: "14:10" },
  friday: { on: "06:50", off: "14:10" },
  saturday: { on: "00:00", off: "00:00" },
  sunday: { on: "00:00", off: "00:00" },
  holidays: [{ start: "2026-01-01", end: "2026-01-02" }],
  whitelist: []
};

const originalFetch = globalThis.fetch;

await runAsyncTest("Endpoint /api/status: OPTIONS preflight returns 204 with CORS", async () => {
  const res = await statusOptions();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.ok(res.headers.get("Access-Control-Allow-Methods").includes("GET"));
});

await runAsyncTest("Endpoint /api/status: GET returns 200 with schedule, sha, and brusselsTime", async () => {
  globalThis.fetch = async (url) => {
    assert.ok(url.includes("contents/schedule.json"));
    return new Response(JSON.stringify({
      content: utf8ToBase64(JSON.stringify(sampleSchedule)),
      sha: "blob-sha-xyz"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const req = new Request("https://localhost/api/status", { method: "GET" });
    const res = await statusGet({ request: req, env: mockEnv });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.sha, "blob-sha-xyz");
    assert.deepEqual(data.schedule, sampleSchedule);
    assert.ok(data.brusselsTime.isoDate);
    assert.ok(data.brusselsTime.time);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/status: GET returns 404 when file not found", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
  try {
    const req = new Request("https://localhost/api/status", { method: "GET" });
    const res = await statusGet({ request: req, env: mockEnv });
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.ok(data.error);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/status: GET returns 502 with empathetic message on GitHub error", async () => {
  globalThis.fetch = async () => new Response("GitHub server error", { status: 500 });
  try {
    const req = new Request("https://localhost/api/status", { method: "GET" });
    const res = await statusGet({ request: req, env: mockEnv });
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.match(data.error, /salle des machines 🚂/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/chat: OPTIONS returns 204 with CORS", async () => {
  const res = await chatOptions();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
});

await runAsyncTest("Endpoint /api/chat: POST returns 200 with extracted proposedAction and reply", async () => {
  globalThis.fetch = async (url) => {
    if (url.includes("api.github.com")) {
      return new Response(JSON.stringify({
        content: utf8ToBase64(JSON.stringify(sampleSchedule)),
        sha: "blob-sha-123"
      }), { status: 200 });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [
              { text: "Je vous propose de fermer la gare." },
              { functionCall: { name: "propose_holiday", args: { start: "2026-05-14", end: "2026-05-17", description: "Pont de l'Ascension" } } }
            ]
          }
        }]
      }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const req = new Request("https://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Ferme la gare du 14 au 17 mai" })
    });
    const res = await chatPost({ request: req, env: mockEnv });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reply, "Je vous propose de fermer la gare.");
    assert.equal(data.currentSha, "blob-sha-123");
    assert.equal(data.proposedAction.name, "propose_holiday");
    assert.equal(data.proposedAction.args.start, "2026-05-14");
    assert.equal(data.proposedAction.args.end, "2026-05-17");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/chat: POST returns 400 when message is missing", async () => {
  const req = new Request("https://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const res = await chatPost({ request: req, env: mockEnv });
  assert.equal(res.status, 400);
});

await runAsyncTest("Endpoint /api/chat: POST returns 502 with empathetic message on Gemini error", async () => {
  globalThis.fetch = async (url) => {
    if (url.includes("api.github.com")) {
      return new Response(JSON.stringify({
        content: utf8ToBase64(JSON.stringify(sampleSchedule)),
        sha: "blob-sha-123"
      }), { status: 200 });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response("Gemini overloaded", { status: 503 });
    }
    throw new Error(`Unexpected: ${url}`);
  };

  try {
    const req = new Request("https://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Bonjour" })
    });
    const res = await chatPost({ request: req, env: mockEnv });
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.match(data.error, /Le bot prend un petit café ☕/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/confirm: OPTIONS returns 204 with CORS", async () => {
  const res = await confirmOptions();
  assert.equal(res.status, 204);
});

await runAsyncTest("Endpoint /api/confirm: rejects invalid date (2026-02-29) before calling GitHub", async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  try {
    const req = new Request("https://localhost/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "propose_holiday",
        payload: { start: "2026-02-29", end: "2026-02-29" },
        sha: "sha-123"
      })
    });
    const res = await confirmPost({ request: req, env: mockEnv });
    assert.equal(res.status, 400);
    assert.equal(fetchCalled, false, "GitHub fetch must not be called on validation error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/confirm: commits valid schedule update and returns commit details", async () => {
  let putBody = null;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "PUT") {
      putBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        commit: { sha: "commit-sha-777", message: putBody.message },
        content: { sha: "new-file-sha-888" }
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      content: utf8ToBase64(JSON.stringify(sampleSchedule)),
      sha: "sha-123"
    }), { status: 200 });
  };

  try {
    const req = new Request("https://localhost/api/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "cf-access-authenticated-user-email": "stationmaster@genval.be"
      },
      body: JSON.stringify({
        action: "propose_holiday",
        payload: { start: "2026-05-14", end: "2026-05-17", description: "Pont de l'Ascension" },
        sha: "sha-123"
      })
    });
    const res = await confirmPost({ request: req, env: mockEnv });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.commit.sha, "commit-sha-777");
    assert.equal(data.newFileSha, "new-file-sha-888");
    assert.ok(putBody);
    assert.equal(putBody.sha, "sha-123");
    assert.match(putBody.message, /Pont de l'Ascension/);
    assert.match(putBody.message, /stationmaster@genval\.be/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/confirm: handles SHA mismatch (409 conflict) with empathetic French error", async () => {
  globalThis.fetch = async () => {
    // Current SHA on GitHub is different from client's sha
    return new Response(JSON.stringify({
      content: utf8ToBase64(JSON.stringify(sampleSchedule)),
      sha: "sha-modified-by-another-user"
    }), { status: 200 });
  };

  try {
    const req = new Request("https://localhost/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "propose_holiday",
        payload: { start: "2026-05-14", end: "2026-05-17" },
        sha: "sha-stale"
      })
    });
    const res = await confirmPost({ request: req, env: mockEnv });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.conflict, true);
    assert.match(data.error, /salle des machines 🚂/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await runAsyncTest("Endpoint /api/confirm: handles GitHub HTTP 409 PUT response with empathetic French error", async () => {
  globalThis.fetch = async (url, options) => {
    if (options?.method === "PUT") {
      return new Response(JSON.stringify({ message: "Resource was modified" }), { status: 409 });
    }
    return new Response(JSON.stringify({
      content: utf8ToBase64(JSON.stringify(sampleSchedule)),
      sha: "sha-123"
    }), { status: 200 });
  };

  try {
    const req = new Request("https://localhost/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "propose_holiday",
        payload: { start: "2026-05-14", end: "2026-05-17" },
        sha: "sha-123"
      })
    });
    const res = await confirmPost({ request: req, env: mockEnv });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.conflict, true);
    assert.match(data.error, /salle des machines 🚂/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Final Summary Scorecard
// ---------------------------------------------------------------------------
console.log("\n=================================================");
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${totalTests - passedTests}`);
if (failed) {
  console.error("❌ MILESTONE 2 VERIFICATION FAILED");
  process.exit(1);
} else {
  console.log("✔ MILESTONE 2 VERIFICATION COMPLETED: 100% PASS");
  console.log("=================================================");
}
