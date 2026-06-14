import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

// path = direct route link; slug = /products?category=slug
const CATEGORIES = [
  {
    label: 'Health Resource Center',
    slug: 'allopathic',
    children: [
      { label: 'All Diseases',               path: '/diseases' },
      { label: 'All Medicines',              path: '/products' },
      { label: 'Capsules & Tablets',         slug: 'caps-tabs' },
      { label: 'Liquids & Syrups',           slug: 'liquids' },
      { label: 'Generic Medicines',          slug: 'generic' },
      { label: 'High Value Medicines',       slug: 'high-value' },
    ],
  },
  { label: 'Hair Care',            slug: 'hair-care' },
  { label: 'Fitness & Health',     slug: 'fitness-health' },
  { label: 'Sexual Wellness',      slug: 'sexual-wellness' },
  { label: 'Vitamins & Nutrition', slug: 'vitamins-nutrition' },
  { label: 'Supports & Braces',    slug: 'supports-braces' },
  { label: 'Immunity Boosters',    slug: 'immunity-boosters' },
  { label: 'Ayurveda',             slug: 'ayurveda' },
  { label: 'Skin Care',            slug: 'skin-care' },
  { label: 'Baby Care',            slug: 'baby-care' },
  { label: 'Diabetes Care',        slug: 'diabetes-care' },
  { label: 'Elderly Care',         slug: 'elderly-care' },
];

export default function CategoryNav() {
  const [activeIdx, setActiveIdx] = useState(null);
  const [dropPos, setDropPos] = useState({ left: 0, top: 0 });
  const navRef = useRef(null);
  const dropdownRef = useRef(null);
  const itemRefs = useRef([]);
  const closeTimer = useRef(null);
  const navigate = useNavigate();

  // Detect touch device
  const isTouchDevice = useRef(false);
  useEffect(() => {
    const onTouch = () => { isTouchDevice.current = true; };
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, []);

  // ── URL-based "currently browsing" highlight ──────────────────────────────
  const location = useLocation();
  const currentCatSlug = new URLSearchParams(location.search).get('category') || '';

  // Find which top-level nav item owns the active slug (direct parent match OR child match)
  const browsingIdx = CATEGORIES.findIndex(cat =>
    cat.slug === currentCatSlug ||
    cat.children?.some(child => child.slug === currentCatSlug)
  );

  // Close on outside click or scroll
  useEffect(() => {
    const close = (e) => {
      const inNav = navRef.current && navRef.current.contains(e.target);
      const inDrop = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inNav && !inDrop) setActiveIdx(null);
    };
    const closeOnScroll = () => setActiveIdx(null);
    // Use 'click' (not 'mousedown') so Link navigation fires first before the dropdown closes
    document.addEventListener('click', close);
    window.addEventListener('scroll', closeOnScroll, { passive: true });
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', closeOnScroll);
    };
  }, []);

  const openAt = useCallback((idx) => {
    clearTimeout(closeTimer.current);
    const el = itemRefs.current[idx];
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropPos({ left: rect.left, top: rect.bottom }); // fixed positioning
    }
    setActiveIdx(idx);
  }, []);

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setActiveIdx(null), 150);
  };

  const activeCat = activeIdx !== null ? CATEGORIES[activeIdx] : null;

  return (
    <>
      <nav className="cat-nav" ref={navRef} aria-label="Category navigation">
        <div className="cat-nav__scroll">
          {CATEGORIES.map((cat, idx) => {
            const hasChildren = cat.children?.length > 0;
            const isDropOpen = hasChildren && activeIdx === idx;
            return (
              <div
                key={cat.slug}
                className={`cat-nav__item${
                  isDropOpen ? ' cat-nav__item--active' : ''
                }${browsingIdx === idx ? ' cat-nav__item--browsing' : ''}`}
                ref={el => { itemRefs.current[idx] = el; }}
                onMouseEnter={() => hasChildren ? openAt(idx) : scheduleClose()}
                onMouseLeave={scheduleClose}
              >
                <Link
                  to={cat.path || `/products?category=${cat.slug}`}
                  className="cat-nav__label"
                  onClick={(e) => {
                    if (hasChildren) {
                      e.preventDefault();
                      if (activeIdx === idx) setActiveIdx(null);
                      else openAt(idx);
                    } else {
                      setActiveIdx(null);
                    }
                  }}
                >
                  {cat.label}
                  {hasChildren && (
                    <ChevronDown size={13} className="cat-nav__chevron" />
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Dropdown rendered in a portal-style fixed element — escapes ALL overflow clipping */}
      {activeCat?.children?.length > 0 && (
        <div
          className="cat-nav__dropdown"
          ref={dropdownRef}
          style={{ left: dropPos.left, top: dropPos.top }}
          onMouseEnter={() => { clearTimeout(closeTimer.current); }}
          onMouseLeave={scheduleClose}
          onClick={e => e.stopPropagation()}
        >
          {activeCat.children.map((child) => {
            const childSlug = child.slug || '';
            const isChildActive = childSlug && childSlug === currentCatSlug;
            return (
              <Link
                key={child.path || child.label}
                to={child.path || `/products?category=${child.slug}`}
                className={`cat-nav__dropdown-item${isChildActive ? ' cat-nav__dropdown-item--active' : ''}`}
                onClick={() => setActiveIdx(null)}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
