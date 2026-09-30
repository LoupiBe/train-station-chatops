import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ScheduleViewController,
  STORAGE_KEYS,
  initFreshnessListeners as initFreshnessListenersSchedule,
} from "../../public/js/schedule-view.js";
import {
  initFreshnessListeners as initFreshnessListenersApp,
} from "../../public/js/app.js";
import {
  ChatManager,
  ERROR_MESSAGES,
} from "../../public/js/chat.js";

/**
 * Lightweight mock element for Node.js test environment
 */
class MockElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = "";
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        } else if (force) {
          this.classList._classes.add(c);
        } else {
          this.classList._classes.delete(c);
        }
      },
    };
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.offsetHeight = 46;
    this.children = [];
    this.parentElement = null;
    this._listeners = {};
    this._innerHTML = "";
    this._textContent = "";
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    this._textContent = String(val)
      .replace(/<[^>]*>/g, "")
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>/gis;
    let match;
    while ((match = tagRegex.exec(val)) !== null) {
      const tag = match[1];
      const attrs = match[2];
      const content = match[3];
      const el = new MockElement(tag);

      const idMatch = attrs.match(/id="([^"]+)"/i);
      if (idMatch) el.id = idMatch[1];

      const classMatch = attrs.match(/class="([^"]+)"/i);
      if (classMatch) {
        el.className = classMatch[1];
        classMatch[1].split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
      }

      el.innerHTML = content;
      this.appendChild(el);
    }
  }
  get innerHTML() {
    return this._innerHTML;
  }

  contains(child) {
    if (!child) return false;
    if (child === this) return true;
    for (const c of this.children) {
      if (c === child || (c.contains && c.contains(child))) return true;
    }
    return false;
  }

  set textContent(val) {
    this.children = [];
    this._textContent = String(val);
    this._innerHTML = String(val);
  }
  get textContent() {
    if (this.children && this.children.length > 0) {
      return this.children.map((c) => c.textContent).join(" ");
    }
    return this._textContent;
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((cb) => cb !== fn);
    }
  }

  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    const handlers = this._listeners[type] || [];
    for (const h of handlers) {
      h(event);
    }
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
    }
  }

  setAttribute(k, v) {
    this[k] = v;
  }
  getAttribute(k) {
    return this[k] || null;
  }
  focus() {}

  _matches(selector) {
    const parts = selector.split(",").map((s) => s.trim());
    for (const part of parts) {
      if (part.startsWith("#") && this.id === part.slice(1)) return true;
      if (part.startsWith(".") && this.classList.contains(part.slice(1))) return true;
      if (part.toLowerCase() === this.tagName.toLowerCase()) return true;
    }
    return false;
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (child._matches && child._matches(selector)) return child;
      const found = child.querySelector ? child.querySelector(selector) : null;
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (child._matches && child._matches(selector)) results.push(child);
        if (child.children) walk(child);
      }
    };
    walk(this);
    return results;
  }
}

/**
 * Lightweight mock document
 */
class MockDocument {
  constructor() {
    this.elements = new Map();
    this._listeners = {};
    this.visibilityState = "visible";
    this.documentElement = {
      style: {
        _props: {},
        setProperty: (k, v) => { this.documentElement.style._props[k] = v; },
        removeProperty: (k) => { delete this.documentElement.style._props[k]; },
        getPropertyValue: (k) => this.documentElement.style._props[k] || "",
      },
    };
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  getElementById(id) {
    return this.elements.get(id) || null;
  }

  registerElement(id, el) {
    el.id = id;
    this.elements.set(id, el);
    return el;
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((cb) => cb !== fn);
    }
  }

  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    const handlers = this._listeners[type] || [];
    for (const h of handlers) {
      h(event);
    }
  }
}

/**
 * Lightweight mock window
 */
class MockWindow {
  constructor() {
    this._listeners = {};
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((cb) => cb !== fn);
    }
  }

  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    const handlers = this._listeners[type] || [];
    for (const h of handlers) {
      h(event);
    }
  }
}

