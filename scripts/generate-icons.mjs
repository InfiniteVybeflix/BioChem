#!/usr/bin/env node
/**
 * Generates the PWA icon set from the official brand mark
 * (public/brand/Logo.webp) using sharp. Run once — the outputs are
 * committed:
 *
 *   node scripts/generate-icons.mjs
 *
 * The brand artwork already sits on its own deep-navy canvas, so every
 * icon is a full-bleed composite of that canvas plus the mark; the
 * maskable variant adds extra safe-zone padding.
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BRAND_MARK = "public/brand/Logo.webp";
const OUT_DIR = "public/icons";
// Matches the logo's own near-black navy canvas.
const BG = { r: 2, g: 6, b: 15, alpha: 1 };

const mark = await readFile(BRAND_MARK);

async function compose(size, scale) {
  const inner = Math.round(size * scale);
  const resized = await sharp(mark).resize(inner, inner).png().toBuffer();
  const offset = Math.round((size - inner) / 2);
  return sharp({
    create: { width: size, height: size, channels: 3, background: BG },
  })
    .composite([{ input: resized, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const sizes = [
    ["icon-192.png", 192, 0.88],
    ["icon-512.png", 512, 0.88],
    ["maskable-512.png", 512, 0.7],
    ["apple-touch-icon.png", 180, 0.88],
  ];

  for (const [name, size, scale] of sizes) {
    const png = await compose(size, scale);
    await writeFile(`${OUT_DIR}/${name}`, png);
    console.log(`✓ ${OUT_DIR}/${name} (${size}x${size})`);
  }

  // icon.svg — SVG wrapper embedding the 512px PNG.
  const png512 = await compose(512, 0.88);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">
  <title>BioChem app icon</title>
  <image width="512" height="512" xlink:href="data:image/png;base64,${png512.toString("base64")}"/>
</svg>
`;
  await writeFile(`${OUT_DIR}/icon.svg`, svg, "utf8");
  console.log(`✓ ${OUT_DIR}/icon.svg (${Math.round(svg.length / 1024)} KiB)`);
  console.log("Done.");
}

await main();
