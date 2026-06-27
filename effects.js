/* ============================================================
   StayHub — Advanced Visual Effects Engine
   Features: 3D Tilt, Custom Cursor, Magnetic Buttons
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Only run custom cursor + tilt effects on homepage
    if (!document.body.dataset.page || document.body.dataset.page !== 'home') {
      document.querySelectorAll('.tilt-target').forEach(el => {
        el.style.transform = ''; // reset any accidental transforms
      });
      return;
    }

    initTiltEffect();
    initMagneticButtons();
});



/**
 * 3D TILT EFFECT
 */
function initTiltEffect() {
    const cards = document.querySelectorAll('.card, .tilt-target');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
    });
}

/**
 * MAGNETIC BUTTONS
 */
function initMagneticButtons() {
    const buttons = document.querySelectorAll('.btn-primary, .logo-mark');
    
    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = `translate(0, 0)`;
        });
    });
}
