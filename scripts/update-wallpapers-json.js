const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const OUTPUT_JSON = path.join(ROOT, "data", "wallpapers.json");

const BASE_URL =
  "https://cdn.jsdelivr.net/gh/raj918/wallpaper-assets/images";

const isImage = (file) => /\.(jpg|jpeg|png)$/i.test(file);

const makeId = (category, name) => {
  const hash = crypto
    .createHash("md5")
    .update(category + name)
    .digest("hex")
    .slice(0, 6);

  return `${category}_${name}_${hash}`;
};

const wallpapers = [];

fs.readdirSync(IMAGES_DIR).forEach((folder) => {
  const folderPath = path.join(IMAGES_DIR, folder);

  // skip thumbs & non folders
  if (
    !fs.statSync(folderPath).isDirectory() ||
    folder.endsWith("_thumb")
  ) {
    return;
  }

  const category = folder.replace(/\s+/g, "_");
  const thumbFolder = `${folder}_thumb`;

  console.log(`📁 Category: ${category}`);

  fs.readdirSync(folderPath).forEach((file) => {
    if (!isImage(file)) return;

    const name = path.parse(file).name;

    wallpapers.push({
      id: makeId(category, name),
      category,
      url: `${BASE_URL}/${encodeURIComponent(folder)}/${file}`,
      thumb: `${BASE_URL}/${encodeURIComponent(thumbFolder)}/${file}`,
    });
  });
});

// sort for clean diffs (amoled am1 → am2 → ...)
wallpapers.sort((a, b) => {
  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }
  return a.url.localeCompare(b.url);
});

// ensure data folder exists
fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });

// write json
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(wallpapers, null, 2));

console.log(`\n✅ ${wallpapers.length} wallpapers written`);
console.log(`📄 Output → data/wallpapers.json`);