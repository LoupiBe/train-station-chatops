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

  test("all assets declared in public/sw.js APP_SHELL exist on disk in public/", () => {
    const swContent = fs.readFileSync(path.join(rootDir, "public/sw.js"), "utf-8");
    const appShellMatch = swContent.match(/const APP_SHELL = \[([\s\S]*?)\];/);
    assert.ok(appShellMatch, "public/sw.js must define APP_SHELL array");

    const urls = appShellMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("'") || line.startsWith('"'))
      .map((line) => line.replace(/['",]/g, "").trim());

    assert.ok(urls.length >= 10, "APP_SHELL must contain core application assets");
    assert.ok(urls.includes("/js/image-processor.js"), "APP_SHELL must include image-processor.js");
    assert.ok(urls.includes("/fonts/quicksand-bold.woff2"), "APP_SHELL must include quicksand-bold.woff2");

    for (const url of urls) {
      const relPath = url === "/" ? "index.html" : url.replace(/^\//, "");
      const fullPath = path.join(rootDir, "public", relPath);
      assert.ok(
        fs.existsSync(fullPath),
        `Asset declared in APP_SHELL does not exist on disk: ${url} (checked: ${fullPath})`
      );
    }
  });
});
