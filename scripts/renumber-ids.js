const fs = require("fs");
const path = require("path");

const JSON_PATH = path.join(__dirname, "../data/wallpapers.json");

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

const grouped = {};
data.forEach(item => {
  if (!grouped[item.category]) grouped[item.category] = [];
  grouped[item.category].push(item);
});

const fixed = [];

Object.keys(grouped).forEach(category => {
  grouped[category].forEach((item, index) => {
    fixed.push({
      ...item,
      id: `${category}_${String(index + 1).padStart(2, "0")}`
    });
  });
});

fs.writeFileSync(JSON_PATH, JSON.stringify(fixed, null, 2));
console.log("✅ IDs renumbered cleanly by category");