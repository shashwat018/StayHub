/**
 * StayHub — PG Detail Page
 * Loads full PG data, reviews, and Dijkstra graph distances
 */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = parseInt(params.get('id'));
  let campus = params.get('campus') || 'kondhwa';

  if (!id || isNaN(id)) {
    showError('Invalid PG ID in URL.');
    return;
  }

  // Campus switcher
  document.querySelectorAll('.bc-campus-btn').forEach(btn => {
    if (btn.dataset.campus === campus) btn.classList.add('active');
    else btn.classList.remove('active');
    btn.addEventListener('click', () => {
      campus = btn.dataset.campus;
      document.querySelectorAll('.bc-campus-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPG(id, campus);
    });
  });

  await loadPG(id, campus);
});

async function loadPG(id, campus) {
  document.getElementById('pageLoading').classList.remove('hidden');
  document.getElementById('pageContent').classList.add('hidden');
  document.getElementById('pageError').classList.add('hidden');

  try {
    const data = await API.getPGDetail(id, campus);
    if (!data.success) throw new Error(data.error || 'PG not found');
    renderPG(data.data, campus);
    loadGraphDistances(data.data);
  } catch (e) {
    showError(e.message);
  }
}

function showError(msg) {
  document.getElementById('pageLoading').classList.add('hidden');
  document.getElementById('pageContent').classList.add('hidden');
  document.getElementById('pageError').classList.remove('hidden');
  document.getElementById('pageErrorMsg').textContent = msg;
}

