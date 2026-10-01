/**
 * tests/unit/forced-refresh-and-data-sync.test.js
 * Unit & Integration tests for forced application reload, cache purge, and live data refresh
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  isForcedReloadRequest,
  isDataRefreshRequest,
  ChatManager,
} from "../../public/js/chat.js";
import { hardPurgeAndReload } from "../../public/js/sw-register.js";
import {
  GEMINI_TOOLS,
  parseGeminiResponse,
  formatActionSummary,
} from "../../functions/api/_lib/gemini.js";

/**
 * Lightweight mock DOM element for Node.js test environment
 */
class MockElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.children = [];
    this.innerHTML = "";
    this.textContent = "";
    this.style = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector() {
    return null;
  }

  remove() {
    if (this.parentElement && Array.isArray(this.parentElement.children)) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
    }
  }

  getAllHtml() {
    return (
      (this.innerHTML || "") +
      " " +
      this.children.map((c) => (c.getAllHtml ? c.getAllHtml() : c.innerHTML || "")).join(" ")
    );
  }
}

describe("Forced Application Reload & Live Data Refresh", () => {
  describe("isForcedReloadRequest synonym detection", () => {
    test("detects explicit French and English forced reload variations", () => {
      const positivePhrases = [
        "rafraichissement force",
        "rafraîchissement forcé",
        "peux-tu faire un rafraîchissement forcé ?",
        "force le rafraichissement",
        "force le refresh",
        "forcer le rechargement",
        "rechargement force",
        "hard reload",
        "hard refresh",
        "vide le cache et recharge",
        "purger le cache",
        "reinitialise le cache",
        "nettoyer le cache",
        "mode force",
      ];

      for (const phrase of positivePhrases) {
        assert.equal(
          isForcedReloadRequest(phrase),
          true,
          `Failed to match forced reload phrase: "${phrase}"`
        );
      }
    });

    test("rejects standard conversational messages and data refresh requests", () => {
      const negativePhrases = [
        "bonjour comment vas-tu ?",
        "fermer la gare du 14 au 17 mai",
        "rafraîchis les horaires",
        "synchronise le planning",
        "mets à jour l'affichage",
        "quels sont les horaires du lundi ?",
        "",
        null,
        undefined,
      ];

      for (const phrase of negativePhrases) {
        assert.equal(
          isForcedReloadRequest(phrase),
          false,
          `Incorrectly matched normal phrase: "${phrase}"`
        );
      }
    });
  });

  describe("isDataRefreshRequest schedule sync detection", () => {
    test("detects requests to update or sync live schedule data", () => {
      const positivePhrases = [
        "rafraîchis les horaires",
        "rafraichis le planning",
        "synchronise le planning",
        "actualise les données",
        "mets à jour l'affichage",
        "mettre a jour les horaires",
        "sync horaires",
        "vérifier les horaires en direct",
      ];

      for (const phrase of positivePhrases) {
        assert.equal(
          isDataRefreshRequest(phrase),
          true,
          `Failed to match data refresh phrase: "${phrase}"`
        );
      }
    });

    test("prioritizes forced reload over data refresh and ignores normal chat", () => {
      // Forced reload takes precedence
      assert.equal(isDataRefreshRequest("force le rafraîchissement des horaires"), false);
      assert.equal(isDataRefreshRequest("rafraîchissement forcé"), false);

      // Normal chat
      assert.equal(isDataRefreshRequest("bonjour"), false);
      assert.equal(isDataRefreshRequest("fermer demain"), false);
      assert.equal(isDataRefreshRequest(null), false);
    });
  });

  describe("hardPurgeAndReload execution flow", () => {
    let originalCaches;
    let origNavDesc;
    let originalLocalStorage;
    let originalSessionStorage;
    let originalWindow;

    let deletedCaches = [];
    let unregisteredWorkers = 0;
    let removedLocalStorageKeys = [];
    let sessionStorageCleared = false;
    let replacedUrl = null;

    beforeEach(() => {
      deletedCaches = [];
      unregisteredWorkers = 0;
      removedLocalStorageKeys = [];
      sessionStorageCleared = false;
      replacedUrl = null;

      originalCaches = globalThis.caches;
      origNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
      originalLocalStorage = globalThis.localStorage;
      originalSessionStorage = globalThis.sessionStorage;
      originalWindow = globalThis.window;

      globalThis.caches = {
        keys: async () => ["cache-v1", "cache-v2"],
        delete: async (name) => {
          deletedCaches.push(name);
          return true;
        },
      };

      const mockNav = {
        onLine: true,
        serviceWorker: {
          getRegistrations: async () => [
            {
              unregister: async () => {
                unregisteredWorkers++;
                return true;
              },
            },
          ],
        },
      };

      Object.defineProperty(globalThis, "navigator", {
        value: mockNav,
        configurable: true,
        writable: true,
      });

      globalThis.localStorage = {
        removeItem: (key) => {
          removedLocalStorageKeys.push(key);
        },
      };

      globalThis.sessionStorage = {
        clear: () => {
          sessionStorageCleared = true;
        },
      };

      globalThis.window = {
        location: {
          href: "https://kiosk.example.com/app",
          replace: (url) => {
            replacedUrl = url;
          },
        },
      };
    });

    afterEach(() => {
      globalThis.caches = originalCaches;
      if (origNavDesc) {
        Object.defineProperty(globalThis, "navigator", origNavDesc);
      }
      globalThis.localStorage = originalLocalStorage;
      globalThis.sessionStorage = originalSessionStorage;
      globalThis.window = originalWindow;
    });

    test("purges caches, service workers, storage, and reloads with anti-cache param", async () => {
      await hardPurgeAndReload();

      assert.deepEqual(deletedCaches, ["cache-v1", "cache-v2"]);
      assert.equal(unregisteredWorkers, 1);
      assert.ok(removedLocalStorageKeys.includes("kiosk_schedule_cache"));
      assert.ok(removedLocalStorageKeys.includes("kiosk_schedule_sha"));
      assert.equal(sessionStorageCleared, true);
      assert.ok(replacedUrl);
      assert.ok(replacedUrl.includes("_t="));
    });
  });

  describe("ChatManager fast-path integration without confirmation cards", () => {
    let mockContainer;
    let mockInput;
    let mockForm;
    let mockSubmit;
    let origDoc;
    let origNavDesc;

    beforeEach(() => {
      origDoc = global.document;
      origNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");

      global.document = {
        createElement: (tag) => new MockElement(tag),
      };

      Object.defineProperty(globalThis, "navigator", {
        value: { onLine: true },
        configurable: true,
        writable: true,
      });

      mockContainer = new MockElement("div");
      mockInput = { value: "" };
      mockForm = { addEventListener: () => {} };
      mockSubmit = { disabled: false };
    });

    afterEach(() => {
      global.document = origDoc;
      if (origNavDesc) {
        Object.defineProperty(globalThis, "navigator", origNavDesc);
      }
    });

    test("executes hard reload directly without confirmation card", async () => {
      let hardReloadCalled = false;
      const chat = new ChatManager({
        messagesContainer: mockContainer,
        chatForm: mockForm,
        chatInput: mockInput,
        chatSubmit: mockSubmit,
        onHardReload: () => {
          hardReloadCalled = true;
        },
      });

      chat.formatBrusselsTime = () => "12:00";
      chat.scrollToBottom = () => {};

      await chat.sendMessage("peux-tu faire un rafraîchissement forcé ?");

      assert.equal(mockContainer.children.length, 2); // user message + bot message

      // Inspect HTML in child elements
      const userBubble = mockContainer.children[0].getAllHtml();
      const botBubble = mockContainer.children[1].getAllHtml();
      assert.ok(userBubble.includes("rafraîchissement forcé"));
      assert.ok(botBubble.includes("rechargement forcé"));
      assert.equal(botBubble.includes("action-confirmation-card"), false);
      assert.equal(botBubble.includes("Confirmer"), false);

      // Await setTimeout callback
      await new Promise((r) => setTimeout(r, 350));
      assert.equal(hardReloadCalled, true);
    });

    test("executes live data refresh directly without confirmation card", async () => {
      let scheduleUpdatedCalled = false;
      const chat = new ChatManager({
        messagesContainer: mockContainer,
        chatForm: mockForm,
        chatInput: mockInput,
        chatSubmit: mockSubmit,
        onScheduleUpdated: async () => {
          scheduleUpdatedCalled = true;
        },
      });

      chat.formatBrusselsTime = () => "12:00";
      chat.scrollToBottom = () => {};

      await chat.sendMessage("rafraîchis les horaires");

      assert.equal(scheduleUpdatedCalled, true);
      assert.equal(mockContainer.children.length, 2);

      const botBubble = mockContainer.children[1].getAllHtml();
      assert.ok(botBubble.includes("synchronisés et rafraîchis"));
      assert.equal(botBubble.includes("action-confirmation-card"), false);
      assert.equal(botBubble.includes("Confirmer"), false);
    });
  });

  describe("Gemini Tools & Parser for reload and refresh", () => {
    test("declares refresh_schedule_data and hard_reload_app in GEMINI_TOOLS", () => {
      const decls = GEMINI_TOOLS[0].functionDeclarations;
      const refreshTool = decls.find((d) => d.name === "refresh_schedule_data");
      const reloadTool = decls.find((d) => d.name === "hard_reload_app");

      assert.ok(refreshTool, "refresh_schedule_data must be defined in GEMINI_TOOLS");
      assert.ok(reloadTool, "hard_reload_app must be defined in GEMINI_TOOLS");
    });

    test("formats human-friendly French action summaries", () => {
      const refreshSummary = formatActionSummary("refresh_schedule_data", {});
      const reloadSummary = formatActionSummary("hard_reload_app", {});

      assert.equal(refreshSummary, "Rafraîchissement des horaires en direct");
      assert.equal(reloadSummary, "Rafraîchissement forcé et purge du cache de l'application");
    });

    test("parseGeminiResponse assigns empathetic default replies", () => {
      const refreshParsed = parseGeminiResponse({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "refresh_schedule_data", args: {} } }],
            },
          },
        ],
      });
      assert.ok(refreshParsed.reply.includes("synchronisés et rafraîchis"));

      const reloadParsed = parseGeminiResponse({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "hard_reload_app", args: {} } }],
            },
          },
        ],
      });
      assert.ok(reloadParsed.reply.includes("rechargement forcé"));
    });
  });
});
