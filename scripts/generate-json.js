/**
 * CLI Generator Script for Wallpaper Assets
 * Rebuilds data/wallpapers.json and generates missing thumbnails.
 * Usage: node scripts/generate-json.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT_DIR, 'images');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const WALLPAPERS_JSON = path.join(DATA_DIR, 'wallpapers.json');
const VERSION_JSON = path.join(DATA_DIR, 'version.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');

const isImage = (file) => /\.(jpg|jpeg|png|webp)$/i.test(file);

function getConfig() {
  const defaults = {
    cdnUrl: 'https://cdn.jsdelivr.net/gh/raj918/wallpaper-assets/images',
    thumbnailWidth: 520
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {}
  }
  return defaults;
}

function makeId(category, name) {
  const hash = crypto
    .createHash('md5')
    .update(category + name)
    .digest('hex')
    .slice(0, 6);
  return `${category}_${name}_${hash}`;
}

async function run() {
  console.log('🔄 Scanning images and rebuilding catalog...');
  const cfg = getConfig();
  const cdnBase = cfg.cdnUrl.replace(/\/+$/, '');
  const thumbWidth = cfg.thumbnailWidth || 520;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  const categories = entries
    .filter(d => d.isDirectory() && !d.name.endsWith('_thumb') && !d.name.startsWith('.'))
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const wallpapers = [];
  let generatedThumbs = 0;

  for (const cat of categories) {
    const catDir = path.join(IMAGES_DIR, cat);
    const thumbDir = path.join(IMAGES_DIR, `${cat}_thumb`);
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const files = fs.readdirSync(catDir).filter(isImage);
    console.log(`📁 Category "${cat}": ${files.length} wallpapers`);

    for (const file of files) {
      const inputPath = path.join(catDir, file);
      const thumbPath = path.join(thumbDir, file);
      const ext = path.extname(file).toLowerCase();

      if (!fs.existsSync(thumbPath)) {
        try {
          let pipeline = sharp(inputPath).resize({ width: thumbWidth, withoutEnlargement: true });
          if (ext === '.webp') {
            pipeline = pipeline.webp({ quality: 88 });
          } else if (ext === '.png') {
            pipeline = pipeline.png({ compressionLevel: 8 });
          } else {
            pipeline = pipeline.jpeg({ quality: 88, chromaSubsampling: '4:4:4' });
          }
          await pipeline.toFile(thumbPath);
          generatedThumbs++;
        } catch (e) {
          console.warn(`  ⚠️ Failed to generate thumb for ${file}:`, e.message);
        }
      }

      const name = path.parse(file).name;
      wallpapers.push({
        id: makeId(cat, name),
        category: cat,
        url: `${cdnBase}/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
        thumb: `${cdnBase}/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(file)}`
      });
    }
  }

  // Sort wallpapers: category first, then url
  wallpapers.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.url.localeCompare(b.url);
  });

  fs.writeFileSync(WALLPAPERS_JSON, JSON.stringify(wallpapers, null, 2) + '\n', 'utf8');

  // Update version metadata
  let currentVer = 1;
  if (fs.existsSync(VERSION_JSON)) {
    try {
      currentVer = JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8')).version || 1;
    } catch (e) {}
  }
  const nextVer = currentVer + 1;
  fs.writeFileSync(VERSION_JSON, JSON.stringify({
    version: nextVer,
    totalWallpapers: wallpapers.length,
    categoriesCount: categories.length,
    lastUpdated: new Date().toISOString()
  }, null, 2) + '\n', 'utf8');

  console.log('\n=============================================');
  console.log(`✅ Catalog rebuilt successfully! (v${nextVer})`);
  console.log(`📊 Total Wallpapers: ${wallpapers.length} across ${categories.length} categories`);
  if (generatedThumbs > 0) {
    console.log(`🖼️ Created ${generatedThumbs} missing thumbnails`);
  }
  console.log(`📄 Saved to data/wallpapers.json`);
  console.log('=============================================\n');
}

run().catch(console.error);