function renderPG(pg, campus) {
  document.title = `${pg.name} — StayHub`;

  // Tags
  const genderClass = { female: 'tag-female', male: 'tag-male', any: 'tag-any' }[pg.gender] || 'tag-any';
  const genderLabel = { female: 'Girls PG', male: 'Boys PG', any: 'Co-ed / Any' }[pg.gender] || 'Any';
  let tagsHTML = `<span class="tag ${genderClass}">${genderLabel}</span>`;
  if (pg.verified) tagsHTML += `<span class="tag tag-verified">✓ Verified</span>`;
  if (pg.tier && pg.tier !== 'basic') tagsHTML += `<span class="tag tag-premium">${pg.tier.charAt(0).toUpperCase()+pg.tier.slice(1)}</span>`;
  if (pg.ac) tagsHTML += `<span class="tag" style="background:var(--blue-100);color:var(--blue-500)">❄ AC</span>`;
  document.getElementById('pgHeroTags').innerHTML = tagsHTML;

  // Name & area
  const roomImages = [
    'pg_room_premium_1778858759007.png',
    'pg_room_shared_1778858926245.png'
  ];

  // Resolve real hostel images or fall back to placeholders
  const hostelImgs = (typeof getHostelImages === 'function' && getHostelImages(pg.name)) || null;
  const heroImg = hostelImgs ? hostelImgs[0] : (pg.rent_min > 8000 ? roomImages[0] : roomImages[1]);

  // Gallery strip under hero (if multiple images available)
  const galleryImgs = hostelImgs || [heroImg];
  const galleryHTML = galleryImgs.length > 1
    ? `<div style="display:flex;gap:6px;margin-top:8px;overflow-x:auto;padding-bottom:4px;">
        ${galleryImgs.slice(1, 6).map((img, i) =>
          `<img src="${img}" alt="${pg.name}" onclick="if(typeof openLightbox!=='undefined'){openLightbox('${pg.name.replace(/'/g,"\\'")}',${i+1})}"
               style="width:80px;height:58px;object-fit:cover;border-radius:8px;cursor:pointer;flex-shrink:0;border:2px solid transparent;transition:border-color 0.2s;"
               onmouseover="this.style.borderColor='#7A9E87'" onmouseout="this.style.borderColor='transparent'">`
        ).join('')}
        ${galleryImgs.length > 6 ? `<div onclick="if(typeof openLightbox!=='undefined'){openLightbox('${pg.name.replace(/'/g,"\\'")}',6)}"
          style="width:80px;height:58px;border-radius:8px;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;">+${galleryImgs.length - 6}</div>` : ''}
      </div>`
    : '';

  // Create a hero image container
  const heroImageWrap = document.createElement('div');
  heroImageWrap.style = "margin-bottom: 32px;";
  heroImageWrap.innerHTML = `
    <div style="width:100%;height:320px;border-radius:20px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);position:relative;cursor:pointer;"
         onclick="if(typeof openLightbox!=='undefined'){openLightbox('${pg.name.replace(/'/g,"\\'")}',0)}">
      <img src="${heroImg}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='${roomImages[1]}'">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 60%,rgba(0,0,0,0.15));"></div>
      ${galleryImgs.length > 1 ? '<div style="position:absolute;bottom:12px;right:14px;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;font-weight:600;padding:5px 10px;border-radius:20px;cursor:pointer;">📷 View all ' + galleryImgs.length + ' photos</div>' : ''}
    </div>
    ${galleryHTML}
  `;
  
  document.querySelector('.pg-detail-main').prepend(heroImageWrap);

  document.getElementById('pgName').textContent = pg.name;
  document.getElementById('pgArea').innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
    ${pg.area || 'Kondhwa, Pune'}
    ${pg.source ? `· <span style="font-size:12px;color:var(--text-muted)">via ${pg.source}</span>` : ''}
  `;

  // Quick stats
  const dist = pg.campus_distance;
  const rent = pg.rent_display || (pg.rent_min ? `₹${pg.rent_min}` : 'Contact');
  document.getElementById('pgQuickStats').innerHTML = `
    ${dist != null ? `<div class="qs-item"><span class="qs-val">${dist} km</span><span class="qs-label">From ${campus.charAt(0).toUpperCase()+campus.slice(1)}</span></div>` : ''}
    <div class="qs-item"><span class="qs-val">${rent}</span><span class="qs-label">Per month</span></div>
    ${pg.rating ? `<div class="qs-item"><span class="qs-val">★ ${pg.rating.toFixed(1)}</span><span class="qs-label">${pg.review_count} review${pg.review_count !== 1 ? 's' : ''}</span></div>` : ''}
    ${pg.wifi_speed ? `<div class="qs-item"><span class="qs-val">${pg.wifi_speed} Mbps</span><span class="qs-label">WiFi</span></div>` : ''}
  `;

  // Score card
  const safetyScore = pg.safety_score;
  const amenityScore = pg.amenity_score;
  const safetyColor = safetyScore >= 8 ? '#22c55e' : safetyScore >= 6 ? '#fbbf24' : '#ef4444';
  const amenityColor = amenityScore >= 7 ? '#22c55e' : amenityScore >= 5 ? '#fbbf24' : '#ef4444';
  document.getElementById('pgScoreCard').innerHTML = `
    <div class="psc-score-row">
      <div class="psc-score-block">
        <span class="psc-score-num" style="color:${safetyColor}">${safetyScore != null ? safetyScore.toFixed(1) : 'N/A'}</span>
        <span class="psc-score-label">SAFETY / 10</span>
      </div>
      <div class="psc-score-block">
        <span class="psc-score-num" style="color:${amenityColor}">${amenityScore != null ? amenityScore.toFixed(1) : 'N/A'}</span>
        <span class="psc-score-label">AMENITY / 10</span>
      </div>
    </div>
    <div class="psc-bars">
      <div class="psc-bar-row">
        <span class="psc-bar-label">Safety</span>
        <div class="psc-bar-wrap"><div class="psc-bar-fill" style="width:${(safetyScore/10)*100}%;background:${safetyColor}"></div></div>
        <span class="psc-bar-val">${safetyScore != null ? safetyScore.toFixed(1) : '-'}</span>
      </div>
      <div class="psc-bar-row">
        <span class="psc-bar-label">Amenities</span>
        <div class="psc-bar-wrap"><div class="psc-bar-fill" style="width:${amenityScore ? (amenityScore/10)*100 : 0}%;background:${amenityColor}"></div></div>
        <span class="psc-bar-val">${amenityScore != null ? amenityScore.toFixed(1) : '-'}</span>
      </div>
    </div>
    ${pg.rating ? `
    <div class="psc-rating">
      <span class="psc-stars">${'★'.repeat(Math.round(pg.rating/2))}</span>
      <span class="psc-rating-val">${pg.rating.toFixed(1)}/10</span>
      <span class="psc-rating-count">${pg.review_count} reviews</span>
    </div>` : '<div style="font-size:13px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:12px">No reviews yet</div>'}
  `;

  // Overview grid
  const overviewItems = [
    { icon: '💰', label: 'Rent', val: pg.rent_display || 'Contact for price' },
    { icon: '🏦', label: 'Deposit', val: pg.deposit ? `₹${pg.deposit.toLocaleString('en-IN')}` : 'Not specified' },
    { icon: '📍', label: 'Distance', val: dist != null ? `${dist} km` : 'N/A' },
    { icon: '🛏', label: 'Room Types', val: (pg.sharing_types || []).join(', ') || 'Not specified' },
    { icon: '🍽', label: 'Food', val: pg.food === true ? 'Included' : pg.food === 'optional' ? 'Optional' : 'Not included' },
    { icon: '📶', label: 'WiFi', val: pg.wifi_speed ? `${pg.wifi_speed} Mbps` : 'Not specified' },
    { icon: '❄', label: 'AC', val: pg.ac ? 'Available' : 'Not available' },
    { icon: '🌙', label: 'Curfew', val: pg.curfew === 'no_curfew' ? 'No curfew' : (pg.curfew || 'Not specified') },
  ];
  document.getElementById('overviewGrid').innerHTML = overviewItems.map(item => `
    <div class="overview-item">
      <span class="ov-icon">${item.icon}</span>
      <span class="ov-label">${item.label}</span>
      <span class="ov-val">${item.val}</span>
    </div>
  `).join('');

  // Amenities
  const highlightKeywords = ['wifi', 'study', 'cctv', 'power backup', 'attached', 'washing machine', 'water purifier'];
  const amenities = pg.amenities || [];
  if (amenities.length > 0) {
    document.getElementById('amenitiesGrid').innerHTML = amenities.map(a => {
      const isHighlight = highlightKeywords.some(k => a.toLowerCase().includes(k));
      return `<span class="amenity-tag${isHighlight ? ' highlight' : ''}">${isHighlight ? '✦ ' : ''}${a}</span>`;
    }).join('');
  } else {
    document.getElementById('amenitiesGrid').innerHTML = '<p style="color:var(--text-muted);font-size:14px">No amenities listed.</p>';
  }

  // Score breakdown section
  const scoreItems = [
    { label: 'Safety Score', val: safetyScore != null ? safetyScore.toFixed(1) : null, max: 10, desc: 'Based on gender, CCTV, warden type, biometric' },
    { label: 'Amenity Score', val: amenityScore != null ? amenityScore.toFixed(1) : null, max: 10, desc: 'Proximity to bus stops, hospitals, grocery, gym' },
    { label: 'Rating', val: pg.rating ? pg.rating.toFixed(2) : null, max: 10, desc: 'Duration-weighted aggregate of resident reviews' },
    { label: 'WiFi Score', val: pg.wifi_speed ? Math.min(pg.wifi_speed / 300, 1).toFixed(2) : null, max: 1, desc: `${pg.wifi_speed || 0} Mbps — normalized to 300 Mbps max` },
  ];
  document.getElementById('scoresGrid').innerHTML = scoreItems.filter(s => s.val).map(s => {
    const pct = ((s.val / s.max) * 100).toFixed(0);
    const color = pct >= 70 ? '#22c55e' : pct >= 50 ? '#fbbf24' : '#ef4444';
    return `<div class="score-item">
      <div class="score-item-header">
        <span class="score-item-label">${s.label}</span>
        <span class="score-item-val" style="color:${color}">${s.val}</span>
      </div>
      <div class="score-item-bar"><div class="score-item-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="score-item-desc">${s.desc}</div>
    </div>`;
  }).join('') || '<p style="color:var(--text-muted);font-size:14px">Score data unavailable.</p>';

  // Reviews
  renderReviews(pg.reviews || [], pg.review_count || 0);

  // Weekly Food Menu (Zolo-inspired)
  if (pg.food_menu) {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const today = days[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
    
    document.getElementById('foodMenuCalendar').innerHTML = days.map(day => {
        const menu = pg.food_menu[day] || {};
        return `
          <div class="food-day-card ${day === today ? 'today' : ''}">
            <span class="food-day-name">${day === today ? 'Today' : day}</span>
            <div class="food-meal">
              <span class="food-meal-label">B-Fast</span>
              <span class="food-meal-val">${menu.Breakfast || 'N/A'}</span>
            </div>
            <div class="food-meal">
              <span class="food-meal-label">Lunch</span>
              <span class="food-meal-val">${menu.Lunch || 'N/A'}</span>
            </div>
            <div class="food-meal">
              <span class="food-meal-label">Dinner</span>
              <span class="food-meal-val">${menu.Dinner || 'N/A'}</span>
            </div>
          </div>
        `;
    }).join('');
  } else {
    document.getElementById('sectionFoodMenu').style.display = 'none';
  }

  // Location Map (NoBroker-inspired)
  if (pg.lat && pg.lng) {
      setTimeout(() => {
        const map = L.map('pgDetailMap').setView([pg.lat, pg.lng], 16);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB'
        }).addTo(map);

        L.marker([pg.lat, pg.lng], {
            icon: L.divIcon({
                className: 'price-marker',
                html: `<div>₹${(pg.rent_min/1000).toFixed(1)}k</div>`,
                iconSize: [40, 24],
                iconAnchor: [20, 12]
            })
        }).addTo(map).bindPopup(`<strong>${pg.name}</strong>`).openPopup();
      }, 500);
  } else {
      document.getElementById('sectionLocation').style.display = 'none';
  }

  // Contact info sidebar
  const waLink = `https://wa.me/91${pg.contact ? pg.contact.replace(/\D/g,'') : ''}?text=Hi, I am interested in ${pg.name} via StayHub.`;
  document.getElementById('contactInfo').innerHTML = `
    <div class="contact-row">
      <span class="contact-icon">📞</span>
      <div>
        <span class="contact-label">Contact</span>
        <span class="contact-val">${pg.contact || 'Not provided'}</span>
      </div>
    </div>
    <div class="contact-row">
      <span class="contact-icon">🔗</span>
      <div>
        <span class="contact-label">Source</span>
        <span class="contact-val">${pg.source || 'StayHub'}</span>
      </div>
    </div>
    <div class="contact-row">
      <span class="contact-icon">✅</span>
      <div>
        <span class="contact-label">Verification</span>
        <span class="contact-val">${pg.verified ? 'Verified by StayHub' : 'Not yet verified'}</span>
      </div>
    </div>
    <div class="contact-row">
      <span class="contact-icon">🏷</span>
      <div>
        <span class="contact-label">Tier</span>
        <span class="contact-val">${pg.tier ? pg.tier.charAt(0).toUpperCase()+pg.tier.slice(1) : 'Basic'}</span>
      </div>
    </div>
    <div style="margin-top:20px; display:flex; flex-direction:column; gap:10px">
        <a href="${waLink}" target="_blank" class="btn btn-outline" style="width:100%; justify-content:center; border-color:#25D366; color:#25D366">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
            WhatsApp Chat
        </a>
    </div>
  `;

  // Show page
  document.getElementById('pageLoading').classList.add('hidden');
  document.getElementById('pageContent').classList.remove('hidden');
}

