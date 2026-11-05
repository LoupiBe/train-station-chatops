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
import { ScheduleViewController } from "../../public/js/schedule-view.js";

describe("Screensaver Toggle Feature & Integration", () => {
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
    special_schedules: [],
    screensaver_enabled: true
  };

  describe("validateAction for propose_toggle_screensaver", () => {
    test("validates propose_toggle_screensaver with enabled=true", () => {
      const res = validateAction("propose_toggle_screensaver", { enabled: true });
      assert.equal(res.valid, true);
    });

    test("validates propose_toggle_screensaver with enabled=false", () => {
      const res = validateAction("propose_toggle_screensaver", { enabled: false });
      assert.equal(res.valid, true);
    });

    test("rejects propose_toggle_screensaver with non-boolean enabled", () => {
      const res = validateAction("propose_toggle_screensaver", { enabled: "oui" });
      assert.equal(res.valid, false);
      assert.match(res.error, /enabled/);
    });

    test("rejects propose_toggle_screensaver with missing enabled", () => {
      const res = validateAction("propose_toggle_screensaver", {});
      assert.equal(res.valid, false);
      assert.match(res.error, /enabled/);
    });
  });

  describe("applyScheduleAction for propose_toggle_screensaver", () => {
    test("sets screensaver_enabled to false", () => {
      const updated = applyScheduleAction(baseSchedule, "propose_toggle_screensaver", { enabled: false });
      assert.equal(updated.screensaver_enabled, false);
    });

    test("sets screensaver_enabled to true", () => {
      const scheduleWithout = { ...baseSchedule, screensaver_enabled: false };
      const updated = applyScheduleAction(scheduleWithout, "propose_toggle_screensaver", { enabled: true });
      assert.equal(updated.screensaver_enabled, true);
    });
  });

  describe("validateScheduleStructure with screensaver_enabled", () => {
    test("validates schedule containing screensaver_enabled: true", () => {
      const res = validateScheduleStructure(baseSchedule);
      assert.equal(res.valid, true);
    });

    test("validates schedule containing screensaver_enabled: false", () => {
      const res = validateScheduleStructure({ ...baseSchedule, screensaver_enabled: false });
      assert.equal(res.valid, true);
    });

    test("validates schedule when screensaver_enabled is omitted (backward compatibility)", () => {
      const { screensaver_enabled, ...legacySchedule } = baseSchedule;
      const res = validateScheduleStructure(legacySchedule);
      assert.equal(res.valid, true);
    });

    test("rejects schedule when screensaver_enabled is not a boolean", () => {
      const res = validateScheduleStructure({ ...baseSchedule, screensaver_enabled: "yes" });
      assert.equal(res.valid, false);
      assert.match(res.error, /screensaver_enabled doit être un booléen/);
    });
  });

  describe("Gemini Tools, Formatting & Commit Messages", () => {
    test("declares propose_toggle_screensaver in GEMINI_TOOLS", () => {
      const toolDef = GEMINI_TOOLS[0].functionDeclarations.find(
        (f) => f.name === "propose_toggle_screensaver"
      );
      assert.ok(toolDef);
      assert.equal(toolDef.parameters.required[0], "enabled");
    });

    test("formats human-friendly summary for activating screensaver", () => {
      const summary = formatActionSummary("propose_toggle_screensaver", { enabled: true });
      assert.match(summary, /Activation/);
      assert.match(summary, /écran de veille/);
    });

    test("formats human-friendly summary for deactivating screensaver", () => {
      const summary = formatActionSummary("propose_toggle_screensaver", { enabled: false });
      assert.match(summary, /Désactivation/);
      assert.match(summary, /écran de veille/);
    });

    test("generates descriptive git commit message", () => {
      const msgEnable = generateCommitMessage("propose_toggle_screensaver", { enabled: true });
      assert.match(msgEnable, /écran de veille activé/);

      const msgDisable = generateCommitMessage("propose_toggle_screensaver", { enabled: false });
      assert.match(msgDisable, /écran de veille désactivé/);
    });

    test("parseGeminiResponse parses propose_toggle_screensaver correctly", () => {
      const fakeGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "propose_toggle_screensaver",
                    args: { enabled: false }
                  }
                }
              ]
            }
          }
        ]
      };
      const parsed = parseGeminiResponse(fakeGeminiResponse);
      assert.ok(parsed.proposedAction);
      assert.equal(parsed.proposedAction.name, "propose_toggle_screensaver");
      assert.equal(parsed.proposedAction.args.enabled, false);
    });
  });

  describe("ScheduleView Meta Badge Rendering", () => {
    test("updates screensaver badge based on schedule state", () => {
      // Mock basic DOM
      const fakeBadge = {
        textContent: "",
        style: {},
        title: ""
      };
      globalThis.document = {
        getElementById(id) {
          if (id === "schedule-screensaver-badge") return fakeBadge;
          return null;
        }
      };

      const view = new ScheduleViewController();
      view.schedule = { ...baseSchedule, screensaver_enabled: true };
      view.renderMeta(false);

      assert.equal(fakeBadge.textContent, "🏋️ Gym LCD : Actif");
      assert.match(fakeBadge.title, /actif/i);

      view.schedule = { ...baseSchedule, screensaver_enabled: false };
      view.renderMeta(false);

      assert.equal(fakeBadge.textContent, "⏸️ Gym LCD : Inactif");
      assert.match(fakeBadge.title, /désactivé/i);

      delete globalThis.document;
    });
  });
});
