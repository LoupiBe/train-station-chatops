#!/usr/bin/env node
/**
 * scripts/verify-m3.js
 * Milestone 3 Comprehensive Verification Runner
 * 
 * Validates:
 * 1. Syntax integrity across frontend JavaScript files via `node --check`
 * 2. HTML5 & Semantic DOM validation of `public/index.html`
 * 3. CSS design system, responsive breakpoints, and touch target sizing of `public/css/app.css`
 * 4. PWA Web App Manifest (`public/manifest.json`) and physical icon assets on disk
 * 5. Service Worker (`public/sw.js`) cache naming, lifecycle, and differentiated routing
 * 6. Verbatim French Error Matrix character-for-character compliance
 * 7. Mock DOM Component Simulation of chat action cards, state locking, confirm/cancel flows,
 *    and online/offline UI transitions.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const rootDir = process.cwd();
console.log("=================================================");
console.log("🚆 RUNNING MILESTONE 3 COMPREHENSIVE VERIFICATION");
console.log("=================================================");

let failed = false;
let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failed = true;
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failed = true;
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

// Helper to recursively locate files
function findFiles(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, ext));
    } else if (fullPath.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ===========================================================================
// [1/7] Syntax Validation via `node --check`
// ===========================================================================
console.log("\n[1/7] Syntax Validation via `node --check`...");

const coreFrontendFiles = [
  path.join(rootDir, "public/sw.js"),
  path.join(rootDir, "public/js/app.js"),
  path.join(rootDir, "public/js/chat.js"),
  path.join(rootDir, "public/js/schedule-view.js"),
  path.join(rootDir, "public/js/sw-register.js"),
  path.join(rootDir, "scripts/verify-m3.js")
];

for (const file of coreFrontendFiles) {
  const relPath = path.relative(rootDir, file);
  runTest(`Syntax check: ${relPath}`, () => {
    assert.ok(fs.existsSync(file), `File ${relPath} must exist on disk`);
    execSync(`node --check "${file}"`, { stdio: "pipe" });
  });
}

// Check any optional scripts in scripts/ (e.g. generate-icons.js)
const extraScripts = findFiles(path.join(rootDir, "scripts"), ".js").filter(
  f => !coreFrontendFiles.includes(f)
);
for (const file of extraScripts) {
  const relPath = path.relative(rootDir, file);
  runTest(`Syntax check: ${relPath}`, () => {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
  });
}

// ===========================================================================
// [2/7] HTML5 & Semantic DOM Validation (`public/index.html`)
// ===========================================================================
console.log("\n[2/7] HTML5 & Semantic DOM Validation (`public/index.html`)...");

const indexPath = path.join(rootDir, "public/index.html");
let indexHtml = "";

runTest("index.html exists and is readable", () => {
  assert.ok(fs.existsSync(indexPath), "public/index.html must exist");
  indexHtml = fs.readFileSync(indexPath, "utf-8");
  assert.ok(indexHtml.length > 200, "public/index.html must not be empty");
});

runTest("HTML5 Doctype and French language declaration", () => {
  assert.match(indexHtml, /<!doctype\s+html>/i, "index.html must declare <!DOCTYPE html>");
  assert.match(indexHtml, /<html[^>]*lang=["']fr["']/i, "index.html must declare lang='fr'");
});

runTest("Character encoding UTF-8 and mobile viewport configuration", () => {
  assert.match(indexHtml, /<meta\s+charset=["']?utf-8["']?/i, "index.html must specify UTF-8 charset");
  assert.match(indexHtml, /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*initial-scale=1/i, "index.html must specify mobile-first viewport meta");
});

runTest("Web App Manifest and touch icon links", () => {
  assert.match(indexHtml, /<link\s+[^>]*rel=["']manifest["'][^>]*href=["']\/?(manifest\.json|\.\/manifest\.json)["']/i, "index.html must link to manifest.json");
  assert.match(indexHtml, /<link\s+[^>]*rel=["']apple-touch-icon["']/i, "index.html must declare apple-touch-icon");
});

runTest("Document title reflects Gare de Genval ChatOps", () => {
  assert.match(indexHtml, /<title>.*(Genval|Kiosque|ChatOps).*<\/title>/i, "index.html title must identify Gare de Genval / Kiosque ChatOps");
});

runTest("Header branding includes station name and train logo", () => {
  assert.match(indexHtml, /Gare de Genval/i, "Header must contain station name 'Gare de Genval'");
  assert.match(indexHtml, /(🚆|🚂|<svg[^>]*>)/i, "Header must contain train icon or SVG logo");
});

runTest("Live Brussels clock in header", () => {
  assert.ok(/id=["'](brussels-clock|clock-display)["']/i.test(indexHtml), "Header must contain Brussels clock container");
});

runTest("Schedule consultation drawer toggle button exists", () => {
  assert.ok(
    /id=["'](toggle-schedule-btn|schedule-drawer-toggle|drawer-toggle)["']/i.test(indexHtml) ||
    /class=["'][^"']*btn-schedule-toggle[^"']*["']/i.test(indexHtml),
    "index.html must have a schedule drawer toggle button"
  );
});

runTest("Top offline amber warning banner container exists with role='alert'", () => {
  assert.ok(
    /id=["']offline-banner["']/i.test(indexHtml) || /class=["'][^"']*banner-offline[^"']*["']/i.test(indexHtml),
    "index.html must contain an offline banner container"
  );
  assert.match(indexHtml, /role=["']alert["']/i, "Offline banner must have accessibility role='alert'");
});

runTest("Schedule consultation drawer structure (weekly, holidays, whitelist)", () => {
  assert.ok(
    /id=["']schedule-drawer["']/i.test(indexHtml) || /class=["'][^"']*schedule-drawer[^"']*["']/i.test(indexHtml),
    "index.html must contain schedule drawer container"
  );
  assert.ok(/(semaine|horaires|weekly|monday)/i.test(indexHtml), "Drawer must contain weekly schedule section");
  assert.ok(/(congés|fermetures|holidays)/i.test(indexHtml), "Drawer must contain scheduled closures section");
  assert.ok(/(ouvertures|whitelist|fériés)/i.test(indexHtml), "Drawer must contain whitelist section");
});

runTest("Chat messages container and chat form input controls", () => {
  assert.ok(/id=["']chat-messages["']/i.test(indexHtml), "index.html must contain #chat-messages container");
  assert.ok(/id=["']chat-form["']/i.test(indexHtml), "index.html must contain #chat-form element");
  assert.ok(/id=["']chat-input["']/i.test(indexHtml), "index.html must contain #chat-input element");
  assert.ok(/id=["']chat-submit["']/i.test(indexHtml) || /type=["']submit["']/i.test(indexHtml), "index.html must contain submit send button");
});

runTest("Action confirmation card buttons referenced in markup or template", () => {
  // Action cards may be declared directly or rendered dynamically; verify 'Confirmer' and 'Annuler' exist
  const jsFiles = findFiles(path.join(rootDir, "public/js"), ".js");
  const jsCorpus = jsFiles.map(f => fs.readFileSync(f, "utf-8")).join("\n");
  assert.ok(
    /Confirmer/i.test(indexHtml) || /Confirmer/i.test(jsCorpus),
    "Confirmation action 'Confirmer' must exist in markup or client JS"
  );
  assert.ok(
    /Annuler/i.test(indexHtml) || /Annuler/i.test(jsCorpus),
    "Confirmation action 'Annuler' must exist in markup or client JS"
  );
});

runTest("Version string v0.1.0 explicitly displayed in footer", () => {
  assert.match(
    indexHtml,
    /<footer[^>]*>[\s\S]*v0\.1\.0[\s\S]*<\/footer>/i,
    "Footer must explicitly display version string 'v0.1.0'"
  );
});

runTest("Bottom PWA install status bar container exists in markup", () => {
  assert.ok(/id=["']pwa-install-banner["']/i.test(indexHtml), "index.html must contain #pwa-install-banner element");
  assert.ok(/id=["']btn-pwa-install["']/i.test(indexHtml), "index.html must contain #btn-pwa-install element");
  assert.ok(/id=["']btn-pwa-dismiss["']/i.test(indexHtml), "index.html must contain #btn-pwa-dismiss element");
});

// ===========================================================================
// [3/7] CSS Design System & Accessibility Validation (`public/css/app.css`)
// ===========================================================================
console.log("\n[3/7] CSS Design System & Accessibility Validation (`public/css/app.css`)...");

const cssPath = path.join(rootDir, "public/css/app.css");
let appCss = "";

runTest("app.css exists and is non-empty", () => {
  assert.ok(fs.existsSync(cssPath), "public/css/app.css must exist");
  appCss = fs.readFileSync(cssPath, "utf-8");
  assert.ok(appCss.length > 500, "public/css/app.css must contain stylesheet rules");
});

runTest("Belgian Rail color variables declared in :root", () => {
  assert.ok(appCss.includes(":root"), "app.css must define custom properties in :root");
  // Check Rail navy (#1a365d or #1e3a8a)
  assert.ok(
    /#1a365d|#1e3a8a|#0f233d/i.test(appCss),
    "app.css must define Belgian rail navy brand color"
  );
  // Check Amber warning (#d97706 or #f59e0b)
  assert.ok(
    /#d97706|#f59e0b|#fef3c7|#b45309/i.test(appCss),
    "app.css must define amber warning status color"
  );
  // Check Green success (#16a34a or #22c55e or #15803d)
  assert.ok(
    /#16a34a|#22c55e|#15803d|#dcfce7/i.test(appCss),
    "app.css must define green success status color"
  );
});

runTest("Responsive media queries defined for mobile and desktop", () => {
  assert.match(appCss, /@media\s*\([^)]+\)/i, "app.css must define responsive media queries");
});

runTest("Top amber warning banner styling defined", () => {
  assert.ok(
    /(\.banner-offline|\.offline-banner|#offline-banner)/i.test(appCss),
    "app.css must style offline banner"
  );
  assert.ok(
    /#d97706|#f59e0b|#fef3c7|var\(--color-amber/i.test(appCss),
    "Offline banner must apply amber warning styling"
  );
});

runTest("Bottom PWA install status bar and button styling defined", () => {
  assert.ok(appCss.includes(".pwa-install-banner"), "app.css must style .pwa-install-banner");
  assert.ok(appCss.includes(".btn-pwa-install"), "app.css must style .btn-pwa-install");
  assert.ok(appCss.includes(".btn-pwa-dismiss"), "app.css must style .btn-pwa-dismiss");
});

runTest("Action confirmation card and button styles defined", () => {
  assert.ok(
    /(\.action-card|\.confirmation-card)/i.test(appCss),
    "app.css must style action confirmation cards"
  );
  assert.ok(
    /(\.btn-action-confirm|\.btn-confirm)/i.test(appCss),
    "app.css must define styling for confirm button"
  );
  assert.ok(
    /(\.btn-action-cancel|\.btn-cancel)/i.test(appCss),
    "app.css must define styling for cancel button"
  );
});

runTest("Touch target ergonomics enforce minimum 44px height", () => {
  // Checks that button, input, or interactive controls enforce >= 44px
  assert.ok(
    /(min-height\s*:\s*(44px|48px|3rem|2\.75rem)|height\s*:\s*(44px|48px))/i.test(appCss),
    "app.css must enforce touch targets >= 44px for buttons or controls"
  );
});

runTest("Schedule drawer slide-in and layout styling defined", () => {
  assert.ok(
    /(\.schedule-drawer|#schedule-drawer)/i.test(appCss),
    "app.css must style schedule drawer"
  );
  assert.ok(
    /(transform|transition|position\s*:\s*fixed)/i.test(appCss),
    "Schedule drawer must use slide or modal positioning"
  );
});

runTest("Accessible focus visible styling defined", () => {
  assert.ok(
    /(:focus-visible|:focus)/i.test(appCss),
    "app.css must define clear keyboard focus rings"
  );
});

// ===========================================================================
// [4/7] Web App Manifest & Icons Validation (`public/manifest.json` & icons)
// ===========================================================================
console.log("\n[4/7] Web App Manifest & Icons Validation...");

const manifestPath = path.join(rootDir, "public/manifest.json");
let manifest = null;

runTest("manifest.json exists and parses as valid JSON", () => {
  assert.ok(fs.existsSync(manifestPath), "public/manifest.json must exist");
  const content = fs.readFileSync(manifestPath, "utf-8");
  manifest = JSON.parse(content);
  assert.ok(manifest && typeof manifest === "object", "manifest must be a valid JSON object");
});

runTest("Manifest specifies required PWA identity fields", () => {
  assert.ok(manifest.name && manifest.name.includes("Gare de Genval"), "manifest.name must include 'Gare de Genval'");
  assert.ok(manifest.short_name && manifest.short_name.length <= 30, "manifest.short_name must be concise");
});

runTest("Manifest specifies standalone display mode and start URL", () => {
  assert.equal(manifest.display, "standalone", "manifest.display must be 'standalone'");
  assert.ok(manifest.start_url, "manifest.start_url must be defined");
});

runTest("Manifest specifies Belgian rail theme and background colors", () => {
  assert.ok(manifest.theme_color, "manifest.theme_color must be defined");
  assert.match(manifest.theme_color, /^#[0-9a-fA-F]{6}$/, "theme_color must be a valid hex color");
  assert.ok(manifest.background_color, "manifest.background_color must be defined");
});

runTest("Manifest specifies standard icons array with 192x192 and 512x512 entries", () => {
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "manifest.icons must contain at least 2 icon entries");
  const has192 = manifest.icons.some(i => i.sizes === "192x192");
  const has512 = manifest.icons.some(i => i.sizes === "512x512");
  assert.ok(has192, "manifest.icons must include 192x192 icon entry");
  assert.ok(has512, "manifest.icons must include 512x512 icon entry");
});

runTest("Manifest includes maskable icon specification", () => {
  const hasMaskable = manifest.icons.some(i => i.purpose && i.purpose.includes("maskable"));
  assert.ok(hasMaskable, "manifest.icons should define at least one maskable icon for Android adaptive styling");
});

runTest("Physical icon assets exist on disk with valid byte sizes", () => {
  const iconFiles = ["icon.svg", "icon-192.png", "icon-512.png"];
  for (const name of iconFiles) {
    const fullIconPath = path.join(rootDir, "public/icons", name);
    assert.ok(fs.existsSync(fullIconPath), `public/icons/${name} must exist on disk`);
    const size = fs.statSync(fullIconPath).size;
    assert.ok(size > 50, `public/icons/${name} must be non-empty (size: ${size} bytes)`);
  }
});

// ===========================================================================
// [5/7] Service Worker Validation (`public/sw.js`)
// ===========================================================================
console.log("\n[5/7] Service Worker Validation (`public/sw.js`)...");

const swPath = path.join(rootDir, "public/sw.js");
let swContent = "";

runTest("sw.js exists and is non-empty", () => {
  assert.ok(fs.existsSync(swPath), "public/sw.js must exist");
  swContent = fs.readFileSync(swPath, "utf-8");
  assert.ok(swContent.length > 200, "public/sw.js must not be empty");
});

runTest("Cache name strictly matches 'kiosk-chatops-v0.1.0'", () => {
  assert.ok(
    swContent.includes("kiosk-chatops-v0.1.0"),
    "sw.js must define cache name strictly containing 'kiosk-chatops-v0.1.0'"
  );
});

runTest("App Shell pre-cache list includes core assets", () => {
  assert.match(swContent, /['"]\/?index\.html['"]|['"]\/['"]/, "Pre-cache must include index.html or root");
  assert.match(swContent, /['"][^'"]*app\.css['"]/, "Pre-cache must include app.css");
  assert.match(swContent, /['"][^'"]*manifest\.json['"]/, "Pre-cache must include manifest.json");
  assert.match(swContent, /['"][^'"]*chat\.js['"]/, "Pre-cache must include chat.js");
  assert.match(swContent, /['"][^'"]*schedule-view\.js['"]/, "Pre-cache must include schedule-view.js");
  assert.match(swContent, /['"][^'"]*sw-register\.js['"]/, "Pre-cache must include sw-register.js");
});

runTest("Install event listener pre-caches shell assets", () => {
  assert.match(swContent, /addEventListener\(\s*['"]install['"]/i, "sw.js must handle install event");
  assert.match(swContent, /caches\.open\(/i, "Install event must open CacheStorage");
});

runTest("Activate event listener purges outdated caches and claims clients", () => {
  assert.match(swContent, /addEventListener\(\s*['"]activate['"]/i, "sw.js must handle activate event");
  assert.match(swContent, /caches\.delete\(/i, "Activate event must delete old caches");
  assert.match(swContent, /clients\.claim\(\)/i, "Activate event must invoke clients.claim()");
});

runTest("Message listener handles SKIP_WAITING signal", () => {
  assert.match(swContent, /addEventListener\(\s*['"]message['"]/i, "sw.js must handle message event");
  assert.match(swContent, /SKIP_WAITING/i, "sw.js must respond to SKIP_WAITING message");
});

runTest("Route /api/status uses Network-First strategy with Cache Fallback", () => {
  assert.ok(swContent.includes("/api/status"), "sw.js must explicitly route /api/status");
  assert.match(swContent, /fetch\(/i, "Network-first must fetch from network");
  assert.match(swContent, /caches\.match\(/i, "Network-first must fallback to caches.match");
});

runTest("Routes /api/chat and /api/confirm use Network-Only strategy (never cached)", () => {
  assert.ok(swContent.includes("/api/chat"), "sw.js must route /api/chat");
  assert.ok(swContent.includes("/api/confirm"), "sw.js must route /api/confirm");
  // Verify that POST mutations are NOT put in cache
  assert.doesNotMatch(
    swContent,
    /cache\.put\([^)]*\/api\/(chat|confirm)/i,
    "sw.js must NEVER cache /api/chat or /api/confirm mutations"
  );
});

runTest("Routes /api/chat and /api/confirm return HTTP 503 with offline French error when offline", () => {
  assert.match(swContent, /503/, "sw.js must return HTTP 503 when network fails on API mutations");
  assert.ok(
    swContent.includes("Oups, pas de connexion Internet ! 📡"),
    "HTTP 503 offline fallback must return the verbatim French offline message"
  );
});

// ===========================================================================
// [6/7] Verbatim French Error Matrix Validation
// ===========================================================================
console.log("\n[6/7] Verbatim French Error Matrix Validation...");

const VERBATIM_MESSAGES = [
  {
    key: "offline",
    name: "Offline Message",
    expected: "Oups, pas de connexion Internet ! 📡 Vérifiez votre réseau pour papoter avec le bot et mettre à jour les horaires."
  },
  {
    key: "timeout",
    name: "AI Unavailable / Timeout Message",
    expected: "Le bot prend un petit café ☕ (ou le réseau fait une pause). Réessayez dans quelques instants !"
  },
  {
    key: "github_failure",
    name: "GitHub Commit Failure Message",
    expected: "Petit accroc technique dans la salle des machines 🚂 Impossible d'enregistrer pour l'instant. Pas d'inquiétude, le planning actuel reste inchangé."
  },
  {
    key: "ambiguous_dates",
    name: "Ambiguous Dates Message",
    expected: "Je ne suis pas tout à fait sûr d'avoir bien compris les dates 🧐 Pouvez-vous me préciser ça ? (Ex: 'fermer du 14 au 17 mai') "
  },
  {
    key: "app_update",
    name: "App Update Message",
    expected: "Une nouvelle version toute fraîche est prête ! 🚀 Cliquez pour recharger."
  }
];

// Aggregate all frontend text files into a search corpus
const allFrontendTextFiles = [
  indexPath,
  cssPath,
  swPath,
  ...findFiles(path.join(rootDir, "public/js"), ".js")
];
const aggregatedCorpus = allFrontendTextFiles
  .filter(f => fs.existsSync(f))
  .map(f => fs.readFileSync(f, "utf-8"))
  .join("\n");

for (const msg of VERBATIM_MESSAGES) {
  runTest(`Verbatim text match: ${msg.name}`, () => {
    const trimmedExpected = msg.expected.trim();
    const found = aggregatedCorpus.includes(msg.expected) || aggregatedCorpus.includes(trimmedExpected);
    assert.ok(
      found,
      `Frontend codebase must contain verbatim French message:\n"${msg.expected}"`
    );
  });
}

// ===========================================================================
// [7/7] Component Simulation & Interaction Flow Tests
// ===========================================================================
console.log("\n[7/7] Component Simulation & Interaction Flow Tests...");

// Lightweight Mock DOM for pure Node.js verification without external npm packages
class MockClassList {
  constructor() { this._set = new Set(); }
  add(...tokens) { tokens.forEach(t => this._set.add(t)); }
  remove(...tokens) { tokens.forEach(t => this._set.delete(t)); }
  toggle(token, force) {
    if (force !== undefined) {
      if (force) this._set.add(token); else this._set.delete(token);
      return force;
    }
    if (this._set.has(token)) { this._set.delete(token); return false; }
    this._set.add(token); return true;
  }
  contains(token) { return this._set.has(token); }
  has(token) { return this._set.has(token); }
  get value() { return Array.from(this._set).join(" "); }
}

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.id = "";
    this.classList = new MockClassList();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.disabled = false;
    this.hidden = false;
    this.value = "";
    this.style = {};
    this._textContent = "";
    this._listeners = new Map();
  }
  get textContent() {
    if (this.children.length === 0) return this._textContent;
    return this.children.map(c => c.textContent).join(" ");
  }
  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  removeAttribute(k) { this.attributes.delete(k); }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners.get(type);
    if (arr) {
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }
  dispatchEvent(event) {
    event.target = this;
    const fns = this._listeners.get(event.type) || [];
    const results = [];
    if (typeof this[`on${event.type}`] === "function") {
      results.push(this[`on${event.type}`](event));
    }
    fns.forEach(fn => results.push(fn(event)));
    return results;
  }
  click() {
    return Promise.all(this.dispatchEvent({ type: "click", target: this }));
  }
  querySelector(sel) {
    return this._find(sel, false);
  }
  querySelectorAll(sel) {
    const results = [];
    this._find(sel, true, results);
    return results;
  }
  _find(sel, all = false, results = []) {
    for (const child of this.children) {
      if (this._matches(child, sel)) {
        if (!all) return child;
        results.push(child);
      }
      const found = child._find(sel, all, results);
      if (found && !all) return found;
    }
    return all ? results : null;
  }
  _matches(node, sel) {
    if (!sel || !node) return false;
    if (sel.includes(".") && !sel.startsWith(".")) {
      const [tag, className] = sel.split(".");
      return node.tagName === tag.toUpperCase() && node.classList.contains(className);
    }
    if (sel.startsWith(".")) return node.classList.contains(sel.slice(1));
    if (sel.startsWith("#")) return node.id === sel.slice(1);
    return node.tagName === sel.toUpperCase();
  }
  get innerHTML() {
    return this._rawHtml || this.textContent;
  }
  set innerHTML(html) {
    this._rawHtml = html;
    this.children = [];
    this._parseHtmlIntoChildren(html);
  }
  _parseHtmlIntoChildren(html) {
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/?>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1] || match[4];
      const attrs = match[2] || match[5] || "";
      const inner = match[3] || "";
      const el = new MockElement(tag);

      const classMatch = attrs.match(/class=["']([^"']+)["']/);
      if (classMatch) {
        classMatch[1].trim().split(/\s+/).forEach(c => el.classList.add(c));
      }
      const idMatch = attrs.match(/id=["']([^"']+)["']/);
      if (idMatch) {
        el.id = idMatch[1];
      }
      const typeMatch = attrs.match(/type=["']([^"']+)["']/);
      if (typeMatch) {
        el.setAttribute("type", typeMatch[1]);
      }
      if (inner.includes("<")) {
        el.innerHTML = inner;
      } else {
        el.textContent = inner.trim();
      }
      this.appendChild(el);
    }
  }
}

// Global DOM registry
const elementRegistry = new Map();
function getOrCreateMockElement(id, tag = "div") {
  if (!elementRegistry.has(id)) {
    const el = new MockElement(tag);
    el.id = id;
    elementRegistry.set(id, el);
  }
  return elementRegistry.get(id);
}

globalThis.document = {
  createElement(tag) {
    return new MockElement(tag);
  },
  getElementById(id) {
    return elementRegistry.get(id) || null;
  }
};

const windowListeners = new Map();
globalThis.window = {
  addEventListener(type, fn) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const arr = windowListeners.get(type);
    if (arr) {
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    }
  },
  dispatchEvent(event) {
    const fns = windowListeners.get(event.type) || [];
    fns.forEach(fn => fn(event));
    return true;
  }
};

const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => storageMap.get(k) ?? null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

let mockMatchMediaStandalone = false;
globalThis.window.matchMedia = (query) => ({
  matches: query.includes("display-mode: standalone") ? mockMatchMediaStandalone : false,
  media: query
});

if (typeof navigator !== "undefined") {
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true, writable: true });
} else {
  globalThis.navigator = { onLine: true };
}

// Import genuine production controllers and helpers
import { ChatManager, ERROR_MESSAGES } from "../public/js/chat.js";
import { ScheduleViewController } from "../public/js/schedule-view.js";
import {
  initConnectivityListeners,
  initInstallPrompt,
  isPwaInstalled,
  isInstallDismissed,
  dismissInstallPrompt,
  isIosDevice,
  PWA_DISMISS_KEY
} from "../public/js/sw-register.js";

// 1. Actual ChatManager: Action Card Rendering
runTest("Action confirmation card renders summary, [Confirmer] and [Annuler] buttons via ChatManager", () => {
  const chat = new ChatManager();
  const card = chat.createActionCard({
    name: "propose_holiday",
    args: { start: "2026-05-14", end: "2026-05-17", description: "Pont de l'Ascension" },
    summary: "Fermeture du 14 au 17 mai 2026 (Pont de l'Ascension)"
  }, "sha-test-1234");

  assert.ok(card, "ChatManager must return action card element");
  const confirmBtn = card.querySelector(".btn-action-confirm");
  const cancelBtn = card.querySelector(".btn-action-cancel");
  const summaryEl = card.querySelector(".action-card-summary");

  assert.ok(confirmBtn, "Card must render confirm button");
  assert.ok(cancelBtn, "Card must render cancel button");
  assert.ok(summaryEl, "Card must render action summary");
  assert.equal(confirmBtn.textContent.trim(), "Confirmer");
  assert.equal(cancelBtn.textContent.trim(), "Annuler");
});

// 2. Actual ChatManager: Confirmer Click State Locking
await runAsyncTest("Clicking [Confirmer] locks buttons immediately and dispatches POST /api/confirm via ChatManager", async () => {
  let apiCalled = false;
  let sentBody = null;

  globalThis.fetch = async (url, opts) => {
    apiCalled = true;
    sentBody = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, newFileSha: "sha-test-new" })
    };
  };

  const chat = new ChatManager();
  const card = chat.createActionCard({
    name: "propose_holiday",
    args: { start: "2026-05-14", end: "2026-05-17" },
    summary: "Fermeture du 14 au 17 mai 2026"
  }, "sha-test-1234");

  const confirmBtn = card.querySelector(".btn-action-confirm");
  const cancelBtn = card.querySelector(".btn-action-cancel");

  await confirmBtn.click();

  assert.equal(confirmBtn.disabled, true, "Confirm button must be locked on click");
  assert.equal(cancelBtn.disabled, true, "Cancel button must be locked during submission");
  assert.equal(apiCalled, true, "API dispatch must be initiated");
  assert.equal(sentBody.sha, "sha-test-1234", "Must pass SHA for optimistic concurrency check");
});

// 3. Actual ChatManager: Confirmer HTTP 200 Success Flow
await runAsyncTest("Confirmer HTTP 200 response updates card to confirmed success badge via ChatManager", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, newFileSha: "sha-success-200" })
  });

  const chat = new ChatManager();
  const card = chat.createActionCard({
    name: "propose_whitelist",
    args: { date: "2026-07-21", reason: "Fête Nationale" },
    summary: "Ouverture exceptionnelle"
  }, "sha-test-1234");

  const confirmBtn = card.querySelector(".btn-action-confirm");
  await confirmBtn.click();

  const footer = card.querySelector(".action-card-footer");
  const badge = footer.querySelector(".badge-success");
  assert.ok(badge, "Card must render success badge on 200 OK");
  assert.ok(badge.textContent.includes("succès"), "Badge must confirm successful commit");
  assert.equal(chat.currentSha, "sha-success-200", "ChatManager must store updated file SHA");
});

// 4. Actual ChatManager: Confirmer HTTP 409 Conflict Handling & Retry Button
await runAsyncTest("Confirmer HTTP 409 Conflict renders empathetic error and [Réessayer 🔄] button via ChatManager", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: "Conflict SHA", conflict: true })
  });

  const chat = new ChatManager();
  const card = chat.createActionCard({
    name: "propose_holiday",
    args: { start: "2026-05-14", end: "2026-05-17" },
    summary: "Fermeture"
  }, "sha-stale");

  const confirmBtn = card.querySelector(".btn-action-confirm");
  await confirmBtn.click();

  const footer = card.querySelector(".action-card-footer");
  const errorBadge = footer.querySelector(".badge-error");
  assert.ok(errorBadge, "Card must render error badge on conflict");
  const retryBtn = footer.querySelector(".btn-action-retry");
  assert.ok(retryBtn, "Card must render [Réessayer 🔄] button on conflict");
});

// 5. Actual ChatManager: Action Confirmation Retry Flow Dispatches Fresh Fetch
await runAsyncTest("Clicking [Réessayer 🔄] re-executes confirmation request with latest SHA without dead buttons", async () => {
  let fetchCount = 0;
  let sentShas = [];

  globalThis.fetch = async (url, opts) => {
    fetchCount++;
    const body = JSON.parse(opts.body);
    sentShas.push(body.sha);
    if (fetchCount === 1) {
      return {
        ok: false,
        status: 409,
        json: async () => ({ error: "Conflict SHA", conflict: true })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, newFileSha: "sha-recovered-999" })
    };
  };

  let scheduleSha = "sha-initial-111";
  const chat = new ChatManager({
    getScheduleSha: () => scheduleSha
  });

  const card = chat.createActionCard({
    name: "propose_holiday",
    args: { start: "2026-05-14", end: "2026-05-17" },
    summary: "Fermeture"
  }, "sha-initial-111");

  const confirmBtn = card.querySelector(".btn-action-confirm");
  await confirmBtn.click();

  assert.equal(fetchCount, 1, "First fetch must be dispatched on confirm");

  const footer = card.querySelector(".action-card-footer");
  const retryBtn = footer.querySelector(".btn-action-retry");
  assert.ok(retryBtn, "Retry button must exist after 409 failure");

  // Simulate schedule refresh providing updated SHA
  scheduleSha = "sha-refreshed-222";

  // Trigger retry click
  await retryBtn.click();

  assert.equal(fetchCount, 2, "Second fetch must be dispatched when clicking [Réessayer 🔄]");
  assert.equal(sentShas[1], "sha-refreshed-222", "Retry fetch must pass the latest refreshed SHA");

  const successBadge = footer.querySelector(".badge-success");
  assert.ok(successBadge, "Card must transition to success badge after successful retry");
  assert.equal(chat.currentSha, "sha-recovered-999", "ChatManager must update SHA upon successful retry");
});

// 6. Actual ChatManager: Clicking [Annuler] & [Fermer] Flow
await runAsyncTest("Clicking [Annuler] cancels proposal without issuing network call, and [Fermer] closes error card", async () => {
  let networkRequested = false;
  globalThis.fetch = async () => {
    networkRequested = true;
    return { ok: true, json: async () => ({}) };
  };

  const chat = new ChatManager();
  const card = chat.createActionCard({
    name: "propose_holiday",
    args: { start: "2026-05-14", end: "2026-05-17" },
    summary: "Fermeture"
  }, "sha-test");

  const cancelBtn = card.querySelector(".btn-action-cancel");
  const footer = card.querySelector(".action-card-footer");

  await cancelBtn.click();

  assert.equal(networkRequested, false, "No network request must occur on cancel");
  const cancelBadge = footer.querySelector(".badge-canceled");
  assert.ok(cancelBadge, "Must render cancelled state badge");
  assert.ok(cancelBadge.textContent.includes("annulée"), "Badge text must indicate cancellation");
});

// 7. Actual ScheduleViewController: French Weekday Highlighting
runTest("ScheduleViewController highlights current day with row-today when given French weekday ('vendredi')", () => {
  const tbodyEl = getOrCreateMockElement("weekly-table-body", "tbody");
  tbodyEl.innerHTML = "";

  const ctrl = new ScheduleViewController();
  ctrl.schedule = {
    monday: { on: "06:50", off: "14:10" },
    tuesday: { on: "06:50", off: "14:10" },
    wednesday: { on: "06:50", off: "14:40" },
    thursday: { on: "06:50", off: "14:10" },
    friday: { on: "06:50", off: "14:10" },
    saturday: { on: "00:00", off: "00:00" },
    sunday: { on: "00:00", off: "00:00" },
  };

  ctrl.renderWeeklyTable({ weekday: "vendredi" });

  const todayRow = tbodyEl.querySelector(".row-today");
  assert.ok(todayRow, "Schedule table must highlight row matching French weekday 'vendredi'");
  assert.ok(todayRow.textContent.includes("Vendredi"), "Highlighted row must be Vendredi");
  assert.ok(todayRow.querySelector(".day-badge-today"), "Highlighted row must contain 'Aujourd'hui' badge");
});

// 8. Actual ScheduleViewController: Diacritic-Insensitive Search
runTest("ScheduleViewController diacritic-insensitive search matches unaccented queries against accented text", () => {
  const tbodyEl = getOrCreateMockElement("weekly-table-body", "tbody");
  const holidaysListEl = getOrCreateMockElement("holidays-list", "ul");
  const whitelistListEl = getOrCreateMockElement("whitelist-list", "ul");
  getOrCreateMockElement("holidays-count-badge", "span");
  getOrCreateMockElement("whitelist-count-badge", "span");

  const ctrl = new ScheduleViewController();
  ctrl.schedule = {
    monday: { on: "06:50", off: "14:10" },
    tuesday: { on: "06:50", off: "14:10" },
    wednesday: { on: "06:50", off: "14:40" },
    thursday: { on: "06:50", off: "14:10" },
    friday: { on: "06:50", off: "14:10" },
    saturday: { on: "00:00", off: "00:00" },
    sunday: { on: "00:00", off: "00:00" },
    holidays: [
      { start: "2026-08-15", end: "2026-08-15", description: "Assomption (Août)" },
      { start: "2026-12-25", end: "2026-12-25", description: "Noël" }
    ],
    whitelist: [
      { date: "2026-07-21", reason: "Fête Nationale" }
    ]
  };

  // 1. Search 'ferme' matches 'Fermé'
  ctrl.searchQuery = ctrl.normalize("ferme");
  ctrl.renderWeeklyTable({ weekday: "vendredi" });
  assert.equal(tbodyEl.querySelectorAll("tr").length, 2, "Unaccented 'ferme' must match 2 closed days ('Fermé')");

  // 2. Search 'aout' matches 'Août'
  ctrl.searchQuery = ctrl.normalize("aout");
  ctrl.renderHolidays();
  assert.ok(holidaysListEl.textContent.includes("Août"), "Unaccented 'aout' must match holiday 'Assomption (Août)'");

  // 3. Search 'noel' matches 'Noël'
  ctrl.searchQuery = ctrl.normalize("noel");
  ctrl.renderHolidays();
  assert.ok(holidaysListEl.textContent.includes("Noël"), "Unaccented 'noel' must match holiday 'Noël'");

  // 4. Search 'fete' matches 'Fête Nationale'
  ctrl.searchQuery = ctrl.normalize("fete");
  ctrl.renderWhitelist();
  assert.ok(whitelistListEl.textContent.includes("Fête"), "Unaccented 'fete' must match whitelist 'Fête Nationale'");
});

// 9. Actual ScheduleViewController: First-Launch Offline Graceful Degradation
runTest("ScheduleViewController gracefully displays explicit empty state when launched offline without cache", () => {
  const tbodyEl = getOrCreateMockElement("weekly-table-body", "tbody");
  const holidaysListEl = getOrCreateMockElement("holidays-list", "ul");
  const whitelistListEl = getOrCreateMockElement("whitelist-list", "ul");

  const ctrl = new ScheduleViewController();
  ctrl.schedule = null;
  ctrl.render(true, null);

  assert.ok(
    tbodyEl.textContent.includes("Aucun horaire en cache local"),
    "Weekly table must display informative message when launched offline without cache"
  );
  assert.ok(
    holidaysListEl.textContent.includes("Aucun horaire en cache local"),
    "Holidays list must display informative message when launched offline without cache"
  );
});

// 10. Actual sw-register: Online/Offline Network UI State Transitions
runTest("Online/offline window events toggle amber banner and chat input state via initConnectivityListeners", () => {
  const offlineBanner = getOrCreateMockElement("offline-banner", "aside");
  offlineBanner.hidden = true;
  const offlineBannerText = getOrCreateMockElement("offline-banner-text", "p");
  const connectionPill = getOrCreateMockElement("connection-pill", "div");
  const pillLabel = new MockElement("span");
  pillLabel.classList.add("pill-label");
  connectionPill.appendChild(pillLabel);
  const chatInput = getOrCreateMockElement("chat-input", "input");
  chatInput.disabled = false;
  const chatSubmit = getOrCreateMockElement("chat-submit", "button");
  chatSubmit.disabled = false;

  initConnectivityListeners();

  // Dispatch offline event
  window.dispatchEvent({ type: "offline" });

  assert.equal(offlineBanner.hidden, false, "Amber banner must be un-hidden when offline");
  assert.equal(offlineBanner.classList.contains("visible"), true, "Amber banner must have visible class");
  assert.equal(chatInput.disabled, true, "Chat input must be disabled when offline");
  assert.equal(chatSubmit.disabled, true, "Chat submit button must be disabled when offline");
  assert.equal(pillLabel.textContent, "Hors ligne", "Pill label must indicate 'Hors ligne'");

  // Dispatch online event
  window.dispatchEvent({ type: "online" });

  assert.equal(offlineBanner.hidden, true, "Amber banner must be hidden when back online");
  assert.equal(chatInput.disabled, false, "Chat input must be re-enabled when back online");
  assert.equal(chatSubmit.disabled, false, "Chat submit button must be re-enabled when back online");
  assert.equal(pillLabel.textContent, "En ligne", "Pill label must indicate 'En ligne'");
});

// 11. Brussels Official Clock Simulation
runTest("Brussels clock generates valid 24-hour military time", () => {
  const formatter = new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const timeStr = formatter.format(new Date());
  assert.match(timeStr, /^\d{2}:\d{2}:\d{2}$/, "Brussels time string must match HH:mm:ss 24h format");
});

// 12. PWA Install Detection: isPwaInstalled
runTest("PWA install: isPwaInstalled detects standalone display mode", () => {
  mockMatchMediaStandalone = false;
  globalThis.navigator.standalone = false;
  assert.equal(isPwaInstalled(), false, "Should return false when not standalone");

  mockMatchMediaStandalone = true;
  assert.equal(isPwaInstalled(), true, "Should return true when display-mode: standalone matches");

  mockMatchMediaStandalone = false;
  globalThis.navigator.standalone = true;
  assert.equal(isPwaInstalled(), true, "Should return true when navigator.standalone is true");
  globalThis.navigator.standalone = false;
});

// 13. PWA Install Dismissal: isInstallDismissed & dismissInstallPrompt
runTest("PWA install: isInstallDismissed checks 7-day expiration in localStorage", () => {
  localStorage.clear();
  assert.equal(isInstallDismissed(), false, "Should be false when no dismiss recorded");

  dismissInstallPrompt();
  assert.equal(isInstallDismissed(), true, "Should be true immediately after dismissal");

  // Expired timestamp (8 days ago)
  const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
  localStorage.setItem(PWA_DISMISS_KEY, eightDaysAgo.toString());
  assert.equal(isInstallDismissed(), false, "Should be false when dismissal expired after 7 days");

  localStorage.clear();
});

// 14. PWA Install Flow: beforeinstallprompt
await runAsyncTest("PWA install: beforeinstallprompt reveals banner and triggers prompt on install click", async () => {
  localStorage.clear();
  mockMatchMediaStandalone = false;

  const banner = getOrCreateMockElement("pwa-install-banner", "aside");
  banner.hidden = true;
  banner.classList.remove("visible");
  const bannerText = getOrCreateMockElement("install-banner-text", "span");
  const installBtn = getOrCreateMockElement("btn-pwa-install", "button");
  const dismissBtn = getOrCreateMockElement("btn-pwa-dismiss", "button");

  initInstallPrompt();

  let promptCalled = false;
  const mockBeforeInstallPromptEvent = {
    type: "beforeinstallprompt",
    preventDefault: () => {},
    prompt: async () => { promptCalled = true; },
    userChoice: Promise.resolve({ outcome: "accepted" })
  };

  // Dispatch beforeinstallprompt
  window.dispatchEvent(mockBeforeInstallPromptEvent);

  assert.equal(banner.hidden, false, "Banner should be un-hidden on beforeinstallprompt");
  assert.equal(banner.classList.contains("visible"), true, "Banner should have .visible class");

  // Click install button
  await installBtn.click();
  assert.equal(promptCalled, true, "Clicking install button must invoke prompt()");
  assert.equal(banner.hidden, true, "Banner should hide after install accepted");
});

// 15. PWA Install Flow: dismiss button
runTest("PWA install: dismiss button hides banner and persists 7-day dismissal in localStorage", () => {
  localStorage.clear();
  mockMatchMediaStandalone = false;

  const banner = getOrCreateMockElement("pwa-install-banner", "aside");
  banner.hidden = false;
  banner.classList.add("visible");
  const dismissBtn = getOrCreateMockElement("btn-pwa-dismiss", "button");

  initInstallPrompt();

  dismissBtn.click();

  assert.equal(banner.hidden, true, "Dismiss click must hide banner");
  assert.equal(banner.classList.contains("visible"), false, "Visible class must be removed");
  assert.equal(isInstallDismissed(), true, "Dismissal must be persisted in localStorage");

  localStorage.clear();
});

// 16. PWA Install Flow: iOS Safari instructions
runTest("PWA install: iOS Safari renders tailored step-by-step instructions", () => {
  localStorage.clear();
  mockMatchMediaStandalone = false;

  const banner = getOrCreateMockElement("pwa-install-banner", "aside");
  banner.hidden = true;
  banner.classList.remove("visible");
  const bannerText = getOrCreateMockElement("install-banner-text", "span");
  const installBtn = getOrCreateMockElement("btn-pwa-install", "button");

  // Mock iOS user agent
  const originalUA = navigator.userAgent;
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    configurable: true
  });

  assert.equal(isIosDevice(), true, "Should identify iPhone as iOS device");

  initInstallPrompt();

  assert.equal(banner.hidden, false, "Banner should be displayed on iOS Safari");
  assert.ok(bannerText.innerHTML.includes("Partager"), "Instructions must mention 'Partager'");
  assert.ok(bannerText.innerHTML.includes("écran d'accueil"), "Instructions must mention 'Sur l'écran d'accueil'");
  assert.equal(installBtn.textContent, "Compris", "Install button should display 'Compris' on iOS");

  // Restore userAgent
  Object.defineProperty(navigator, "userAgent", {
    value: originalUA,
    configurable: true
  });
  localStorage.clear();
});

// ===========================================================================
// Final Summary Scorecard
// ===========================================================================
console.log("\n=================================================");
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${totalTests - passedTests}`);
if (failed) {
  console.error("❌ MILESTONE 3 VERIFICATION FAILED");
  process.exit(1);
} else {
  console.log("✔ MILESTONE 3 VERIFICATION COMPLETED: 100% PASS");
  console.log("=================================================");
}