function renderReviews(reviews, count) {
  document.getElementById('reviewCountBadge').textContent = count;
  const container = document.getElementById('reviewsContent');

  if (!reviews || reviews.length === 0) {
    container.innerHTML = `<div class="no-reviews">No reviews yet for this PG.</div>`;
    return;
  }

  // Summary
  const totalWeight = reviews.reduce((s, r) => s + Math.sqrt(r.duration_months || 1), 0);
  const weightedRating = reviews.reduce((s, r) => s + (r.rating || 0) * Math.sqrt(r.duration_months || 1), 0) / totalWeight;
  const starCount = Math.round(weightedRating / 2);

  const summary = `
    <div class="reviews-summary">
      <span class="rs-score">${weightedRating.toFixed(1)}</span>
      <div class="rs-detail">
        <span class="rs-stars">${'★'.repeat(Math.max(0,starCount))}${'☆'.repeat(Math.max(0,5-starCount))}</span>
        <span class="rs-label">${reviews.length} review${reviews.length !== 1 ? 's' : ''} · Duration-weighted average</span>
      </div>
    </div>
  `;

  const cards = reviews.map(r => {
    const weight = Math.sqrt(r.duration_months || 1).toFixed(2);
    const starsR = Math.round((r.rating || 0) / 2);
    return `
      <div class="review-card">
        <div class="review-header">
          <span class="review-user">${r.user || 'Anonymous'}</span>
          <div class="review-meta">
            <span class="review-rating">
              <span class="review-rating-star">★</span>
              ${r.rating}/10
            </span>
            <span class="review-duration">${r.duration_months || '?'} month stay</span>
            <span class="review-date">${r.date || ''}</span>
          </div>
        </div>
        <p class="review-text">"${r.text || ''}"</p>
        <div class="review-weight-note">Weight: √${r.duration_months || 1} = ${weight}× (longer stay = higher influence)</div>
      </div>
    `;
  }).join('');

  container.innerHTML = summary + `<div class="review-list">${cards}</div>`;
}

