import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';import { Search, SlidersHorizontal, X, Package, ChevronRight, Pill, Leaf, Sparkles, Baby, Scissors, LayoutGrid, Droplets, Droplet, FlaskConical, Wind, Syringe, Thermometer, ShoppingBag, Star, Box, TestTube, GlassWater, Gem, Tag, Shield, Apple, Smile, ShoppingCart, Flower2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getProducts, getTopBrands, requestMedicineAvailability } from '../api/products';
import { getBrandPromotions } from '../api/brands';
import { getActiveOffers } from '../api/offers';
import { getCategories } from '../api/categories';
import ProductCard from '../components/ProductCard';
import OfferBanner from '../components/OfferBanner';
import PromoVideo from '../components/PromoVideo';
import SEO from '../components/SEO';
import { trackSearch } from '../utils/analytics';

const SORT_OPTIONS = [
  { value: 'newest',        label: 'Newest First' },
  { value: 'price_asc',     label: 'Price: Low → High' },
  { value: 'price_desc',    label: 'Price: High → Low' },
  { value: 'name_asc',      label: 'Name: A – Z' },
  { value: 'name_desc',     label: 'Name: Z – A' },
  { value: 'category_asc',  label: 'Category: A – Z' },
];

const CAT_ICONS = {
  // actual DB slugs (seedCategories.js)
  'caps-tabs':        <Pill size={15} />,
  'liquids':          <Droplets size={15} />,
  'cream-ointment':   <FlaskConical size={15} />,
  'drop':             <Droplet size={15} />,
  'powder':           <TestTube size={15} />,
  'lotion':           <Sparkles size={15} />,
  'injection':        <Syringe size={15} />,
  'inhaler':          <Wind size={15} />,
  'softgel-capsules': <Gem size={15} />,
  'fluids':           <GlassWater size={15} />,
  'high-value':       <Star size={15} />,
  'fmcg':             <ShoppingBag size={15} />,
  'surgicals':        <Scissors size={15} />,
  'generic':          <Package size={15} />,
  'keimed-generics':  <Tag size={15} />,
  'container':        <Box size={15} />,
  'pharma-misc':      <LayoutGrid size={15} />,
  'fridge':           <Thermometer size={15} />,
  // legacy fallbacks
  allopathic:         <Pill size={15} />,
  ayurvedic:          <Leaf size={15} />,
  cosmetics:          <Sparkles size={15} />,
  'baby-products':    <Baby size={15} />,
  surgical:           <Scissors size={15} />,
  // new categories
  vaccines:           <Shield size={15} />,
  nutrition:          <Apple size={15} />,
  dental:             <Smile size={15} />,
  otc:                <ShoppingCart size={15} />,
  herbal:             <Flower2 size={15} />,
};

function Skeleton() {
  return (
    <div className="catalog__skeleton-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="catalog__skeleton-card">
          <div className="catalog__skeleton-img" />
          <div className="catalog__skeleton-line" style={{ width: '80%' }} />
          <div className="catalog__skeleton-line" style={{ width: '50%' }} />
          <div className="catalog__skeleton-line" style={{ width: '60%', height: '28px' }} />
        </div>
      ))}
    </div>
  );
}

