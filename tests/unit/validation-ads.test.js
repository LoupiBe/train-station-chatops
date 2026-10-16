/**
 * tests/unit/validation-ads.test.js
 * Unit test suite for ad banner validation:
 * - validateNewAdFilename (strict lowercase, .webp format)
 * - validateExistingAdFilename (historical format tolerance, anti-traversal, anti-duplicate disabled-)
 * - isWebPBase64 (RIFF/WEBP magic bytes verification)
 * - validateAction for upload_ad and disable_ad
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateNewAdFilename,
  validateExistingAdFilename,
  isWebPBase64,
  validateAction,
} from "../../functions/api/_lib/validation.js";

// Helper to create a valid minimal 16-byte WebP header in Base64
function createMockWebPBase64(extraBytes = 0) {
  const header = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x20, 0x00, 0x00, 0x00, // file size (little-endian)
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20, // "VP8 "
  ]);
  if (extraBytes > 0) {
    const payload = Buffer.alloc(Math.floor(extraBytes));
    return Buffer.concat([header, payload]).toString("base64");
  }
  return header.toString("base64");
}

describe("Advertisement Banners Backend Validation", () => {
  describe("validateNewAdFilename (Strict Convention for New Uploads)", () => {
    test("accepts valid new ad filenames with various tag configurations", () => {
      // 1. duration + slug
      assert.strictEqual(validateNewAdFilename("15-test.webp"), true);
      assert.strictEqual(validateNewAdFilename("30-croissant-chaud.webp"), true);

      // 2. duration + expiry date + slug
      assert.strictEqual(validateNewAdFilename("15-20261031-evenement.webp"), true);
      assert.strictEqual(validateNewAdFilename("20-20261225-fermeture-noel.webp"), true);

      // 3. duration + Tag F (opaque background) + slug
      assert.strictEqual(validateNewAdFilename("15-F-affiche-opaque.webp"), true);
      assert.strictEqual(validateNewAdFilename("10-F-menu-automne.webp"), true);

      // 4. duration + expiry date + Tag F + slug
      assert.strictEqual(validateNewAdFilename("15-20261031-F-promo-croissant.webp"), true);
      assert.strictEqual(validateNewAdFilename("60-20270101-F-bonne-annee_2027.webp"), true);
      assert.strictEqual(validateNewAdFilename("  15-20261031-F-promo-croissant.webp  "), true);
    });

    test("strictly rejects filenames with uppercase characters or non-webp extensions", () => {
      // Uppercase extension
      assert.strictEqual(validateNewAdFilename("15-test.WEBP"), false);
      assert.strictEqual(validateNewAdFilename("15-test.WebP"), false);

      // Uppercase slug
      assert.strictEqual(validateNewAdFilename("15-Promo.webp"), false);
      assert.strictEqual(validateNewAdFilename("15-PROMO.webp"), false);
      assert.strictEqual(validateNewAdFilename("15-F-Affiche.webp"), false);

      // Non-webp extensions
      assert.strictEqual(validateNewAdFilename("15-test.png"), false);
      assert.strictEqual(validateNewAdFilename("15-test.jpg"), false);
      assert.strictEqual(validateNewAdFilename("15-test.jpeg"), false);
      assert.strictEqual(validateNewAdFilename("15-test.gif"), false);
    });

    test("strictly rejects malformed patterns, path traversal and invalid characters", () => {
      assert.strictEqual(validateNewAdFilename(""), false);
      assert.strictEqual(validateNewAdFilename(null), false);
      assert.strictEqual(validateNewAdFilename(undefined), false);
      assert.strictEqual(validateNewAdFilename(123), false);

      // Spaces and special characters
      assert.strictEqual(validateNewAdFilename("15-affiche test.webp"), false);
      assert.strictEqual(validateNewAdFilename("15-affiche@2026.webp"), false);
      assert.strictEqual(validateNewAdFilename("15-affiche!.webp"), false);

      // Path traversal
      assert.strictEqual(validateNewAdFilename("../15-test.webp"), false);
      assert.strictEqual(validateNewAdFilename("/15-test.webp"), false);
      assert.strictEqual(validateNewAdFilename("ads/15-test.webp"), false);

      // Missing duration or slug
      assert.strictEqual(validateNewAdFilename("-test.webp"), false);
      assert.strictEqual(validateNewAdFilename("test.webp"), false);
      assert.strictEqual(validateNewAdFilename("15-.webp"), false);
      assert.strictEqual(validateNewAdFilename("15-F-.webp"), false);
    });
  });

  describe("validateExistingAdFilename (Tolerant for Disabling Existing Files)", () => {
    test("accepts historical filenames present in the timetable repository", () => {
      assert.strictEqual(validateExistingAdFilename("4-logo_laStation.webp"), true);
      assert.strictEqual(validateExistingAdFilename("20-20261011-F-randotourix.jpg"), true);
      assert.strictEqual(validateExistingAdFilename("15-20261231-FULL-affiche.png"), true);
      assert.strictEqual(validateExistingAdFilename("5-F-logo.webp"), true);
      assert.strictEqual(validateExistingAdFilename("10-20261011-randotourix.jpg"), true);
      assert.strictEqual(validateExistingAdFilename("10-20261011-f-lowercase.jpg"), true);
      assert.strictEqual(validateExistingAdFilename("10-full-banner.jpg"), true);
    });

    test("strictly rejects already disabled files to prevent disabled-disabled-... stacking", () => {
      assert.strictEqual(validateExistingAdFilename("disabled-4-logo_laStation.webp"), false);
      assert.strictEqual(validateExistingAdFilename("Disabled-4-logo_laStation.webp"), false);
      assert.strictEqual(validateExistingAdFilename("DISABLED-20-20261011-F-randotourix.jpg"), false);
      assert.strictEqual(validateExistingAdFilename("  disabled-4-logo_laStation.webp  "), false);
      assert.strictEqual(validateExistingAdFilename("off-banner.webp"), false);
      assert.strictEqual(validateExistingAdFilename("OFF-banner.webp"), false);
      assert.strictEqual(validateExistingAdFilename("_archived.png"), false);
    });

    test("strictly rejects path traversal and non-image extensions", () => {
      assert.strictEqual(validateExistingAdFilename("../schedule.json"), false);
      assert.strictEqual(validateExistingAdFilename("..\\schedule.json"), false);
      assert.strictEqual(validateExistingAdFilename("sub/4-logo_laStation.webp"), false);
      assert.strictEqual(validateExistingAdFilename("4-logo_laStation.txt"), false);
      assert.strictEqual(validateExistingAdFilename("4-logo_laStation.exe"), false);
      assert.strictEqual(validateExistingAdFilename(""), false);
      assert.strictEqual(validateExistingAdFilename(null), false);
    });
  });

  describe("isWebPBase64 (Magic Bytes Detector)", () => {
    test("detects valid RIFF/WEBP header with and without data URL prefix", () => {
      const rawWebpB64 = createMockWebPBase64();
      assert.strictEqual(isWebPBase64(rawWebpB64), true);

      const prefixedWebpB64 = `data:image/webp;base64,${rawWebpB64}`;
      assert.strictEqual(isWebPBase64(prefixedWebpB64), true);

      // Hyphenated mime type prefix
      const xWebpB64 = `data:image/x-webp;base64,${rawWebpB64}`;
      assert.strictEqual(isWebPBase64(xWebpB64), true);

      // Base64 lengths where length % 4 === 1 (e.g. 17 chars) must not throw InvalidCharacterError
      const base17 = rawWebpB64.slice(0, 16) + "A";
      assert.strictEqual(isWebPBase64(base17), true);

      const base21 = rawWebpB64.slice(0, 20) + "A";
      assert.strictEqual(isWebPBase64(base21), true);
    });

    test("rejects non-WebP payloads (PNG, JPEG, arbitrary text)", () => {
      // PNG header: 89 50 4E 47 0D 0A 1A 0A
      const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]).toString("base64");
      assert.strictEqual(isWebPBase64(pngB64), false);

      // JPEG header: FF D8 FF E0
      const jpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString("base64");
      assert.strictEqual(isWebPBase64(jpegB64), false);

      // Plain text
      const textB64 = Buffer.from("Hello World, this is not an image").toString("base64");
      assert.strictEqual(isWebPBase64(textB64), false);

      assert.strictEqual(isWebPBase64(""), false);
      assert.strictEqual(isWebPBase64(null), false);
    });
  });

  describe("validateAction for Ad Operations", () => {
    test("validates upload_ad with valid filename, content and WebP magic bytes", () => {
      const validPayload = {
        filename: "15-20261031-F-croissant.webp",
        content: createMockWebPBase64(100),
      };
      const res = validateAction("upload_ad", validPayload);
      assert.strictEqual(res.valid, true);

      // Accepts data:image/x-webp;base64,... prefix
      const xWebpPayload = {
        filename: "15-croissant.webp",
        content: `data:image/x-webp;base64,${createMockWebPBase64(50)}`,
      };
      assert.strictEqual(validateAction("upload_ad", xWebpPayload).valid, true);
    });

    test("rejects upload_ad with invalid filename", () => {
      const invalidNamePayload = {
        filename: "15-Croissant.webp",
        content: createMockWebPBase64(),
      };
      const res = validateAction("upload_ad", invalidNamePayload);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes("Nom de fichier"));
    });

    test("rejects upload_ad with missing or non-string content", () => {
      const res1 = validateAction("upload_ad", { filename: "15-test.webp" });
      assert.strictEqual(res1.valid, false);

      const res2 = validateAction("upload_ad", { filename: "15-test.webp", content: "" });
      assert.strictEqual(res2.valid, false);
    });

    test("rejects upload_ad with non-WebP content (e.g. fake image)", () => {
      const fakeContent = Buffer.from("this is not a webp image").toString("base64");
      const res = validateAction("upload_ad", {
        filename: "15-test.webp",
        content: fakeContent,
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes("WebP valide"));
    });

    test("rejects upload_ad with oversized payload (> 1 MB)", () => {
      // 1.2 MB payload
      const largeB64 = createMockWebPBase64(1.2 * 1024 * 1024);
      const res = validateAction("upload_ad", {
        filename: "15-large.webp",
        content: largeB64,
      });
      assert.strictEqual(res.valid, false);
      assert.ok(res.error.includes("1 Mo"));
    });

    test("validates disable_ad with historical filenames", () => {
      const res1 = validateAction("disable_ad", { filename: "20-20261011-F-randotourix.jpg" });
      assert.strictEqual(res1.valid, true);

      const res2 = validateAction("disable_ad", { filename: "4-logo_laStation.webp" });
      assert.strictEqual(res2.valid, true);
    });

    test("rejects disable_ad for already disabled files and traversal attempts", () => {
      const res1 = validateAction("disable_ad", { filename: "disabled-4-logo_laStation.webp" });
      assert.strictEqual(res1.valid, false);
      assert.ok(res1.error.includes("invalide ou fichier déjà désactivé"));

      const res2 = validateAction("disable_ad", { filename: "../4-logo_laStation.webp" });
      assert.strictEqual(res2.valid, false);
    });
  });
});
