/**
 * tests/unit/version-consistency.test.js
 * Validates that version strings across package.json, index.html, sw.js, and github.js are strictly synchronized.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

describe("Version Consistency across Project", () => {
  test("package.json, public/index.html, public/sw.js, functions/api/_lib/github.js, and README.md are synchronized", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
    const version = pkg.version;
    assert.ok(version, "package.json must specify a version");

    const indexHtml = fs.readFileSync(path.join(rootDir, "public/index.html"), "utf-8");
    assert.ok(
      indexHtml.includes(`id="footer-version">v${version}</span>`),
      `public/index.html must display v${version}`
    );

    const swJs = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
    assert.ok(
      swJs.includes(`const CACHE_NAME = 'kiosk-chatops-v${version}';`),
      `public/sw.js must define cache kiosk-chatops-v${version}`
    );

    const githubJs = fs.readFileSync(path.join(rootDir, "functions/api/_lib/github.js"), "utf-8");
    assert.ok(
      githubJs.includes(`"User-Agent": "TrainStation-ChatOps/${version}"`),
      `functions/api/_lib/github.js must have User-Agent TrainStation-ChatOps/${version}`
    );

    const readme = fs.readFileSync(path.join(rootDir, "README.md"), "utf-8");
    assert.ok(
      readme.includes(`v${version}`),
      `README.md must mention v${version}`
    );
  });
});
