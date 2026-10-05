const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();

// Path Constants
const ROOT_DIR = __dirname;
const IMAGES_DIR = path.join(ROOT_DIR, 'images');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const WALLPAPERS_JSON = path.join(DATA_DIR, 'wallpapers.json');
const VERSION_JSON = path.join(DATA_DIR, 'version.json');
const CATEGORIES_JSON = path.join(DATA_DIR, 'categories.json');
const CATEGORY_COVERS_JSON = path.join(DATA_DIR, 'category_covers.json');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// Ensure base directories exist
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Static route for local instant preview of wallpapers & thumbnails (no-cache headers to prevent stale reordered thumbnails)
app.use('/storage/images', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}, express.static(IMAGES_DIR));
app.use('/data', express.static(DATA_DIR));

// Convenience direct root endpoints matching CDN and app expectations
app.get('/categories.json', (req, res) => {
  if (fs.existsSync(CATEGORIES_JSON)) {
    res.sendFile(CATEGORIES_JSON);
  } else {
    res.status(404).json({ error: 'categories.json not found' });
  }
});

app.get('/wallpapers.json', (req, res) => {
  if (fs.existsSync(WALLPAPERS_JSON)) {
    res.sendFile(WALLPAPERS_JSON);
  } else {
    res.status(404).json({ error: 'wallpapers.json not found' });
  }
});

app.get('/version.json', (req, res) => {
  if (fs.existsSync(VERSION_JSON)) {
    res.sendFile(VERSION_JSON);
  } else {
    res.status(404).json({ error: 'version.json not found' });
  }
});

// Helper: Config Management
function getConfig() {
  const defaults = {
    cdnUrl: 'https://raw.githubusercontent.com/raj918/wallpaper-assets/main/images',
    thumbnailWidth: 520,
    port: 3000,
    git: {
      autoPush: false,
      remote: 'origin',
      branch: 'main'
    }
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaults, ...parsed };
    } catch (e) {
      console.error('Error reading config file:', e);
    }
  }
  return defaults;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

// Helper: Category Covers Management
function getCategoryCovers() {
  if (fs.existsSync(CATEGORY_COVERS_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(CATEGORY_COVERS_JSON, 'utf8'));
    } catch (e) {
      console.error('Error reading category covers:', e);
    }
  }
  return {};
}

function saveCategoryCovers(covers) {
  fs.writeFileSync(CATEGORY_COVERS_JSON, JSON.stringify(covers, null, 2) + '\n', 'utf8');
}

// Helper: Version Management
function getVersionInfo() {
  if (fs.existsSync(VERSION_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8'));
    } catch (e) {}
  }
  return { version: 1, totalWallpapers: 0, lastUpdated: new Date().toISOString() };
}

function incrementVersion(totalWallpapers = 0, categoriesCount = 0) {
  const current = getVersionInfo();
  const nextVer = (current.version || 0) + 1;
  const versionData = {
    version: nextVer,
    totalWallpapers,
    categoriesCount,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync(VERSION_JSON, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
  return versionData;
}

// Helper: Image file check
const isImage = (file) => /\.(jpg|jpeg|png|webp)$/i.test(file);

// Helper: Natural sort comparator
function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// Helper: Unique ID generator matching scripts/update-wallpapers-json.js
function makeWallpaperId(category, fileName) {
  const name = path.parse(fileName).name;
  const hash = crypto
    .createHash('md5')
    .update(category + name)
    .digest('hex')
    .slice(0, 6);
  return `${category}_${name}_${hash}`;
}

// Helper: Ensure category directory and thumbnail directory exist
// Follows wallpaper-assets exact structure: images/<category> and images/<category>_thumb
function ensureCategoryDirs(category) {
  const catDir = path.join(IMAGES_DIR, category);
  const thumbDir = path.join(IMAGES_DIR, `${category}_thumb`);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
  return { catDir, thumbDir };
}

// Helper: Get list of all wallpaper categories on disk
function getAllCategories() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  const entries = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  return entries
    .filter(d => d.isDirectory() && !d.name.endsWith('_thumb') && !d.name.startsWith('.'))
    .map(d => d.name)
    .sort(naturalSort);
}

// Helper: Get ordered category names from categories.json (preserving custom drag sequence)
function getOrderedCategoryNames() {
  const diskCategories = getAllCategories();
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
    } catch (e) {
      console.error('Error reading order from categories.json:', e);
    }
  }

  // Any newly added categories on disk not yet in custom order get appended
  const remaining = diskCategories.filter(c => !ordered.includes(c));
  ordered.push(...remaining);
  return ordered;
}

