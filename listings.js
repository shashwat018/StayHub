/**
 * StayHub — Listings Page
 * Full filter/sort/pagination integration with backend
 */
document.addEventListener('DOMContentLoaded', () => {
  // ── State ─────────────────────────────────────────────────
  const state = {
    campus: new URLSearchParams(window.location.search).get('campus') || 'kondhwa',
    gender: '',
    max_rent: null,
    max_distance: null,
    food: false,
    ac: false,
    curfew: false,
    sharing: null,
    sort: 'distance',
    search: '',
    page: 1,
    limit: 12,
    viewMode: 'grid',
    totalPages: 1,
    cardVariant: 'luxury', // Set Variant A (Luxury Editorial) as default
  };

  // Feature 5: Restore saved filters
  const savedFilters = JSON.parse(localStorage.getItem('sh_filters') || '{}');
  let filtersRestored = false;
  if (Object.keys(savedFilters).length > 0) {
    Object.assign(state, savedFilters);
    state.page = 1; // Always reset to page 1 on restore
    filtersRestored = true;
  }

  // ── DOM refs ──────────────────────────────────────────────
  const pgGrid = document.getElementById('pgGrid');
  if (pgGrid) pgGrid.className = 'pg-grid luxury-view'; // Set initial view
  const resultsCount = document.getElementById('resultsCount');
  const pagination = document.getElementById('pagination');
  const budgetSlider = document.getElementById('budgetSlider');
  const budgetVal = document.getElementById('budgetVal');
  const distSlider = document.getElementById('distSlider');
  const distVal = document.getElementById('distVal');
  const sortSelect = document.getElementById('sortSelect');
  const searchInput = document.getElementById('searchInput');
  const filterReset = document.getElementById('filterReset');
  const viewGrid = document.getElementById('viewGrid');
  const viewList = document.getElementById('viewList');
  const viewMap = document.getElementById('viewMap');
  const mobileFilterToggle = document.getElementById('mobileFilterToggle');
  const filterSidebar = document.getElementById('filterSidebar');
  const listingsLayout = document.querySelector('.listings-layout');

  // ── Campus toggle init ────────────────────────────────────
  document.querySelectorAll('[data-filter="campus"]').forEach(btn => {
    if (btn.dataset.val === state.campus) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  // ── Toggle buttons ────────────────────────────────────────
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      const val = btn.dataset.val;
      document.querySelectorAll(`[data-filter="${filter}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (filter === 'campus') state.campus = val;
      if (filter === 'gender') state.gender = val;
      state.page = 1;
      fetchListings();
    });
  });

  // ── Sliders ───────────────────────────────────────────────
  budgetSlider.addEventListener('input', () => {
    const v = parseInt(budgetSlider.value);
    state.max_rent = v < 25000 ? v : null;
    budgetVal.textContent = v < 25000 ? `₹${v.toLocaleString()}` : 'Any';
    state.page = 1;
  });
  budgetSlider.addEventListener('change', fetchListings);

  distSlider.addEventListener('input', () => {
    const v = parseFloat(distSlider.value);
    state.max_distance = v < 6 ? v : null;
    distVal.textContent = v < 6 ? `${v} km` : 'Any';
    state.page = 1;
  });
  distSlider.addEventListener('change', fetchListings);

  // ── Checkboxes ────────────────────────────────────────────
  document.getElementById('filterFood').addEventListener('change', e => { state.food = e.target.checked; state.page = 1; fetchListings(); });
  document.getElementById('filterAC').addEventListener('change', e => { state.ac = e.target.checked; state.page = 1; fetchListings(); });
  document.getElementById('filterNoCurfew').addEventListener('change', e => { state.curfew = e.target.checked; state.page = 1; fetchListings(); });

  // ── Sharing type ─────────────────────────────────────────
  document.querySelectorAll('.sharing-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = [...document.querySelectorAll('.sharing-check:checked')].map(c => c.value);
      state.sharing = checked.length > 0 ? checked[0] : null;
      state.page = 1;
      fetchListings();
    });
  });

  // ── Sort ─────────────────────────────────────────────────
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; state.page = 1; fetchListings(); });

  // ── Search (debounced) ────────────────────────────────────
  let searchTimer;
  const stickySearchInput = document.getElementById('stickySearchInput');

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      if (stickySearchInput) stickySearchInput.value = state.search;
      state.page = 1;
      fetchListings();
    }, 400);
  });

  if (stickySearchInput) {
    stickySearchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = stickySearchInput.value.trim();
        searchInput.value = state.search;
        state.page = 1;
        fetchListings();
      }, 400);
    });
  }

  // ── Reset ─────────────────────────────────────────────────
  filterReset.addEventListener('click', () => {
    state.gender = ''; state.max_rent = null; state.max_distance = null;
    state.food = false; state.ac = false; state.curfew = false;
    state.sharing = null; state.search = ''; state.sort = 'distance'; state.page = 1;
    budgetSlider.value = 25000; budgetVal.textContent = 'Any';
    distSlider.value = 6; distVal.textContent = 'Any';
    document.getElementById('filterFood').checked = false;
    document.getElementById('filterAC').checked = false;
    document.getElementById('filterNoCurfew').checked = false;
    document.querySelectorAll('.sharing-check').forEach(c => c.checked = false);
    searchInput.value = '';
    if (stickySearchInput) stickySearchInput.value = '';
    sortSelect.value = 'distance';
    document.querySelectorAll('[data-filter="gender"]').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-filter="gender"][data-val=""]').classList.add('active');
    fetchListings();
  });

  // ── View toggle ───────────────────────────────────────────
  if (viewGrid) {
    viewGrid.addEventListener('click', () => {
      state.viewMode = 'grid';
      pgGrid.classList.remove('list-view');
      listingsLayout.classList.remove('map-active');
      viewGrid.classList.add('active');
      if (viewMap) viewMap.classList.remove('active');
    });
  }
  if (viewList) {
    viewList.addEventListener('click', () => {
      state.viewMode = 'list';
      pgGrid.classList.add('list-view');
      listingsLayout.classList.remove('map-active');
      viewList.classList.add('active'); viewGrid.classList.remove('active'); viewMap.classList.remove('active');
    });
  }
  if (viewMap) {
    viewMap.addEventListener('click', () => {
      state.viewMode = 'map';
      listingsLayout.classList.add('map-active');
      viewMap.classList.add('active');
      if (viewGrid) viewGrid.classList.remove('active');
      initMap();
      setTimeout(() => {
        if (map) {
          map.invalidateSize();
          updateMapMarkers(lastFetchedPGs);
        }
      }, 400);
    });
  }

  // ── Mobile filter toggle ──────────────────────────────────
  mobileFilterToggle.addEventListener('click', () => {
    filterSidebar.classList.toggle('open');
    mobileFilterToggle.textContent = filterSidebar.classList.contains('open') ? '✕ Close Filters' : '⚙ Filters';
  });

  // ── Map Integration ───────────────────────────────────────
  let map = null;
  let markersLayer = null;

  function initMap() {
    if (map) return;
    map = L.map('map').setView([18.4635, 73.8845], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CartoDB'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
  }

  function updateMapMarkers(pgs) {
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();
    pgs.forEach(pg => {
      if (pg.lat && pg.lng) {
        const price = pg.rent_min ? `₹${(pg.rent_min / 1000).toFixed(1)}k` : 'N/A';
        const marker = L.marker([pg.lat, pg.lng], {
          icon: L.divIcon({
            className: 'price-marker',
            html: `<div>${price}</div>`,
            iconSize: [40, 24],
            iconAnchor: [20, 12]
          })
        }).bindPopup(`<strong>${pg.name}</strong><br>₹${pg.rent_min}/mo`);
        markersLayer.addLayer(marker);
      }
    });
    if (markersLayer.getLayers().length > 0) {
      const group = new L.featureGroup(markersLayer.getLayers());
      map.fitBounds(group.getBounds(), { padding: [40, 40] });
    }
  }

  let lastFetchedPGs = [];

  function updateFilterBadge(filters) {
    const activeCount = Object.values(filters).filter(v => v && v !== 'kondhwa' && v !== 'distance' && v !== 20 && v !== 1 && v !== '20' && v !== '1').length;
    const badge = document.getElementById('filterBadge');
    if (badge) {
      badge.textContent = activeCount > 0 ? activeCount : '';
      badge.style.display = activeCount > 0 ? 'flex' : 'none';
    }
  }

  // ── Fetch & Render ────────────────────────────────────────
  async function fetchListings() {
    // Clear previous results immediately
    const container = document.getElementById('listingsContainer') 
      || document.getElementById('pgGrid') 
      || document.querySelector('.listings-list');
    if (container) {
      container.innerHTML = '<div class="loading-state">Filtering...</div>';
    }
    resultsCount.textContent = 'Loading...';
    pagination.innerHTML = '';

    const filters = {
      campus: state.campus,
      sort: state.sort,
      page: state.page,
      limit: state.limit,
    };
    if (state.gender) filters.gender = state.gender;
    if (state.max_rent) filters.max_rent = state.max_rent;
    if (state.max_distance) filters.max_distance = state.max_distance;
    if (state.food) filters.food = true;
    if (state.ac) filters.ac = true;
    if (state.curfew) filters.curfew = 'no_curfew';
    if (state.sharing) filters.sharing = state.sharing;
    if (state.search) filters.search = state.search;

    updateFilterBadge(filters);

    try {
      const data = await API.getListings(filters);
      if (!data.success) throw new Error(data.error || 'Failed to load listings');

      const pgs = data.data;
      lastFetchedPGs = pgs;
      const meta = data.meta;
      state.totalPages = meta.total_pages;

      if (pgs.length === 0) {
        let suggestion = '';
        const activeFilters = [];
        if (state.max_rent) activeFilters.push('Budget');
        if (state.max_distance) activeFilters.push('Distance');
        if (state.ac) activeFilters.push('AC');
        if (state.food) activeFilters.push('Meals');
        if (state.curfew) activeFilters.push('No Curfew');
        if (state.sharing) activeFilters.push('Sharing');

        if (activeFilters.length > 0) {
          suggestion = `<p style="margin-top:14px; font-size:13px; color:var(--yellow); background: rgba(239,255,56,0.06); padding: 10px; border-radius: 6px; border: 1px dashed rgba(239,255,56,0.3); display: inline-block;">💡 Smart Suggestion: Try relaxing your <strong>${activeFilters.join(', ')}</strong> filter(s) to view nearby matches.</p>`;
        }

        pgGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon">🏠</div>
          <h3>No PGs found</h3>
          <p>Try relaxing your filters or searching a different campus.</p>
          ${suggestion}
        </div>`;
        resultsCount.innerHTML = '<strong>0</strong> PGs found';
      } else {
        pgGrid.innerHTML = '';
        pgs.forEach(pg => {
          const cardHtml = API.buildPGCard(pg, state.campus, state.cardVariant);
          const temp = document.createElement('div');
          temp.innerHTML = cardHtml.trim();
          const card = temp.firstChild;
          if (state.viewMode === 'list') card.classList.add('list-view');
          pgGrid.appendChild(card);
        });

        if (state.viewMode === 'map') updateMapMarkers(pgs);
        if (typeof initTiltEffect === 'function') initTiltEffect();

        resultsCount.innerHTML = `<strong>${meta.total}</strong> PG${meta.total !== 1 ? 's' : ''} found`;
        renderPagination(meta.page, meta.total_pages);

        // Feature 5: Save filters to localStorage
        const filtersToSave = {
          campus: state.campus, gender: state.gender, max_rent: state.max_rent,
          max_distance: state.max_distance, food: state.food, ac: state.ac,
          curfew: state.curfew, sharing: state.sharing, sort: state.sort,
        };
        localStorage.setItem('sh_filters', JSON.stringify(filtersToSave));

        // Design 5: Live viewers counter
        const vcEl = document.getElementById('viewerCount');
        if (vcEl) vcEl.textContent = Math.floor(Math.random() * 12) + 4;
      }
    } catch (e) {
      pgGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <h3>Connection error</h3>
        <p>${e.message}</p>
      </div>`;
    }
  }

  function renderPagination(currentPage, totalPages) {
    if (totalPages <= 1) return;
    let html = '';
    const prev = currentPage - 1;
    const next = currentPage + 1;
    if (prev > 0) html += `<button class="page-btn" data-page="${prev}">←</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
        html += `<button class="page-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
      } else if (i === currentPage - 3 || i === currentPage + 3) {
        html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
      }
    }
    if (next <= totalPages) html += `<button class="page-btn" data-page="${next}">→</button>`;
    pagination.innerHTML = html;
    pagination.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.page = parseInt(btn.dataset.page);
        fetchListings();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ── Initial load ──────────────────────────────────────────
  fetchListings();

  // Feature 5: Apply restored filters to UI + show toast
  if (filtersRestored) {
    if (state.max_rent) { budgetSlider.value = state.max_rent; budgetVal.textContent = `₹${Number(state.max_rent).toLocaleString()}`; }
    if (state.max_distance) { distSlider.value = state.max_distance; distVal.textContent = `${state.max_distance} km`; }
    if (state.food) document.getElementById('filterFood').checked = true;
    if (state.ac) document.getElementById('filterAC').checked = true;
    if (state.curfew) document.getElementById('filterNoCurfew').checked = true;
    if (state.sort) { const ss = document.getElementById('sortSelect'); if (ss) ss.value = state.sort; }
    document.querySelectorAll('[data-filter="campus"]').forEach(b => b.classList.toggle('active', b.dataset.val === state.campus));
    document.querySelectorAll('[data-filter="gender"]').forEach(b => b.classList.toggle('active', b.dataset.val === (state.gender || '')));
    setTimeout(() => showToast('Filters restored from your last visit', 'info', 3000), 800);
  }

  // ── Feature 2: PG Comparison Tool ─────────────────────────
  const selectedForCompare = new Map(); // id → pg object
  window.selectedForCompare = selectedForCompare; // Expose to global scope just in case

  function toggleCompare(pgId, pgData) {
    const idStr = String(pgId);
    if (selectedForCompare.has(idStr)) {
      selectedForCompare.delete(idStr);
    } else {
      if (selectedForCompare.size >= 3) {
        showToast('Max 3 PGs can be compared', 'info');
        // Uncheck the checkbox if we exceeded max
        const cb = document.querySelector(`.pg-compare-cb[data-id="${pgId}"]`);
        if (cb) cb.checked = false;
        return;
      }
      selectedForCompare.set(idStr, pgData);
    }
    updateCompareBar();
  }

  function updateCompareBar() {
    const bar = document.getElementById('compareBar');
    if (!bar) return;
    const count = selectedForCompare.size;
    
    // Update the inner tray item count
    const countEl = document.getElementById('compareCount');
    if (countEl) countEl.textContent = `${count} PGs selected`;

    const compareNowBtn = document.getElementById('compareNowBtn');
    if (compareNowBtn) compareNowBtn.disabled = count < 2;

    const itemsContainer = document.getElementById('compareBarItems');
    if (itemsContainer) {
      itemsContainer.innerHTML = '';
      selectedForCompare.forEach((pg, id) => {
        const chip = document.createElement('div');
        chip.className = 'compare-chip';
        chip.innerHTML = `<span>${pg.name.length > 22 ? pg.name.slice(0,22)+'…' : pg.name}</span><button class="compare-chip-x" data-id="${id}">✕</button>`;
        chip.querySelector('.compare-chip-x').onclick = () => {
          selectedForCompare.delete(String(id));
          const cb = document.querySelector(`.pg-compare-cb[data-id="${id}"]`);
          if (cb) cb.checked = false;
          updateCompareBar();
        };
        itemsContainer.appendChild(chip);
      });
    }

    if (count >= 2) {
      bar.style.display = 'flex';
      bar.classList.add('visible');
    } else if (count > 0) {
      bar.style.display = 'flex';
      bar.classList.remove('visible');
    } else {
      bar.style.display = 'none';
      bar.classList.remove('visible');
    }
  }

  function openComparison() {
    const pgs = [...selectedForCompare.values()];
    if (pgs.length < 2) return;

    const ROWS = [
      { label: 'Rent',      fn: pg => `<strong>₹${pg.rent_min ? pg.rent_min.toLocaleString('en-IN') : 'Contact'}</strong>` },
      { label: 'Distance',  fn: pg => pg.campus_distance ? `${pg.campus_distance} km` : 'N/A' },
      { label: 'Rating',    fn: pg => pg.rating ? `⭐ ${pg.rating}` : '—' },
      { label: 'Safety',    fn: pg => pg.safety_score ? `${pg.safety_score}/10` : '—' },
      { label: 'WiFi',      fn: pg => pg.wifi_speed ? `${pg.wifi_speed} Mbps` : '—' },
      { label: 'Food',      fn: pg => pg.food === true ? '<span class="check-yes">✓</span>' : pg.food === 'optional' ? 'Optional' : '<span class="check-no">✗</span>' },
      { label: 'AC',        fn: pg => pg.ac ? '<span class="check-yes">✓</span>' : '<span class="check-no">✗</span>' },
      { label: 'Curfew',    fn: pg => pg.curfew === 'no_curfew' ? '<span class="check-yes">None</span>' : (pg.curfew || '—') },
      { label: 'Gender',    fn: pg => ({ female: 'Girls PG', male: 'Boys PG', any: 'Co-ed' })[pg.gender] || '—' },
      { label: 'Deposit',   fn: pg => pg.deposit ? `₹${pg.deposit.toLocaleString('en-IN')}` : '—' },
    ];

    const colHeaders = pgs.map(pg => `
      <th>
        <div class="compare-pg-name">${pg.name}</div>
        <div class="compare-pg-price">₹${pg.rent_min ? pg.rent_min.toLocaleString('en-IN') : 'Contact'}/mo</div>
      </th>
    `).join('');

    const rows = ROWS.map(row => `
      <tr>
        <td class="row-label">${row.label}</td>
        ${pgs.map(pg => `<td>${row.fn(pg)}</td>`).join('')}
      </tr>
    `).join('');

    const drawerContent = document.getElementById('comparisonContent');
    if (drawerContent) {
      drawerContent.innerHTML = `
        <div style="overflow-x:auto">
          <table class="compare-table">
            <thead><tr><th></th>${colHeaders}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap">
          ${pgs.map(pg => `<a href="pg-detail.html?id=${pg.id}&campus=${state.campus}" class="btn-primary" style="font-size:0.82rem">View ${pg.name.split(' ')[0]} →</a>`).join('')}
        </div>
      `;
    }
  }

  window.closeComparison = () => {
    document.body.style.overflow = '';
  };

  window.closeComparison = () => {
    const modal = document.getElementById('comparisonModal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
  };

  // Event delegation: catch checkbox changes even after re-renders
  pgGrid.addEventListener('change', e => {
    const cb = e.target.closest('.pg-compare-cb');
    if (!cb) return;
    const id = cb.dataset.id;
    const card = cb.closest('.list-card');
    let pgData = {};
    if (card && card.dataset.pg) {
      try {
        pgData = JSON.parse(card.dataset.pg.replace(/&#39;/g, "'"));
      } catch(_) {
        pgData = { id: id, name: cb.dataset.name || 'PG' };
      }
    }
    toggleCompare(id, pgData);
  });

  const compareNowBtn = document.getElementById('compareNowBtn');
  if (compareNowBtn) {
    compareNowBtn.addEventListener('click', openComparison);
  }

  const compareClearBtn = document.getElementById('compareClearBtn');
  if (compareClearBtn) {
    compareClearBtn.addEventListener('click', () => {
      selectedForCompare.clear();
      document.querySelectorAll('.pg-compare-cb:checked').forEach(cb => cb.checked = false);
      updateCompareBar();
    });
  }

  // Close when overlay is clicked
  const compModal = document.getElementById('comparisonModal');
  if (compModal) {
    compModal.addEventListener('click', e => {
      if (e.target === compModal) {
        window.closeComparison();
      }
    });
  }

  // ── Card Style Variant Toggle ──
  const styleToggleBtns = document.querySelectorAll('#cardStyleToggle .style-pill-btn');
  styleToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.cardVariant = btn.dataset.variant;
      
      // Update grid classes based on variant style
      if (state.cardVariant === 'luxury') {
        pgGrid.className = 'pg-grid luxury-view';
      } else if (state.cardVariant === 'immersive') {
        pgGrid.className = 'pg-grid immersive-view';
      } else {
        pgGrid.className = 'pg-grid';
      }
      
      fetchListings();
    });
  });

});
