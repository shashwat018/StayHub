/**
 * StayHub — Home Page JS
 * Loads featured listings and updates live stats
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Live stats from health endpoint
  try {
    const health = await API.getHealth();
    const pgStat = document.getElementById('statPGs');
    if (pgStat && health.data) {
      pgStat.textContent = health.data.total_pgs;
    }
  } catch (e) {
    // Silently fail — static numbers remain
  }

  // Featured listings — top rated PGs
  await loadFeaturedListings();

  // Animate weight bars on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.wd-bar').forEach(bar => {
          bar.style.transition = 'width 1.2s cubic-bezier(0.25,0.46,0.45,0.94)';
        });
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.weight-demo').forEach(el => observer.observe(el));
});

async function loadFeaturedListings() {
  const container = document.getElementById('featuredListings');
  if (!container) return;

  try {
    const data = await API.getListings({ sort: 'rating', limit: 3, campus: 'kondhwa' });
    const pgs = data.data || [];

    if (pgs.length === 0) {
      container.innerHTML = '<p class="no-results">No listings found.</p>';
      return;
    }

    // Use the new minimalist pg-card design from design-system v3
    container.innerHTML = pgs.map(pg => API.buildPGCard(pg, 'kondhwa', 'minimal')).join('');

  } catch (err) {
    container.innerHTML = `
      <div class="error-state">
        <span>⚡</span>
        <strong>Backend not connected</strong>
        <small>${err.message}</small>
      </div>
    `;
  }
}
