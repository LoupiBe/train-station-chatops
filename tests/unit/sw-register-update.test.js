import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerServiceWorker,
  checkForServiceWorkerUpdate,
  showUpdateToast,
  trackInstallingWorker,
  UPDATE_PROMPT_MESSAGE,
} from "../../public/js/sw-register.js";

/**
 * Lightweight mock element for DOM tests in Node.js
 */
class MockElement {
  constructor(tag = "div", id = "") {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = "";
    this.classList = {
      _classes: new Set(),
      add: (...classes) => classes.forEach((c) => this.classList._classes.add(c)),
      remove: (...classes) => classes.forEach((c) => this.classList._classes.delete(c)),
      contains: (c) => this.classList._classes.has(c),
    };
    this.hidden = true;
    this.textContent = "";
    this.innerHTML = "";
    this.attributes = {};
    this.style = {};
    this._listeners = {};
    this.onclick = null;
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
  }

  dispatchEvent(event) {
    const type = typeof event === "string" ? event : event.type;
    const listeners = this._listeners[type] || [];
    for (const h of listeners) {
      h(event);
    }
    if (type === "click" && typeof this.onclick === "function") {
      this.onclick(event);
    }
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }

  querySelector(selector) {
    return null;
  }
}

describe("Service Worker Update & Registration Resilience", () => {
  let originalWindow, originalDocument, originalNavigator;
  let mockDoc, mockWin, mockNav;
  let toastEl, toastTextEl, toastBtnEl;
  let swRegisterCalls = [];
  let swUpdateCalls = [];
  let postMessageCalls = [];

  let origNavDesc;

  beforeEach(() => {
    originalWindow = global.window;
    originalDocument = global.document;
    origNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");

    swRegisterCalls = [];
    swUpdateCalls = [];
    postMessageCalls = [];

    toastEl = new MockElement("aside", "update-toast");
    toastTextEl = new MockElement("span", "update-toast-text");
    toastBtnEl = new MockElement("button", "update-toast-btn");

    mockDoc = {
      readyState: "complete",
      visibilityState: "visible",
      _listeners: {},
      addEventListener(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
      },
      removeEventListener(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
      },
      dispatchEvent(event) {
        const type = typeof event === "string" ? event : event.type;
        const listeners = this._listeners[type] || [];
        for (const h of listeners) h(event);
      },
      getElementById(id) {
        if (id === "update-toast") return toastEl;
        if (id === "update-toast-text") return toastTextEl;
        if (id === "update-toast-btn") return toastBtnEl;
        return null;
      },
    };

    mockWin = {
      _listeners: {},
      location: {
        _reloaded: false,
        reload() {
          this._reloaded = true;
        },
      },
      addEventListener(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
      },
      removeEventListener(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter((h) => h !== handler);
      },
      dispatchEvent(event) {
        const type = typeof event === "string" ? event : event.type;
        const listeners = this._listeners[type] || [];
        for (const h of listeners) h(event);
      },
    };

    mockNav = {
      onLine: true,
      serviceWorker: {
        controller: { id: "old-controller-v1" },
        _listeners: {},
        addEventListener(event, handler) {
          if (!this._listeners[event]) this._listeners[event] = [];
          this._listeners[event].push(handler);
        },
        dispatchEvent(event) {
          const type = typeof event === "string" ? event : event.type;
          const listeners = this._listeners[type] || [];
          for (const h of listeners) h(event);
        },
        async register(scriptUrl, options) {
          swRegisterCalls.push({ scriptUrl, options });
          return mockRegistration;
        },
      },
    };

    global.window = mockWin;
    global.document = mockDoc;
    Object.defineProperty(globalThis, "navigator", {
      value: mockNav,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    if (origNavDesc) {
      Object.defineProperty(globalThis, "navigator", origNavDesc);
    } else {
      delete globalThis.navigator;
    }
  });

  let mockRegistration;

  test("registers with scope '/' and updateViaCache 'none'", async () => {
    mockRegistration = {
      waiting: null,
      installing: null,
      _listeners: {},
      addEventListener(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
      },
      async update() {
        swUpdateCalls.push(Date.now());
      },
    };

    registerServiceWorker();
    // Allow any async tick to complete
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(swRegisterCalls.length, 1, "Must call navigator.serviceWorker.register");
    assert.equal(swRegisterCalls[0].scriptUrl, "/sw.js");
    assert.deepEqual(swRegisterCalls[0].options, {
      scope: "/",
      updateViaCache: "none",
    });
  });

  test("executes registration immediately when document.readyState is 'complete'", async () => {
    mockDoc.readyState = "complete";
    mockRegistration = {
      waiting: null,
      installing: null,
      _listeners: {},
      addEventListener() {},
      async update() {
        swUpdateCalls.push(Date.now());
      },
    };

    registerServiceWorker();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(swRegisterCalls.length, 1, "Must register immediately without waiting for 'load' event");
    assert.equal(swUpdateCalls.length, 1, "Must proactively call update() on registration");
  });

  test("waits for 'load' event only when document.readyState is 'loading'", async () => {
    mockDoc.readyState = "loading";
    mockRegistration = {
      waiting: null,
      installing: null,
      _listeners: {},
      addEventListener() {},
      async update() {
        swUpdateCalls.push(Date.now());
      },
    };

    registerServiceWorker();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(swRegisterCalls.length, 0, "Must not have registered yet while document is loading");

    // Simulate load event
    mockWin.dispatchEvent({ type: "load" });
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(swRegisterCalls.length, 1, "Must register once 'load' event fires");
    assert.equal(swUpdateCalls.length, 1, "Must call update() after load registration");
  });

  test("shows update toast immediately if a worker is already waiting upon registration", async () => {
    const mockWaitingWorker = {
      state: "installed",
      postMessage(msg) {
        postMessageCalls.push(msg);
      },
    };

    mockRegistration = {
      waiting: mockWaitingWorker,
      installing: null,
      _listeners: {},
      addEventListener() {},
      async update() {},
    };

    registerServiceWorker();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(toastEl.hidden, false, "Toast must be un-hidden");
    assert.equal(toastEl.classList.contains("visible"), true, "Toast must have 'visible' class");
    assert.equal(toastTextEl.textContent, UPDATE_PROMPT_MESSAGE);

    // Clicking reload button sends SKIP_WAITING
    toastBtnEl.click();
    assert.deepEqual(postMessageCalls, [{ type: "SKIP_WAITING" }]);
  });

  test("shows update toast when installing worker transitions to 'installed'", async () => {
    let stateChangeHandler = null;
    const mockInstallingWorker = {
      state: "installing",
      _listeners: {},
      addEventListener(event, handler) {
        if (event === "statechange") stateChangeHandler = handler;
      },
      postMessage(msg) {
        postMessageCalls.push(msg);
      },
    };

    mockRegistration = {
      waiting: null,
      installing: mockInstallingWorker,
      _listeners: {},
      addEventListener() {},
      async update() {},
    };

    registerServiceWorker();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(toastEl.hidden, true, "Toast should remain hidden while worker is installing");

    // Transition worker to 'installed'
    mockInstallingWorker.state = "installed";
    assert.ok(stateChangeHandler, "statechange listener must be registered");
    stateChangeHandler();

    assert.equal(toastEl.hidden, false, "Toast must be shown when worker state becomes 'installed'");
    assert.equal(toastEl.classList.contains("visible"), true);
  });

  test("reloads window safely upon controllerchange", async () => {
    mockRegistration = {
      waiting: null,
      installing: null,
      _listeners: {},
      addEventListener() {},
      async update() {},
    };

    registerServiceWorker();
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(mockWin.location._reloaded, false);

    // Dispatch controllerchange event on navigator.serviceWorker
    mockNav.serviceWorker.dispatchEvent({ type: "controllerchange" });

    assert.equal(mockWin.location._reloaded, true, "Window must reload when new worker takes control");
  });

  test("triggers update check on tab focus and visibilitychange (throttled)", async () => {
    mockRegistration = {
      waiting: null,
      installing: null,
      _listeners: {},
      addEventListener() {},
      async update() {
        swUpdateCalls.push(Date.now());
      },
    };

    registerServiceWorker();
    await new Promise((r) => setTimeout(r, 10));

    const initialUpdates = swUpdateCalls.length;
    assert.equal(initialUpdates, 1, "Initial update check performed");

    // Rapid focus event within throttle window (< 10s) must be skipped
    mockWin.dispatchEvent({ type: "focus" });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(swUpdateCalls.length, initialUpdates, "Rapid focus event must be throttled");

    // Rapid visibilitychange within throttle window must be skipped
    mockDoc.dispatchEvent({ type: "visibilitychange" });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(swUpdateCalls.length, initialUpdates, "Rapid visibilitychange event must be throttled");

    // Force update via checkForServiceWorkerUpdate(true) bypasses throttle
    await checkForServiceWorkerUpdate(true);
    assert.equal(swUpdateCalls.length, initialUpdates + 1, "Forced update check must execute immediately");
  });

  test("catches network failure in update check without throwing unhandled rejection", async () => {
    mockRegistration = {
      waiting: null,
      installing: null,
      _listeners: {},
      addEventListener() {},
      async update() {
        throw new Error("Network request failed");
      },
    };

    assert.doesNotReject(async () => {
      await checkForServiceWorkerUpdate(true);
    }, "Update errors must be caught gracefully");
  });
});
