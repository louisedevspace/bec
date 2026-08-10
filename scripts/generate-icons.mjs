import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const srcLogo = path.resolve(root, 'client', 'src', 'assets', 'logo.png');
const outDir = path.resolve(root, 'client', 'public', 'icons');

async function run() {
  if (!fs.existsSync(srcLogo)) {
    console.error('Source logo not found at:', srcLogo);
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outputs = [
    { size: 192, file: path.join(outDir, 'icon-192.png') },
    { size: 512, file: path.join(outDir, 'icon-512.png') },
  ];
  for (const { size, file } of outputs) {
    await sharp(srcLogo)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(file);
    console.log('Generated', file);
  }
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
