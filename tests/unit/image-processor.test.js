/**
 * tests/unit/image-processor.test.js
 * Unit test suite for client-side Canvas ad image processor:
 * - fitWithMargins (Cover-scaled blur without distortion, transparent margins, opaque base)
 * - cropFill (top, center, bottom anchors, 1:1 exact mode)
 * - isImageOpaque (sampling, bottom-band weighting, 98% threshold, arbitrary dimensions)
 * - fitTextToBox & generateTextBanner (dynamic scaling 24px-72px, forced word-breaking, 140 chars)
 * - sanitizeSlug & buildAdFilename
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fitWithMargins,
  cropFill,
  isImageOpaque,
  ensureFontLoaded,
  fitTextToBox,
  generateTextBanner,
  sanitizeSlug,
  buildAdFilename,
} from "../../public/js/image-processor.js";

/**
 * Lightweight mock 2D Context for Canvas testing in Node.js
 */
class MockContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.calls = [];
    this.fillStyle = "#000000";
    this.filter = "none";
    this.font = "10px sans-serif";
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
    this._savedStates = [];
    this._pixelData = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }

  save() {
    this.calls.push({ method: "save" });
    this._savedStates.push({ filter: this.filter, fillStyle: this.fillStyle });
  }

  restore() {
    this.calls.push({ method: "restore" });
    const s = this._savedStates.pop();
    if (s) {
      this.filter = s.filter;
      this.fillStyle = s.fillStyle;
    }
  }

  fillRect(x, y, w, h) {
    this.calls.push({ method: "fillRect", x, y, w, h, fillStyle: this.fillStyle });
    for (let py = Math.max(0, y); py < Math.min(this.canvas.height, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(this.canvas.width, x + w); px++) {
        const idx = (py * this.canvas.width + px) * 4;
        this._pixelData[idx] = 26;
        this._pixelData[idx + 1] = 32;
        this._pixelData[idx + 2] = 44;
        this._pixelData[idx + 3] = 255; // 100% opaque alpha
      }
    }
  }

  clearRect(x, y, w, h) {
    this.calls.push({ method: "clearRect", x, y, w, h });
    for (let py = Math.max(0, y); py < Math.min(this.canvas.height, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(this.canvas.width, x + w); px++) {
        const idx = (py * this.canvas.width + px) * 4;
        this._pixelData[idx + 3] = 0; // alpha = 0
      }
    }
  }

  drawImage(img, ...args) {
    this.calls.push({ method: "drawImage", img, args, filter: this.filter });
  }

  fillText(text, x, y) {
    this.calls.push({ method: "fillText", text, x, y, font: this.font, fillStyle: this.fillStyle });
  }

  measureText(text) {
    const match = /(\d+)px/.exec(this.font);
    const size = match ? parseInt(match[1], 10) : 16;
    // Approximates character width based on current font size
    return { width: text.length * (size * 0.55) };
  }

  getImageData(x, y, w, h) {
    return {
      width: w,
      height: h,
      data: this._pixelData,
    };
  }
}

class MockCanvas {
  constructor(width = 1280, height = 200) {
    this.width = width;
    this.height = height;
    this.ctx = new MockContext2D(this);
  }

  getContext(type) {
    if (type === "2d") return this.ctx;
    return null;
  }

  toDataURL(type = "image/webp", quality = 0.92) {
    return `data:${type};base64,mockWebpData`;
  }
}

