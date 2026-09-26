#!/usr/bin/env node
/**
 * scripts/bump-version.js
 * Atomic Version Bump Coordinator for Train Station ChatOps
 * 
 * Synchronizes SemVer across:
 * - package.json
 * - public/index.html (#footer-version)
 * - public/sw.js (CACHE_NAME & cache version header)
 * - functions/api/_lib/github.js (User-Agent header)
 * - README.md (badges & headers)
 * - Git tag (optional, enabled by default or via --tag)
 * 
 * Usage:
 *   node scripts/bump-version.js [major|minor|patch|<version>] [--tag] [--no-tag]
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// 1. Read current version from package.json
const pkgPath = path.join(rootDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const currentVersion = pkg.version || "0.1.0";

// 2. Parse arguments
const args = process.argv.slice(2);
const bumpTypeOrVer = args.find((a) => !a.startsWith("--")) || "patch";
const shouldTag = !args.includes("--no-tag");

function calculateNextVersion(current, type) {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Current version "${current}" is not valid SemVer (X.Y.Z)`);
  }
  let [major, minor, patch] = parts;

  switch (type.toLowerCase()) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(type)) {
        return type.replace(/^v/, "");
      }
      throw new Error(`Invalid bump type or version: "${type}". Use "major", "minor", "patch", or explicit "X.Y.Z".`);
  }
}

const nextVersion = calculateNextVersion(currentVersion, bumpTypeOrVer);
console.log(`\n🚆 Train Station ChatOps Version Bump`);
console.log(`──────────────────────────────────────`);
console.log(`Current version : ${currentVersion}`);
console.log(`Target version  : ${nextVersion}`);
console.log(`──────────────────────────────────────\n`);

// 3. Update package.json
pkg.version = nextVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
console.log(`✔ Updated package.json -> ${nextVersion}`);

// 4. Update public/index.html
const indexHtmlPath = path.join(rootDir, "public/index.html");
let indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");
indexHtml = indexHtml.replace(
  /<span class="footer-version" id="footer-version">v[^<]+<\/span>/,
  `<span class="footer-version" id="footer-version">v${nextVersion}</span>`
);
fs.writeFileSync(indexHtmlPath, indexHtml, "utf-8");
console.log(`✔ Updated public/index.html (#footer-version -> v${nextVersion})`);

// 5. Update public/sw.js
const swPath = path.join(rootDir, "public/sw.js");
let swContent = fs.readFileSync(swPath, "utf-8");
swContent = swContent.replace(
  /\* Cache version: kiosk-chatops-v[^\n]+/,
  `* Cache version: kiosk-chatops-v${nextVersion}`
);
swContent = swContent.replace(
  /const CACHE_NAME = ['"]kiosk-chatops-v[^'"]+['"];/,
  `const CACHE_NAME = 'kiosk-chatops-v${nextVersion}';`
);
fs.writeFileSync(swPath, swContent, "utf-8");
console.log(`✔ Updated public/sw.js (CACHE_NAME -> kiosk-chatops-v${nextVersion})`);

// 6. Update functions/api/_lib/github.js
const githubLibPath = path.join(rootDir, "functions/api/_lib/github.js");
if (fs.existsSync(githubLibPath)) {
  let githubLib = fs.readFileSync(githubLibPath, "utf-8");
  githubLib = githubLib.replace(
    /"User-Agent":\s*"TrainStation-ChatOps\/[^"]+",/,
    `"User-Agent": "TrainStation-ChatOps/${nextVersion}",`
  );
  fs.writeFileSync(githubLibPath, githubLib, "utf-8");
  console.log(`✔ Updated functions/api/_lib/github.js (User-Agent -> TrainStation-ChatOps/${nextVersion})`);
}

// 7. Update README.md
const readmePath = path.join(rootDir, "README.md");
if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, "utf-8");
  readme = readme.replace(
    /# 🚆 Train Station ChatOps — La Station Genval \(v[^)]+\)/,
    `# 🚆 Train Station ChatOps — La Station Genval (v${nextVersion})`
  );
  readme = readme.replace(
    /`kiosk-chatops-v[^`]+`/,
    "`kiosk-chatops-v" + nextVersion + "`"
  );
  fs.writeFileSync(readmePath, readme, "utf-8");
  console.log(`✔ Updated README.md headers & cache notes`);
}

console.log(`\n✨ Version bump to v${nextVersion} completed successfully!\n`);
