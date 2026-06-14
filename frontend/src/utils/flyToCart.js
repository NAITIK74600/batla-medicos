/**
 * Fly-to-cart animation — swing then fly to cart button.
 * @param {HTMLElement|null} sourceEl  Product image or image wrapper element
 * @param {HTMLElement|null} cardEl    Fallback: whole product card (used when no image)
 */
export function flyToCart(sourceEl, cardEl = null) {
  const cartBtn = document.querySelector('.navbar__cart-btn');
  if (!cartBtn) return;

  // Use image element if visible, otherwise fall back to whole card
  const refEl = (sourceEl && sourceEl.getBoundingClientRect().width > 0) ? sourceEl : cardEl;
  if (!refEl) return;

  const srcRect  = refEl.getBoundingClientRect();
  const destRect = cartBtn.getBoundingClientRect();
  if (!srcRect.width) return;

  const ghost = document.createElement('div');
  ghost.className = 'fly-to-cart-ghost';

  // Detect a usable image src
  const imgTag   = sourceEl ? (sourceEl.tagName === 'IMG' ? sourceEl : sourceEl.querySelector('img')) : null;
  const hasImage = !!(imgTag?.src && imgTag.src.startsWith('http'));

  if (hasImage) {
    const img = document.createElement('img');
    img.src = imgTag.src;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:inherit;';
    ghost.appendChild(img);
  } else {
    // Branded pill ghost — shown when product has no image
    ghost.style.background = 'linear-gradient(135deg,#3451D1,#27AE60)';
    const icon = document.createElement('span');
    icon.textContent = '💊';
    icon.style.cssText = 'font-size:26px;line-height:1;display:block;';
    ghost.appendChild(icon);
    ghost.style.display = 'flex';
    ghost.style.alignItems = 'center';
    ghost.style.justifyContent = 'center';
  }

  const size   = Math.min(srcRect.width, srcRect.height, hasImage ? 80 : 60);
  const startX = srcRect.left  + srcRect.width  / 2 - size / 2;
  const startY = srcRect.top   + srcRect.height / 2 - size / 2;

  Object.assign(ghost.style, {
    position:        'fixed',
    left:            `${startX}px`,
    top:             `${startY}px`,
    width:           `${size}px`,
    height:          `${size}px`,
    zIndex:          '99999',
    pointerEvents:   'none',
    borderRadius:    '50%',
    overflow:        'hidden',
    boxShadow:       '0 6px 24px rgba(0,0,0,0.3)',
    transformOrigin: 'center bottom',
    willChange:      'transform, opacity',
  });

  document.body.appendChild(ghost);

  // ── Phase 1: Swing (pendulum) ───────────────────────────────────────────
  const swing = ghost.animate([
    { transform: 'scale(1)     rotate(0deg)'   },
    { transform: 'scale(1.18)  rotate(-22deg)', offset: 0.25 },
    { transform: 'scale(1.12)  rotate(13deg)',  offset: 0.50 },
    { transform: 'scale(1.06)  rotate(-7deg)',  offset: 0.75 },
    { transform: 'scale(1)     rotate(0deg)'   },
  ], { duration: 380, easing: 'ease-in-out', fill: 'none' });

  // ── Phase 2: Fly to cart ────────────────────────────────────────────────
  swing.onfinish = () => {
    const endX     = destRect.left + destRect.width  / 2 - 14;
    const endY     = destRect.top  + destRect.height / 2 - 14;
    const dx       = endX - startX;
    const dy       = endY - startY;
    const endScale = 28 / size;

    const fly = ghost.animate([
      { transform: 'translate(0px,0px) scale(1) rotate(0deg)', opacity: '1' },
      {
        transform: `translate(${dx * 0.45}px,${dy * 0.25}px) scale(0.82) rotate(140deg)`,
        opacity:   '0.9',
        offset:    0.38,
      },
      { transform: `translate(${dx}px,${dy}px) scale(${endScale}) rotate(720deg)`, opacity: '0.05' },
    ], {
      duration: 640,
      easing:   'cubic-bezier(0.25,0.46,0.45,0.94)',
      fill:     'forwards',
    });

    fly.onfinish = () => {
      ghost.remove();
      cartBtn.classList.add('navbar__cart-btn--bounce');
      setTimeout(() => cartBtn.classList.remove('navbar__cart-btn--bounce'), 500);
    };
  };
}
