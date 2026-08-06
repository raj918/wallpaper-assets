const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const crypto = require("crypto");

const BASE_URL = "https://cdn.jsdelivr.net/gh/raj918/wallpaper-assets/images";
const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const DATA_FILE = path.join(ROOT, "data/wallpapers.json");

const isImage = (file) => /\.(jpg|jpeg|png)$/i.test(file);
const generateId = () => crypto.randomBytes(3).toString("hex");

const normalizeCategory = (folder) =>
  folder.trim().toLowerCase().replace(/\s+/g, "_");

async function run() {
  let newData = [];

  const folders = fs.readdirSync(IMAGES_DIR);

  for (const folder of folders) {
    if (folder.endsWith("_thumb")) continue;

    const category = normalizeCategory(folder);

    const inputFolder = path.join(IMAGES_DIR, folder);
    const thumbFolder = path.join(IMAGES_DIR, folder + "_thumb");

    if (!fs.existsSync(thumbFolder)) {
      fs.mkdirSync(thumbFolder);
      console.log(`📂 Created: ${folder}_thumb`);
    }

    console.log(`\n📁 Processing: ${folder}`);

    const files = fs.readdirSync(inputFolder).filter(isImage);

    for (const file of files) {
      const inputPath = path.join(inputFolder, file);
      const thumbPath = path.join(thumbFolder, file);

      const url = `${BASE_URL}/${folder}/${file}`;
      const thumb = `${BASE_URL}/${folder}_thumb/${file}`;

      // ✅ create thumbnail if missing
      if (!fs.existsSync(thumbPath)) {
        try {
          await sharp(inputPath)
            .resize({ width: 520, withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toFile(thumbPath);

          console.log(`🖼️ Thumb: ${file}`);
        } catch (err) {
          console.error(`❌ Error: ${file}`, err.message);
          continue;
        }
      }

      // ✅ ALWAYS push fresh (no duplicate possible)
      newData.push({
        id: `${category}_${path.parse(file).name}_${generateId()}`,
        category,
        url,
        thumb,
      });
    }
  }

  // 🔥 overwrite completely (THIS FIXES DUPLICATES)
  fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));

  console.log("\n🔥 JSON FULLY REBUILT (NO DUPLICATES)");
}

run();