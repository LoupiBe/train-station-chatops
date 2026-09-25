import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const svgPath = resolve(rootDir, 'public/icons/icon.svg');
const iconsDir = resolve(rootDir, 'public/icons');
const icon192Path = resolve(iconsDir, 'icon-192.png');
const icon512Path = resolve(iconsDir, 'icon-512.png');

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

if (!existsSync(svgPath)) {
  console.error(`Error: Vector icon not found at ${svgPath}`);
  process.exit(1);
}

function generateWithRsvg() {
  try {
    execSync(`rsvg-convert -w 192 -h 192 "${svgPath}" -o "${icon192Path}"`);
    execSync(`rsvg-convert -w 512 -h 512 "${svgPath}" -o "${icon512Path}"`);
    return true;
  } catch {
    return false;
  }
}

function generateWithConvert() {
  try {
    execSync(`convert -background none -resize 192x192 "${svgPath}" "${icon192Path}"`);
    execSync(`convert -background none -resize 512x512 "${svgPath}" "${icon512Path}"`);
    return true;
  } catch {
    return false;
  }
}

console.log('Generating PWA raster icons from SVG...');
let success = generateWithRsvg();
if (!success) {
  console.log('rsvg-convert not available or failed; trying ImageMagick convert...');
  success = generateWithConvert();
}

if (!success) {
  console.error('Failed to generate PNG icons. Please install librsvg (rsvg-convert) or ImageMagick.');
  process.exit(1);
}

console.log('✔ Generated icon-192.png and icon-512.png successfully!');