describe("Image Processor & Canvas Engine", () => {
  describe("fitWithMargins Preset (Letterbox with Cover Blur or Transparent Margins)", () => {
    test("preserves aspect ratio without horizontal distortion on A4 portrait image (1000x1414) with blur", () => {
      const img = {
        naturalWidth: 1000,
        naturalHeight: 1414,
        width: 1000,
        height: 1414,
      };
      const canvas = new MockCanvas(1280, 200);
      fitWithMargins(img, { blurBackground: true, canvas });

      const ctx = canvas.getContext("2d");
      const drawCalls = ctx.calls.filter((c) => c.method === "drawImage");
      assert.strictEqual(drawCalls.length, 2, "must have 2 drawImage calls (background blur + foreground)");

      // 1. Background Cover Blur call
      const bgCall = drawCalls[0];
      const [bgX, bgY, bgW, bgH] = bgCall.args;
      const expectedCoverScale = Math.max(1360 / 1000, 280 / 1414); // 1.36
      assert.strictEqual(bgW, 1000 * expectedCoverScale);
      assert.strictEqual(bgH, 1414 * expectedCoverScale);
      // Verify aspect ratio preservation (no 7x stretching bug!)
      assert.strictEqual(Math.round((bgW / bgH) * 1000), Math.round((1000 / 1414) * 1000));
      assert.strictEqual(bgX, (1280 - bgW) / 2);
      assert.strictEqual(bgY, (200 - bgH) / 2);
      assert.ok(bgCall.filter.includes("blur(20px)"), "must apply blur filter");

      // Verify base fillRect with #1a202c
      const fillRectCalls = ctx.calls.filter((c) => c.method === "fillRect");
      assert.strictEqual(fillRectCalls.length, 1);
      assert.strictEqual(fillRectCalls[0].fillStyle, "#1a202c");
      assert.strictEqual(fillRectCalls[0].w, 1280);
      assert.strictEqual(fillRectCalls[0].h, 200);

      // 2. Foreground Contain call
      const fgCall = drawCalls[1];
      const [fgX, fgY, fgW, fgH] = fgCall.args;
      const expectedContainScale = Math.min(1280 / 1000, 200 / 1414); // 200 / 1414
      assert.strictEqual(fgH, 200);
      assert.strictEqual(fgW, 1000 * expectedContainScale);
      assert.strictEqual(fgX, (1280 - fgW) / 2);
      assert.strictEqual(fgY, 0);

      // Verify resulting canvas is 100% opaque
      assert.strictEqual(isImageOpaque(ctx, 1280, 200), true);
    });

    test("fitWithMargins with blurBackground: false clears background to transparent margins", () => {
      const img = {
        naturalWidth: 800,
        naturalHeight: 600,
        width: 800,
        height: 600,
      };
      const canvas = new MockCanvas(1280, 200);
      fitWithMargins(img, { blurBackground: false, canvas });

      const ctx = canvas.getContext("2d");
      const clearCalls = ctx.calls.filter((c) => c.method === "clearRect");
      assert.strictEqual(clearCalls.length, 1);
      assert.strictEqual(clearCalls[0].w, 1280);
      assert.strictEqual(clearCalls[0].h, 200);

      const drawCalls = ctx.calls.filter((c) => c.method === "drawImage");
      assert.strictEqual(drawCalls.length, 1, "only 1 drawImage call for transparent margin mode");
    });
  });

  describe("cropFill Preset (Cover Cropping)", () => {
    test("anchors top, center, and bottom vertical crop correctly", () => {
      const img = {
        naturalWidth: 1000,
        naturalHeight: 1414,
        width: 1000,
        height: 1414,
      };
      const scale = Math.max(1280 / 1000, 200 / 1414); // 1.28
      const drawW = 1000 * scale; // 1280
      const drawH = 1414 * scale; // 1809.92

      // Top anchor
      const canvasTop = new MockCanvas(1280, 200);
      cropFill(img, "top", { canvas: canvasTop });
      const topCalls = canvasTop.getContext("2d").calls.filter((c) => c.method === "drawImage");
      assert.strictEqual(topCalls[0].args[1], 0, "top anchor must have drawY = 0");

      // Center anchor
      const canvasCenter = new MockCanvas(1280, 200);
      cropFill(img, "center", { canvas: canvasCenter });
      const centerCalls = canvasCenter.getContext("2d").calls.filter((c) => c.method === "drawImage");
      assert.strictEqual(centerCalls[0].args[1], (200 - drawH) / 2, "center anchor must be vertically centered");

      // Bottom anchor
      const canvasBottom = new MockCanvas(1280, 200);
      cropFill(img, "bottom", { canvas: canvasBottom });
      const bottomCalls = canvasBottom.getContext("2d").calls.filter((c) => c.method === "drawImage");
      assert.strictEqual(bottomCalls[0].args[1], 200 - drawH, "bottom anchor must have drawY = 200 - drawH");
    });

    test("1:1 direct mode for images already measuring exactly 1280x200", () => {
      const img = {
        naturalWidth: 1280,
        naturalHeight: 200,
        width: 1280,
        height: 200,
      };
      const canvas = new MockCanvas(1280, 200);
      cropFill(img, "center", { canvas });

      const drawCalls = canvas.getContext("2d").calls.filter((c) => c.method === "drawImage");
      assert.strictEqual(drawCalls.length, 1);
      const [x, y, w, h] = drawCalls[0].args;
      assert.strictEqual(x, 0);
      assert.strictEqual(y, 0);
      assert.strictEqual(w, 1280);
      assert.strictEqual(h, 200);
    });
  });

  describe("isImageOpaque (Opacity Detector with Bottom-Band Weighting)", () => {
    test("detects fully opaque images (alpha >= 240 on 100% pixels)", () => {
      const canvas = new MockCanvas(1280, 200);
      const ctx = canvas.getContext("2d");
      // Fill all pixels with opaque alpha 255
      for (let i = 3; i < ctx._pixelData.length; i += 4) {
        ctx._pixelData[i] = 255;
      }
      assert.strictEqual(isImageOpaque(ctx, 1280, 200), true);
    });

    test("detects transparent bottom band (y >= height * 0.7) and returns false", () => {
      const canvas = new MockCanvas(1280, 200);
      const ctx = canvas.getContext("2d");
      // Top 70% is opaque (alpha 255), bottom 30% is transparent (alpha 0)
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 1280; x++) {
          const idx = (y * 1280 + x) * 4;
          ctx._pixelData[idx + 3] = y < 140 ? 255 : 0;
        }
      }
      assert.strictEqual(isImageOpaque(ctx, 1280, 200), false);
    });

    test("handles arbitrary dimensions (e.g. 800x800) using explicit parameters", () => {
      const canvas = new MockCanvas(800, 800);
      const ctx = canvas.getContext("2d");
      for (let i = 3; i < ctx._pixelData.length; i += 4) {
        ctx._pixelData[i] = 255;
      }
      assert.strictEqual(isImageOpaque(ctx, 800, 800), true);
    });

    test("respects 98% threshold (99% opaque passes, 95% opaque fails)", () => {
      const canvas = new MockCanvas(100, 100);
      const ctx = canvas.getContext("2d");

      // 99% opaque
      for (let i = 3; i < ctx._pixelData.length; i += 4) {
        ctx._pixelData[i] = (i / 4 < ctx._pixelData.length / 4 * 0.99) ? 255 : 100;
      }
      assert.strictEqual(isImageOpaque(ctx, 100, 100), true);

      // 95% opaque
      for (let i = 3; i < ctx._pixelData.length; i += 4) {
        ctx._pixelData[i] = (i / 4 < ctx._pixelData.length / 4 * 0.95) ? 255 : 100;
      }
      assert.strictEqual(isImageOpaque(ctx, 100, 100), false);
    });
  });

  describe("fitTextToBox & generateTextBanner", () => {
    test("fits 140 character text message without vertical or horizontal overflow", () => {
      const canvas = new MockCanvas(1280, 200);
      const ctx = canvas.getContext("2d");
      const longMessage = "La Station Genval : Venez profiter de notre terrasse ensoleillée ce vendredi avec café offert pour l'achat de 2 viennoiseries artisanales !";
      assert.ok(longMessage.length <= 140);

      const result = fitTextToBox(ctx, longMessage, 1160, 160, 72, 24, "Quicksand");
      assert.ok(result.fontSize >= 24 && result.fontSize <= 72, `fontSize was ${result.fontSize}`);
      assert.ok(result.totalHeight <= 160, `totalHeight was ${result.totalHeight}`);
      assert.ok(result.lines.length >= 1);
    });

    test("forces word breaking for ultra-long words/URLs exceeding maxWidth", () => {
      const canvas = new MockCanvas(1280, 200);
      const ctx = canvas.getContext("2d");
      const urlWord = "https://train-station-timetable.pages.dev/very/long/path/with/lots/of/slashes/and/dashes/that/cannot/fit/on/a/single/line/and/must/be/broken";
      const result = fitTextToBox(ctx, urlWord, 1160, 160, 72, 24, "Quicksand");

      assert.ok(result.lines.length > 1, "must break long word into multiple lines");
      for (const line of result.lines) {
        ctx.font = `700 ${result.fontSize}px Quicksand`;
        assert.ok(ctx.measureText(line).width <= 1160, `line "${line}" exceeded 1160px`);
      }
    });

    test("generateTextBanner sets default café colors and fills background", () => {
      const canvas = new MockCanvas(1280, 200);
      generateTextBanner({
        text: "Pause Café à La Station ☕",
        style: "cafe",
        canvas,
      });

      const ctx = canvas.getContext("2d");
      const fillRects = ctx.calls.filter((c) => c.method === "fillRect");
      assert.strictEqual(fillRects.length, 1);
      assert.strictEqual(fillRects[0].fillStyle, "#2c1810");

      const textCalls = ctx.calls.filter((c) => c.method === "fillText");
      assert.ok(textCalls.length >= 1);
      assert.strictEqual(textCalls[0].fillStyle, "#fef3c7");
    });

    test("generateTextBanner supports official station style", () => {
      const canvas = new MockCanvas(1280, 200);
      generateTextBanner({
        text: "Information Voyageurs : Gare de Genval",
        style: "official",
        canvas,
      });

      const ctx = canvas.getContext("2d");
      const fillRects = ctx.calls.filter((c) => c.method === "fillRect");
      assert.strictEqual(fillRects[0].fillStyle, "#1a365d");
    });
  });

  describe("sanitizeSlug & buildAdFilename", () => {
    test("sanitizeSlug strips accents, converts to lowercase, and replaces special chars with dashes", () => {
      assert.strictEqual(sanitizeSlug("Événement Spécial 2026!"), "evenement-special-2026");
      assert.strictEqual(sanitizeSlug("  ---Café & Croissants---  "), "cafe-croissants");
      assert.strictEqual(sanitizeSlug("PROMO_PRINTEMPS"), "promo_printemps");
      assert.strictEqual(sanitizeSlug(""), "");
      assert.strictEqual(sanitizeSlug(null), "");
    });

    test("buildAdFilename formats correctly for all tag F and expiration combinations", () => {
      // 1. duration + slug (no date, no tag F)
      assert.strictEqual(
        buildAdFilename({ duration: 15, slug: "croissant" }),
        "15-croissant.webp"
      );

      // 2. duration + expiry date + slug
      assert.strictEqual(
        buildAdFilename({ duration: 15, expiryDate: "2026-10-31", slug: "promo" }),
        "15-20261031-promo.webp"
      );

      // 3. duration + Tag F + slug
      assert.strictEqual(
        buildAdFilename({ duration: 15, isOpaque: true, slug: "affiche" }),
        "15-F-affiche.webp"
      );

      // 4. duration + expiry date + Tag F + slug
      assert.strictEqual(
        buildAdFilename({ duration: 20, expiryDate: "20261225", isOpaque: true, slug: "noel" }),
        "20-20261225-F-noel.webp"
      );

      // 5. Negative, zero, or invalid duration defaults safely to 15
      assert.strictEqual(
        buildAdFilename({ duration: -5, slug: "test" }),
        "15-test.webp"
      );
      assert.strictEqual(
        buildAdFilename({ duration: 0, slug: "test" }),
        "15-test.webp"
      );
      assert.strictEqual(
        buildAdFilename({ duration: "not-a-number", slug: "test" }),
        "15-test.webp"
      );

      // 6. ISO timestamp and date parsing resilience
      assert.strictEqual(
        buildAdFilename({ duration: 15, expiryDate: "2026-10-31T00:00:00Z", slug: "iso" }),
        "15-20261031-iso.webp"
      );
      assert.strictEqual(
        buildAdFilename({ duration: 15, expiryDate: "invalid-date", slug: "clean" }),
        "15-clean.webp"
      );
    });
  });

  describe("Edge cases, Null Guards & Font Loading Resilience", () => {
    test("fitTextToBox preserves explicit paragraph newlines", () => {
      const canvas = new MockCanvas(1280, 200);
      const ctx = canvas.getContext("2d");
      const textWithNewlines = "Fermeture Exceptionnelle\nVendredi 15 mai\nDe 14h à 18h";

      const res = fitTextToBox(ctx, textWithNewlines, 1160, 160, 72, 24, "Quicksand");
      assert.ok(res.lines.length >= 3, `Expected at least 3 lines, got ${res.lines.length}`);
      assert.strictEqual(res.lines[0], "Fermeture Exceptionnelle");
      assert.strictEqual(res.lines[1], "Vendredi 15 mai");
      assert.strictEqual(res.lines[2], "De 14h à 18h");
    });

    test("fitTextToBox handles empty, whitespace, and null ctx safely", () => {
      const canvas = new MockCanvas(1280, 200);
      const ctx = canvas.getContext("2d");

      assert.strictEqual(fitTextToBox(ctx, "").lines.length, 0);
      assert.strictEqual(fitTextToBox(ctx, "   \n\n   ").lines.length, 0);
      assert.strictEqual(fitTextToBox(null, "Test").lines.length, 0);
    });

    test("fitWithMargins and cropFill safely handle null/invalid inputs without throwing", () => {
      const emptyCanvas = { getContext: () => null };
      assert.strictEqual(fitWithMargins(null, { canvas: emptyCanvas }), emptyCanvas);
      assert.strictEqual(fitWithMargins({ width: 0, height: 0 }, { canvas: emptyCanvas }), emptyCanvas);
      assert.strictEqual(cropFill(null, "center", { canvas: emptyCanvas }), emptyCanvas);
      assert.strictEqual(cropFill({ width: -10, height: 0 }, "center", { canvas: emptyCanvas }), emptyCanvas);
    });

    test("isImageOpaque handles null context and zero dimensions safely", () => {
      assert.strictEqual(isImageOpaque(null, 1280, 200), false);
      assert.strictEqual(isImageOpaque({}, 1280, 200), false);
      const canvas = new MockCanvas(1280, 200);
      assert.strictEqual(isImageOpaque(canvas.getContext("2d"), 0, 200), false);
      assert.strictEqual(isImageOpaque(canvas.getContext("2d"), 1280, -10), false);
    });

    test("ensureFontLoaded completes or times out safely without hanging", async () => {
      // In Node environment without document.fonts, it resolves immediately
      await assert.doesNotReject(ensureFontLoaded('700 48px "Quicksand"', 50));
    });

    test("source image sampling distinguishes between opaque portrait posters and transparent logos", () => {
      // 1. Opaque portrait poster (1000x1414)
      const posterCanvas = new MockCanvas(320, 200);
      const posterCtx = posterCanvas.getContext("2d");
      for (let i = 3; i < posterCtx._pixelData.length; i += 4) {
        posterCtx._pixelData[i] = 255;
      }
      assert.strictEqual(isImageOpaque(posterCtx, 320, 200), true, "sampled opaque poster must be true");

      // 2. Transparent logo (320x200 with 50% transparent margins)
      const logoCanvas = new MockCanvas(320, 200);
      const logoCtx = logoCanvas.getContext("2d");
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 320; x++) {
          const idx = (y * 320 + x) * 4;
          // only center 100px is opaque, outer is transparent
          logoCtx._pixelData[idx + 3] = (x > 100 && x < 220) ? 255 : 0;
        }
      }
      assert.strictEqual(isImageOpaque(logoCtx, 320, 200), false, "sampled transparent logo must be false");
    });
  });
});