/**
 * Lightweight mock localStorage
 */
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe("Freshness Throttling, Sync Warning Banner & Version Conflict (R1, R2, R3, R4)", () => {
  let origDoc, origWin, origStorage, origFetch, origNavDesc, origDateNow;
  let doc, win, storage;
  let warningBanner, warningText, lastTimeSpan, retryBtn, closeBtn, refreshBtn;

  beforeEach(() => {
    origDoc = global.document;
    origWin = global.window;
    origStorage = global.localStorage;
    origFetch = global.fetch;
    origNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    origDateNow = Date.now;

    doc = new MockDocument();
    win = new MockWindow();
    storage = new MockLocalStorage();

    warningBanner = new MockElement("aside", "sync-warning-banner");
    warningBanner.hidden = true;
    warningBanner.classList.add("banner-sync-warning");

    warningText = new MockElement("p", "sync-warning-text");
    lastTimeSpan = new MockElement("span", "sync-warning-last-time");
    retryBtn = new MockElement("button", "sync-warning-retry-btn");
    retryBtn.classList.add("btn-banner-retry");
    closeBtn = new MockElement("button", "sync-warning-close-btn");
    closeBtn.classList.add("btn-banner-close");

    warningBanner.appendChild(warningText);
    warningBanner.appendChild(lastTimeSpan);
    warningBanner.appendChild(retryBtn);
    warningBanner.appendChild(closeBtn);

    doc.registerElement("sync-warning-banner", warningBanner);
    doc.registerElement("sync-warning-text", warningText);
    doc.registerElement("sync-warning-last-time", lastTimeSpan);
    doc.registerElement("sync-warning-retry-btn", retryBtn);
    doc.registerElement("sync-warning-close-btn", closeBtn);

    const drawer = new MockElement("aside", "schedule-drawer");
    refreshBtn = new MockElement("button", "refresh-schedule-btn");
    const refreshLabel = new MockElement("span");
    refreshLabel.classList.add("refresh-label");
    refreshLabel.textContent = "Actualiser";
    refreshBtn.appendChild(refreshLabel);

    doc.registerElement("schedule-drawer", drawer);
    doc.registerElement("refresh-schedule-btn", refreshBtn);

    global.document = doc;
    global.window = win;
    global.localStorage = storage;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    global.document = origDoc;
    global.window = origWin;
    global.localStorage = origStorage;
    global.fetch = origFetch;
    if (origNavDesc) {
      Object.defineProperty(globalThis, "navigator", origNavDesc);
    }
    Date.now = origDateNow;
  });

  describe("R1. Freshness Check on Focus & Visibility with 10s Throttling", () => {
    test("focus event triggers schedule freshness check", async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({ schedule: {}, sha: "sha-fresh-1", brusselsTime: "12:00:00" }),
        };
      };

      const ctrl = new ScheduleViewController();
      ctrl.setupFreshnessListeners(10000);

      assert.equal(fetchCount, 0);
      win.dispatchEvent({ type: "focus" });

      // Allow async fetchSchedule to resolve
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1);
      assert.equal(ctrl.sha, "sha-fresh-1");
    });

    test("two focus events spaced less than 10 seconds apart trigger only one network call", async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({ schedule: {}, sha: `sha-${fetchCount}` }),
        };
      };

      let currentTime = 1000000;
      Date.now = () => currentTime;

      const ctrl = new ScheduleViewController();
      ctrl.setupFreshnessListeners(10000);

      // Event 1 at t = 0s
      win.dispatchEvent({ type: "focus" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1);

      // Event 2 at t = 3s (spaced 3s < 10s) -> MUST BE THROTTLED
      currentTime += 3000;
      win.dispatchEvent({ type: "focus" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1, "Second focus event within 10s must be throttled");

      // Event 3 at t = 8s (spaced 8s < 10s from first fetch) -> MUST BE THROTTLED
      currentTime += 5000;
      win.dispatchEvent({ type: "focus" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1, "Third focus event within 10s must still be throttled");

      // Event 4 at t = 11s (spaced 11s > 10s from first fetch) -> MUST FIRE
      currentTime += 3000; // now total 11s
      win.dispatchEvent({ type: "focus" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 2, "Focus event after 10s must trigger new network call");
    });

    test("visibilitychange when document is visible triggers freshness check", async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({ schedule: {}, sha: "sha-vis-1" }),
        };
      };

      const ctrl = new ScheduleViewController();
      ctrl.setupFreshnessListeners(10000);

      doc.visibilityState = "visible";
      doc.dispatchEvent({ type: "visibilitychange" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1);
    });

    test("visibilitychange when document is hidden does NOT trigger fetch", async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return { ok: true, json: async () => ({ schedule: {} }) };
      };

      const ctrl = new ScheduleViewController();
      ctrl.setupFreshnessListeners(10000);

      doc.visibilityState = "hidden";
      doc.dispatchEvent({ type: "visibilitychange" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 0, "No network call should be made when tab is hidden");
    });

    test("rapid alternating visibilitychange and focus events are throttled to 1 call", async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return { ok: true, json: async () => ({ schedule: {} }) };
      };

      const ctrl = new ScheduleViewController();
      ctrl.setupFreshnessListeners(10000);

      doc.visibilityState = "visible";
      doc.dispatchEvent({ type: "visibilitychange" });
      win.dispatchEvent({ type: "focus" });
      doc.dispatchEvent({ type: "visibilitychange" });
      win.dispatchEvent({ type: "focus" });

      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1, "Bursts of visibility and focus events within 10s must trigger only 1 call");
    });

    test("initFreshnessListeners from app.js and schedule-view.js wires listeners seamlessly", async () => {
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount++;
        return { ok: true, json: async () => ({ schedule: {} }) };
      };

      const ctrl = new ScheduleViewController();
      initFreshnessListenersApp(ctrl, 10000);
      initFreshnessListenersSchedule(ctrl, 10000);

      win.dispatchEvent({ type: "focus" });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCount, 1);
    });

    test("multiple calls to setupFreshnessListeners update throttleMs and reuse same handler", async () => {
      const ctrl = new ScheduleViewController();
      const h1 = ctrl.setupFreshnessListeners(5000);
      assert.equal(ctrl.freshnessThrottleMs, 5000);
      const h2 = ctrl.setupFreshnessListeners(10000);
      assert.equal(ctrl.freshnessThrottleMs, 10000);
      assert.equal(h1, h2, "Must return the same handler without duplicating listeners");
    });

    test("in-flight schedule fetches are deduplicated during overlapping calls", async () => {
      let networkCalls = 0;
      global.fetch = async () => {
        networkCalls++;
        await new Promise((r) => setTimeout(r, 25));
        return {
          ok: true,
          json: async () => ({ schedule: { monday: { on: "07:00", off: "14:00" } }, sha: "sha-parallel" }),
        };
      };

      const ctrl = new ScheduleViewController();
      // Launch two fetches concurrently
      const [res1, res2] = await Promise.all([
        ctrl.fetchSchedule(true),
        ctrl.fetchSchedule(true),
      ]);

      assert.equal(networkCalls, 1, "Only one network request should be sent when fetch is in flight");
      assert.equal(res1.sha, "sha-parallel");
      assert.equal(res2.sha, "sha-parallel");
    });

    test("initFreshnessListenersApp fallback throttles duck-typed objects with only fetchSchedule", async () => {
      let callCount = 0;
      const duck = {
        fetchSchedule: async () => {
          callCount++;
        },
      };

      let currentTime = 1000;
      Date.now = () => currentTime;

      const handler = initFreshnessListenersApp(duck, 10000);
      assert.ok(handler);

      // Event 1 at t = 1000
      win.dispatchEvent({ type: "focus" });
      assert.equal(callCount, 1);

      // Event 2 at t = 3000 (within 10s throttle)
      currentTime += 2000;
      win.dispatchEvent({ type: "focus" });
      assert.equal(callCount, 1, "Must be throttled");

      // Event 3 at t = 12000 (after 10s throttle)
      currentTime += 9000;
      win.dispatchEvent({ type: "focus" });
      assert.equal(callCount, 2, "Must fire after throttle window");
    });

    test("calling showWarningBanner multiple times does not attach duplicate click listeners to retryBtn", async () => {
      let fetchScheduleCallCount = 0;
      const ctrl = new ScheduleViewController();
      ctrl.fetchSchedule = async () => {
        fetchScheduleCallCount++;
      };

      // Call showWarningBanner multiple times
      ctrl.showWarningBanner();
      ctrl.showWarningBanner();
      ctrl.showWarningBanner();

      // Click retry button once
      retryBtn.click();
      assert.equal(fetchScheduleCallCount, 1, "Retry button must fire only once per click, no duplicate listeners");
    });

    test("background freshness handler catches fetch failures without emitting unhandled promise rejections", async () => {
      let unhandledRejections = 0;
      const rejectionHandler = () => { unhandledRejections++; };
      process.on("unhandledRejection", rejectionHandler);

      try {
        const ctrl = new ScheduleViewController();
        ctrl.fetchSchedule = async () => {
          throw new Error("Simulated offline failure during tab focus");
        };
        const freshnessHandler = ctrl.setupFreshnessListeners();
        freshnessHandler();
        await new Promise((r) => setTimeout(r, 40));
        assert.equal(unhandledRejections, 0, "No unhandled rejection should escape background freshness listener");
      } finally {
        process.off("unhandledRejection", rejectionHandler);
      }
    });
  });

  describe("R2. Consecutive Failures Counter & Amber Warning Banner (#sync-warning-banner)", () => {
    test("increments consecutiveFailures on network failure and resets to 0 on success", async () => {
      global.fetch = async () => {
        throw new TypeError("Failed to fetch (network down)");
      };

      const ctrl = new ScheduleViewController();
      assert.equal(ctrl.consecutiveFailures, 0);

      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 1);

      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 2);

      // Now mock successful recovery
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ schedule: {}, sha: "fresh-sha" }),
      });

      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 0, "Successful sync must reset consecutiveFailures to 0");
    });

    test("increments consecutiveFailures on HTTP error (status 500, 502, 503)", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });

      const ctrl = new ScheduleViewController();
      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 1);

      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 2);
    });

    test("silent tolerance for 1 to 4 consecutive failures (banner remains hidden)", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
      });

      const ctrl = new ScheduleViewController();

      for (let i = 1; i <= 4; i++) {
        await ctrl.fetchSchedule(true);
        assert.equal(ctrl.consecutiveFailures, i);
        assert.equal(warningBanner.hidden, true, `Banner must remain hidden at failure #${i}`);
        assert.equal(warningBanner.classList.contains("visible"), false);
      }
    });

    test("strictly displays amber banner on the 5th consecutive failure with last sync time", async () => {
      storage.setItem(STORAGE_KEYS.TIMESTAMP, "2026-09-30T10:30:00.000Z");

      global.fetch = async () => ({
        ok: false,
        status: 503,
      });

      const ctrl = new ScheduleViewController();

      for (let i = 1; i <= 4; i++) {
        await ctrl.fetchSchedule(true);
      }
      assert.equal(warningBanner.hidden, true);

      // 5th failure
      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 5);
      assert.equal(warningBanner.hidden, false, "Banner must become visible on 5th consecutive failure");
      assert.equal(warningBanner.classList.contains("visible"), true);

      // Verify content mentions local cache and last sync time
      const bannerText = warningText.textContent;
      assert.ok(bannerText.includes("cache local"), "Banner must mention local cache");
      assert.ok(bannerText.includes("Dernière synchronisation réussie"), "Banner must mention last successful sync");
    });

    test("successful sync immediately hides banner and resets consecutiveFailures to 0", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
      });

      const ctrl = new ScheduleViewController();

      // Trigger 5 failures to display banner
      for (let i = 0; i < 5; i++) {
        await ctrl.fetchSchedule(true);
      }
      assert.equal(warningBanner.hidden, false);
      assert.equal(ctrl.consecutiveFailures, 5);

      // Now recovery
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ schedule: { monday: { on: "07:00", off: "14:00" } }, sha: "sha-ok" }),
      });

      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 0);
      assert.equal(warningBanner.hidden, true, "Banner must be hidden immediately upon successful sync");
      assert.equal(warningBanner.classList.contains("visible"), false);
    });

    test("close button [✕] hides warning banner temporarily without resetting failure count", async () => {
      global.fetch = async () => ({
        ok: false,
        status: 500,
      });

      const ctrl = new ScheduleViewController();

      for (let i = 0; i < 5; i++) {
        await ctrl.fetchSchedule(true);
      }
      assert.equal(ctrl.consecutiveFailures, 5);
      assert.equal(warningBanner.hidden, false);

      // Click close button [✕]
      closeBtn.click();

      assert.equal(warningBanner.hidden, true, "Clicking [✕] must hide the warning banner");
      assert.equal(warningBanner.classList.contains("visible"), false);
      assert.equal(ctrl.consecutiveFailures, 5, "Closing banner must not reset consecutiveFailures count");
    });

    test("retry button [Réessayer 🔄] triggers manual fetchSchedule(false)", async () => {
      let silentArgumentReceived = null;
      let attempts = 0;

      const ctrl = new ScheduleViewController();

      // Mock 5 failures
      global.fetch = async () => ({ ok: false, status: 500 });
      for (let i = 0; i < 5; i++) {
        await ctrl.fetchSchedule(true);
      }
      assert.equal(ctrl.consecutiveFailures, 5);
      assert.equal(warningBanner.hidden, false);

      // Wrap fetchSchedule to spy on silent flag
      const origFetchSchedule = ctrl.fetchSchedule.bind(ctrl);
      ctrl.fetchSchedule = async (silent) => {
        silentArgumentReceived = silent;
        attempts++;
        return origFetchSchedule(silent);
      };

      // Mock next fetch to succeed
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ schedule: {}, sha: "sha-after-retry" }),
      });

      retryBtn.click();
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(attempts, 1, "Retry button must trigger a fetch call");
      assert.equal(silentArgumentReceived, false, "Retry button must pass silent=false");
      assert.equal(ctrl.consecutiveFailures, 0);
      assert.equal(warningBanner.hidden, true, "Successful retry must hide the warning banner");
    });

    test("user dismiss [✕] keeps banner hidden on subsequent silent failures, but manual retry re-shows on failure", async () => {
      global.fetch = async () => ({ ok: false, status: 500 });
      const ctrl = new ScheduleViewController();

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        await ctrl.fetchSchedule(true);
      }
      assert.equal(warningBanner.hidden, false);

      // Dismiss banner via close button
      closeBtn.click();
      assert.equal(warningBanner.hidden, true);

      // Subsequent silent failures (e.g. failure 6 from background tab focus) should NOT un-hide dismissed banner
      await ctrl.fetchSchedule(true);
      assert.equal(ctrl.consecutiveFailures, 6);
      assert.equal(warningBanner.hidden, true, "Banner must remain hidden during silent background checks after user dismissal");

      // But manual retry (silent=false) should re-surface the banner if it fails
      await ctrl.fetchSchedule(false);
      assert.equal(ctrl.consecutiveFailures, 7);
      assert.equal(warningBanner.hidden, false, "Manual retry failure must re-show the banner");
    });

    test("preserves child #sync-warning-last-time span without DOM destruction", async () => {
      // Setup nested DOM structure as defined in index.html
      const banner = new MockElement("aside", "sync-warning-banner");
      const textContainer = new MockElement("p", "sync-warning-text");
      const descSpan = new MockElement("span");
      descSpan.textContent = "Attention : Les données affichées proviennent du cache local.";
      const timeSpan = new MockElement("span", "sync-warning-last-time");
      timeSpan.textContent = "Dernière synchronisation réussie : inconnue";

      textContainer.appendChild(descSpan);
      textContainer.appendChild(timeSpan);
      banner.appendChild(textContainer);

      doc.registerElement("sync-warning-banner", banner);
      doc.registerElement("sync-warning-text", textContainer);
      doc.registerElement("sync-warning-last-time", timeSpan);

      storage.setItem(STORAGE_KEYS.TIMESTAMP, "2026-09-30T10:30:00.000Z");

      const ctrl = new ScheduleViewController();
      ctrl.warningBanner = banner;
      ctrl.warningText = textContainer;

      ctrl.showWarningBanner();

      // Ensure timeSpan was NOT removed from the DOM
      const resolvedSpan = doc.getElementById("sync-warning-last-time");
      assert.ok(resolvedSpan, "sync-warning-last-time element must not be destroyed");
      assert.ok(resolvedSpan.textContent.includes("10:30:00") || resolvedSpan.textContent.includes("Dernière synchronisation"));
      assert.ok(textContainer.contains(resolvedSpan), "timeSpan must remain a child of textContainer");
    });

    test("getLastSyncFormatted falls back to in-memory timestamp when localStorage is inaccessible", async () => {
      global.localStorage = {
        getItem: () => {
          throw new Error("QuotaExceeded or SecurityError in private mode");
        },
      };

      const ctrl = new ScheduleViewController();
      assert.equal(ctrl.getLastSyncFormatted(), "inconnue");

      ctrl.lastSuccessfulSyncTime = "2026-09-30T12:00:00.000Z";
      const formatted = ctrl.getLastSyncFormatted();
      assert.ok(formatted.includes("12:00:00") || formatted.includes("14:00:00"));
    });

    test("showWarningBanner sets CSS custom property --sync-warning-banner-height on document.documentElement", async () => {
      const ctrl = new ScheduleViewController();
      ctrl.showWarningBanner();

      const heightProp = doc.documentElement.style.getPropertyValue("--sync-warning-banner-height");
      assert.equal(heightProp, "46px", "Should set custom CSS property for drawer alignment");

      ctrl.hideWarningBanner();
      const removedProp = doc.documentElement.style.getPropertyValue("--sync-warning-banner-height");
      assert.equal(removedProp, "", "Should clear custom CSS property on hide");
    });

    test("user dismiss [✕] keeps banner hidden across 10, 15, 20 consecutive silent failures", async () => {
      global.fetch = async () => ({ ok: false, status: 500 });
      const ctrl = new ScheduleViewController();

      // Trigger 5 failures to show banner
      for (let i = 0; i < 5; i++) {
        await ctrl.fetchSchedule(true);
      }
      assert.equal(warningBanner.hidden, false);

      // Dismiss banner via close button
      closeBtn.click();
      assert.equal(warningBanner.hidden, true);

      // Verify that silent failures 6, 7, 8, 9, 10, 11... 20 do NOT re-show the banner
      for (let i = 6; i <= 20; i++) {
        await ctrl.fetchSchedule(true);
        assert.equal(ctrl.consecutiveFailures, i);
        assert.equal(warningBanner.hidden, true, `Banner must remain hidden at failure #${i}`);
      }

      // But a manual user retry failure immediately brings it back
      await ctrl.fetchSchedule(false);
      assert.equal(ctrl.consecutiveFailures, 21);
      assert.equal(warningBanner.hidden, false, "Manual retry failure must re-show the banner");
    });

    test("getLastSyncFormatted handles invalid date strings safely by returning inconnue", () => {
      storage.setItem(STORAGE_KEYS.TIMESTAMP, "invalid-non-iso-date");
      const ctrl = new ScheduleViewController();
      assert.equal(ctrl.getLastSyncFormatted(), "inconnue", "Invalid date should safely return inconnue");
    });

    test("getLastSyncFormatted formats different calendar day with date and time in Brussels timezone", () => {
      // Set timestamp from earlier date (e.g. 2026-05-14 08:30:00 UTC)
      storage.setItem(STORAGE_KEYS.TIMESTAMP, "2026-05-14T08:30:00.000Z");
      const ctrl = new ScheduleViewController();
      const formatted = ctrl.getLastSyncFormatted();
      assert.ok(formatted.includes("14/05/2026"), "Should include European date format DD/MM/YYYY");
      assert.ok(formatted.includes("10:30:00") || formatted.includes("08:30:00"), "Should include time");
    });

    test("manual retry joining an in-flight silent fetch shows warning banner on failure even if previously dismissed", async () => {
      const ctrl = new ScheduleViewController();
      ctrl.consecutiveFailures = 5;
      ctrl.showWarningBanner();
      assert.equal(warningBanner.hidden, false);

      // User dismisses banner
      closeBtn.click();
      assert.equal(warningBanner.hidden, true);
      assert.equal(ctrl.warningBannerDismissed, true);

      // A background silent fetch is started
      global.fetch = async () => {
        await new Promise((r) => setTimeout(r, 25));
        throw new TypeError("Failed to fetch");
      };

      const silentFetch = ctrl.fetchSchedule(true);
      // User intervenes by clicking retry while background fetch is still in flight
      const manualRetry = ctrl.fetchSchedule(false);

      const [resSilent, resManual] = await Promise.all([silentFetch, manualRetry]);
      assert.equal(resSilent.success, false);
      assert.equal(resManual.success, false);
      assert.equal(ctrl.consecutiveFailures, 6);
      assert.equal(warningBanner.hidden, false, "Banner must be shown when manual retry joins an in-flight fetch and fails");
    });

    test("null or non-object schedule payload in 200 OK is treated as sync failure without wiping cache or resetting counter", async () => {
      storage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify({ monday: { on: "08:00", off: "16:00" } }));
      storage.setItem(STORAGE_KEYS.SHA, "valid-sha-123");

      const ctrl = new ScheduleViewController();
      ctrl.loadFromCache();
      assert.ok(ctrl.schedule);
      ctrl.consecutiveFailures = 4;

      global.fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ schedule: null, sha: "bad-sha" }),
        };
      };

      const res = await ctrl.fetchSchedule(true);
      assert.equal(res.success, false);
      assert.equal(ctrl.consecutiveFailures, 5, "Failures must increment to 5 on null schedule payload");
      assert.equal(warningBanner.hidden, false, "Amber banner must appear on 5th failure");

      // Verify that valid local cache was preserved
      const cached = JSON.parse(storage.getItem(STORAGE_KEYS.SCHEDULE));
      assert.equal(cached.monday.on, "08:00", "Valid cached schedule must not be wiped by corrupted network response");
    });

    test("getLastSyncFormatted prefers in-memory lastSuccessfulSyncTime when newer than older localStorage timestamp", () => {
      // localStorage has timestamp from yesterday
      storage.setItem(STORAGE_KEYS.TIMESTAMP, "2026-05-14T08:00:00.000Z");

      const ctrl = new ScheduleViewController();
      // Current session had a successful sync today (e.g. 2026-05-15)
      ctrl.lastSuccessfulSyncTime = new Date().toISOString();

      const formatted = ctrl.getLastSyncFormatted();
      assert.ok(!formatted.includes("14/05/2026"), "Should use today timestamp rather than stale localStorage from yesterday");
    });
  });

  describe("R3. SHA Concurrency Conflict (HTTP 409 & SHA_CONFLICT) in chat.js", () => {
    test("intercepts HTTP 409 response with clear non-guilt message and refreshes schedule", async () => {
      let scheduleUpdateTriggered = false;

      global.fetch = async (url) => {
        if (url === "/api/confirm") {
          return {
            status: 409,
            ok: false,
            json: async () => ({
              error: "Conflict",
              code: "SHA_CONFLICT",
              conflict: true,
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      };

      const messagesContainer = new MockElement("div", "chat-messages");
      const chatManager = new ChatManager({
        messagesContainer,
        onScheduleUpdated: () => {
          scheduleUpdateTriggered = true;
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const confirmBtn = new MockElement("button");
      confirmBtn.classList.add("btn-action-confirm");
      footer.appendChild(confirmBtn);

      const action = {
        name: "propose_holiday",
        args: { start: "2026-05-14", end: "2026-05-17", description: "Congé de l'Ascension" },
      };

      await chatManager.executeConfirm(card, action, "stale-sha", footer);

      // Check conflict message verbatim
      const expectedMessage = ERROR_MESSAGES.shaConflict;
      assert.ok(expectedMessage, "ERROR_MESSAGES.shaConflict must be defined");
      assert.equal(
        expectedMessage,
        "⚠️ Le planning a été modifié entre-temps par un autre collaborateur. Les horaires viennent d'être rafraîchis. Veuillez revérifier les horaires actuels avant de renouveler votre demande."
      );

      assert.ok(
        footer.textContent.includes("modifié entre-temps par un autre collaborateur"),
        "Card footer must display explicit conflict message"
      );
      assert.ok(
        footer.textContent.includes("revérifier les horaires actuels"),
        "Card footer must advise re-verifying current schedule"
      );
      assert.equal(scheduleUpdateTriggered, true, "onScheduleUpdated must be immediately called on 409 conflict");
    });

    test("intercepts data.code === 'SHA_CONFLICT' even if HTTP status is not 409", async () => {
      let scheduleUpdateTriggered = false;

      global.fetch = async () => ({
        status: 400,
        ok: false,
        json: async () => ({
          error: "Stale sha",
          code: "SHA_CONFLICT",
        }),
      });

      const chatManager = new ChatManager({
        onScheduleUpdated: () => {
          scheduleUpdateTriggered = true;
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      await chatManager.executeConfirm(card, action, "stale-sha", footer);

      assert.ok(
        footer.textContent.includes("modifié entre-temps par un autre collaborateur"),
        "Conflict message must be displayed on code === SHA_CONFLICT"
      );
      assert.equal(scheduleUpdateTriggered, true);
    });

    test("intercepts data.conflict === true", async () => {
      let scheduleUpdateTriggered = false;

      global.fetch = async () => ({
        status: 400,
        ok: false,
        json: async () => ({
          error: "Conflict occurred",
          conflict: true,
        }),
      });

      const chatManager = new ChatManager({
        onScheduleUpdated: () => {
          scheduleUpdateTriggered = true;
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      await chatManager.executeConfirm(card, action, "stale-sha", footer);

      assert.ok(
        footer.textContent.includes("modifié entre-temps par un autre collaborateur"),
        "Conflict message must be displayed on conflict === true"
      );
      assert.equal(scheduleUpdateTriggered, true);
    });

    test("non-conflict errors display standard error message and do not trigger onScheduleUpdated", async () => {
      let scheduleUpdateTriggered = false;

      global.fetch = async () => ({
        status: 502,
        ok: false,
        json: async () => ({
          error: "GitHub API timeout",
          code: "GITHUB_ERROR",
        }),
      });

      const chatManager = new ChatManager({
        onScheduleUpdated: () => {
          scheduleUpdateTriggered = true;
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      await chatManager.executeConfirm(card, action, "sha", footer);

      assert.ok(!footer.textContent.includes("modifié entre-temps"));
      assert.ok(footer.textContent.includes("GitHub API timeout"));
      assert.equal(scheduleUpdateTriggered, false, "Standard errors must not trigger onScheduleUpdated");
    });

    test("successful action confirmation triggers onScheduleUpdated and renders success badge", async () => {
      let scheduleUpdateTriggered = false;

      global.fetch = async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          newFileSha: "new-sha-12345",
        }),
      });

      const chatManager = new ChatManager({
        onScheduleUpdated: () => {
          scheduleUpdateTriggered = true;
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      await chatManager.executeConfirm(card, action, "sha", footer);

      assert.ok(footer.textContent.includes("Modification enregistrée avec succès"));
      assert.equal(chatManager.currentSha, "new-sha-12345");
      assert.equal(scheduleUpdateTriggered, true);
    });

    test("conflict error applies badge-conflict CSS class", async () => {
      global.fetch = async () => ({
        status: 409,
        ok: false,
        json: async () => ({ code: "SHA_CONFLICT", conflict: true }),
      });

      const chatManager = new ChatManager({});
      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      await chatManager.executeConfirm(card, action, "stale-sha", footer);

      const badge = footer.querySelector(".action-status-badge");
      assert.ok(badge, "Badge element must be rendered");
      assert.ok(badge.classList.contains("badge-conflict"), "Badge element must have badge-conflict class");
      assert.ok(badge.classList.contains("badge-error"), "Badge element must also retain badge-error class for backward compatibility");
    });

    test("clicking retry after 409 conflict awaits pending schedule update and uses fresh SHA", async () => {
      let confirmCallCount = 0;
      const requestedShaHistory = [];
      let scheduleSha = "old-sha-1";

      global.fetch = async (url, opts) => {
        if (url === "/api/confirm") {
          confirmCallCount++;
          const body = JSON.parse(opts.body);
          requestedShaHistory.push(body.sha);

          if (confirmCallCount === 1) {
            // First call fails with 409 conflict
            return {
              status: 409,
              ok: false,
              json: async () => ({ code: "SHA_CONFLICT", conflict: true }),
            };
          } else {
            // Second call (retry) succeeds with new sha
            return {
              status: 200,
              ok: true,
              json: async () => ({ success: true, newFileSha: "sha-after-mutation" }),
            };
          }
        }
        return { ok: true, json: async () => ({}) };
      };

      const chatManager = new ChatManager({
        getScheduleSha: () => scheduleSha,
        onScheduleUpdated: async () => {
          // Simulate background async fetch
          await new Promise((r) => setTimeout(r, 15));
          scheduleSha = "new-fresh-sha-2";
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      // Step 1: Initial confirm fails with 409 conflict
      await chatManager.executeConfirm(card, action, "old-sha-1", footer);

      const retryBtn = footer.querySelector(".btn-action-retry");
      assert.ok(retryBtn, "Retry button must be present on conflict");

      // Step 2: User clicks retry
      retryBtn.click();
      await new Promise((r) => setTimeout(r, 35));

      assert.equal(confirmCallCount, 2, "Retry must perform second confirm call");
      assert.equal(requestedShaHistory[0], "old-sha-1", "First call sent old sha");
      assert.equal(requestedShaHistory[1], "new-fresh-sha-2", "Second call sent fresh sha from background refresh");
      assert.ok(footer.textContent.includes("Modification enregistrée avec succès"));
    });

    test("on 409 conflict without getScheduleSha, retry uses fresh SHA resolved from onScheduleUpdated", async () => {
      let confirmCallCount = 0;
      const requestedShaHistory = [];

      global.fetch = async (url, opts) => {
        if (url === "/api/confirm") {
          confirmCallCount++;
          const body = JSON.parse(opts.body);
          requestedShaHistory.push(body.sha);

          if (confirmCallCount === 1) {
            return {
              status: 409,
              ok: false,
              json: async () => ({ code: "SHA_CONFLICT", conflict: true }),
            };
          } else {
            return {
              status: 200,
              ok: true,
              json: async () => ({ success: true, newFileSha: "sha-final" }),
            };
          }
        }
        return { ok: true, json: async () => ({}) };
      };

      // Notice: NO getScheduleSha provided! Only onScheduleUpdated that resolves with fresh sha
      const chatManager = new ChatManager({
        onScheduleUpdated: async () => {
          await new Promise((r) => setTimeout(r, 10));
          return { success: true, sha: "sha-from-refresh-promise" };
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      // Step 1: Initial confirm fails with 409
      await chatManager.executeConfirm(card, action, "stale-sha", footer);

      const retryBtn = footer.querySelector(".btn-action-retry");
      assert.ok(retryBtn);

      // Step 2: Retry click
      retryBtn.click();
      await new Promise((r) => setTimeout(r, 35));

      assert.equal(confirmCallCount, 2);
      assert.equal(requestedShaHistory[0], "stale-sha");
      assert.equal(requestedShaHistory[1], "sha-from-refresh-promise", "Retry must use fresh SHA resolved from pending background update");
      assert.equal(chatManager.currentSha, "sha-final");
    });

    test("rapid double-click on confirm button is debounced and executes only once", async () => {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 20));
        return {
          status: 200,
          ok: true,
          json: async () => ({ success: true, newFileSha: "sha-123" }),
        };
      };

      const chatManager = new ChatManager({});
      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      // Launch two confirmations concurrently on same card
      const p1 = chatManager.executeConfirm(card, action, "sha", footer);
      const p2 = chatManager.executeConfirm(card, action, "sha", footer);

      await Promise.all([p1, p2]);
      assert.equal(callCount, 1, "Concurrent confirmation clicks must be debounced to 1 network call");
    });

    test("synchronous exception in onScheduleUpdated does not overwrite 409 conflict message with githubCommitFail", async () => {
      global.fetch = async () => ({
        status: 409,
        ok: false,
        json: async () => ({ code: "SHA_CONFLICT", conflict: true }),
      });

      const chatManager = new ChatManager({
        onScheduleUpdated: () => {
          throw new Error("Synchronous error during schedule update hook");
        },
      });

      const card = new MockElement("div");
      const footer = new MockElement("div");
      const action = { name: "propose_holiday", args: {} };

      await chatManager.executeConfirm(card, action, "sha", footer);
      assert.ok(
        footer.textContent.includes(ERROR_MESSAGES.shaConflict),
        "Footer must preserve the 409 conflict message even if onScheduleUpdated throws synchronously"
      );
      assert.ok(
        !footer.innerHTML.includes(ERROR_MESSAGES.githubCommitFail),
        "Footer must NOT be overwritten with generic githubCommitFail"
      );
    });

    test("rejected promise in onScheduleUpdated is caught cleanly without unhandledRejection", async () => {
      let unhandledCount = 0;
      const rejectionHandler = () => { unhandledCount++; };
      process.on("unhandledRejection", rejectionHandler);

      try {
        global.fetch = async () => ({
          status: 409,
          ok: false,
          json: async () => ({ code: "SHA_CONFLICT", conflict: true }),
        });

        const chatManager = new ChatManager({
          onScheduleUpdated: () => {
            return Promise.reject(new Error("Network drop during schedule fetch"));
          },
        });

        const card = new MockElement("div");
        const footer = new MockElement("div");
        const action = { name: "propose_holiday", args: {} };

        await chatManager.executeConfirm(card, action, "sha", footer);
        await new Promise((r) => setTimeout(r, 40));
        assert.equal(unhandledCount, 0, "No unhandled rejection should occur on schedule update rejection");
      } finally {
        process.off("unhandledRejection", rejectionHandler);
      }
    });
  });
});