// Helper: Regenerate data/wallpapers.json, data/categories.json, data/category_covers.json and data/version.json
function regenerateJsonFiles(customOrder = null) {
  const cfg = getConfig();
  const cdnBase = cfg.cdnUrl.replace(/\/+$/, '');
  const categories = customOrder || getOrderedCategoryNames();
  const covers = getCategoryCovers();

  const wallpapers = [];
  const categoriesList = [];
  const coversMap = {};

  categories.forEach((cat, idx) => {
    const { catDir, thumbDir } = ensureCategoryDirs(cat);
    const files = fs.readdirSync(catDir).filter(isImage).sort(naturalSort);

    // Determine the designated cover filename
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

    const previewFiles = coverFilename && files.includes(coverFilename)
      ? [coverFilename, ...files.filter(f => f !== coverFilename)].slice(0, 4)
      : files.slice(0, 4);

    const previews = previewFiles.map(f => {
      const thumbExists = fs.existsSync(path.join(thumbDir, f));
      return thumbExists
        ? `/storage/images/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(f)}`
        : `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(f)}`;
    });

    categoriesList.push({
      name: cat,
      index: idx + 1,
      count: files.length,
      coverFilename: coverFilename || null,
      coverThumbnail: coverThumbUrl,
      coverWallpaper: coverFullUrl,
      localCoverThumbnail: coverFilename ? `/storage/images/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(coverFilename)}` : null,
      localCoverWallpaper: coverFilename ? `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(coverFilename)}` : null,
      previews
    });

    for (const file of files) {
      const thumbFile = path.join(thumbDir, file);
      // Auto-create missing thumbnail on the fly if needed
      if (!fs.existsSync(thumbFile)) {
        try {
          sharp(path.join(catDir, file))
            .resize({ width: cfg.thumbnailWidth || 520, withoutEnlargement: true })
            .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
            .toFile(thumbFile)
            .catch(() => {});
        } catch (e) {}
      }

      const isCover = file === coverFilename;
      wallpapers.push({
        id: makeWallpaperId(cat, file),
        category: cat,
        isCover,
        url: `${cdnBase}/${encodeURIComponent(cat)}/${encodeURIComponent(file)}`,
        thumb: `${cdnBase}/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(file)}${isCover ? '?cover=true' : ''}`
      });
    }
  });

  saveCategoryCovers(covers);
  fs.writeFileSync(WALLPAPERS_JSON, JSON.stringify(wallpapers, null, 2) + '\n', 'utf8');

  const versionData = incrementVersion(wallpapers.length, categories.length);

  const categoriesJsonData = {
    version: versionData.version,
    categories: categoriesList,
    covers: coversMap
  };
  fs.writeFileSync(CATEGORIES_JSON, JSON.stringify(categoriesJsonData, null, 2) + '\n', 'utf8');

  return { wallpapers, categoriesData: categoriesJsonData, versionData };
}

// Helper: Calculate next sequential file name for a category
function getNextFileName(category, originalFilename) {
  const { catDir } = ensureCategoryDirs(category);
  const ext = (path.extname(originalFilename) || '.jpg').toLowerCase();
  const files = fs.readdirSync(catDir).filter(isImage);

  const catPrefix = category.trim().toLowerCase();

  let maxNum = 0;
  for (const f of files) {
    const match = f.match(/(\d+)\.[^.]+$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum && num < 100000) maxNum = num;
    }
  }

  const nextNum = maxNum + 1;
  return `${catPrefix}_${nextNum}${ext}`;
}

// Git Automation Helper (Commit and Push directly to GitHub)
function execGitCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: ROOT_DIR }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      resolve(stdout.trim());
    });
  });
}

