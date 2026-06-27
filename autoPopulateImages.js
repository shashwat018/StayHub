/**
 * StayHub — Auto-Populate Images Script
 * ----------------------------------------
 * Maps subfolders inside frontend/hostel_images/ to PG entries in pgs.json
 * using fuzzy string matching (lowercase + remove special chars).
 *
 * Run with: node backend/scripts/autoPopulateImages.js
 */

const fs   = require('fs');
const path = require('path');

const PGS_PATH     = path.join(__dirname, '../../backend/data/pgs.json');
const IMAGES_DIR   = path.join(__dirname, '../../frontend/hostel_images');
const IMAGE_EXTS   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

// Normalize a string for fuzzy matching: lowercase, remove non-alphanumeric
function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Simple fuzzy match score: count matching substrings
function similarityScore(a, b) {
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  let matches = 0;
  for (let i = 0; i < na.length - 2; i++) {
    if (nb.includes(na.slice(i, i + 3))) matches++;
  }
  return matches / Math.max(na.length, 1);
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ hostel_images directory not found at: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const pgs = JSON.parse(fs.readFileSync(PGS_PATH, 'utf8'));
  const subfolders = fs.readdirSync(IMAGES_DIR).filter(name => {
    return fs.statSync(path.join(IMAGES_DIR, name)).isDirectory();
  });

  console.log(`\n📂 Found ${subfolders.length} hostel image folders`);
  console.log(`📋 Matching against ${pgs.length} PGs in pgs.json\n`);

  let updated = 0;

  subfolders.forEach(folder => {
    // Find best matching PG
    let bestPG = null, bestScore = 0;
    pgs.forEach(pg => {
      const score = similarityScore(folder, pg.name);
      if (score > bestScore) { bestScore = score; bestPG = pg; }
    });

    if (!bestPG || bestScore < 0.3) {
      console.log(`⚠️  No match for folder: "${folder}" (best score: ${bestScore.toFixed(2)})`);
      return;
    }

    // Collect all image files in this subfolder
    const folderPath = path.join(IMAGES_DIR, folder);
    const imageFiles = fs.readdirSync(folderPath)
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map(f => `hostel_images/${folder}/${f}`);

    if (imageFiles.length === 0) {
      console.log(`⚠️  No images found in folder: "${folder}"`);
      return;
    }

    // Update PG images array
    const pgIdx = pgs.findIndex(p => p.id === bestPG.id);
    if (pgIdx !== -1) {
      pgs[pgIdx].images = imageFiles;
      console.log(`✅ "${folder}" → "${bestPG.name}" (score: ${bestScore.toFixed(2)}, ${imageFiles.length} images)`);
      updated++;
    }
  });

  // Save updated pgs.json
  fs.writeFileSync(PGS_PATH, JSON.stringify(pgs, null, 2), 'utf8');
  console.log(`\n✨ Done! Updated images for ${updated} PGs. pgs.json saved.\n`);
}

main();
