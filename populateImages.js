const fs   = require('fs');
const path = require('path');

// Find hostel root
const roots = [
  'C:/Users/suhan shetty/OneDrive/Desktop/New folder/ALL HOSTELS',
  path.join(__dirname, '../../../../../ALL HOSTELS'),
  path.join(__dirname, '../../../../ALL HOSTELS'),
  path.join(__dirname, '../../../ALL HOSTELS'),
];
const hostelRoot = roots.find(p => fs.existsSync(p));
if (!hostelRoot) { console.error('Cannot find hostel folder'); process.exit(1); }

const pgsPath = path.join(__dirname, '../data/pgs.json');
const pgs = JSON.parse(fs.readFileSync(pgsPath, 'utf8'));
const IMG = ['.jpg','.jpeg','.png','.webp','.JPG','.JPEG','.PNG','.WEBP'];

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const folders = fs.readdirSync(hostelRoot)
  .filter(f => fs.statSync(path.join(hostelRoot, f)).isDirectory());

let matched = 0;
pgs.forEach(pg => {
  // Skip if already has real images (not placeholder)
  if (pg.images && pg.images.length > 0 && pg.images[0].startsWith('/hostels/')) {
    const existing = path.join(hostelRoot, decodeURIComponent(pg.images[0].replace('/hostels/','').split('/')[0]));
    if (fs.existsSync(existing)) { matched++; return; } // already good
  }

  const pgN = norm(pg.name);
  let best = null, bestScore = 0;

  folders.forEach(folder => {
    const fN = norm(folder);
    // Word overlap scoring
    const pgWords = pgN.match(/.{1,4}/g) || [];
    let score = 0;
    pgWords.forEach(w => { if (fN.includes(w)) score += w.length; });
    if (fN === pgN) score = 9999;
    if (score > bestScore) { best = folder; bestScore = score; }
  });

  if (best && bestScore > 3) {
    const folderPath = path.join(hostelRoot, best);
    const imgs = fs.readdirSync(folderPath)
      .filter(f => IMG.includes(path.extname(f)))
      .sort() // consistent order
      .map(f => `/hostels/${encodeURIComponent(best)}/${encodeURIComponent(f)}`);
    
    if (imgs.length > 0) {
      pg.images = imgs;
      matched++;
      console.log(`✅ "${pg.name}" → "${best}" (${imgs.length} imgs)`);
    } else {
      console.log(`⚠️  "${pg.name}" → "${best}" — folder empty`);
    }
  } else {
    console.log(`❌ No match: "${pg.name}" (best: "${best}", score: ${bestScore})`);
  }
});

fs.writeFileSync(pgsPath, JSON.stringify(pgs, null, 2));
console.log(`\nDone — ${matched}/${pgs.length} PGs have images`);