async function getGitStatus() {
  try {
    const statusOut = await execGitCommand('git status --porcelain');
    const branchOut = await execGitCommand('git rev-parse --abbrev-ref HEAD');
    let unpushedCount = 0;
    try {
      const unpushedOut = await execGitCommand('git log origin/main..HEAD --oneline');
      unpushedCount = unpushedOut ? unpushedOut.split('\n').filter(Boolean).length : 0;
    } catch (e) {}

    const pendingChanges = statusOut.split('\n').filter(Boolean).length;
    return {
      clean: pendingChanges === 0,
      pendingCount: pendingChanges,
      unpushedCount,
      branch: branchOut || 'main'
    };
  } catch (err) {
    return { error: err.message, branch: 'main' };
  }
}

async function execGitSync(message = 'Admin Panel: Updated wallpapers and catalog') {
  const cfg = getConfig();
  const remote = (cfg.git && cfg.git.remote) || 'origin';
  const branch = (cfg.git && cfg.git.branch) || 'main';

  // Add data and images
  await execGitCommand('git add data/ images/');

  // Check if anything to commit
  const status = await execGitCommand('git status --porcelain');
  if (status) {
    await execGitCommand(`git commit -m "${message}"`);
  }

  // Push to GitHub
  const pushOutput = await execGitCommand(`git push ${remote} ${branch}`);
  return { success: true, message: 'Pushed to GitHub successfully!', output: pushOutput };
}

// Multer upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

// ==========================================
// API ROUTES
// ==========================================

// 1. Get system config, version, and GitHub status
app.get('/api/config', async (req, res) => {
  const versionInfo = getVersionInfo();
  const gitStatus = await getGitStatus();
  res.json({
    config: getConfig(),
    version: versionInfo.version,
    totalWallpapers: versionInfo.totalWallpapers,
    lastUpdated: versionInfo.lastUpdated,
    git: gitStatus
  });
});

