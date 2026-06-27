/**
 * StayHub Scoring Engine v3.0
 * Algorithm: ROC Weighting + Exponential Distance Decay + 
 *            Budget Efficiency Score + Null-Safe Amenity Scoring +
 *            Review Credibility Weighting + Hard Constraint Guards
 */

const { calculateROCWeights, redistributeWeights } = require('./rocWeighting');
const { calculateAmenityScore, calculateSafetyScore } = require('./amenityScorer');

// ── Constants ─────────────────────────────────────────────────
const NORM = {
  RENT_MAX:     25000,  // absolute max rent in dataset
  DISTANCE_MAX: 6.0,    // km — beyond this is essentially unusable
  WIFI_MAX:     200,    // Mbps — above this has diminishing returns
  SAFETY_MAX:   10.0,
};

// ── 1. BUDGET SCORE ───────────────────────────────────────────
// If rent ≤ budget: score = 1.0 (perfect, don't penalize cheap PGs)
// If rent > budget: graduated penalty based on % over budget
function scoreBudget(rentMin, budget) {
  if (!rentMin) return 0.5; // unknown rent = neutral
  if (!budget)  return Math.max(0, 1 - rentMin / NORM.RENT_MAX); // no budget set — use absolute scale
  if (rentMin <= budget) return 1.0; // within budget = perfect score
  const overBy = (rentMin - budget) / budget; // e.g. 0.2 = 20% over budget
  return Math.max(0, 1 - Math.pow(overBy, 0.7)); // power < 1 = gentler penalty for small overruns
}

// Hard penalty applied separately — large budget breach tanks the composite
function budgetPenaltyFactor(rentMin, budget) {
  if (!rentMin || !budget || rentMin <= budget) return 0;
  const overBy = (rentMin - budget) / budget;
  return Math.min(overBy * 0.6, 0.6); // max 60% penalty, applied proportional to budget weight
}

// ── 2. DISTANCE SCORE ─────────────────────────────────────────
// Exponential decay: students HATE long distances
// 0km = 1.0, 0.5km = 0.93, 1km = 0.82, 2km = 0.6, 3km = 0.37, 5km = 0.12
function scoreDistance(dist) {
  if (dist == null) return 0.4; // unknown = below average
  if (dist <= 0.3) return 1.0;  // walking distance = perfect
  return Math.max(0, Math.exp(-0.4 * dist));
}

function distancePenaltyFactor(dist, preferredMax) {
  if (!dist || !preferredMax || dist <= preferredMax) return 0;
  const overBy = (dist - preferredMax) / preferredMax;
  return Math.min(overBy * 0.5, 0.5);
}

// ── 3. SAFETY SCORE ───────────────────────────────────────────
function scoreSafety(pg, studentGender) {
  const base = pg.safety_score || calculateSafetyScore(pg, studentGender);
  let score = base / NORM.SAFETY_MAX;
  // Female students get an extra weight on female-only or female-warden PGs
  if ((studentGender || '').toLowerCase() === 'female') {
    if (pg.gender === 'female') score = Math.min(1.0, score * 1.15);
    if (pg.warden_type === 'female') score = Math.min(1.0, score * 1.08);
  }
  return Math.min(1.0, score);
}

// ── 4. AMENITY SCORE (null-safe) ──────────────────────────────
function scoreAmenities(pg) {
  try {
    return calculateAmenityScore(pg); // returns 0–1
  } catch(e) {
    return 0.3; // fallback if amenities data is malformed
  }
}

// ── 5. WIFI SCORE ─────────────────────────────────────────────
// Logarithmic: the jump from 10→50 Mbps matters more than 100→200 Mbps
function scoreWifi(mbps) {
  if (!mbps) return 0.3; // no wifi data = below average
  if (mbps <= 0) return 0;
  return Math.min(1.0, Math.log(mbps + 1) / Math.log(NORM.WIFI_MAX + 1));
}

// ── 6. FOOD SCORE ─────────────────────────────────────────────
function scoreFood(pgFood, needsFood) {
  if (!needsFood) return 1.0; // food not required = neutral
  if (pgFood === true || pgFood === 'included') return 1.0;
  if (pgFood === 'optional') return 0.65;
  return 0.1; // no food when required = very bad
}

// ── 7. CURFEW SCORE ───────────────────────────────────────────
function scoreCurfew(pgCurfew, wantNoCurfew) {
  if (!wantNoCurfew) return 1.0;
  if (!pgCurfew || pgCurfew === 'no_curfew') return 1.0;
  // Has a curfew time — score by how late it is
  const hourMap = { '10pm': 0.5, '11pm': 0.7, '11:30pm': 0.8, '12am': 0.9, 'midnight': 0.9 };
  return hourMap[pgCurfew.toLowerCase()] || 0.6;
}