export default function ProductCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(1);
  const [loading, setLoading]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [brands, setBrands] = useState([]);
  const [brandPromoVideos, setBrandPromoVideos] = useState([]);
  const [offers, setOffers] = useState([]);
  const sidebarRef = useRef(null);
  const [requestName, setRequestName] = useState('');
  const [requestPhone, setRequestPhone] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  const page     = parseInt(searchParams.get('page')) || 1;
  const search   = searchParams.get('search') || '';
  const categoryParam = searchParams.get('category') || '';
  const brand    = searchParams.get('brand') || '';
  const sort     = searchParams.get('sort') || 'newest';

  // Local search state — debounced so the product grid doesn't reload on every keystroke
  const [inputSearch, setInputSearch] = useState(search);
  const searchTimer = useRef(null);

  const handleSearchInput = (value) => {
    setInputSearch(value);
    clearTimeout(searchTimer.current);
    if (!value) {
      // Clear immediately (no debounce needed when emptying)
      const next = new URLSearchParams(searchParams);
      next.delete('search');
      next.set('page', '1');
      setSearchParams(next);
    } else {
      searchTimer.current = setTimeout(() => setParam('search', value), 420);
    }
  };

  // Sync local input when URL search is changed externally (e.g. category chip)
  useEffect(() => { setInputSearch(search); }, [search]);
  useEffect(() => { setRequestSent(false); }, [search, categoryParam, brand]);

  const clearAllFilters = () => {
    clearTimeout(searchTimer.current);
    setInputSearch('');
    setSearchParams(new URLSearchParams());
  };

  const handleRequestAvailability = async (e) => {
    e.preventDefault();
    const medicineName = (search || inputSearch || '').trim();
    if (medicineName.length < 2) {
      toast.error('Please type medicine name first.');
      return;
    }
    setRequestLoading(true);
    try {
      await requestMedicineAvailability({
        medicineName,
        customerName: requestName,
        phone: requestPhone,
        email: requestEmail,
        searchQuery: medicineName,
      });
      setRequestSent(true);
      setRequestName('');
      setRequestPhone('');
      setRequestEmail('');
      toast.success('Request sent. Batla Medicos team will contact you.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not send request. Please try again.');
    } finally {
      setRequestLoading(false);
    }
  };

  const toggleBrand = (b) => {
    setParam('brand', brand === b ? '' : b);
    setSidebarOpen(false);
  };

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setSearchParams(next);
    // Scroll to top of product grid on page/filter change
    if (key === 'page') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const selectedCategory = categories.find(c => c._id === categoryParam || c.slug === categoryParam) || null;
  // Pass categoryParam (slug or numeric ID) directly — backend resolveCategoryIds handles both DB slugs and parent group slugs
  const category = categoryParam;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, sort };
      if (search) params.search = search;
      if (category) params.category = category;
      if (brand) params.brand = brand;
      const { data } = await getProducts(params);
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      if (search) trackSearch(search, data.total);
    } catch {
      setProducts([]);
      setTotal(0);
      setPages(1);
    }
    finally { setLoading(false); }
  }, [page, search, category, brand, sort]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    getCategories().then(r => setCategories(r.data.categories || [])).catch(() => {});
    getTopBrands().then(r => setBrands(r.data.brands || [])).catch(() => {});
    getActiveOffers('products').then(r => setOffers(r.data.offers || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!brand) { setBrandPromoVideos([]); return; }
    getBrandPromotions('brand')
      .then(r => {
        const promos = r.data.promotions || [];
        const match = promos.find(p => p.brand.name.toLowerCase() === brand.toLowerCase());
        setBrandPromoVideos(match ? match.videos : []);
      })
      .catch(() => setBrandPromoVideos([]));
  }, [brand]);

  // Keep the active category/brand button visible inside the (scrollable) sidebar.
  useEffect(() => {
    const root = sidebarRef.current;
    if (!root) return;
    const active = root.querySelector('.catalog-sidebar__item--active');
    if (!active) return;
    try {
      active.scrollIntoView({ block: 'nearest' });
    } catch {
      // ignore
    }
  }, [categoryParam, brand, sidebarOpen]);

  // For parent group slugs (e.g. 'hair-care') that have no DB entry, format slug as readable title
  const slugToTitle = (slug) => slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const selectedCatName = selectedCategory?.name || (categoryParam ? slugToTitle(categoryParam) : null);
  const hasFilter = !!(search || categoryParam || brand);

  const seoTitle = selectedCatName ? `Buy ${selectedCatName} Online` : search ? `Search: ${search}` : 'Buy Medicines & Healthcare Products Online';
  const seoDesc = selectedCatName
    ? `Buy ${selectedCatName} online at best prices from Batla Medicos. Free delivery above ₹499. Trusted pharmacy since 2005 in New Delhi.`
    : 'Browse medicines, Ayurvedic products, vitamins, cosmetics, baby care & more. Free delivery above ₹499. Buy online from Batla Medicos, New Delhi.';

  // JSON-LD ItemList schema for product listings (fixes Google "offers" warning)
  const catalogSchema = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: seoTitle,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        url: `https://www.batlamedicos.shop/products/${p.slug}`,
        ...(p.image_url ? { image: p.image_url } : {}),
        ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
        sku: String(p._id),
        offers: {
          '@type': 'Offer',
          url: `https://www.batlamedicos.shop/products/${p.slug}`,
          priceCurrency: 'INR',
          price: p.price,
          availability: p.inStock !== false ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          seller: { '@type': 'Organization', name: 'Batla Medicos' },
        },
      },
    })),
  } : undefined;

  return (
    <div className="catalog-page-wrap">
      <SEO
        title={seoTitle}
        description={seoDesc}
        path={`/products${categoryParam ? `?category=${categoryParam}` : ''}`}
        schema={catalogSchema}
      />

      {/* ── Page Hero Banner ─────────────────────────────────────── */}
      <div className="catalog-hero">
        <div className="container">
          <div className="catalog-hero__inner">
            <div>
              <h1 className="catalog-hero__title">
                {selectedCatName ? selectedCatName : 'All Products'}
              </h1>
              <p className="catalog-hero__sub">
                {search
                  ? `Search results for "${search}"`
                  : 'Medicines · Ayurvedic · Cosmetics · Baby Care · Surgical'}
              </p>
            </div>
            {/* Breadcrumb */}
            <nav className="catalog-hero__breadcrumb">
              <span>Home</span>
              <ChevronRight size={14} />
              <span>Products</span>
              {selectedCatName && <><ChevronRight size={14} /><span className="active">{selectedCatName}</span></>}
            </nav>
          </div>
        </div>
      </div>
      {/* ── Offer Banner ── */}
      {offers.length > 0 && <OfferBanner offers={offers} />}
      {/* ── Brand Promo Videos (shown when filtering by a specific brand) ── */}
      {brand && brandPromoVideos.length > 0 && (
        <div style={{ background: '#0d0d1a', padding: 0, overflow: 'hidden' }}>
          {brandPromoVideos.map((v, i) => (
            <PromoVideo
              key={i}
              url={v.url}
              title={v.title}
            />
          ))}
        </div>
      )}
      <div className="container">
        {/* ── Search + Sort toolbar ─────────────────────────────── */}
        <div className="catalog-toolbar">
          <div className="catalog-toolbar__search">
            <Search size={18} />
            <input
              type="search"
              placeholder="Search medicines, cosmetics, brands..."
              value={inputSearch}
              onChange={e => handleSearchInput(e.target.value)}
              maxLength={100}
            />
            {inputSearch && (
              <button className="catalog-toolbar__clear" onClick={() => handleSearchInput('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="catalog-toolbar__right">
            <div className="catalog-toolbar__sort-wrap">
              <span className="catalog-toolbar__sort-label">Sort:</span>
              <select
                value={sort}
                onChange={e => setParam('sort', e.target.value)}
                className="catalog-toolbar__sort"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <button
              className={`catalog-toolbar__filter-btn ${sidebarOpen ? 'active' : ''}`}
              onClick={() => setSidebarOpen(v => !v)}
            >
              <SlidersHorizontal size={16} />
              <span>Filters</span>
              {(categoryParam || brand) && <span className="catalog-toolbar__filter-dot" />}
            </button>
          </div>
        </div>

        {/* ── Layout: sidebar + grid ────────────────────────────── */}
        <div className={`catalog-body ${sidebarOpen ? 'catalog-body--open' : ''}`}>

          {/* Backdrop for mobile sidebar */}
          <div
            className="catalog-sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Sidebar */}
          <aside className="catalog-sidebar" ref={sidebarRef}>
            <div className="catalog-sidebar__header">
              <LayoutGrid size={16} />
              <span>Categories</span>
            </div>
            <ul className="catalog-sidebar__list">
              <li>
                <button
                  className={`catalog-sidebar__item ${!categoryParam ? 'catalog-sidebar__item--active' : ''}`}
                  onClick={() => { setParam('category', ''); setSidebarOpen(false); }}
                >
                  <span className="catalog-sidebar__icon"><Package size={15} /></span>
                  All Products
                  {!categoryParam && <span className="catalog-sidebar__check">✓</span>}
                </button>
              </li>
              {categories.map(cat => (
                <li key={cat._id}>
                  <button
                    className={`catalog-sidebar__item ${(categoryParam === cat._id || categoryParam === cat.slug) ? 'catalog-sidebar__item--active' : ''}`}
                    onClick={() => { setParam('category', cat._id); setSidebarOpen(false); }}
                  >
                    <span className="catalog-sidebar__icon">
                      {CAT_ICONS[cat.slug] || <Package size={15} />}
                    </span>
                    {cat.name}
                    {(categoryParam === cat._id || categoryParam === cat.slug) && <span className="catalog-sidebar__check">✓</span>}
                  </button>
                </li>
              ))}
            </ul>

            {/* Brand filter */}
            {brands.length > 0 && (
              <>
                <div className="catalog-sidebar__header" style={{ marginTop: '20px' }}>
                  <Tag size={16} />
                  <span>Brand / Manufacturer</span>
                </div>
                <ul className="catalog-sidebar__list">
                  {brands.map(b => (
                    <li key={b.brand}>
                      <button
                        className={`catalog-sidebar__item ${brand === b.brand ? 'catalog-sidebar__item--active' : ''}`}
                        onClick={() => toggleBrand(b.brand)}
                      >
                        <span className="catalog-sidebar__icon"><Tag size={15} /></span>
                        {b.brand}
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--gray-400)', flexShrink: 0, paddingLeft: '6px' }}>{b.count}</span>
                        {brand === b.brand && <span className="catalog-sidebar__check">✓</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>

          {/* Main grid */}
          <div className="catalog-main">
            {/* Stats bar */}
            <div className="catalog-main__bar">
              <p className="catalog-main__count">
                {loading
                  ? 'Loading...'
                  : <><strong>{total}</strong> {total === 1 ? 'product' : 'products'} found</>
                }
              </p>
              {hasFilter && (
                <button
                  className="catalog-main__clear"
                  onClick={clearAllFilters}
                >
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {(search || selectedCatName || brand) && (
              <div className="catalog-chips">
                {selectedCatName && (
                  <span className="catalog-chip">
                    {selectedCatName}
                    <button onClick={() => setParam('category', '')}><X size={11} /></button>
                  </span>
                )}
                {brand && (
                  <span className="catalog-chip">
                    {brand}
                    <button onClick={() => setParam('brand', '')}><X size={11} /></button>
                  </span>
                )}
                {(search || inputSearch) && (
                  <span className="catalog-chip">
                    "{search || inputSearch}"
                    <button onClick={() => handleSearchInput('')}><X size={11} /></button>
                  </span>
                )}
              </div>
            )}

            {/* Products */}
            {loading ? (
              <Skeleton />
            ) : products.length === 0 ? (
              <div className="catalog-empty">
                <div className="catalog-empty__icon">
                  <Package size={48} />
                </div>
                <h3>No products found</h3>
                <p>Try adjusting your search or browse a different category.</p>
                {(search || inputSearch) && (
                  <form className="catalog-empty__request" onSubmit={handleRequestAvailability}>
                    <p className="catalog-empty__request-title">
                      Medicine not available? Request Batla Medicos to arrange it.
                    </p>
                    <input
                      type="text"
                      value={search || inputSearch}
                      readOnly
                      aria-label="Medicine name"
                    />
                    <div className="catalog-empty__request-grid">
                      <input
                        type="text"
                        placeholder="Your name (optional)"
                        value={requestName}
                        onChange={(e) => setRequestName(e.target.value)}
                        maxLength={120}
                      />
                      <input
                        type="text"
                        placeholder="Phone number (optional)"
                        value={requestPhone}
                        onChange={(e) => setRequestPhone(e.target.value)}
                        maxLength={25}
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      maxLength={190}
                    />
                    <button className="btn btn--secondary" type="submit" disabled={requestLoading}>
                      {requestLoading ? 'Sending request...' : 'Request availability'}
                    </button>
                    {requestSent && (
                      <p className="catalog-empty__request-success">
                        Request received. Team Batla Medicos will update you soon.
                      </p>
                    )}
                  </form>
                )}
                <button
                  className="btn btn--primary"
                  onClick={clearAllFilters}
                >
                  Browse all products
                </button>
              </div>
            ) : (
              <div className="product-grid">
                {products.map(p => <ProductCard key={p._id} product={p} />)}
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (() => {
              // Build a sliding-window page list: always show first, last,
              // current ± 2, and ellipsis where there are gaps.
              const WINDOW = 2;
              const pageSet = new Set([
                1, pages,
                ...Array.from({ length: WINDOW * 2 + 1 }, (_, i) => page - WINDOW + i),
              ].filter(p => p >= 1 && p <= pages));
              const pageList = [...pageSet].sort((a, b) => a - b);

              // Insert ellipsis markers where there are gaps
              const items = [];
              let prev = null;
              for (const p of pageList) {
                if (prev !== null && p - prev > 1) items.push('…');
                items.push(p);
                prev = p;
              }

              return (
                <div className="pagination">
                  <button
                    disabled={page <= 1}
                    onClick={() => setParam('page', page - 1)}
                    className="pagination__prev"
                  >
                    ← Prev
                  </button>

                  {items.map((item, idx) =>
                    item === '…'
                      ? <span key={`ellipsis-${idx}`} className="pagination__ellipsis">…</span>
                      : (
                        <button
                          key={item}
                          className={page === item ? 'active' : ''}
                          onClick={() => setParam('page', item)}
                        >
                          {item}
                        </button>
                      )
                  )}

                  <button
                    disabled={page >= pages}
                    onClick={() => setParam('page', page + 1)}
                    className="pagination__next"
                  >
                    Next →
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
