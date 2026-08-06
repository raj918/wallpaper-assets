const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const IMAGES_DIR = path.join(__dirname, "images");

const isImage = (file) => /\.(jpg|jpeg|png)$/i.test(file);

fs.readdirSync(IMAGES_DIR).forEach(async (folder) => {
  const inputFolder = path.join(IMAGES_DIR, folder);

  // skip thumbs & non-folders
  if (
    !fs.statSync(inputFolder).isDirectory() ||
    folder.endsWith("_thumb")
  ) {
    return;
  }

  const outputFolder = path.join(IMAGES_DIR, `${folder}_thumb`);

  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  console.log(`\n📁 Processing folder: ${folder}`);

  fs.readdirSync(inputFolder).forEach(async (file) => {
    if (!isImage(file)) return;

    const inputPath = path.join(inputFolder, file);
    const outputPath = path.join(outputFolder, file);

    try {
     await sharp(inputPath)
  .resize({
    width: 520,               // ⬆️ sharper (~30% increase)
    withoutEnlargement: true
  })
  .jpeg({
    quality: 88,              // ⬆️ BIG quality jump
    chromaSubsampling: '4:4:4' // 🔥 keeps colors sharp
  })
  .toFile(outputPath);
      console.log(`  ✔ ${folder}/${file}`);
    } catch (err) {
      console.error(`  ❌ Error: ${folder}/${file}`, err.message);
    }
  });
});

console.log("\n✅ ALL thumbnails created!");