async function loadGraphDistances(pg) {
  const container = document.getElementById('graphDistances');

  // Find graph node for this PG by name matching
  const pgNodeMap = {
    'Stanza Living: Austin House': 'pg_stanza_austin',
    'Casa Living: Iris House': 'pg_casa_iris',
    'Stanza Living: Juliaca House': 'pg_stanza_juliaca',
    'My Happy Home A': 'pg_myhappyhome',
    'Studious Girls Hostel': 'pg_studious',
    'Swami Krupa Boys Hostel': 'pg_swami',
    "Homies' Living Sapphire": 'pg_homies',
    'Alchemy Living': 'pg_alchemy',
  };

  const nodeId = pgNodeMap[pg.name];

  if (!nodeId) {
    container.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">Graph node not mapped for this PG. Proximity data unavailable.</p>`;
    return;
  }

  const amenityTypes = [
    { key: 'bus_stop', icon: '🚌', label: 'Bus Stop', threshold: 0.5 },
    { key: 'medical', icon: '🏥', label: 'Hospital', threshold: 2.0 },
    { key: 'grocery', icon: '🛒', label: 'Grocery', threshold: 0.8 },
    { key: 'gym', icon: '💪', label: 'Gym', threshold: 1.0 },
  ];

  const results = await Promise.allSettled(
    amenityTypes.map(a => API.getAmenityDistance(nodeId, a.key))
  );

  const rows = amenityTypes.map((a, i) => {
    const res = results[i];
    let distText = 'N/A';
    let distClass = '';
    if (res.status === 'fulfilled' && res.value.success) {
      const d = res.value.nearest_distance_km;
      if (d != null) {
        distText = `${d} km`;
        distClass = d <= a.threshold ? 'good' : d <= a.threshold * 2 ? 'ok' : 'far';
      }
    }
    return `<div class="gd-row">
      <span class="gd-icon">${a.icon}</span>
      <span class="gd-type">${a.label}</span>
      <span class="gd-dist ${distClass}">${distText}</span>
    </div>`;
  }).join('');

  container.innerHTML = rows + `<div class="gd-note">Distances via Dijkstra's shortest path algorithm</div>`;
}
