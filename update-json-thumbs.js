const fs = require("fs");
const path = require("path");

const JSON_PATH = path.join(__dirname, "data", "wallpapers.json");

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

const updated = data.map(item => {
  const fileName = item.url.split("/").pop(); // am1.jpg, n10.jpg etc

  return {
    ...item,
    thumb: `https://cdn.jsdelivr.net/gh/raj918/wallpaper-assets/images/${item.category}_thumb/${fileName}`
  };
});

fs.writeFileSync(JSON_PATH, JSON.stringify(updated, null, 2));

console.log("✅ wallpapers.json updated with thumbnail URLs");