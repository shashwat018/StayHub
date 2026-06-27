/**
 * StayHub — FitScore AI Match Page
 * Handles: multi-step form, drag-and-drop priority ranking,
 * live ROC weight preview, API submission, results rendering
 */
document.addEventListener('DOMContentLoaded', () => {

  // ── State ─────────────────────────────────────────────────
  const state = {
    gender: null,
    campus: 'kondhwa',
    budget: 10000,
    preferredDistance: 2,
    needs_food: false,
    curfew: null,
    priorities: ['budget', 'distance', 'safety', 'amenities', 'wifi'],
  };

  // ── Step Navigation ───────────────────────────────────────
  function showStep(stepId) {
    document.querySelectorAll('.fs-step').forEach(s => s.classList.add('hidden'));
    document.getElementById(stepId).classList.remove('hidden');
  }

  document.querySelectorAll('.fs-next').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextId = btn.dataset.next;
      if (nextId === 'step2' && !state.gender) {
        showToast('Please select your gender preference.', 'error');
        return;
      }
      showStep(nextId);
      if (nextId === 'step3') updateWeightPreview();
    });
  });

  document.querySelectorAll('.fs-back').forEach(btn => {
    btn.addEventListener('click', () => showStep(btn.dataset.back));
  });

  // ── Gender Selection ──────────────────────────────────────
  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.gender = btn.dataset.val;
    });
  });

  // ── Campus Selection ──────────────────────────────────────
  document.querySelectorAll('.campus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.campus-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.campus = btn.dataset.val;
    });
  });

  // ── Budget Slider ─────────────────────────────────────────
  const budgetRange = document.getElementById('budgetRange');
  const budgetDisplay = document.getElementById('budgetDisplay');
  budgetRange.addEventListener('input', () => {
    state.budget = parseInt(budgetRange.value);
    budgetDisplay.textContent = `₹${state.budget.toLocaleString('en-IN')}`;
  });

  // ── Distance Slider ───────────────────────────────────────
  const distRange = document.getElementById('distRange');
  const distDisplay = document.getElementById('distDisplay');
  distRange.addEventListener('input', () => {
    state.preferredDistance = parseFloat(distRange.value);
    distDisplay.textContent = `${state.preferredDistance} km`;
  });

  // ── Checkboxes ────────────────────────────────────────────
  document.getElementById('needsFood').addEventListener('change', e => { state.needs_food = e.target.checked; });
  document.getElementById('noCurfew').addEventListener('change', e => { state.curfew = e.target.checked ? 'no_curfew' : null; });

  // ── Drag-and-Drop Priority List ───────────────────────────
  const priorityList = document.getElementById('priorityList');
  let dragSrc = null;

  function makeDraggable() {
    priorityList.querySelectorAll('.priority-item').forEach((item, idx) => {
      item.setAttribute('draggable', true);
      item.querySelector('.priority-rank').textContent = `#${idx + 1}`;

      item.addEventListener('dragstart', e => {
        dragSrc = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        priorityList.querySelectorAll('.priority-item').forEach(i => i.classList.remove('drag-over'));
        updatePriorityOrder();
        updateWeightPreview();
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (item !== dragSrc) {
          priorityList.querySelectorAll('.priority-item').forEach(i => i.classList.remove('drag-over'));
          item.classList.add('drag-over');
        }
      });
      item.addEventListener('drop', e => {
        e.preventDefault();
        if (dragSrc && dragSrc !== item) {
          const items = [...priorityList.querySelectorAll('.priority-item')];
          const srcIdx = items.indexOf(dragSrc);
          const tgtIdx = items.indexOf(item);
          if (srcIdx < tgtIdx) {
            priorityList.insertBefore(dragSrc, item.nextSibling);
          } else {
            priorityList.insertBefore(dragSrc, item);
          }
        }
      });
    });
  }

  // Touch drag fallback (mobile)
  let touchItem = null, touchClone = null, touchStartY = 0;
  priorityList.addEventListener('touchstart', e => {
    touchItem = e.target.closest('.priority-item');
    if (!touchItem) return;
    touchStartY = e.touches[0].clientY;
    touchItem.classList.add('dragging');
  }, { passive: true });

  priorityList.addEventListener('touchmove', e => {
    if (!touchItem) return;
    e.preventDefault();
    const touch = e.touches[0];
    const els = [...priorityList.querySelectorAll('.priority-item')].filter(i => i !== touchItem);
    const el = els.find(i => {
      const r = i.getBoundingClientRect();
      return touch.clientY >= r.top && touch.clientY <= r.bottom;
    });
    if (el) {
      priorityList.querySelectorAll('.priority-item').forEach(i => i.classList.remove('drag-over'));
      el.classList.add('drag-over');
    }
  }, { passive: false });

  priorityList.addEventListener('touchend', e => {
    if (!touchItem) return;
    touchItem.classList.remove('dragging');
    const overItem = priorityList.querySelector('.priority-item.drag-over');
    if (overItem && overItem !== touchItem) {
      const items = [...priorityList.querySelectorAll('.priority-item')];
      const srcIdx = items.indexOf(touchItem);
      const tgtIdx = items.indexOf(overItem);
      if (srcIdx < tgtIdx) priorityList.insertBefore(touchItem, overItem.nextSibling);
      else priorityList.insertBefore(touchItem, overItem);
      overItem.classList.remove('drag-over');
    }
    touchItem = null;
    updatePriorityOrder();
    updateWeightPreview();
    makeDraggable();
  });

  function updatePriorityOrder() {
    const items = priorityList.querySelectorAll('.priority-item');
    state.priorities = [...items].map(i => i.dataset.val);
    items.forEach((item, idx) => {
      item.querySelector('.priority-rank').textContent = `#${idx + 1}`;
    });
  }

  // ── ROC Weight Calculator (client-side mirror) ────────────
  function calcROCWeights(priorities) {
    const n = priorities.length;
    const weights = {};
    priorities.forEach((criterion, rank) => {
      let w = 0;
      for (let j = rank; j < n; j++) w += 1 / (j + 1);
      w /= n;
      weights[criterion] = parseFloat(w.toFixed(4));
    });
    return weights;
  }

  // ── Weight Preview ────────────────────────────────────────
  const PRIORITY_LABELS = {
    budget: 'Budget', distance: 'Distance', safety: 'Safety',
    amenities: 'Amenities', wifi: 'WiFi', food: 'Food', curfew: 'Curfew',
  };

  function updateWeightPreview() {
    const weights = calcROCWeights(state.priorities);
    const wpBars = document.getElementById('wpBars');
    wpBars.innerHTML = state.priorities.map(p => {
      const pct = ((weights[p] || 0) * 100).toFixed(1);
      return `<div class="wp-row">
        <span class="wp-name">${PRIORITY_LABELS[p] || p}</span>
        <div class="wp-bar-wrap"><div class="wp-bar" style="width:${pct}%"></div></div>
        <span class="wp-pct">${pct}%</span>
      </div>`;
    }).join('');
  }

  makeDraggable();
  updateWeightPreview();

  // ── Panel helpers ─────────────────────────────────────────
  window.goToStep = (stepNum) => showStep('step' + stepNum);

  function showResultsPlaceholder() {
    const panel = document.getElementById('resultsPanel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="fs-results-placeholder">
        <div class="fs-placeholder-icon">🎯</div>
        <h3>Your ranked PGs will appear here</h3>
        <p>Complete the form to get personalised AI recommendations based on your exact preferences.</p>
        <div class="algo-explainer">
          <div class="ae-title">WHAT THE ALGORITHM CONSIDERS:</div>
          <div class="ae-row"><span class="ae-dot">●</span> ROC weights from your priority order</div>
          <div class="ae-row"><span class="ae-dot">●</span> Dijkstra graph distances to amenities</div>
          <div class="ae-row"><span class="ae-dot">●</span> Duration-weighted resident reviews</div>
          <div class="ae-row"><span class="ae-dot">●</span> Soft budget &amp; distance penalties</div>
          <div class="ae-row"><span class="ae-dot">●</span> Gender safety multipliers</div>
        </div>
      </div>
    `;
  }

  showResultsPlaceholder();

  function showLoadingState() {
    const panel = document.getElementById('resultsPanel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="fs-loading">
        <div class="fs-loading-inner">
          <div class="fs-spinner"></div>
          <div class="fs-loading-text">Running recommendation engine...</div>
          <div class="fs-loading-steps" id="fsLoadingSteps"></div>
        </div>
      </div>
    `;

    const steps = [
      'Applying gender filter...',
      'Computing ROC weights from priority order...',
      'Running Dijkstra distance calculations...',
      'Scoring amenity proximity...',
      'Applying soft budget & distance penalties...',
      'Aggregating duration-weighted reviews...',
      'Sorting by FitScore...',
    ];
    const stepsEl = document.getElementById('fsLoadingSteps');
    if (!stepsEl) return;
    stepsEl.innerHTML = '';
    steps.forEach((s, i) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'loading-step';
        div.innerHTML = `<div class="ls-dot"></div><span>${s}</span>`;
        if (stepsEl) stepsEl.appendChild(div);
        setTimeout(() => div.classList.add('done'), 300);
      }, i * 280);
    });
  }

  // ── SUBMIT ────────────────────────────────────────────────
  document.getElementById('submitFitScore').addEventListener('click', submitFitScore);

  function collectFormData() {
    // Read gender directly from whichever button is active/selected
    // (fitscore.html uses .gender-card; older template uses .gender-btn)
    const activeGenderBtn = document.querySelector('.gender-card.active, .gender-btn.selected');
    const genderVal = activeGenderBtn ? activeGenderBtn.dataset.val : null;
    const gender = (!genderVal || genderVal.toLowerCase() === 'any') ? null : genderVal;

    // Read campus from active campus button
    const activeCampusBtn = document.querySelector('.campus-card.active, .campus-btn.active');
    const campus = activeCampusBtn ? activeCampusBtn.dataset.val : (state.campus || 'kondhwa');

    // Budget: read from dual slider; fall back to state.budget
    const budgetMaxEl = document.getElementById('budgetRange');
    const budgetMinEl = document.getElementById('budgetRangeMin');
    const budget = budgetMaxEl ? parseInt(budgetMaxEl.value) : state.budget;
    const min_rent = budgetMinEl ? parseInt(budgetMinEl.value) : undefined;

    // Distance: read from slider
    const distEl = document.getElementById('distRange');
    const preferredDistance = distEl ? parseFloat(distEl.value) : state.preferredDistance;

    // Food / curfew from checkboxes
    const foodCb    = document.getElementById('needsFood');
    const curfewCb  = document.getElementById('noCurfew');
    const needs_food = foodCb  ? foodCb.checked  : state.needs_food;
    const curfew     = curfewCb ? curfewCb.checked : state.curfew;

    return {
      gender,
      campus,
      budget,
      min_rent,
      preferredDistance,
      needs_food,
      curfew,
      priorities: state.priorities,
      min_results: 3,
      include_debug: true,
    };
  }

  async function submitFitScore() {
    const prefs = collectFormData();
    
    if (!prefs.campus) {
      showToast('Please select a campus', 'error');
      return;
    }

    showLoadingState();

    try {
      const result = await API.getFitScore(prefs);
      
      if (!result || !result.data) {
        throw new Error('No data returned from server');
      }
      
      renderResults(result.data, result.meta);
      
    } catch (err) {
      console.error('FitScore error:', err);
      
      const panel = document.getElementById('resultsPanel');
      panel.innerHTML = `
        <div class="results-error">
          <div style="font-size:2rem">⚡</div>
          <h3>Something went wrong</h3>
          <p>${err.message.includes('fetch') ? 'Cannot connect to server. Is the backend running?' : err.message}</p>
          <button class="btn btn-primary" onclick="showResultsPlaceholder()">Try Again</button>
        </div>
      `;
    }
  }

  function getGenderBadge(pg) {
    const g = (pg.gender || 'any').toLowerCase().trim();
    const map = {
      'female': { label: 'GIRLS', color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
      'male':   { label: 'BOYS',  color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
      'any':    { label: 'ANY',   color: '#a3a3a3', bg: 'rgba(163,163,163,0.1)' },
    };
    const badge = map[g] || map['any'];
    return `<span class="gender-badge" style="color:${badge.color};background:${badge.bg};border:1px solid ${badge.color}40;font-size:10px;padding:2px 7px;border-radius:99px;font-weight:700;letter-spacing:0.05em">${badge.label}</span>`;
  }

  function scoreExplanation(pg, prefs, debugScores) {
    if (!debugScores) return 'Good all-round match for your preferences';
    const parts = [];
    if (parseFloat(debugScores.distance) > 0.85) parts.push(`📍 Very close to campus (${pg.campus_distance}km)`);
    if (parseFloat(debugScores.budget) === 1.0)  parts.push(`💰 Within your ₹${prefs.budget} budget`);
    if (parseFloat(debugScores.safety) > 0.8)    parts.push(`🔒 High safety score (${pg.safety_score}/10)`);
    if (pg.food === true && prefs.needs_food)     parts.push(`🍛 Food included`);
    if (parseFloat(debugScores.reviewBonus) > 0.03) parts.push(`⭐ Highly rated by long-term residents`);
    return parts.length > 0 ? parts.join(' • ') : 'Good all-round match for your preferences';
  }

  function updatePriorityListUI() {
    const priorityList = document.getElementById('priorityList');
    if (!priorityList) return;
    const items = [...priorityList.querySelectorAll('.priority-item')];
    const sorted = state.priorities.map(p => items.find(item => item.dataset.val === p)).filter(Boolean);
    priorityList.innerHTML = '';
    sorted.forEach(item => priorityList.appendChild(item));
    makeDraggable();
  }

  window.recalibrate = (action) => {
    if (action === 'more_budget') {
      state.budget = Math.round(state.budget * 1.25);
      const br = document.getElementById('budgetRange');
      if (br) { br.value = state.budget; document.getElementById('budgetDisplay').textContent = `₹${state.budget.toLocaleString('en-IN')}`; }
      showToast(`Budget increased to ₹${state.budget.toLocaleString('en-IN')}`, 'success');
    } else if (action === 'further_ok') {
      state.preferredDistance = parseFloat((state.preferredDistance * 1.5).toFixed(1));
      const dr = document.getElementById('distRange');
      if (dr) { dr.value = state.preferredDistance; document.getElementById('distDisplay').textContent = `${state.preferredDistance} km`; }
      showToast(`Preferred distance adjusted to ${state.preferredDistance} km`, 'success');
    } else if (action === 'safety_first') {
      const p = state.priorities.filter(x => x !== 'safety');
      state.priorities = ['safety', ...p];
      updatePriorityListUI();
      updateWeightPreview();
      showToast('Safety promoted to priority #1!', 'success');
    }
    submitFitScore();
  };

  // ── Results Renderer ──────────────────────────────────────
  function renderResults(pgs, meta) {
    const panel = document.getElementById('resultsPanel');
    if (!panel) return;

    const headerHTML = `
      <div class="fs-results-header">
        <div>
          <h2 class="fs-results-title">Your Rankings</h2>
          <p class="fs-results-meta">${meta.total_matched} PGs ranked for ${meta.preferences.gender || 'all'} students on ${meta.campus} campus</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="goToStep(1)">↺ Recalculate</button>
      </div>
      <div class="fs-results-algo">
        Algorithm: ROC-weighted + Soft-constraint penalties + Duration-weighted reviews | Campus: ${meta.campus} | Budget: ₹${meta.preferences.budget || 'Any'}
      </div>
    `;

    if (pgs.length === 0) {
      panel.innerHTML = `
        <div class="fs-results-inner">
          ${headerHTML}
          <div class="empty-state">
            <div class="empty-state-icon">🏠</div>
            <h3>No PGs found</h3>
            <p>Try relaxing your filters or switching campus.</p>
          </div>
        </div>`;
      return;
    }

    const cardsHTML = pgs.map((pg, i) => renderResultCard(pg, i)).join('');

    const feedbackHTML = `
      <div class="feedback-bar" style="margin-top: 24px; padding: 16px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(122,158,135,0.2); border-radius: 12px; display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; text-align: center;">
        <span style="font-weight:600; color: #fff; font-size: 13px;">Are these results helpful? Try recalibrating:</span>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
          <button class="btn btn-xs btn-outline" onclick="recalibrate('more_budget')" style="font-size: 11px; padding: 4px 10px;">I can spend more</button>
          <button class="btn btn-xs btn-outline" onclick="recalibrate('further_ok')" style="font-size: 11px; padding: 4px 10px;">Distance is OK</button>
          <button class="btn btn-xs btn-outline" onclick="recalibrate('safety_first')" style="font-size: 11px; padding: 4px 10px;">Safety is #1</button>
        </div>
      </div>
    `;

    // Share URL button
    const shareBtnHTML = `
      <button class="btn btn-ghost btn-sm" id="shareBtn" style="margin-top:20px;font-size:12px;opacity:0.7;">
        📤 Share my results
      </button>
    `;

    panel.innerHTML = `
      <div class="fs-results-inner">
        ${headerHTML}
        <div class="fs-results-list">${cardsHTML}</div>
        ${feedbackHTML}
        ${shareBtnHTML}
      </div>
    `;

    // Attach click event to shareBtn after rendering HTML
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.onclick = () => {
        const params = new URLSearchParams({
          g: meta.preferences.gender || '',
          c: state.campus,
          b: state.budget,
          d: state.preferredDistance,
          p: state.priorities.join(',')
        });
        const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        navigator.clipboard.writeText(url).then(() => showToast('Link copied!', 'success'));
      };
    }

    if (typeof initTiltEffect === 'function') initTiltEffect();
  }

  function renderResultCard(pg, idx) {
    const rank = idx + 1;
    const score = pg.fitScore;
    const dist = pg.campus_distance;
    // Split any concatenated amenity strings and take first 4 distinct tags
    const _rawAmenities = pg.amenities || [];
    const amenities = _rawAmenities
      .flatMap(a => typeof a === 'string' ? a.split(/(?=[A-Z][a-z])/) : [a])
      .map(a => a.trim()).filter(Boolean).slice(0, 4);
    const isTopPick = rank === 1;
    const isNote = pg._note;
    const rankEmojis = ['🥇', '🥈', '🥉'];

    const genderBadgeHTML = getGenderBadge(pg);

    // Helper: format debug key → readable label
    const fmtKey = k => k
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .replace(/_/g,' ')
      .trim();
    // Helper: format debug value → readable number
    const fmtVal = v => {
      const n = parseFloat(v);
      if (isNaN(n)) return String(v);
      if (n === Math.round(n) && Math.abs(n) < 100) return n.toFixed(0);
      return n.toFixed(3);
    };

    const debugHTML = pg.debug_scores ? `
      <button class="debug-toggle" onclick="event.stopPropagation();this.nextElementSibling.classList.toggle('open')" style="margin-top:10px;">
        ⚙ Show score breakdown
      </button>
      <div class="debug-panel">
        <div class="debug-grid">
          ${Object.entries(pg.debug_scores).map(([k, v]) =>
            `<div class="debug-item"><span class="di-key">${fmtKey(k)}</span><span class="di-val">${fmtVal(v)}</span></div>`
          ).join('')}
        </div>
        ${pg.debug_weights ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08)">
          <div style="margin-bottom:6px;color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">ROC Weights</div>
          <div class="debug-grid">${Object.entries(pg.debug_weights).map(([k, v]) =>
            `<div class="debug-item"><span class="di-key">${fmtKey(k)}</span><span class="di-val">${(v*100).toFixed(1)}%</span></div>`
          ).join('')}</div>
        </div>` : ''}
      </div>
    ` : '';

    const _hImgs = (typeof getHostelImages === 'function' && getHostelImages(pg.name)) || null;
    const pgImage = (_hImgs && _hImgs[0])
      || (pg.images && pg.images[0])
      || (pg.rent_min > 8000 ? 'pg_room_premium_1778858759007.png' : 'pg_room_shared_1778858926245.png');

    return `
      <div class="fs-result-card${isTopPick ? ' top-pick rank-1-card' : ''}" style="animation-delay: ${idx * 80}ms;" onclick="window.location = 'pg-detail.html?id=${pg.id}&campus=${state.campus}'">
        <div class="fs-result-rank">
          <div class="fs-result-image" style="width: 100px; height: 70px; border-radius: 10px; overflow: hidden; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">
             <img src="${pgImage}" alt="Room" style="width:100%; height:100%; object-fit:cover;cursor:pointer;" onclick="event.stopPropagation();if(typeof openLightbox!=='undefined'){openLightbox('${pg.name.replace(/'/g,"\\'")}'||'',0)}" onerror="this.src='pg_room_shared_1778858926245.png'">
          </div>
          <span class="rank-num rank-${rank}">${rank}</span>
          ${rankEmojis[idx] ? `<span class="rank-badge">${rankEmojis[idx]}</span>` : ''}
        </div>
        <div class="fs-result-info">
          <div class="fs-result-top-row">
            <span class="fs-result-name">${pg.name}</span>
            ${genderBadgeHTML}
            ${pg.verified ? '<span class="tag tag-verified">✓</span>' : ''}
          </div>
          <div class="fs-result-area">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${pg.area || ''}
          </div>
          <div class="fs-result-meta">
            ${dist != null ? `<div class="fs-result-meta-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${dist} km from campus
            </div>` : ''}
            <div class="fs-result-meta-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              ${pg.rent_display || (pg.rent_min ? '₹' + pg.rent_min + '/mo' : 'Contact for price')}
            </div>
            ${pg.rating ? `<div class="fs-result-meta-item">★ ${pg.rating.toFixed(1)} (${pg.review_count || 0} reviews)</div>` : ''}
            ${pg.safety_score != null ? `<div class="fs-result-meta-item">🔒 Safety ${pg.safety_score}/10</div>` : ''}
          </div>
          ${amenities.length ? `<div class="fs-result-amenities">
            ${amenities.map(a => `<span class="pc-tag">${a}</span>`).join('')}
            ${pg.amenities && pg.amenities.length > 4 ? `<span class="pc-tag">+${pg.amenities.length - 4}</span>` : ''}
          </div>` : ''}
          
          <div class="fs-score-explanation" style="font-size:12px;color:var(--accent-deep,#4F7A5E);opacity:0.95;margin-top:8px;font-weight:500;">
            ${scoreExplanation(pg, state, pg.debug_scores)}
          </div>

          ${pg.contact ? `<a href="https://wa.me/${pg.contact.replace(/\D/g,'')}?text=${encodeURIComponent(`Hi! I found ${pg.name} via StayHub AI Match (FitScore: ${score}). Is accommodation available?`)}" target="_blank" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 14px;background:rgba(34,197,94,0.1);border:1px solid #22c55e;color:#22c55e;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">💬 WhatsApp</a>` : ''}
          ${isNote ? `<div class="fs-note-tag">ℹ ${pg._note}</div>` : ''}
          ${debugHTML}
        </div>
        <div class="fs-score-block">
          <div class="fs-score-main" style="background:rgba(122,158,135,0.10);border:1.5px solid rgba(122,158,135,0.35);backdrop-filter:blur(12px);border-radius:16px;box-shadow:0 0 24px rgba(122,158,135,0.12)">
            <span class="fs-score-num" style="color:var(--accent-deep,#4F7A5E);text-shadow:0 0 20px rgba(122,158,135,0.3)">${score}</span>
            <span class="fs-score-label">FITSCORE</span>
          </div>
          ${pg.wifi_speed ? `<div class="fs-score-sub">📶 ${pg.wifi_speed} Mbps</div>` : ''}
          ${pg.food ? `<div class="fs-score-sub">🍽 Food incl.</div>` : ''}
          ${pg.curfew === 'no_curfew' ? `<div class="fs-score-sub">🌙 No curfew</div>` : ''}
        </div>
      </div>
    `;
  }

  // Feature 4: Auto-fill from shared URL params
  const urlP = new URLSearchParams(window.location.search);
  if (urlP.has('g') && urlP.has('b')) {
    const g = urlP.get('g'), c = urlP.get('c'), b = urlP.get('b'), d = urlP.get('d'), p = urlP.get('p');
    if (g) {
      state.gender = g;
      document.querySelectorAll('.gender-btn').forEach(btn => {
        if (btn.dataset.val === g) btn.classList.add('selected');
      });
    }
    if (c) {
      state.campus = c;
      document.querySelectorAll('.campus-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.val === c));
    }
    if (b) {
      state.budget = parseInt(b);
      const br = document.getElementById('budgetRange');
      if (br) { br.value = b; document.getElementById('budgetDisplay').textContent = `₹${Number(b).toLocaleString('en-IN')}`; }
    }
    if (d) {
      state.preferredDistance = parseFloat(d);
      const dr = document.getElementById('distRange');
      if (dr) { dr.value = d; document.getElementById('distDisplay').textContent = `${d} km`; }
    }
    if (p) state.priorities = p.split(',');
    setTimeout(() => submitFitScore(), 400);
  }
});
