/**
 * StayHub API Service
 * All backend communication goes through this module.
 * Base URL auto-detects localhost vs production.
 */

const API = (() => {
  // ── Config ────────────────────────────────────────────────
  const BASE_URL = (() => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    // In production, set your actual backend URL here:
    return window.STAYHUB_API_URL || 'http://localhost:3000';
  })();

  // ── Core fetch wrapper ────────────────────────────────────
  async function request(path, options = {}) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        throw new Error('Cannot connect to StayHub server. Please ensure the backend is running on port 3000.');
      }
      throw e;
    }
  }

  // ── LISTINGS ─────────────────────────────────────────────
  async function getListings(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params.set(k, v);
    });
    return request(`/api/listings?${params.toString()}`);
  }

  async function getPGDetail(id, campus = 'kondhwa') {
    return request(`/api/pg/${id}?campus=${campus}`);
  }

  async function getPGReviews(id) {
    return request(`/api/pg/${id}/reviews`);
  }

  async function getFilterOptions() {
    return request('/api/listings/meta/filters');
  }

  // ── FITSCORE ─────────────────────────────────────────────
  async function getFitScore(preferences) {
    return request('/api/fitscore', {
      method: 'POST',
      body: JSON.stringify({ ...preferences, include_debug: true }),
    });
  }

  async function previewWeights(priorities) {
    const p = Array.isArray(priorities) ? priorities.join(',') : priorities;
    return request(`/api/fitscore/weights?priorities=${encodeURIComponent(p)}`);
  }

  // ── GRAPH ────────────────────────────────────────────────
  async function getGraphDistance(from, to) {
    return request(`/api/graph/distance?from=${from}&to=${to}`);
  }

  async function getAmenityDistance(pgNode, type) {
    return request(`/api/graph/amenity?pg=${pgNode}&type=${type}`);
  }

  async function getGraphNodes(type = '') {
    const q = type ? `?type=${type}` : '';
    return request(`/api/graph/nodes${q}`);
  }

  // ── HEALTH / META ────────────────────────────────────────
  async function getHealth() {
    return request('/api/health');
  }

  async function getCampuses() {
    return request('/api/campuses');
  }

  // ── Score colour helper ──────────────────────────────────────
  function scoreColor(score) {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#fbbf24';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  }

  // ── Build PG card HTML ───────────────────────────────────────
  function buildPGCard(pg, campus = 'kondhwa', variant = 'luxury') {
    const genderLabel = { female: 'Girls PG', male: 'Boys PG', any: 'Co-ed / Any' }[pg.gender] || 'Any';
    const dist = pg.campus_distance ?? (campus === 'bibwewadi' ? pg.distance_bibwewadi : pg.distance_kondhwa);
    const distText = dist != null ? `${dist} km` : 'N/A';
    const rating = pg.rating ? pg.rating.toFixed(1) : null;
    const fitScore = pg.fitScore;

    // Top amenity pills
    const topAmenities = [];
    if (pg.ac) topAmenities.push('❄️ AC');
    if (pg.food) topAmenities.push('🍛 Meals');
    if (pg.wifi_speed) topAmenities.push('📶 WiFi');
    if (pg.cctv || pg.safety_score > 8) topAmenities.push('📹 CCTV');
    if (pg.power_backup) topAmenities.push('⚡ Backup');
    const amenitiesText = topAmenities.length > 0 ? topAmenities.slice(0, 4).join(' • ') : 'Basic Amenities';
    
    const sharingText = pg.sharing_types && pg.sharing_types.length > 0 
      ? pg.sharing_types.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ') + ' Sharing'
      : 'Multiple Sharing Options';

    const fallback = 'pg_room_shared_1778858926245.png';
    // Use real hostel photo index first, then API images, then placeholder
    const hostelImgs = (typeof getHostelImages === 'function' && getHostelImages(pg.name)) || null;
    const imgs = hostelImgs || (pg.images && pg.images.length > 0 ? pg.images : [fallback]);
    let mainImg  = imgs[0] || fallback;
    let subImg1  = imgs[1] || imgs[0] || fallback;
    let subImg2  = imgs[2] || imgs[0] || fallback;
    let extraImgsCount = Math.max(0, imgs.length - 3);

    // Feature 3: Vacancy / Urgency tag
    const vacancyTag = pg.vacancy != null
      ? pg.vacancy <= 2
        ? `<span class="tag-urgent">🔥 Only ${pg.vacancy} bed${pg.vacancy === 1 ? '' : 's'} left</span>`
        : `<span class="tag-available">✓ ${pg.vacancy} beds available</span>`
      : '';

    // Feature 7: Established + response time
    const estTag = pg.established ? `<span class="jd-tag jd-tag-sm">Est. ${pg.established}</span>` : '';
    const respTag = pg.response_time ? `<span class="jd-tag jd-tag-sm">⏱ ${pg.response_time}</span>` : '';

    // Feature 7: Trustmark row (JustDial parity)
    const trustmarks = [];
    if (pg.verified) trustmarks.push(`<span class="tm-item tm-verified">✔ Verified</span>`);
    if (dist != null) trustmarks.push(`<span class="tm-item">📍 ${distText}</span>`);
    if (rating) trustmarks.push(`<span class="tm-item">⭐ ${rating}</span>`);
    if (pg.rent_min) trustmarks.push(`<span class="tm-item tm-price">💰 ₹${pg.rent_min.toLocaleString('en-IN')}/mo</span>`);
    const trustmarkRow = trustmarks.length > 0
      ? `<div class="jd-trustmarks">${trustmarks.join('<span class="tm-sep">|</span>')}</div>`
      : '';

    // Data for comparison tool (Feature 2) — serialized safely
    const compareData = JSON.stringify({
      id: pg.id, name: pg.name,
      rent_min: pg.rent_min, rent_max: pg.rent_max,
      campus_distance: dist, safety_score: pg.safety_score,
      amenities: (pg.amenities || []).slice(0, 5),
      wifi_speed: pg.wifi_speed, rating: pg.rating,
      fitScore: pg.fitScore, food: pg.food, ac: pg.ac, verified: pg.verified
    }).replace(/'/g, '&#39;');

    // ── Variant MINIMAL — Redesigned v3 clean card ──
    if (variant === 'minimal' || variant === 'luxury') {
      const scoreNum = fitScore ? Math.round(fitScore) : null;
      const genderShort = { female: 'Girls', male: 'Boys', any: 'Co-ed' }[pg.gender] || 'Co-ed';
      return `
        <a href="pg-detail.html?id=${pg.id}&campus=${campus}" class="pg-card">
          <div class="pg-card-img" onclick="if(typeof openLightbox!=='undefined'&&(typeof getHostelImages==='undefined'||getHostelImages('${pg.name.replace(/'/g,"\\'")}'))){ event.preventDefault(); openLightbox('${pg.name.replace(/'/g,"\\'")}',0); }">
            <img src="${mainImg}" alt="${pg.name}" loading="lazy" onerror="this.onerror=null;this.src='pg_room_shared_1778858926245.png'">
            ${scoreNum ? `<div class="pg-fitscore-badge">${scoreNum}% Match</div>` : ''}
            <div class="pg-gender-badge">${genderShort}</div>
            <div class="pg-card-img-overlay">
              <div class="pg-card-name">${pg.name}</div>
              <div class="pg-card-price"><strong>₹${pg.rent_min ? pg.rent_min.toLocaleString('en-IN') : 'Contact'}</strong>/mo</div>
            </div>
          </div>
          <div class="pg-card-meta">
            <span class="pg-card-location">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${pg.area || 'Pune'} · ${distText}
            </span>
            <div class="pg-card-tags">
              ${pg.food ? '<span class="pg-tag accent">Meals</span>' : ''}
              ${pg.ac ? '<span class="pg-tag">AC</span>' : ''}
              ${pg.wifi_speed ? '<span class="pg-tag">WiFi</span>' : ''}
            </div>
          </div>
        </a>
      `;
    }

    // ── Variant A — Luxury Editorial (Grid card) kept for old pages ──
    if (variant === 'luxury_old') {
      return `
        <div class="list-card card-luxury" data-id="${pg.id}" data-pg='${compareData}' onclick="if(!event.target.closest('.no-click')){ window.location='pg-detail.html?id=${pg.id}&campus=${campus}' }">
          <div class="luxury-image-wrapper">
            <img src="${mainImg}" class="luxury-img" onerror="this.onerror=null;this.src='pg_room_shared_1778858926245.png'">
            <div class="luxury-gradient-overlay"></div>
            
            <div class="luxury-badges">
              ${pg.verified ? '<span class="luxury-badge-verified">✔ Verified</span>' : ''}
              <span class="luxury-badge-tier tier-${pg.tier || 'basic'}">${pg.tier ? pg.tier.toUpperCase() : 'BASIC'}</span>
            </div>
            
            ${vacancyTag ? `<div class="luxury-vacancy">${vacancyTag}</div>` : ''}
          </div>

          <div class="luxury-content">
            <div class="luxury-top">
              <h3 class="luxury-title">${pg.name}</h3>
              <span class="luxury-rating">${rating ? `★ ${rating}` : 'New'}</span>
            </div>
            
            <div class="luxury-location">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${pg.area || 'Pune'} • ${distText}
            </div>

            <div class="luxury-safety">
              <div class="luxury-safety-label">
                <span>Safety Score</span>
                <span>${pg.safety_score || 8.0}/10</span>
              </div>
              <div class="luxury-progress-bg">
                <div class="luxury-progress-bar" style="width: ${(pg.safety_score || 8.0) * 10}%"></div>
              </div>
            </div>

            <div class="luxury-details">
              <span>${genderLabel}</span>
              <span>•</span>
              <span>${sharingText}</span>
            </div>

            <div class="luxury-footer">
              <div class="luxury-price-box">
                <span class="luxury-price-label">Starting Rent</span>
                <span class="luxury-price">₹${pg.rent_min ? pg.rent_min.toLocaleString('en-IN') : 'Contact'}</span>
              </div>
              <div class="luxury-actions no-click">
                <a href="tel:${pg.contact ? pg.contact.replace(/\D/g, '') : '911234567890'}" class="luxury-btn btn-call" title="Call">📞 Call</a>
                <a href="https://wa.me/${pg.contact ? pg.contact.replace(/\D/g, '') : '911234567890'}?text=${encodeURIComponent('Hi, I\'m interested in ' + pg.name + ' via StayHub.')}" target="_blank" class="luxury-btn btn-wa" title="WhatsApp">💬 WA</a>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // ── Variant B — Immersive Dark (Horizontal Split card) ──
    if (variant === 'immersive') {
      return `
        <div class="list-card card-immersive" data-id="${pg.id}" data-pg='${compareData}' onclick="if(!event.target.closest('.no-click')){ window.location='pg-detail.html?id=${pg.id}&campus=${campus}' }">
          <div class="immersive-photo-panel">
            <img src="${mainImg}" class="immersive-main-img" id="immersive-img-${pg.id}" onerror="this.onerror=null;this.src='pg_room_shared_1778858926245.png'">
            <div class="immersive-photo-overlay"></div>
            
            <div class="immersive-thumbnails no-click">
              ${imgs.slice(0, 3).map((img, idx) => `
                <div class="immersive-thumb ${idx === 0 ? 'active' : ''}" 
                     onmouseover="document.getElementById('immersive-img-${pg.id}').src='${img}'; this.parentNode.querySelectorAll('.immersive-thumb').forEach(t => t.classList.remove('active')); this.classList.add('active');" 
                     style="background-image: url('${img}')"></div>
              `).join('')}
            </div>
          </div>

          <div class="immersive-info">
            <div class="immersive-header">
              <div class="immersive-title-row">
                <h3 class="immersive-title">
                  ${pg.name}
                  ${pg.verified ? '<span class="immersive-verified-icon">✔</span>' : ''}
                </h3>
                <div class="immersive-rating-box">
                  <span class="immersive-rating-num">${rating || 'New'}</span>
                  <span class="immersive-rating-star">★</span>
                </div>
              </div>
              <div class="immersive-sub-title">
                <span>${pg.area || 'Pune'}</span>
                <span>•</span>
                <span class="highlight-neon">${distText} to Campus</span>
              </div>
            </div>

            <div class="immersive-scores">
              <div class="immersive-score-item">
                <div class="immersive-score-lbl">
                  <span>Safety</span>
                  <span class="highlight-neon">${pg.safety_score || 8.0}/10</span>
                </div>
                <div class="immersive-bar-bg">
                  <div class="immersive-bar-fill safety" style="width: ${(pg.safety_score || 8.0) * 10}%"></div>
                </div>
              </div>
              <div class="immersive-score-item">
                <div class="immersive-score-lbl">
                  <span>Amenities</span>
                  <span class="highlight-neon">${pg.amenity_score || 7.0}/10</span>
                </div>
                <div class="immersive-bar-bg">
                  <div class="immersive-bar-fill amenities" style="width: ${(pg.amenity_score || 7.0) * 10}%"></div>
                </div>
              </div>
            </div>

            <div class="immersive-chips">
              <span class="immersive-chip-gender ${pg.gender}">${genderLabel}</span>
              <span class="immersive-chip-feature">${sharingText}</span>
              ${pg.ac ? '<span class="immersive-chip-feature">❄️ AC</span>' : ''}
              ${pg.food ? '<span class="immersive-chip-feature">🍛 Food</span>' : ''}
              ${pg.wifi_speed ? `<span class="immersive-chip-feature">📶 ${pg.wifi_speed} Mbps</span>` : ''}
            </div>

            <div class="immersive-footer">
              <div class="immersive-price-wrapper">
                <span class="immersive-price-lbl">Starting Rent</span>
                <span class="immersive-price-val">₹${pg.rent_min ? pg.rent_min.toLocaleString('en-IN') : 'Contact'}</span>
              </div>
              <div class="immersive-actions no-click">
                <a href="tel:${pg.contact ? pg.contact.replace(/\D/g, '') : '911234567890'}" class="immersive-btn btn-call" title="Call">📞 Call</a>
                <a href="https://wa.me/${pg.contact ? pg.contact.replace(/\D/g, '') : '911234567890'}?text=${encodeURIComponent('Hi, I\'m interested in ' + pg.name + ' via StayHub.')}" target="_blank" class="immersive-btn btn-wa" title="WhatsApp">💬 WA</a>
                <label class="immersive-compare no-click">
                  <input type="checkbox" class="pg-compare-cb" data-id="${pg.id}" data-name="${pg.name.replace(/"/g, '&quot;')}"> Compare
                </label>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // ── Variant C — Classic JD (Original) ──
    return `
      <div class="list-card jd-style" data-id="${pg.id}" data-pg='${compareData}' onclick="if(!event.target.closest('.no-click')){ window.location='pg-detail.html?id=${pg.id}&campus=${campus}' }">
        
        <!-- LEFT: INFO SECTION -->
        <div class="jd-info">
          <div class="jd-header">
            ${vacancyTag}
            <h3 class="jd-title">
              ${pg.verified ? '<span class="verified-dot" title="Verified">✔</span>' : ''}
              ${pg.name}
            </h3>
          </div>
          
          <div class="jd-ratings">
            ${rating ? `<span class="badge-rating">${rating} ★</span> <span class="badge-count">${pg.review_count || 0} Ratings</span>` : '<span class="badge-count">New Listing</span>'}
            ${pg.verified ? `<span class="badge-verified">✔ Verified</span>` : ''}
            ${fitScore ? `<span class="badge-trending">🔥 Fit: ${fitScore}</span>` : ''}
          </div>
          
          <div class="jd-location">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${pg.area || 'Pune'} • ${distText}
          </div>

          <div class="jd-tags">
            <span class="jd-tag">${genderLabel}</span>
            <span class="jd-tag">${sharingText}</span>
            <span class="jd-tag">${amenitiesText}</span>
            ${estTag}${respTag}
          </div>
          
          <div class="jd-highlights">
            <div class="jd-highlight-item">⚡ <strong>High demand</strong></div>
            <div class="jd-highlight-item">💰 Rent Per Bed Starting at <strong><span class="jd-price-text">₹${pg.rent_min ? pg.rent_min.toLocaleString('en-IN') : 'Contact'}</span></strong></div>
          </div>

          ${trustmarkRow}
          
          <div class="jd-actions no-click">
            <a href="tel:${pg.contact ? pg.contact.replace(/\D/g, '') : '911234567890'}" class="btn-action btn-call" title="Call">📞 ${pg.contact || 'Contact'}</a>
            <a href="https://wa.me/${pg.contact ? pg.contact.replace(/\D/g, '') : '911234567890'}?text=${encodeURIComponent('Hi, I\'m interested in ' + pg.name + ' via StayHub.')}" target="_blank" class="btn-action btn-wa" title="WhatsApp">💬 WhatsApp</a>
            <label class="compare-check no-click" title="Compare this PG">
              <input type="checkbox" class="pg-compare-cb" data-id="${pg.id}" data-name="${pg.name.replace(/"/g, '&quot;')}"> Compare
            </label>
          </div>
        </div>

        <!-- RIGHT: GALLERY SECTION -->
        <div class="jd-gallery">
          <img src="${mainImg}" class="jd-main-img" onerror="this.onerror=null;this.src='pg_room_shared_1778858926245.png'">
          <div class="jd-sub-gallery">
            <img src="${subImg1}" class="jd-sub-img" onerror="this.onerror=null;this.src='pg_room_shared_1778858926245.png'">
            <div class="jd-more-wrapper">
              <img src="${subImg2}" class="jd-sub-img" onerror="this.onerror=null;this.src='pg_room_shared_1778858926245.png'">
              ${extraImgsCount > 0 ? `<div class="jd-more-overlay">+${extraImgsCount}<br>More</div>` : ''}
            </div>
          </div>
        </div>
        
      </div>
    `;
  }

  // ── Public interface ─────────────────────────────────────
  return {
    getListings, getPGDetail, getPGReviews, getFilterOptions,
    getFitScore, previewWeights,
    getGraphDistance, getAmenityDistance, getGraphNodes,
    getHealth, getCampuses,
    buildPGCard,
    BASE_URL,
  };
})();

// ── Toast utility (global) ───────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}




// ── Nav scroll effect ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Mobile nav
  const hamburger = document.getElementById('navHamburger');
  const mobileNav = document.getElementById('navMobile');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
    });
  }

  // Mark active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPage) link.classList.add('active');
  });
});
