const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const JSON_PATH = path.join(__dirname, "../data/wallpapers.json");

const wallpapers = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

const updated = wallpapers.map(item => {
  const fileName = item.url.split("/").pop().replace(".jpg", "");
  const hash = crypto
    .createHash("md5")
    .update(item.url)
    .digest("hex")
    .slice(0, 6);

  return {
    ...item,
    id: `${item.category}_${fileName}_${hash}`
  };
});

fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2));
console.log("✅ Generated globally unique IDs (hash-based)");