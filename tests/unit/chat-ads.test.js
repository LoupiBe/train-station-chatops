/**
 * tests/unit/chat-ads.test.js
 * Unit test suite for client-side chat Action Cards for advertisements:
 * - createImageAdCard (framing presets, Tag F recalculation, manual override preservation)
 * - createTextAdCard (text banner configuration, style selector, Tag F preservation)
 * - Drag-and-drop & paste event handling resilience
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ChatManager } from "../../public/js/chat.js";

/**
 * Lightweight mock DOM Element supporting attributes, classes, dataset, and hierarchy
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
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.value = "";
    this.checked = false;
    this.children = [];
    this.parentElement = null;
    this._listeners = {};
    this._innerHTML = "";
    this._textContent = "";
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = [];
    this._textContent = String(val).replace(/<[^>]*>/g, "");

    // Simplified DOM parser for test fixtures
    const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>|<([a-z0-9]+)([^>]*)\/?>/gis;
    let match;
    while ((match = tagRegex.exec(val)) !== null) {
      const tag = match[1] || match[4];
      const attrs = match[2] || match[5] || "";
      const content = match[3] || "";
      const el = new MockElement(tag);

      const idMatch = attrs.match(/id="([^"]+)"/i);
      if (idMatch) el.id = idMatch[1];

      const classMatch = attrs.match(/class="([^"]+)"/i);
      if (classMatch) {
        el.className = classMatch[1];
        classMatch[1].split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
      }

      const valMatch = attrs.match(/value="([^"]*)"/i);
      if (valMatch) el.value = valMatch[1];

      const modeMatch = attrs.match(/data-mode="([^"]+)"/i);
      if (modeMatch) el.dataset.mode = modeMatch[1];

      const styleMatch = attrs.match(/data-style="([^"]+)"/i);
      if (styleMatch) el.dataset.style = styleMatch[1];

      if (attrs.includes("checked")) el.checked = true;

      if (content) el.innerHTML = content;
      this.appendChild(el);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set textContent(val) {
    this.children = [];
    this._textContent = String(val);
    this._innerHTML = String(val);
  }

  get textContent() {
    let t = this._textContent || "";
    for (const c of this.children) {
      t += " " + (c.textContent || "");
    }
    return t.trim();
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
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

  _matches(selector) {
    const parts = selector.split(",").map((s) => s.trim());
    for (const part of parts) {
      if (part.startsWith("#") && this.id === part.slice(1)) return true;
      if (part.startsWith(".")) {
        const classes = part.split(".").filter(Boolean);
        if (classes.length > 0 && classes.every((c) => this.classList.contains(c))) return true;
      }
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
 * Mock 2D Context for testing
 */
class MockContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this._pixelData = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    // Default to fully opaque
    for (let i = 3; i < this._pixelData.length; i += 4) {
      this._pixelData[i] = 255;
    }
  }
  save() {}
  restore() {}
  fillRect() {
    for (let i = 3; i < this._pixelData.length; i += 4) {
      this._pixelData[i] = 255;
    }
  }
  clearRect() {
    for (let i = 3; i < this._pixelData.length; i += 4) {
      this._pixelData[i] = 0;
    }
  }
  drawImage(img, ...args) {
    const alpha = (img && img.isTransparent) ? 0 : 255;
    if (args.length >= 4) {
      const [dx, dy, dw, dh] = args.slice(-4);
      const startX = Math.max(0, Math.floor(dx));
      const endX = Math.min(this.canvas.width, Math.ceil(dx + dw));
      const startY = Math.max(0, Math.floor(dy));
      const endY = Math.min(this.canvas.height, Math.ceil(dy + dh));
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * this.canvas.width + x) * 4;
          this._pixelData[idx + 3] = alpha;
        }
      }
    } else {
      for (let i = 3; i < this._pixelData.length; i += 4) {
        this._pixelData[i] = alpha;
      }
    }
  }
  fillText() {}
  measureText() { return { width: 100 }; }
  getImageData(x, y, w, h) {
    return { width: w, height: h, data: this._pixelData };
  }
}

class MockCanvas extends MockElement {
  constructor(width = 1280, height = 200) {
    super("canvas");
    this.width = width;
    this.height = height;
    this.ctx = new MockContext2D(this);
  }
  getContext(type) {
    if (type === "2d") return this.ctx;
    return null;
  }
  toDataURL(type = "image/webp") {
    return `data:${type};base64,mockWebpB64Data`;
  }
}

