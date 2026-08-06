const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");

const isImage = (file) => /\.(jpg|jpeg|png)$/i.test(file);

async function run() {
  const folders = fs.readdirSync(IMAGES_DIR);

  for (const folder of folders) {
    if (folder.endsWith("_thumb")) continue;

    const inputFolder = path.join(IMAGES_DIR, folder);
    const thumbFolder = path.join(IMAGES_DIR, folder + "_thumb");

    // recreate clean folder
    if (fs.existsSync(thumbFolder)) {
      fs.rmSync(thumbFolder, { recursive: true, force: true });
    }
    fs.mkdirSync(thumbFolder);

    console.log(`\n📁 Fixing: ${folder}`);

    const files = fs.readdirSync(inputFolder).filter(isImage);

    for (const file of files) {
      const inputPath = path.join(inputFolder, file);
      const thumbPath = path.join(thumbFolder, file);

      await sharp(inputPath)
        .resize({ width: 520, withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toFile(thumbPath);

      console.log(`✅ Fixed thumb: ${file}`);
    }
  }

  console.log("\n🔥 ALL THUMBNAILS FIXED");
}

run();