// ── 8. REVIEW CREDIBILITY BONUS ───────────────────────────────
// Duration-weighted rating on 1-10 scale adds up to 8% bonus
function reviewBonus(pgReviews) {
  if (!pgReviews || pgReviews.length === 0) return 0;
  let ws = 0, tw = 0;
  pgReviews.forEach(r => {
    // Weight = sqrt of months stayed, capped at 12 months
    const w = Math.sqrt(Math.min(r.duration_months || 1, 12));
    ws += (r.rating || 5) * w;
    tw += w;
  });
  if (tw === 0) return 0;
  const weightedAvg = ws / tw; // 1–10 scale
  // Credibility scales with review count (more reviews = more trustworthy)
  const credibility = Math.min(1.0, pgReviews.length / 5);
  // Bonus: 0 to +0.08 for perfect ratings, scaled by credibility
  return ((weightedAvg - 5) / 5) * 0.08 * credibility;
}

// ── GENDER HARD FILTER ────────────────────────────────────────
function passesGenderFilter(pg, studentGender) {
  if (!studentGender) return true;
  const sg = studentGender.toLowerCase();
  const pg_g = (pg.gender || 'any').toLowerCase();
  if (pg_g === 'any') return true;
  return pg_g === sg;
}

// ── MAIN RANKING FUNCTION ─────────────────────────────────────
function rankPGs(studentPrefs, allPGs, campus = 'kondhwa') {
  const {
    gender,
    budget,
    preferredDistance,
    needs_food = false,
    curfew: wantNoCurfew,
    priorities = ['budget', 'distance', 'safety', 'amenities', 'wifi'],
    reviews: reviewMap = {},
  } = studentPrefs;

  const distanceKey = campus === 'bibwewadi' ? 'distance_bibwewadi' : 'distance_kondhwa';

  // ── Hard filter: gender ──────────────────────────────────
  const eligible = allPGs.filter(pg => {
    if (pg[distanceKey] == null) return false; // wrong campus
    return passesGenderFilter(pg, gender);
  });

  // ── ROC weights ──────────────────────────────────────────
  // Always include curfew in the priority list if user wants no curfew
  let effectivePriorities = [...priorities];
  if (wantNoCurfew === 'no_curfew' && !effectivePriorities.includes('curfew')) {
    effectivePriorities.push('curfew');
  }

  let weights = calculateROCWeights(effectivePriorities);

  // Zero out food weight if user doesn't need food, redistribute to others
  if (!needs_food) {
    weights = redistributeWeights(weights, ['food']);
  }

  // Normalise weights to exactly sum to 1.0 (fix floating point drift)
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (weightSum > 0) {
    Object.keys(weights).forEach(k => {
      weights[k] = parseFloat((weights[k] / weightSum).toFixed(4));
    });
  }

  // ── Score each PG ────────────────────────────────────────
  const scored = eligible.map(pg => {
    const dist    = pg[distanceKey];
    const rentMin = pg.rent_min || 0;

    // Individual dimension scores (all 0–1)
    const s_budget    = scoreBudget(rentMin, budget);
    const s_distance  = scoreDistance(dist);
    const s_safety    = scoreSafety(pg, gender);
    const s_amenities = scoreAmenities(pg);
    const s_wifi      = scoreWifi(pg.wifi_speed);
    const s_food      = scoreFood(pg.food, needs_food);
    const s_curfew    = scoreCurfew(pg.curfew, wantNoCurfew === 'no_curfew');

    const scoreMap = {
      budget:    s_budget,
      distance:  s_distance,
      safety:    s_safety,
      amenities: s_amenities,
      wifi:      s_wifi,
      food:      s_food,
      curfew:    s_curfew,
    };

    // Weighted composite
    let composite = 0;
    for (const [criterion, weight] of Object.entries(weights)) {
      if (weight > 0 && scoreMap[criterion] !== undefined) {
        composite += scoreMap[criterion] * weight;
      }
    }

    // Apply soft penalties (graduated, not eliminatory)
    const bPenalty = budgetPenaltyFactor(rentMin, budget) * (weights.budget || 0.25);
    const dPenalty = distancePenaltyFactor(dist, preferredDistance) * (weights.distance || 0.25);
    composite = Math.max(0, composite - bPenalty - dPenalty);

    // Review credibility bonus (max +8%)
    const pgReviews = reviewMap[pg.id] || [];
    const rBonus = reviewBonus(pgReviews);
    composite = Math.min(1.0, composite + rBonus);

    // Verified PG tiny bonus
    if (pg.verified) composite = Math.min(1.0, composite + 0.01);

    const fitScore = parseFloat((composite * 100).toFixed(1));

    return {
      ...pg,
      fitScore,
      campus_distance: dist,
      rent_display: (pg.rent_min && pg.rent_max && pg.rent_min !== pg.rent_max)
        ? `₹${pg.rent_min}–₹${pg.rent_max}`
        : `₹${pg.rent_min || 'Contact'}`,
      // Debug info
      debug_weights: weights,
      debug_scores: {
        budget:    s_budget.toFixed(3),
        distance:  s_distance.toFixed(3),
        safety:    s_safety.toFixed(3),
        amenities: s_amenities.toFixed(3),
        wifi:      s_wifi.toFixed(3),
        food:      s_food.toFixed(3),
        curfew:    s_curfew.toFixed(3),
        budgetPenalty:   bPenalty.toFixed(3),
        distancePenalty: dPenalty.toFixed(3),
        reviewBonus:     rBonus.toFixed(3),
      },
    };
  });

  // Sort by fitScore descending
  scored.sort((a, b) => b.fitScore - a.fitScore);
  return scored;
}

module.exports = { rankPGs };
