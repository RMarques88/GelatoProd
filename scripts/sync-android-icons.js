const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Config
const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'assets');
const androidResDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

const iconPath = path.join(assetsDir, 'icon.png');
const adaptivePath = path.join(assetsDir, 'adaptive-icon.png');

// Sizes for mipmap (approx values for launcher icons in px)
const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function writeIconToFolder(srcPath, folder, fileName, size) {
  await ensureDir(folder);
  const outPath = path.join(folder, fileName);
  await sharp(srcPath).resize(size, size).webp({ quality: 90 }).toFile(outPath);
  console.log('written', outPath);
}

async function main() {
  if (!fs.existsSync(iconPath)) {
    console.error('icon not found at', iconPath);
    process.exit(1);
  }

  // Generate ic_launcher for each mipmap
  for (const [folderName, px] of Object.entries(sizes)) {
    const folder = path.join(androidResDir, folderName);
    await writeIconToFolder(iconPath, folder, 'ic_launcher.webp', px);
    // Also create ic_launcher_round.webp (same size)
    await writeIconToFolder(iconPath, folder, 'ic_launcher_round.webp', px);
  }

  // Generate ic_launcher_foreground from adaptive-icon (if exists) or icon
  const fgSource = fs.existsSync(adaptivePath) ? adaptivePath : iconPath;
  for (const [folderName, px] of Object.entries(sizes)) {
    const folder = path.join(androidResDir, folderName);
    await writeIconToFolder(fgSource, folder, 'ic_launcher_foreground.webp', px);
  }

  // Ensure mipmap-anydpi-v26 has xml and foreground
  const anydpi = path.join(androidResDir, 'mipmap-anydpi-v26');
  await ensureDir(anydpi);

  // write foreground image (512 recommended)
  const fgOut = path.join(anydpi, 'ic_launcher_foreground.png');
  await sharp(fgSource).resize(512, 512).png({ quality: 90 }).toFile(fgOut);
  console.log('written', fgOut);

  // write ic_launcher.xml to reference adaptive icon
  const xmlContent = `<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<adaptive-icon xmlns:android=\"http://schemas.android.com/apk/res/android\">\n    <foreground android:drawable=\"@mipmap/ic_launcher_foreground\"/>\n    <background android:drawable=\"@color/iconBackground\"/>\n</adaptive-icon>`;
  fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), xmlContent, 'utf8');
  console.log('written', path.join(anydpi, 'ic_launcher.xml'));

  console.log('Done syncing Android icons.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