describe("Chat Manager Ad Action Cards & UI Resilience", () => {
  let originalDocument;
  let originalWindow;
  let docListeners;

  beforeEach(() => {
    docListeners = {};
    originalDocument = global.document;
    originalWindow = global.window;

    global.document = {
      createElement: (tag) => {
        if (tag === "canvas") return new MockCanvas(1280, 200);
        return new MockElement(tag);
      },
      addEventListener: (type, fn) => {
        if (!docListeners[type]) docListeners[type] = [];
        docListeners[type].push(fn);
      },
      dispatchEvent: (event) => {
        const type = typeof event === "string" ? event : event.type;
        const handlers = docListeners[type] || [];
        for (const h of handlers) h(event);
      },
      getElementById: () => null,
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  describe("createImageAdCard Framing Presets & Tag F", () => {
    test("initializes opaque portrait image to fit-blur and Tag F checked", () => {
      const messagesContainer = new MockElement("div");
      const chat = new ChatManager({ messagesContainer });

      const img = {
        naturalWidth: 1000,
        naturalHeight: 1414,
        width: 1000,
        height: 1414,
      };

      const card = chat.createImageAdCard(img, "mon-affiche.jpg");
      assert.ok(card);

      const activePreset = card.querySelector(".btn-preset.active");
      assert.ok(activePreset);
      assert.strictEqual(activePreset.dataset.mode, "fit-blur");

      const tagFCheckbox = card.querySelector(".ad-tag-f");
      assert.strictEqual(tagFCheckbox.checked, true, "Tag F must default to checked for opaque images");

      const filenamePreview = card.querySelector(".ad-filename-preview");
      assert.ok(filenamePreview.textContent.includes("-F-"), "Filename must include -F- tag");
    });

    test("recalculates Tag F state when switching presets if untouched by user", () => {
      const messagesContainer = new MockElement("div");
      const chat = new ChatManager({ messagesContainer });

      const img = { naturalWidth: 1000, naturalHeight: 1414 };
      const card = chat.createImageAdCard(img, "poster.png");
      const tagFCheckbox = card.querySelector(".ad-tag-f");
      const filenamePreview = card.querySelector(".ad-filename-preview");

      assert.strictEqual(tagFCheckbox.checked, true);

      // Preset 1: Switch to [Ajuster + Transparent] (fit-transparent)
      const presets = card.querySelectorAll(".btn-preset");
      const fitTransBtn = presets.find((b) => b.dataset.mode === "fit-transparent");
      assert.ok(fitTransBtn);

      // Make canvas mock transparent
      const canvas = card.querySelector("canvas");
      // Pixel data defaults to 0 (alpha = 0, transparent)
      fitTransBtn.click();

      assert.strictEqual(tagFCheckbox.checked, false, "Tag F must be recalculated to false for transparent framing");
      assert.ok(!filenamePreview.textContent.includes("-F-"), "Filename preview must omit -F-");

      // Preset 2: Switch back to [Ajuster + Flou] (fit-blur)
      const fitBlurBtn = presets.find((b) => b.dataset.mode === "fit-blur");
      // Fill canvas mock with opaque alpha
      for (let i = 3; i < canvas.ctx._pixelData.length; i += 4) {
        canvas.ctx._pixelData[i] = 255;
      }
      fitBlurBtn.click();

      assert.strictEqual(tagFCheckbox.checked, true, "Tag F must be recalculated to true for blur framing");
      assert.ok(filenamePreview.textContent.includes("-F-"));
    });

    test("strictly preserves manual user Tag F override when switching presets, editing inputs, and submitting", async () => {
      let confirmedPayload = null;
      const messagesContainer = new MockElement("div");
      const chat = new ChatManager({ messagesContainer });

      // Intercept executeConfirm
      chat.executeConfirm = async (card, action) => {
        confirmedPayload = action;
      };

      const img = { naturalWidth: 1000, naturalHeight: 1414 };
      const card = chat.createImageAdCard(img, "menu-automne.jpg");
      const tagFCheckbox = card.querySelector(".ad-tag-f");
      const durationInput = card.querySelector(".ad-duration");
      const slugInput = card.querySelector(".ad-slug");
      const filenamePreview = card.querySelector(".ad-filename-preview");
      const confirmBtn = card.querySelector(".btn-action-confirm");

      // Initially Tag F is checked
      assert.strictEqual(tagFCheckbox.checked, true);
      assert.ok(filenamePreview.textContent.includes("-F-"));

      // 1. USER MANUALLY UNCHECKS TAG F
      tagFCheckbox.checked = false;
      tagFCheckbox.dispatchEvent({ type: "change" });

      assert.strictEqual(tagFCheckbox.checked, false);
      assert.ok(!filenamePreview.textContent.includes("-F-"), "Filename must reflect user manual uncheck");

      // 2. User switches presets to [Remplir : Haut]
      const presets = card.querySelectorAll(".btn-preset");
      const fillTopBtn = presets.find((b) => b.dataset.mode === "fill-top");
      fillTopBtn.click();

      // Crucial: Tag F must NOT be blown away by preset switch!
      assert.strictEqual(tagFCheckbox.checked, false, "Manual Tag F override must be preserved across preset switches");
      assert.ok(!filenamePreview.textContent.includes("-F-"));

      // 3. User edits duration and slug
      durationInput.value = "20";
      durationInput.dispatchEvent({ type: "input" });
      slugInput.value = "menu-special";
      slugInput.dispatchEvent({ type: "input" });

      assert.strictEqual(tagFCheckbox.checked, false, "Manual Tag F override must be preserved across input edits");
      assert.strictEqual(filenamePreview.textContent, "20-menu-special.webp");

      // 4. User submits via [Publier sur GitHub 🚀]
      confirmBtn.click();

      assert.ok(confirmedPayload, "Must execute confirmation");
      assert.strictEqual(confirmedPayload.args.filename, "20-menu-special.webp", "Filename on submission must preserve manual Tag F uncheck");
    });

    test("activates 1:1 fill-center direct mode for images already measuring exactly 1280x200", () => {
      const messagesContainer = new MockElement("div");
      const chat = new ChatManager({ messagesContainer });

      // Opaque 1280x200
      const exactOpaque = { naturalWidth: 1280, naturalHeight: 200, width: 1280, height: 200 };
      const cardOpaque = chat.createImageAdCard(exactOpaque, "exact-banner.png");
      const activeOpaque = cardOpaque.querySelector(".btn-preset.active");
      assert.ok(activeOpaque);
      assert.strictEqual(activeOpaque.dataset.mode, "fill-center");
      assert.strictEqual(cardOpaque.querySelector(".ad-tag-f").checked, true);

      // Transparent 1280x200
      const exactTrans = { naturalWidth: 1280, naturalHeight: 200, isTransparent: true };
      const cardTrans = chat.createImageAdCard(exactTrans, "exact-transparent.png");
      const activeTrans = cardTrans.querySelector(".btn-preset.active");
      assert.ok(activeTrans);
      assert.strictEqual(activeTrans.dataset.mode, "fill-center");
      assert.strictEqual(cardTrans.querySelector(".ad-tag-f").checked, false);
    });
  });

  describe("createTextAdCard Dynamic Text Banner Generation", () => {
    test("initializes with Ambiance Café style, Tag F checked, and preserves manual Tag F override upon submission", async () => {
      let confirmedPayload = null;
      const messagesContainer = new MockElement("div");
      const chat = new ChatManager({ messagesContainer });
      chat.executeConfirm = async (card, action) => {
        confirmedPayload = action;
      };

      const action = {
        name: "propose_generate_text_ad",
        args: {
          text: "Fermeture exceptionnelle ce vendredi à 14h",
          style: "cafe",
          duration: 15,
          endDate: "2026-10-31",
          slug: "fermeture-vendredi",
        },
      };

      const card = await chat.createTextAdCard(action, "sha-123");
      assert.ok(card);

      const tagFCheckbox = card.querySelector(".ad-tag-f");
      const filenamePreview = card.querySelector(".ad-filename-preview");
      const textarea = card.querySelector(".text-ad-textarea");
      const confirmBtn = card.querySelector(".btn-action-confirm");

      assert.strictEqual(tagFCheckbox.checked, true);
      assert.strictEqual(filenamePreview.textContent, "15-20261031-F-fermeture-vendredi.webp");

      // User manually unchecks Tag F
      tagFCheckbox.checked = false;
      tagFCheckbox.dispatchEvent({ type: "change" });

      assert.strictEqual(filenamePreview.textContent, "15-20261031-fermeture-vendredi.webp");

      // Switch style to Panneau officiel
      const officialStyleBtn = card.querySelectorAll(".btn-style").find((b) => b.dataset.style === "official");
      assert.ok(officialStyleBtn);
      officialStyleBtn.click();

      // Tag F uncheck must be preserved
      assert.strictEqual(tagFCheckbox.checked, false, "Tag F uncheck must be preserved when switching style");
      assert.strictEqual(filenamePreview.textContent, "15-20261031-fermeture-vendredi.webp");

      // User submits
      confirmBtn.click();

      assert.ok(confirmedPayload);
      assert.strictEqual(confirmedPayload.args.filename, "15-20261031-fermeture-vendredi.webp");
    });
  });

  describe("Drag and Drop Resilience", () => {
    test("always calls preventDefault on drop event to prevent browser navigation, and handles non-image files with warning", () => {
      const messagesContainer = new MockElement("div");
      const chat = new ChatManager({ messagesContainer });
      chat.init();

      let preventDefaultCalled = false;
      const fakeDropEvent = {
        type: "drop",
        preventDefault: () => {
          preventDefaultCalled = true;
        },
        dataTransfer: {
          files: [
            {
              name: "document.pdf",
              type: "application/pdf",
              size: 50000,
            },
          ],
        },
      };

      global.document.dispatchEvent(fakeDropEvent);

      assert.strictEqual(preventDefaultCalled, true, "preventDefault must be called on drop to prevent SPA navigation loss");
      assert.ok(
        messagesContainer.children.length > 0,
        "Must render a bot warning message for non-image file"
      );
      const text = messagesContainer.textContent;
      assert.ok(text.includes("document.pdf"));
      assert.ok(text.includes("n'est pas une image valide"));
    });
  });
});
