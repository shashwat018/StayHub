/**
 * StayHub Amenity Scorer v2.0
 * Null-safe. Handles missing amenities arrays gracefully.
 */

const PROXIMITY_THRESHOLDS = {
  bus_stop: 0.5,   // km — within 500m is ideal
  hospital: 2.0,   // km
  grocery:  0.8,   // km
  gym:      1.5,   // km
};

const AMENITY_WEIGHTS = {
  // High value (student essentials)
  'wifi': 0.09, 'wi-fi': 0.09, 'high-speed wi-fi': 0.09, 'high speed wifi': 0.09,
  'meals': 0.08, 'food': 0.08, 'mess': 0.08, 'pure veg mess': 0.08,
  'washing machine': 0.07, 'laundry': 0.06,
  'study room': 0.07, 'study lobby': 0.07, 'library': 0.06,
  'attached washroom': 0.07, 'attached bathroom': 0.07,
  'power backup': 0.06, 'electricity backup': 0.06, 'generator': 0.06,
  // Security
  'cctv': 0.05, 'surveillance': 0.05, '24x7 security': 0.05, '24/7 security': 0.05,
  'biometric': 0.04, 'gated': 0.03,
  // Comfort
  'ac': 0.05, 'air conditioning': 0.05, 'air conditioned': 0.05,
  'geyser': 0.04, 'hot water': 0.04,
  'water purifier': 0.04, 'ro water': 0.04,
  'refrigerator': 0.04, 'fridge': 0.04,
  'housekeeping': 0.05, 'daily cleaning': 0.04,
  // Lifestyle
  'gym': 0.04, 'fitness': 0.03,
  'tv': 0.03, 'television': 0.03,
  'parking': 0.03, 'bike parking': 0.03,
  'terrace': 0.02, 'indoor games': 0.03, 'carrom': 0.02,
  'induction': 0.03, 'kitchen': 0.04,
  'dining area': 0.03, 'common area': 0.02,
};

function proximityScore(distKm, thresholdKm) {
  if (distKm == null || distKm === undefined) return 0.5; // unknown = neutral
  if (distKm <= 0) return 1.0;
  if (distKm <= thresholdKm) return 1.0;
  // Beyond threshold: linear decay to 0 at 2× threshold
  return Math.max(0, 1.0 - (distKm - thresholdKm) / thresholdKm);
}

function calculateAmenityScore(pg) {
  if (!pg) return 0.3;

  // ── Proximity component (40% of score) ──────────────────
  const proxComponents = [
    { val: pg.bus_stop_distance, threshold: PROXIMITY_THRESHOLDS.bus_stop, w: 0.30 },
    { val: pg.hospital_distance, threshold: PROXIMITY_THRESHOLDS.hospital, w: 0.20 },
    { val: pg.grocery_distance,  threshold: PROXIMITY_THRESHOLDS.grocery,  w: 0.30 },
    { val: pg.gym_distance,      threshold: PROXIMITY_THRESHOLDS.gym,       w: 0.20 },
  ];
  let proxScore = 0;
  proxComponents.forEach(({ val, threshold, w }) => {
    proxScore += proximityScore(val, threshold) * w;
  });

  // ── Amenity list component (60% of score) ───────────────
  // Null-safe: handle missing, null, or non-array amenities
  const amenities = Array.isArray(pg.amenities) ? pg.amenities : [];
  const amenityText = amenities.join(' ').toLowerCase();

  let bonusTotal = 0;
  let bonusMax = 0;
  for (const [keyword, weight] of Object.entries(AMENITY_WEIGHTS)) {
    bonusMax += weight;
    if (amenityText.includes(keyword.toLowerCase())) {
      bonusTotal += weight;
    }
  }

  // Also check individual boolean fields
  if (pg.ac)           bonusTotal += 0.05;
  if (pg.food === true) bonusTotal += 0.08;
  if (pg.cctv)         bonusTotal += 0.05;
  if (pg.biometric)    bonusTotal += 0.04;
  if (pg.power_backup) bonusTotal += 0.06;
  if (pg.wifi_speed && pg.wifi_speed >= 50) bonusTotal += 0.04;

  const amenityScore = bonusMax > 0 ? Math.min(bonusTotal / bonusMax, 1.0) : 0.3;

  const final = (proxScore * 0.40) + (amenityScore * 0.60);
  return Math.min(parseFloat(final.toFixed(4)), 1.0);
}

function calculateSafetyScore(pg, gender = 'any') {
  if (!pg) return 5.0;
  
  let base = 5.5; // neutral base
  
  // Gender-specific base
  if ((pg.gender || '').toLowerCase() === 'female') base = 7.0;
  else if ((pg.gender || '').toLowerCase() === 'any') base = 6.0;
  else base = 6.0; // male PG

  let bonus = 0;
  if (pg.warden_type === 'female') bonus += 1.5;
  else if (pg.warden_type === 'male') bonus += 0.5;
  else if (pg.warden_type === 'both') bonus += 1.0;
  
  if (pg.cctv)         bonus += 0.7;
  if (pg.biometric)    bonus += 0.5;
  if (pg.power_backup) bonus += 0.3;
  if (pg.verified)     bonus += 0.3;
  if (pg.curfew && pg.curfew !== 'no_curfew') bonus += 0.2; // curfew = safer

  return parseFloat(Math.min(base + bonus, 10.0).toFixed(2));
}

module.exports = { calculateAmenityScore, calculateSafetyScore, proximityScore };
