/**
 * CLI Generator Script for Wallpaper Assets
 * Rebuilds data/wallpapers.json, data/categories.json and generates missing thumbnails.
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
const CATEGORIES_JSON = path.join(DATA_DIR, 'categories.json');
const CATEGORY_COVERS_JSON = path.join(DATA_DIR, 'category_covers.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');

const isImage = (file) => /\.(jpg|jpeg|png|webp)$/i.test(file);
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

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

function getCategoryCovers() {
  if (fs.existsSync(CATEGORY_COVERS_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(CATEGORY_COVERS_JSON, 'utf8'));
    } catch (e) {}
  }
  return {};
}

function saveCategoryCovers(covers) {
  fs.writeFileSync(CATEGORY_COVERS_JSON, JSON.stringify(covers, null, 2) + '\n', 'utf8');
}

function getOrderedCategories() {
  const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  const diskCategories = entries
    .filter(d => d.isDirectory() && !d.name.endsWith('_thumb') && !d.name.startsWith('.'))
    .map(d => d.name)
    .sort(naturalSort);

  const diskSet = new Set(diskCategories);
  const ordered = [];

  if (fs.existsSync(CATEGORIES_JSON)) {
    try {
      const data = JSON.parse(fs.readFileSync(CATEGORIES_JSON, 'utf8'));
      if (data && Array.isArray(data.categories)) {
        for (const item of data.categories) {
          const name = typeof item === 'string' ? item : item.name;
          if (name && diskSet.has(name) && !ordered.includes(name)) {
            ordered.push(name);
          }
        }
      }
    } catch (e) {}
  }

  const remaining = diskCategories.filter(c => !ordered.includes(c));
  ordered.push(...remaining);
  return ordered;
}

async function run() {
  console.log('🔄 Scanning images and rebuilding catalog with category ordering and covers...');
  const cfg = getConfig();
  const cdnBase = cfg.cdnUrl.replace(/\/+$/, '');
  const thumbWidth = cfg.thumbnailWidth || 520;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const categories = getOrderedCategories();
  const covers = getCategoryCovers();

  const wallpapers = [];
  const categoriesList = [];
  const coversMap = {};
  let generatedThumbs = 0;

  for (let idx = 0; idx < categories.length; idx++) {
    const cat = categories[idx];
    const catDir = path.join(IMAGES_DIR, cat);
    const thumbDir = path.join(IMAGES_DIR, `${cat}_thumb`);
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

    const files = fs.readdirSync(catDir).filter(isImage).sort(naturalSort);
    console.log(`📁 Category "${cat}" (#${idx + 1}): ${files.length} wallpapers`);

    let coverFilename = covers[cat];
    if (!coverFilename || !files.includes(coverFilename)) {
      coverFilename = files.length > 0 ? files[0] : null;
      if (coverFilename) {
        covers[cat] = coverFilename;
      } else {
        delete covers[cat];
      }
    }

    const coverThumbUrl = coverFilename
      ? `${cdnBase}/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(coverFilename)}`
      : null;
    const coverFullUrl = coverFilename
      ? `${cdnBase}/${encodeURIComponent(cat)}/${encodeURIComponent(coverFilename)}`
      : null;

    if (coverThumbUrl) {
      coversMap[cat] = coverThumbUrl;
    }

    categoriesList.push({
      name: cat,
      index: idx + 1,
      count: files.length,
      coverFilename: coverFilename || null,
      coverThumbnail: coverThumbUrl,
      coverWallpaper: coverFullUrl,
      localCoverThumbnail: coverFilename ? `/storage/images/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(coverFilename)}` : null,
      localCoverWallpaper: coverFilename ? `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(coverFilename)}` : null
    });

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
      const isCover = file === coverFilename;
      wallpapers.push({
        id: makeId(cat, name),
        category: cat,
        isCover,
        url: `${cdnBase}/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
        thumb: `${cdnBase}/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(file)}${isCover ? '?cover=true' : ''}`
      });
    }
  }

  saveCategoryCovers(covers);
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

  const categoriesJsonData = {
    version: nextVer,
    categories: categoriesList,
    covers: coversMap
  };
  fs.writeFileSync(CATEGORIES_JSON, JSON.stringify(categoriesJsonData, null, 2) + '\n', 'utf8');

  console.log('\n=============================================');
  console.log(`✅ Catalog rebuilt successfully! (v${nextVer})`);
  console.log(`📊 Total Wallpapers: ${wallpapers.length} across ${categories.length} categories`);
  if (generatedThumbs > 0) {
    console.log(`🖼️ Created ${generatedThumbs} missing thumbnails`);
  }
  console.log(`📄 Saved to data/wallpapers.json & data/categories.json`);
  console.log('=============================================\n');
}

run().catch(console.error);
