const fs = require("fs");
const path = require("path");

const JSON_PATH = path.join(__dirname, "../data/wallpapers.json");

const wallpapers = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

const seen = new Map();
const counters = {}; // per-category counters

const fixed = wallpapers.map(item => {
  const category = item.category;

  if (!counters[category]) {
    counters[category] = 1;
  }

  let id = item.id;

  if (seen.has(id)) {
    // generate new unique id
    const newId = `${category}_${String(counters[category]).padStart(2, "0")}`;
    counters[category]++;

    console.log(`🔁 Duplicate found: ${id} → ${newId}`);

    id = newId;
  }

  seen.set(id, true);

  return {
    ...item,
    id
  };
});

fs.writeFileSync(JSON_PATH, JSON.stringify(fixed, null, 2));
console.log("✅ Duplicate IDs fixed automatically");