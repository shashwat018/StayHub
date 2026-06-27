/**
 * VLIVE / StayHub — Integrated Backend
 * Main Express server — PORT 3000
 *
 * Routes:
 *   GET  /                          → health
 *   GET  /api/listings              → all PGs with filters
 *   GET  /api/pg/:id                → single PG detail
 *   GET  /api/listings/meta/filters → filter options
 *   POST /api/fitscore              → AI recommendation
 *   GET  /api/fitscore/weights      → ROC weight preview
 *   GET  /api/campuses              → campus info
 *   GET  /api/health                → health check
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const http    = require('http');

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));

const fs = require('fs');

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/hostel_images', express.static(path.join(__dirname, '../frontend/hostel_images')));

// ── Serve hostel images — try multiple folder name variants ──
const hostelPaths = [
  'C:/Users/suhan shetty/OneDrive/Desktop/New folder/ALL HOSTELS',
  path.join(__dirname, '../../../../ALL HOSTELS'),
  path.join(__dirname, '../../../../all hostels'),
  path.join(__dirname, '../../../../../ALL HOSTELS'),
  path.join(__dirname, '../all hostels'),
  path.join(__dirname, '../All Hostels'),  
  path.join(__dirname, '../All_Hostels'),
  path.join(__dirname, '../hostels'),
  path.join(__dirname, '../frontend/hostels'),
];
const rawHostelRoot = hostelPaths.find(p => fs.existsSync(p));
if (rawHostelRoot) {
  const hostelRoot = path.resolve(rawHostelRoot);
  // serve with decoded URLs so spaces in folder names work
  app.use('/hostels', (req, res, next) => {
    const decoded = decodeURIComponent(req.url);
    const filePath = path.resolve(path.join(hostelRoot, decoded));
    // Security: prevent path traversal
    if (!filePath.startsWith(hostelRoot)) return res.status(403).end();
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.sendFile(filePath);
    }
    next();
  });
  console.log(`✅ Hostel images: ${hostelRoot}`);
} else {
  console.warn('⚠️  No hostel images folder found');
}

// Request logger
app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () =>
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now()-t}ms)`)
    );
    next();
});

// ── Load data ─────────────────────────────────────────────────
const pgs     = require('./data/pgs.json');
const reviews = require('./data/reviews.json');

// ── Utils ─────────────────────────────────────────────────────
const { rankPGs }                          = require('./utils/scoringEngine');
const { calculateAmenityScore, calculateSafetyScore } = require('./utils/amenityScorer');
const { durationWeightedRating }           = require('./utils/reviewUtils');
const { calculateROCWeights }              = require('./utils/rocWeighting');

// ── Enrich PG ─────────────────────────────────────────────────
function enrichPG(pg, campus = 'kondhwa') {
    const distKey = campus === 'bibwewadi' ? 'distance_bibwewadi' : 'distance_kondhwa';
    const pgReviews = (reviews.find(r => r.pg_id === pg.id) || {}).reviews || [];
    return {
        ...pg,
        campus_distance : pg[distKey],
        rent_display    : pg.rent_min === pg.rent_max
                            ? `₹${pg.rent_min}`
                            : `₹${pg.rent_min}–₹${pg.rent_max}`,
        safety_score    : pg.safety_score ?? calculateSafetyScore(pg),
        amenity_score   : parseFloat((calculateAmenityScore(pg) * 10).toFixed(1)),
        rating          : durationWeightedRating(pgReviews),
        review_count    : pgReviews.length,
    };
}

// ── ROOT ──────────────────────────────────────────────────────
app.get('/api', (req, res) => res.json({
    name: 'StayHub API', version: '2.0.0',
    status: 'operational', pgs: pgs.length,
}));

// ── HEALTH ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    data: { total_pgs: pgs.length, reviewed_pgs: reviews.length },
}));

// ── CAMPUSES ─────────────────────────────────────────────────
app.get('/api/campuses', (req, res) => res.json({ success: true, data: [
    { id: 'kondhwa',   name: 'VIT Pune — Kondhwa Campus',   lat: 18.4765, lng: 73.8875 },
    { id: 'bibwewadi', name: 'VIT Pune — Bibwewadi Campus',  lat: 18.4674, lng: 73.8617 },
]}));

// ── FILTER META ───────────────────────────────────────────────
app.get('/api/listings/meta/filters', (req, res) => {
    const areas     = [...new Set(pgs.map(p => p.area))].filter(Boolean).sort();
    const amenities = [...new Set(pgs.flatMap(p => p.amenities || []))].filter(Boolean).sort();
    const rents     = pgs.map(p => p.rent_min).filter(Boolean);
    const dists     = pgs.map(p => p.distance_kondhwa).filter(Boolean);
    res.json({ success: true, data: {
        genders      : ['Male','Female','Any'],
        campuses     : ['kondhwa','bibwewadi'],
        sharing_types: ['single','double','triple','quadruple','six'],
        areas, amenities,
        rent_range   : { min: Math.min(...rents), max: Math.max(...rents) },
        distance_range: { min: Math.min(...dists), max: Math.max(...dists) },
        sort_options : ['distance','rent_asc','rent_desc','rating','safety'],
        priority_options: ['budget','distance','safety','amenities','wifi','food','curfew'],
    }});
});

// ── LISTINGS ─────────────────────────────────────────────────
app.get('/api/listings', (req, res) => {
    const {
        campus = 'kondhwa', gender, min_rent, max_rent,
        max_distance, food, ac, curfew, sharing, wifi_min,
        verified, search, sort = 'distance',
        page = 1, limit = 20,
    } = req.query;

    const distKey = campus === 'bibwewadi' ? 'distance_bibwewadi' : 'distance_kondhwa';
    
    // Explicitly filter out PGs that do not belong to the selected campus (i.e. distance is null)
    let results = pgs.filter(pg => pg[distKey] != null).map(pg => enrichPG(pg, campus));

    if (gender && gender.toLowerCase() !== 'any') {
        const g = gender.toLowerCase();
        results = results.filter(pg => {
            const pg_g = (pg.gender || 'any').toLowerCase();
            return pg_g === 'any' || pg_g === g;
        });
    }
    if (min_rent)     results = results.filter(pg => pg.rent_max >= Number(min_rent));
    if (max_rent)     results = results.filter(pg => pg.rent_min <= Number(max_rent));
    if (max_distance) results = results.filter(pg => pg[distKey] != null && pg[distKey] <= Number(max_distance));
    if (food === 'true') results = results.filter(pg => pg.food === true || pg.food === 'optional');
    if (ac === 'true')   results = results.filter(pg => pg.ac === true);
    if (curfew === 'no_curfew') results = results.filter(pg => pg.curfew === 'no_curfew');
    if (sharing) {
        const sh = sharing.toLowerCase().trim();
        results = results.filter(pg => 
            (pg.sharing_types || []).some(s => s.toLowerCase().includes(sh))
        );
    }
    if (wifi_min)    results = results.filter(pg => (pg.wifi_speed || 0) >= Number(wifi_min));
    if (verified === 'true') results = results.filter(pg => pg.verified === true);
    if (search) {
        const s = search.toLowerCase();
        results = results.filter(pg =>
            pg.name.toLowerCase().includes(s) ||
            pg.area.toLowerCase().includes(s) ||
            (pg.amenities||[]).some(a => a.toLowerCase().includes(s))
        );
    }

    switch (sort) {
        case 'rent_asc':  results.sort((a,b) => (a.rent_min||0) - (b.rent_min||0)); break;
        case 'rent_desc': results.sort((a,b) => (b.rent_max||0) - (a.rent_max||0)); break;
        case 'rating':    results.sort((a,b) => (b.rating||0) - (a.rating||0)); break;
        case 'safety':    results.sort((a,b) => (b.safety_score||0) - (a.safety_score||0)); break;
        default:          results.sort((a,b) => (a.campus_distance||99) - (b.campus_distance||99));
    }

    const pageNum   = Math.max(1, parseInt(page));
    const limitNum  = Math.min(50, Math.max(1, parseInt(limit)));
    const total     = results.length;
    const totalPages = Math.ceil(total / limitNum);
    const paginated = results.slice((pageNum-1)*limitNum, pageNum*limitNum);

    res.json({ success: true, meta: { total, page: pageNum, limit: limitNum, total_pages: totalPages, campus }, data: paginated });
});

// ── PG DETAIL ────────────────────────────────────────────────
app.get('/api/pg/:id', (req, res) => {
    const id     = parseInt(req.params.id);
    const campus = req.query.campus || 'kondhwa';
    const pg     = pgs.find(p => p.id === id);
    if (!pg) return res.status(404).json({ success: false, error: `PG ${id} not found` });
    const pgReviews = (reviews.find(r => r.pg_id === id) || {}).reviews || [];
    res.json({ success: true, data: { ...enrichPG(pg, campus), reviews: pgReviews } });
});

// ── PG REVIEWS ───────────────────────────────────────────────
app.get('/api/pg/:id/reviews', (req, res) => {
    const id  = parseInt(req.params.id);
    const pg  = pgs.find(p => p.id === id);
    if (!pg) return res.status(404).json({ success: false, error: 'PG not found' });
    const list = (reviews.find(r => r.pg_id === id) || {}).reviews || [];
    res.json({ success: true, pg_id: id, pg_name: pg.name,
        review_count: list.length, weighted_rating: durationWeightedRating(list), reviews: list });
});

// ── FITSCORE ─────────────────────────────────────────────────
app.post('/api/fitscore', (req, res) => {
  try {
    const {
        gender, campus = 'kondhwa', budget, preferredDistance,
        needs_food = false, curfew, priorities = ['budget','distance','safety','amenities','wifi'],
        min_results = 3, include_debug = false,
    } = req.body;

    const reviewMap = {};
    reviews.forEach(r => { reviewMap[r.pg_id] = r.reviews; });

    const ranked = rankPGs({ gender, campus, budget: budget ? Number(budget) : null,
        preferredDistance: preferredDistance ? Number(preferredDistance) : null,
        needs_food, curfew, priorities, reviews: reviewMap }, pgs, campus);

    const enriched = ranked.map(pg => {
        const pgReviews = reviewMap[pg.id] || [];
        const out = {
            id: pg.id, name: pg.name, area: pg.area, gender: pg.gender,
            campus_distance: pg.campus_distance, rent_display: pg.rent_display,
            rent_min: pg.rent_min, rent_max: pg.rent_max, deposit: pg.deposit,
            food: pg.food, wifi_speed: pg.wifi_speed, ac: pg.ac, curfew: pg.curfew,
            sharing_types: pg.sharing_types, amenities: pg.amenities,
            safety_score: pg.safety_score, tier: pg.tier, verified: pg.verified,
            contact: pg.contact, source: pg.source, fitScore: pg.fitScore,
            rating: durationWeightedRating(pgReviews), review_count: pgReviews.length,
        };
        if (include_debug) { out.debug_weights = pg.debug_weights; out.debug_scores = pg.debug_scores; }
        return out;
    });

    // Fallback if too few results
    let finalResults = enriched;
    if (finalResults.length < min_results && gender) {
        const fallback = rankPGs({ gender: null, campus, budget: budget ? Number(budget) : null,
            preferredDistance: preferredDistance ? Number(preferredDistance) : null,
            needs_food, curfew, priorities, reviews: reviewMap }, pgs, campus)
            .filter(pg => !ranked.find(r => r.id === pg.id))
            .slice(0, min_results - finalResults.length)
            .map(pg => ({ id: pg.id, name: pg.name, area: pg.area, fitScore: pg.fitScore,
                campus_distance: pg.campus_distance, rent_display: pg.rent_display,
                gender: pg.gender, amenities: pg.amenities, food: pg.food,
                curfew: pg.curfew, sharing_types: pg.sharing_types,
                _note: 'Gender preference mismatch — shown as fallback' }));
        finalResults = [...finalResults, ...fallback];
    }

    res.json({ success: true,
        meta: { total_matched: enriched.length, campus,
            preferences: { gender: gender||'any', budget: budget||'not specified',
                preferred_distance: preferredDistance||'not specified', needs_food, priorities },
            algorithm: 'ROC-weighted + Soft-constraint penalties + Duration-weighted reviews' },
        data: finalResults });
  } catch (err) {
    console.error('[FitScore Error]', err.message, err.stack);
    res.status(500).json({
      success: false,
      error: 'Scoring engine error: ' + err.message,
    });
  }
});

// ── ROC WEIGHTS PREVIEW ───────────────────────────────────────
app.get('/api/fitscore/weights', (req, res) => {
    const { priorities } = req.query;
    if (!priorities) return res.status(400).json({ success: false, error: 'priorities param required' });
    const list    = priorities.split(',').map(p => p.trim());
    const weights = calculateROCWeights(list);
    res.json({ success: true, priorities: list, weights });
});

// ── 404 fallback — serve index.html for SPA-style nav ────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║       StayHub API + Frontend v2.0        ║');
    console.log(`║   http://localhost:${PORT}                    ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log(`✅ ${pgs.length} PGs loaded`);
    console.log(`✅ ${reviews.length} reviewed PGs`);
    console.log(`✅ Frontend served from /frontend`);
});

module.exports = app;
