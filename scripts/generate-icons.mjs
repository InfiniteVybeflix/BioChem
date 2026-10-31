#!/usr/bin/env node
/**
 * Generates PWA icons from the BioChem SVG mark (flask + molecule on a
 * gradient tile) using sharp. Run once — the outputs are committed:
 *
 *   node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#14b8a6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <!-- flask body -->
  <path d="M196 128 v96 L118 356 a34 34 0 0 0 30 50 h216 a34 34 0 0 0 30-50 L316 224 v-96"
        fill="none" stroke="#f0fdfa" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- flask neck -->
  <path d="M196 132 h120" stroke="#f0fdfa" stroke-width="26" stroke-linecap="round"/>
  <!-- liquid -->
  <path d="M162 286 h188 l34 70 a34 34 0 0 1 -30 50 h-196 a34 34 0 0 1 -30-50 z"
        fill="#f0fdfa" opacity="0.22"/>
  <!-- bubbles -->
  <circle cx="216" cy="352" r="14" fill="#f0fdfa" opacity="0.85"/>
  <circle cx="262" cy="330" r="9" fill="#f0fdfa" opacity="0.7"/>
  <circle cx="298" cy="364" r="11" fill="#f0fdfa" opacity="0.8"/>
  <!-- molecule -->
  <circle cx="352" cy="120" r="18" fill="#134e4a"/>
  <circle cx="396" cy="164" r="12" fill="#134e4a" opacity="0.85"/>
  <circle cx="340" cy="176" r="9" fill="#134e4a" opacity="0.7"/>
  <path d="M352 120 L396 164 M352 120 L340 176" stroke="#134e4a" stroke-width="8" stroke-linecap="round"/>
</svg>`;

const MASKABLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#14b8a6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(64,64) scale(0.75)">
    <path d="M196 128 v96 L118 356 a34 34 0 0 0 30 50 h216 a34 34 0 0 0 30-50 L316 224 v-96"
          fill="none" stroke="#f0fdfa" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M196 132 h120" stroke="#f0fdfa" stroke-width="26" stroke-linecap="round"/>
    <path d="M162 286 h188 l34 70 a34 34 0 0 1 -30 50 h-196 a34 34 0 0 1 -30-50 z"
          fill="#f0fdfa" opacity="0.22"/>
    <circle cx="216" cy="352" r="14" fill="#f0fdfa" opacity="0.85"/>
    <circle cx="262" cy="330" r="9" fill="#f0fdfa" opacity="0.7"/>
    <circle cx="298" cy="364" r="11" fill="#f0fdfa" opacity="0.8"/>
    <circle cx="352" cy="120" r="18" fill="#134e4a"/>
    <circle cx="396" cy="164" r="12" fill="#134e4a" opacity="0.85"/>
    <circle cx="340" cy="176" r="9" fill="#134e4a" opacity="0.7"/>
    <path d="M352 120 L396 164 M352 120 L340 176" stroke="#134e4a" stroke-width="8" stroke-linecap="round"/>
  </g>
</svg>`;

const OUT_DIR = "public/icons";

await mkdir(OUT_DIR, { recursive: true });

await writeFile(`${OUT_DIR}/icon.svg`, SVG, "utf8");

const sizes = [
  ["icon-192.png", SVG, 192],
  ["icon-512.png", SVG, 512],
  ["maskable-512.png", MASKABLE_SVG, 512],
  ["apple-touch-icon.png", SVG, 180],
];

for (const [name, svg, size] of sizes) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${OUT_DIR}/${name}`);
  console.log(`✓ ${OUT_DIR}/${name} (${size}x${size})`);
}

console.log("Done.");
