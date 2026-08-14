#!/usr/bin/env node
/**
 * Generate Veilpay extension icons.
 *
 * Creates three icon sizes (16, 48, 128) with a solid amber circle (#F59E0B)
 * and a white "V" letter centered on each. Uses Sharp for efficient rendering.
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'public', 'icons');

const AMBER = '#F59E0B';
const WHITE = '#FFFFFF';

// Define sizes with appropriate font scaling
const sizes = [
  { size: 16, fontSize: 10 },
  { size: 48, fontSize: 30 },
  { size: 128, fontSize: 80 },
];

async function generateIcon(size, fontSize) {
  // Create SVG with centered circle and "V"
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${AMBER}"/>
      <text
        x="${size / 2}"
        y="${size / 2}"
        font-family="Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="${WHITE}"
        text-anchor="middle"
        dominant-baseline="central"
      >V</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  try {
    await mkdir(iconsDir, { recursive: true });
    console.log(`Icons directory: ${iconsDir}`);

    for (const { size, fontSize } of sizes) {
      const buffer = await generateIcon(size, fontSize);
      const path = join(iconsDir, `icon-${size}.png`);
      await sharp(buffer).toFile(path);
      console.log(`✓ Generated icon-${size}.png (${buffer.length} bytes)`);
    }

    console.log('\n✓ All icons generated successfully.');
  } catch (error) {
    console.error('Failed to generate icons:', error.message);
    process.exit(1);
  }
}

await main();
