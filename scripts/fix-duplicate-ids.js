const fs = require("fs");
const path = require("path");

const JSON_PATH = path.join(__dirname, "../data/wallpapers.json");

if (!fs.existsSync(JSON_PATH)) {
  console.error("❌ wallpapers.json not found at:", JSON_PATH);
  process.exit(1);
}

const wallpapers = JSON.parse(fs.readFileSync(JSON_PATH, "utf-8"));

const seen = new Set();
const counters = {};

const fixed = wallpapers.map(item => {
  const category = item.category || "unknown";

  if (!counters[category]) counters[category] = 1;

  let id = item.id;

  if (seen.has(id)) {
    const newId = `${category}_${String(counters[category]).padStart(2, "0")}`;
    console.log(`🔁 Duplicate found: ${id} → ${newId}`);
    id = newId;
    counters[category]++;
  }

  seen.add(id);

  return {
    ...item,
    id
  };
});

fs.writeFileSync(JSON_PATH, JSON.stringify(fixed, null, 2));
console.log("✅ Duplicate IDs fixed automatically");