// 2. Update system config
app.post('/api/config', (req, res) => {
  try {
    const { cdnUrl, thumbnailWidth, git } = req.body;
    const current = getConfig();

    if (cdnUrl !== undefined) current.cdnUrl = cdnUrl.trim();
    if (thumbnailWidth !== undefined) current.thumbnailWidth = parseInt(thumbnailWidth, 10) || 520;
    if (git !== undefined) current.git = { ...current.git, ...git };

    saveConfig(current);
    regenerateJsonFiles();

    res.json({ success: true, config: current });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get all categories with stats, covers, and preview strips (ordered by sequence)
app.get('/api/categories', (req, res) => {
  try {
    const categories = getOrderedCategoryNames();
    const covers = getCategoryCovers();
    const cfg = getConfig();
    const cdnBase = cfg.cdnUrl.replace(/\/+$/, '');
    const ts = Date.now();

    const categoriesData = categories.map((cat, idx) => {
      const { catDir, thumbDir } = ensureCategoryDirs(cat);
      const files = fs.readdirSync(catDir).filter(isImage).sort(naturalSort);

      const coverFile = covers[cat] && files.includes(covers[cat]) ? covers[cat] : (files[0] || null);

      const previewFiles = coverFile && files.includes(coverFile)
        ? [coverFile, ...files.filter(f => f !== coverFile)].slice(0, 4)
        : files.slice(0, 4);

      const previews = previewFiles.map(f => {
        const thumbExists = fs.existsSync(path.join(thumbDir, f));
        return thumbExists
          ? `/storage/images/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(f)}?t=${ts}`
          : `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(f)}?t=${ts}`;
      });

      return {
        name: cat,
        index: idx + 1,
        count: files.length,
        coverFilename: coverFile,
        coverThumbnail: coverFile ? `/storage/images/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(coverFile)}?t=${ts}` : null,
        coverWallpaper: coverFile ? `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(coverFile)}?t=${ts}` : null,
        cdnCoverThumbnail: coverFile ? `${cdnBase}/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(coverFile)}` : null,
        cdnCoverWallpaper: coverFile ? `${cdnBase}/${encodeURIComponent(cat)}/${encodeURIComponent(coverFile)}` : null,
        previews
      };
    });

    const total = categoriesData.reduce((sum, c) => sum + c.count, 0);
    const versionInfo = getVersionInfo();

    res.json({
      categories: categoriesData,
      totalWallpapers: total,
      version: versionInfo.version,
      lastUpdated: versionInfo.lastUpdated,
      config: getConfig()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Create new category
app.post('/api/categories', async (req, res) => {
  try {
    let { name } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Category name is required' });
    }

    name = name.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!name) return res.status(400).json({ error: 'Invalid category name' });

    const catDir = path.join(IMAGES_DIR, name);
    if (fs.existsSync(catDir)) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const { thumbDir } = ensureCategoryDirs(name);
    fs.writeFileSync(path.join(catDir, '.gitkeep'), '# Category main\n');
    fs.writeFileSync(path.join(thumbDir, '.gitkeep'), '# Category thumbs\n');

    const { versionData } = regenerateJsonFiles();

    // Auto-Push to GitHub if enabled
    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Created new category "${name}"`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({
      success: true,
      category: name,
      version: versionData.version,
      pushedToGit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder categories sequence by rearranging categories array directly in categories.json
app.post('/api/categories/reorder', async (req, res) => {
  try {
    const { order, category, targetIndex } = req.body;
    const currentCategories = getOrderedCategoryNames();
    let newOrder = [];

    if (Array.isArray(order) && order.length > 0) {
      const validSet = new Set(currentCategories);
      newOrder = order.filter(c => validSet.has(c));
      for (const cat of currentCategories) {
        if (!newOrder.includes(cat)) {
          newOrder.push(cat);
        }
      }
    } else if (category && (typeof targetIndex === 'number' || typeof req.body.position === 'number')) {
      const pos = typeof targetIndex === 'number' ? targetIndex : req.body.position;
      const targetPos = Math.max(0, Math.min(pos <= 0 ? 0 : pos - 1, currentCategories.length - 1));
      const filtered = currentCategories.filter(c => c !== category);
      if (filtered.length !== currentCategories.length) {
        filtered.splice(targetPos, 0, category);
        newOrder = filtered;
      } else {
        return res.status(404).json({ error: `Category "${category}" not found` });
      }
    } else {
      return res.status(400).json({ error: 'Provide either "order" array or "category" with "targetIndex"' });
    }

    const { versionData } = regenerateJsonFiles(newOrder);

    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Reordered categories sequence`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({
      success: true,
      order: newOrder,
      newVersion: versionData.version,
      pushedToGit
    });
  } catch (err) {
    console.error('Reorder categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Get details of a single category
app.get('/api/category/:name', (req, res) => {
  try {
    const cat = req.params.name;
    const catDir = path.join(IMAGES_DIR, cat);

    if (!fs.existsSync(catDir)) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const { thumbDir } = ensureCategoryDirs(cat);
    const files = fs.readdirSync(catDir).filter(isImage).sort(naturalSort);

    const covers = getCategoryCovers();
    const coverFilename = covers[cat] && files.includes(covers[cat]) ? covers[cat] : (files[0] || null);

    const cfg = getConfig();
    const cdnBase = cfg.cdnUrl.replace(/\/+$/, '');
    const ts = Date.now();

    const wallpapers = files.map((f, idx) => {
      const mainPath = path.join(catDir, f);
      const thumbPath = path.join(thumbDir, f);
      let sizeBytes = 0;
      try {
        sizeBytes = fs.statSync(mainPath).size;
      } catch (e) {}

      const isCover = (f === coverFilename);

      return {
        filename: f,
        name: path.parse(f).name,
        index: idx + 1,
        isCover,
        sizeBytes,
        localUrl: `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(f)}?t=${ts}`,
        localThumbnailUrl: fs.existsSync(thumbPath)
          ? `/storage/images/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(f)}?t=${ts}`
          : `/storage/images/${encodeURIComponent(cat)}/${encodeURIComponent(f)}?t=${ts}`,
        cdnUrl: `${cdnBase}/${encodeURIComponent(cat)}/${encodeURIComponent(f)}`,
        cdnThumbnailUrl: `${cdnBase}/${encodeURIComponent(cat)}_thumb/${encodeURIComponent(f)}${isCover ? '?cover=true' : ''}`
      };
    });

    res.json({
      name: cat,
      count: wallpapers.length,
      coverFilename,
      wallpapers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set Category Cover Thumbnail (Swaps/moves the chosen image to position #1 so cover always matches #1)
app.post('/api/category/cover', async (req, res) => {
  try {
    const { category, filename } = req.body;
    if (!category || !filename) {
      return res.status(400).json({ error: 'Category and filename are required' });
    }

    const { catDir, thumbDir } = ensureCategoryDirs(category);
    if (!fs.existsSync(catDir)) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const targetFile = path.join(catDir, filename);
    if (!fs.existsSync(targetFile)) {
      return res.status(404).json({ error: 'Wallpaper file does not exist' });
    }

    // Get current files in order
    const files = fs.readdirSync(catDir).filter(isImage).sort(naturalSort);
    if (!files.includes(filename)) {
      return res.status(404).json({ error: 'Wallpaper not found in category' });
    }

    // Put chosen cover at position 0, keeping rest in order
    const orderedFiles = [filename, ...files.filter(f => f !== filename)];

    // Re-sequence files so chosen cover is at index 1 (#1)
    const catPrefix = category.trim().toLowerCase();
    const prefixSample = files.filter(f => f.toLowerCase().startsWith(`${catPrefix}_`));
    const useCatPrefix = prefixSample.length >= Math.ceil(files.length / 2);

    const renames = [];
    const now = Date.now();

    // Phase 1: Rename to temporary names
    orderedFiles.forEach((oldName, idx) => {
      const ext = path.extname(oldName).toLowerCase();
      const targetName = useCatPrefix ? `${catPrefix}_${idx + 1}${ext}` : `${idx + 1}${ext}`;
      const tempName = `__reorder_${now}_${idx}_${oldName}`;

      const srcMain = path.join(catDir, oldName);
      const tempMain = path.join(catDir, tempName);
      if (fs.existsSync(srcMain)) fs.renameSync(srcMain, tempMain);

      const srcThumb = path.join(thumbDir, oldName);
      const tempThumb = path.join(thumbDir, tempName);
      if (fs.existsSync(srcThumb)) fs.renameSync(srcThumb, tempThumb);

      renames.push({ oldName, tempName, targetName, ext });
    });

    // Phase 2: Rename from temp name to target sequential name
    renames.forEach(({ tempName, targetName }) => {
      const tempMain = path.join(catDir, tempName);
      const finalMain = path.join(catDir, targetName);
      if (fs.existsSync(tempMain)) fs.renameSync(tempMain, finalMain);

      const tempThumb = path.join(thumbDir, tempName);
      const finalThumb = path.join(thumbDir, targetName);
      if (fs.existsSync(tempThumb)) fs.renameSync(tempThumb, finalThumb);
    });

    const newCoverFilename = renames[0].targetName; // Position 1 is the cover!
    const covers = getCategoryCovers();
    covers[category] = newCoverFilename;
    saveCategoryCovers(covers);

    const { versionData } = regenerateJsonFiles();

    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Set "${newCoverFilename}" as cover (#1) for category "${category}"`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({
      success: true,
      category,
      coverFilename: newCoverFilename,
      newVersion: versionData.version,
      pushedToGit
    });
  } catch (err) {
    console.error('Category cover error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reorder wallpapers in a category (Renames files sequentially 1.ext, 2.ext... according to drag-and-drop order)
app.post('/api/wallpapers/reorder', async (req, res) => {
  try {
    const { category, filenames } = req.body;
    if (!category || !Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: 'Category and filenames array required' });
    }

    const { catDir, thumbDir } = ensureCategoryDirs(category);
    if (!fs.existsSync(catDir)) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify all specified files exist
    for (const f of filenames) {
      if (!fs.existsSync(path.join(catDir, f))) {
        return res.status(400).json({ error: `File not found: ${f}` });
      }
    }

    // Detect naming prefix style: e.g. anime_1.jpg vs 1.jpg
    const catPrefix = category.trim().toLowerCase();
    const prefixSample = filenames.filter(f => f.toLowerCase().startsWith(`${catPrefix}_`));
    const useCatPrefix = prefixSample.length >= Math.ceil(filenames.length / 2);

    const renames = [];
    const now = Date.now();

    // Phase 1: Rename each file to a collision-free temporary name
    filenames.forEach((oldName, idx) => {
      const ext = path.extname(oldName).toLowerCase();
      const targetName = useCatPrefix ? `${catPrefix}_${idx + 1}${ext}` : `${idx + 1}${ext}`;
      const tempName = `__reorder_${now}_${idx}_${oldName}`;

      const srcMain = path.join(catDir, oldName);
      const tempMain = path.join(catDir, tempName);
      if (fs.existsSync(srcMain)) fs.renameSync(srcMain, tempMain);

      const srcThumb = path.join(thumbDir, oldName);
      const tempThumb = path.join(thumbDir, tempName);
      if (fs.existsSync(srcThumb)) fs.renameSync(srcThumb, tempThumb);

      renames.push({ oldName, tempName, targetName, ext });
    });

    // Phase 2: Rename from temp name to target sequential name
    renames.forEach(({ tempName, targetName }) => {
      const tempMain = path.join(catDir, tempName);
      const finalMain = path.join(catDir, targetName);
      if (fs.existsSync(tempMain)) fs.renameSync(tempMain, finalMain);

      const tempThumb = path.join(thumbDir, tempName);
      const finalThumb = path.join(thumbDir, targetName);
      if (fs.existsSync(tempThumb)) fs.renameSync(tempThumb, finalThumb);
    });

    // In Wallnest, whichever wallpaper is placed at position 1 (filenames[0]) becomes the category cover!
    const targetCover = renames[0].targetName;
    const covers = getCategoryCovers();
    covers[category] = targetCover;
    saveCategoryCovers(covers);

    const { versionData } = regenerateJsonFiles();

    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Reordered ${filenames.length} wallpapers in ${category}`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({
      success: true,
      category,
      newVersion: versionData.version,
      coverFilename: targetCover,
      count: filenames.length,
      pushedToGit
    });
  } catch (err) {
    console.error('Reorder wallpapers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Bulk upload wallpapers into a category (1 full image + 1 thumbnail)
app.post('/api/upload', upload.array('files', 500), async (req, res) => {
  try {
    const { category, preserveOriginalNames } = req.body;
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const { catDir, thumbDir } = ensureCategoryDirs(category);
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const cfg = getConfig();
    const thumbWidth = cfg.thumbnailWidth || 520;
    const processed = [];

    for (const file of req.files) {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      let outputFilename;

      if (preserveOriginalNames === 'true' || preserveOriginalNames === true) {
        const cleanBase = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        outputFilename = `${cleanBase}${ext}`;
        if (fs.existsSync(path.join(catDir, outputFilename))) {
          outputFilename = `${cleanBase}_${Date.now()}${ext}`;
        }
      } else {
        outputFilename = getNextFileName(category, file.originalname);
      }

      const mainPath = path.join(catDir, outputFilename);
      const thumbPath = path.join(thumbDir, outputFilename);

      // 1. Full Image: Untouched 100% original bytes (zero recompression)
      fs.writeFileSync(mainPath, file.buffer);

      // 2. Thumbnail Image: High quality Sharp pipeline (520px, quality 88, 4:4:4 colors)
      let thumbPipeline = sharp(file.buffer).resize({
        width: thumbWidth,
        withoutEnlargement: true
      });

      if (ext === '.webp') {
        thumbPipeline = thumbPipeline.webp({ quality: 88 });
      } else if (ext === '.png') {
        thumbPipeline = thumbPipeline.png({ compressionLevel: 8 });
      } else {
        thumbPipeline = thumbPipeline.jpeg({
          quality: 88,
          chromaSubsampling: '4:4:4'
        });
      }

      await thumbPipeline.toFile(thumbPath);

      processed.push({
        filename: outputFilename,
        originalName: file.originalname,
        category
      });
    }

    // Regenerate data/wallpapers.json and increment version
    const { versionData } = regenerateJsonFiles();

    // Auto-Push to GitHub if enabled
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Uploaded ${processed.length} wallpapers to ${category}`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({
      success: true,
      category,
      count: processed.length,
      processed,
      newVersion: versionData.version,
      pushedToGit
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete single wallpaper (removes both full image and thumbnail)
app.delete('/api/wallpaper', async (req, res) => {
  try {
    const { category, filename } = req.body;
    if (!category || !filename) {
      return res.status(400).json({ error: 'Category and filename are required' });
    }

    const mainFile = path.join(IMAGES_DIR, category, filename);
    const thumbFile = path.join(IMAGES_DIR, `${category}_thumb`, filename);

    if (fs.existsSync(mainFile)) fs.unlinkSync(mainFile);
    if (fs.existsSync(thumbFile)) fs.unlinkSync(thumbFile);

    const { versionData } = regenerateJsonFiles();

    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Deleted wallpaper ${filename} from ${category}`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({ success: true, newVersion: versionData.version, pushedToGit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Bulk delete multiple wallpapers
app.post('/api/wallpapers/delete-bulk', async (req, res) => {
  try {
    const { category, filenames } = req.body;
    if (!category || !Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: 'Category and filenames array required' });
    }

    for (const filename of filenames) {
      const mainFile = path.join(IMAGES_DIR, category, filename);
      const thumbFile = path.join(IMAGES_DIR, `${category}_thumb`, filename);
      if (fs.existsSync(mainFile)) fs.unlinkSync(mainFile);
      if (fs.existsSync(thumbFile)) fs.unlinkSync(thumbFile);
    }

    const { versionData } = regenerateJsonFiles();

    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Deleted ${filenames.length} wallpapers from ${category}`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({ success: true, count: filenames.length, newVersion: versionData.version, pushedToGit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Delete entire category
app.delete('/api/category/:name', async (req, res) => {
  try {
    const cat = req.params.name;
    const catDir = path.join(IMAGES_DIR, cat);
    const thumbDir = path.join(IMAGES_DIR, `${cat}_thumb`);

    if (!fs.existsSync(catDir) && !fs.existsSync(thumbDir)) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (fs.existsSync(catDir)) fs.rmSync(catDir, { recursive: true, force: true });
    if (fs.existsSync(thumbDir)) fs.rmSync(thumbDir, { recursive: true, force: true });

    const covers = getCategoryCovers();
    if (covers[cat]) {
      delete covers[cat];
      saveCategoryCovers(covers);
    }

    const { versionData } = regenerateJsonFiles();

    const cfg = getConfig();
    let pushedToGit = false;
    if (cfg.git && cfg.git.autoPush) {
      try {
        await execGitSync(`Admin: Removed category ${cat}`);
        pushedToGit = true;
      } catch (gitErr) {
        console.warn('Auto-Push error:', gitErr.message);
      }
    }

    res.json({ success: true, newVersion: versionData.version, pushedToGit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Rebuild all thumbnails across all categories
app.post('/api/regenerate-thumbnails', async (req, res) => {
  try {
    const categories = getAllCategories();
    let totalGenerated = 0;
    const cfg = getConfig();
    const thumbWidth = cfg.thumbnailWidth || 520;

    for (const cat of categories) {
      const { catDir, thumbDir } = ensureCategoryDirs(cat);
      const files = fs.readdirSync(catDir).filter(isImage);

      for (const file of files) {
        const inputPath = path.join(catDir, file);
        const outputPath = path.join(thumbDir, file);
        const ext = path.extname(file).toLowerCase();

        let pipeline = sharp(inputPath).resize({
          width: thumbWidth,
          withoutEnlargement: true
        });

        if (ext === '.webp') {
          pipeline = pipeline.webp({ quality: 88 });
        } else if (ext === '.png') {
          pipeline = pipeline.png({ compressionLevel: 8 });
        } else {
          pipeline = pipeline.jpeg({
            quality: 88,
            chromaSubsampling: '4:4:4'
          });
        }

        await pipeline.toFile(outputPath);
        totalGenerated++;
      }
    }

    const { versionData } = regenerateJsonFiles();

    res.json({ success: true, count: totalGenerated, newVersion: versionData.version });
  } catch (err) {
    console.error('Regenerate thumbnails error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 11. 1-Click Push to GitHub
app.post('/api/git-sync', async (req, res) => {
  try {
    const { message } = req.body;
    const result = await execGitSync(message || 'Admin Panel: Synchronized wallpapers');
    res.json({ success: true, result });
  } catch (err) {
    console.error('Git Push Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 12. Check Git status
app.get('/api/git-status', async (req, res) => {
  try {
    const status = await getGitStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server with automatic fallback port if 3000 is occupied
const initialPort = parseInt(process.env.PORT, 10) || getConfig().port || 3000;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Wallpaper Assets Studio (GitHub & jsDelivr CDN)`);
    console.log(`👉 Running at: http://localhost:${port}`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(initialPort);
