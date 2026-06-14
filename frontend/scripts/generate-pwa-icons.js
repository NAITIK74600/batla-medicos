import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'public', 'logo.png');
const OUT = join(__dirname, '..', 'public', 'icons');

mkdirSync(OUT, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const s of sizes) {
  await sharp(SRC)
    .resize(s, s, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(join(OUT, `icon-${s}x${s}.png`));
  console.log(`✓ icon-${s}x${s}.png`);
}

// Maskable icon (with padding for safe zone)
await sharp(SRC)
  .resize(384, 384, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .extend({ top: 64, bottom: 64, left: 64, right: 64, background: { r: 255, g: 255, b: 255, alpha: 1 } })
  .resize(512, 512)
  .png()
  .toFile(join(OUT, 'maskable-512x512.png'));
console.log('✓ maskable-512x512.png');

console.log('\nAll PWA icons generated!');
