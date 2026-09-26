import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateAction,
  applyScheduleAction,
  validateScheduleStructure
} from "../../functions/api/_lib/validation.js";
import {
  GEMINI_TOOLS,
  formatActionSummary,
  parseGeminiResponse
} from "../../functions/api/_lib/gemini.js";
import { generateCommitMessage } from "../../functions/api/_lib/github.js";

describe("Special / Exceptional Schedules Feature", () => {
  describe("validateAction for propose_special_schedule", () => {
    test("validates single-day special schedule with valid military times", () => {
      const res = validateAction("propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00",
        description: "Veille de Noël"
      });
      assert.equal(res.valid, true);
    });

    test("validates multi-day range special schedule", () => {
      const res = validateAction("propose_special_schedule", {
        start: "2026-05-02",
        end: "2026-05-04",
        on: "10:00",
        off: "18:00",
        description: "Festival de Printemps"
      });
      assert.equal(res.valid, true);
    });

    test("accepts date property as start/end shorthand", () => {
      const res = validateAction("propose_special_schedule", {
        date: "2026-11-11",
        on: "09:00",
        off: "13:00"
      });
      assert.equal(res.valid, true);
    });

    test("validates special schedule with closed hours (00:00 - 00:00)", () => {
      const res = validateAction("propose_special_schedule", {
        start: "2026-10-15",
        end: "2026-10-15",
        on: "00:00",
        off: "00:00",
        description: "Fermeture travaux"
      });
      assert.equal(res.valid, true);
    });

    test("rejects inverted date range", () => {
      const res = validateAction("propose_special_schedule", {
        start: "2026-12-26",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00"
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /antérieure ou égale/i);
    });

    test("rejects non-existent calendar date (leap year)", () => {
      const res = validateAction("propose_special_schedule", {
        start: "2026-02-29",
        end: "2026-02-29",
        on: "08:00",
        off: "12:00"
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /invalide/i);
    });

    test("rejects invalid military times", () => {
      const res1 = validateAction("propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "24:00",
        off: "12:00"
      });
      assert.equal(res1.valid, false);

      const res2 = validateAction("propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:60"
      });
      assert.equal(res2.valid, false);
    });

    test("validates propose_remove_special_schedule", () => {
      const res = validateAction("propose_remove_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24"
      });
      assert.equal(res.valid, true);
    });
  });

  describe("applyScheduleAction for special schedules", () => {
    const baseSchedule = {
      monday: { on: "06:50", off: "14:10" },
      tuesday: { on: "06:50", off: "14:10" },
      wednesday: { on: "06:50", off: "14:40" },
      thursday: { on: "06:50", off: "14:10" },
      friday: { on: "06:50", off: "14:10" },
      saturday: { on: "00:00", off: "00:00" },
      sunday: { on: "00:00", off: "00:00" },
      holidays: [],
      whitelist: [],
      special_schedules: []
    };

    test("adds special schedule and keeps base immutable", () => {
      const updated = applyScheduleAction(baseSchedule, "propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00",
        description: "Veille de Noël"
      });

      assert.equal(baseSchedule.special_schedules.length, 0);
      assert.equal(updated.special_schedules.length, 1);
      assert.deepEqual(updated.special_schedules[0], {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00",
        description: "Veille de Noël"
      });
    });

    test("replaces existing schedule for the exact same date range", () => {
      const step1 = applyScheduleAction(baseSchedule, "propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00"
      });
      const step2 = applyScheduleAction(step1, "propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "09:00",
        off: "13:00",
        description: "Mis à jour"
      });

      assert.equal(step2.special_schedules.length, 1);
      assert.equal(step2.special_schedules[0].on, "09:00");
      assert.equal(step2.special_schedules[0].off, "13:00");
    });

    test("sorts special schedules chronologically", () => {
      let current = applyScheduleAction(baseSchedule, "propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00"
      });
      current = applyScheduleAction(current, "propose_special_schedule", {
        start: "2026-10-15",
        end: "2026-10-15",
        on: "10:00",
        off: "16:00"
      });

      assert.equal(current.special_schedules[0].start, "2026-10-15");
      assert.equal(current.special_schedules[1].start, "2026-12-24");
    });

    test("removes special schedule correctly", () => {
      const step1 = applyScheduleAction(baseSchedule, "propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00"
      });
      const step2 = applyScheduleAction(step1, "propose_remove_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24"
      });

      assert.equal(step2.special_schedules.length, 0);
    });
  });

  describe("validateScheduleStructure with special_schedules", () => {
    test("validates schedule containing valid special_schedules", () => {
      const sched = {
        monday: { on: "06:50", off: "14:10" },
        tuesday: { on: "06:50", off: "14:10" },
        wednesday: { on: "06:50", off: "14:40" },
        thursday: { on: "06:50", off: "14:10" },
        friday: { on: "06:50", off: "14:10" },
        saturday: { on: "00:00", off: "00:00" },
        sunday: { on: "00:00", off: "00:00" },
        holidays: [],
        whitelist: [],
        special_schedules: [
          { start: "2026-12-24", end: "2026-12-24", on: "08:00", off: "12:00" }
        ]
      };
      assert.equal(validateScheduleStructure(sched).valid, true);
    });

    test("rejects schedule with invalid time in special_schedules", () => {
      const sched = {
        monday: { on: "06:50", off: "14:10" },
        tuesday: { on: "06:50", off: "14:10" },
        wednesday: { on: "06:50", off: "14:40" },
        thursday: { on: "06:50", off: "14:10" },
        friday: { on: "06:50", off: "14:10" },
        saturday: { on: "00:00", off: "00:00" },
        sunday: { on: "00:00", off: "00:00" },
        holidays: [],
        whitelist: [],
        special_schedules: [
          { start: "2026-12-24", end: "2026-12-24", on: "99:99", off: "12:00" }
        ]
      };
      assert.equal(validateScheduleStructure(sched).valid, false);
    });
  });

  describe("Commit Messages & Action Summaries", () => {
    test("generateCommitMessage for special schedules", () => {
      const msg1 = generateCommitMessage("propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00",
        description: "Veille de Noël"
      });
      assert.equal(msg1, "Mise à jour des horaires : horaire exceptionnel le 2026-12-24 (08:00 - 12:00) (Veille de Noël)");

      const msg2 = generateCommitMessage("propose_special_schedule", {
        start: "2026-05-02",
        end: "2026-05-04",
        on: "10:00",
        off: "18:00"
      });
      assert.equal(msg2, "Mise à jour des horaires : horaire exceptionnel du 2026-05-02 au 2026-05-04 (10:00 - 18:00)");

      const msgRemove = generateCommitMessage("propose_remove_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24"
      });
      assert.equal(msgRemove, "Mise à jour des horaires : suppression horaire exceptionnel le 2026-12-24");
    });

    test("formatActionSummary for special schedules", () => {
      const summarySingle = formatActionSummary("propose_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24",
        on: "08:00",
        off: "12:00",
        description: "Veille de Noël"
      });
      assert.equal(summarySingle, "Horaire exceptionnel le 24/12/2026 : 08:00 - 12:00 (Veille de Noël)");

      const summaryRange = formatActionSummary("propose_special_schedule", {
        start: "2026-05-02",
        end: "2026-05-04",
        on: "10:00",
        off: "18:00"
      });
      assert.equal(summaryRange, "Horaires exceptionnels du 02/05/2026 au 04/05/2026 : 10:00 - 18:00");

      const summaryRemove = formatActionSummary("propose_remove_special_schedule", {
        start: "2026-12-24",
        end: "2026-12-24"
      });
      assert.equal(summaryRemove, "Suppression de l'horaire exceptionnel le 24/12/2026");
    });

    test("parseGeminiResponse provides default French reply for special schedules", () => {
      const res = parseGeminiResponse({
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: "propose_special_schedule",
                args: { start: "2026-12-24", end: "2026-12-24", on: "08:00", off: "12:00" }
              }
            }]
          }
        }]
      });
      assert.ok(res.reply.includes("horaire exceptionnel"));
      assert.equal(res.proposedAction.name, "propose_special_schedule");
    });
  });

  describe("GEMINI_TOOLS definitions", () => {
    test("declares propose_special_schedule and propose_remove_special_schedule", () => {
      const decls = GEMINI_TOOLS[0].functionDeclarations;
      const special = decls.find(d => d.name === "propose_special_schedule");
      assert.ok(special);
      assert.deepEqual(special.parameters.required, ["start", "end", "on", "off"]);

      const remove = decls.find(d => d.name === "propose_remove_special_schedule");
      assert.ok(remove);
      assert.deepEqual(remove.parameters.required, ["start", "end"]);
    });
  });
});
