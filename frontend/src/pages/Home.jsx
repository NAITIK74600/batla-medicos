import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  Truck, MapPin, ShieldCheck, Clock, ChevronRight, ChevronLeft,
  Navigation, ExternalLink, Search,
  Stethoscope, Pill, Leaf, Sparkles, Baby, Scissors, Hospital, Star, Heart, Syringe,
  Droplets, Droplet, FlaskConical, Wind, Thermometer, ShoppingBag, Box,
  TestTube, Package, GlassWater, Gem, LayoutGrid, Activity,
  SmilePlus, Users, Zap, Shield, Award, FileText, BadgePercent,
} from 'lucide-react';
import AOS from 'aos';
import 'aos/dist/aos.css';
import { getActiveOffers } from '../api/offers';
import { getCategories } from '../api/categories';
import { getProducts } from '../api/products';
import { getBrands, getBrandPromotions } from '../api/brands';
import { getLabTests } from '../api/lab';
import SEO from '../components/SEO';
import ProductCard from '../components/ProductCard';
import OfferBanner from '../components/OfferBanner';
import PromoVideo from '../components/PromoVideo';
import AnimatedSection from '../components/AnimatedSection';
import OrbitalGlobe from '../components/OrbitalGlobe';
import { useRipple, useParallaxMouse, useTilt3D } from '../hooks/useAnimations';
import { getAnimationSetting } from '../pages/admin/AdminSiteSettings';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');
const ASSET_BASE = API_BASE.replace(/\/api\/?$/, '');

const resolveImageUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `${ASSET_BASE}${url}`;
  return url;
};

const CATEGORY_ICONS = {
  'caps-tabs':        { icon: <Pill size={28} />,         bg: '#FEF2F2', color: '#C0392B' },
  'liquids':          { icon: <Droplets size={28} />,     bg: '#EFF6FF', color: '#2563EB' },
  'cream-ointment':   { icon: <FlaskConical size={28} />, bg: '#FDF4FF', color: '#9333EA' },
  'drop':             { icon: <Droplet size={28} />,      bg: '#ECFEFF', color: '#0891B2' },
  'powder':           { icon: <TestTube size={28} />,     bg: '#F1F5F9', color: '#475569' },
  'lotion':           { icon: <Sparkles size={28} />,     bg: '#FFF0F6', color: '#DB2777' },
  'injection':        { icon: <Syringe size={28} />,      bg: '#F0F0FF', color: '#4F46E5' },
  'inhaler':          { icon: <Wind size={28} />,         bg: '#F0FFFE', color: '#0D9488' },
  'softgel-capsules': { icon: <Gem size={28} />,          bg: '#FFF7ED', color: '#EA580C' },
  'fluids':           { icon: <GlassWater size={28} />,   bg: '#F0F9FF', color: '#0284C7' },
  'high-value':       { icon: <Star size={28} />,         bg: '#FFFBEB', color: '#D97706' },
  'fmcg':             { icon: <ShoppingBag size={28} />,  bg: '#FFF5E0', color: '#C2410C' },
  'surgicals':        { icon: <Scissors size={28} />,     bg: '#F0F4F8', color: '#334155' },
  'generic':          { icon: <Package size={28} />,      bg: '#F0FBF4', color: '#16A34A' },
  'container':        { icon: <Box size={28} />,          bg: '#FEFCE8', color: '#CA8A04' },
  'pharma-misc':      { icon: <LayoutGrid size={28} />,   bg: '#F5F3FF', color: '#7C3AED' },
  'fridge':           { icon: <Thermometer size={28} />,  bg: '#E8EEFF', color: '#1E40AF' },
  allopathic:         { icon: <Pill size={28} />,         bg: '#FEF2F2', color: '#C0392B' },
  ayurvedic:          { icon: <Leaf size={28} />,         bg: '#F0FBF4', color: '#1E8449' },
  homeopathy:         { icon: <Droplet size={28} />,      bg: '#EFF6FF', color: '#2563EB' },
  vaccines:           { icon: <Syringe size={28} />,      bg: '#F0F0FF', color: '#4F46E5' },
  dental:             { icon: <SmilePlus size={28} />,    bg: '#F0FFFE', color: '#0D9488' },
  otc:                { icon: <ShoppingBag size={28} />,  bg: '#FFF5E0', color: '#C2410C' },
  herbal:             { icon: <Leaf size={28} />,         bg: '#F0FBF4', color: '#16A34A' },
  nutrition:          { icon: <Activity size={28} />,     bg: '#FFFBEB', color: '#D97706' },
};
const DEFAULT_CAT = { icon: <Hospital size={28} />, bg: '#F0FBF4', color: '#1E8449' };

// Customer-facing Shop by Category — 12 lifestyle groups matching CategoryNav
const SHOP_CATS = [
  { slug: 'allopathic',         label: 'Medicines',          icon: <Pill size={28} />,        bg: '#FEF2F2', color: '#C0392B' },
  { slug: 'ayurveda',           label: 'Ayurveda',           icon: <Leaf size={28} />,        bg: '#F0FBF4', color: '#1E8449' },
  { slug: 'homeopathy',         label: 'Homeopathy',         icon: <Droplet size={28} />,     bg: '#EFF6FF', color: '#2563EB' },
  { slug: 'skin-care',          label: 'Skin Care',          icon: <Sparkles size={28} />,    bg: '#FFF0F6', color: '#DB2777' },
  { slug: 'hair-care',          label: 'Hair Care',          icon: <Scissors size={28} />,    bg: '#F0FFFE', color: '#0D9488' },
  { slug: 'baby-care',          label: 'Baby Care',          icon: <Baby size={28} />,        bg: '#FDF4FF', color: '#9333EA' },
  { slug: 'vitamins-nutrition', label: 'Vitamins & Nutrition', icon: <Activity size={28} />,  bg: '#FFFBEB', color: '#D97706' },
  { slug: 'fitness-health',     label: 'Fitness & Health',   icon: <Zap size={28} />,         bg: '#EFF6FF', color: '#2563EB' },
  { slug: 'sexual-wellness',    label: 'Sexual Wellness',    icon: <Heart size={28} />,       bg: '#FFF5E5', color: '#EA580C' },
  { slug: 'dental',             label: 'Dental Care',        icon: <SmilePlus size={28} />,   bg: '#F0FFFE', color: '#0D9488' },
  { slug: 'diabetes-care',      label: 'Diabetes Care',      icon: <Thermometer size={28} />, bg: '#E8EEFF', color: '#4F46E5' },
  { slug: 'supports-braces',    label: 'Supports & Braces',  icon: <Shield size={28} />,      bg: '#F0F4F8', color: '#334155' },
];

// Personal-care category tiles matching the screenshot style
// Used as fallback when no DB brands are configured for personal_care category.
const PERSONAL_CARE_CATS = [
  { label: 'Skin Care',       slug: 'skin-care',       gradient: 'linear-gradient(135deg,#8BC34A,#5D9E3F)', emoji: '✨' },
  { label: 'Hair Care',       slug: 'hair-care',       gradient: 'linear-gradient(135deg,#4CAF50,#2E7D32)', emoji: '💆' },
  { label: 'Sexual Wellness', slug: 'sexual-wellness', gradient: 'linear-gradient(135deg,#FF9800,#E65100)', emoji: '❤️' },
  { label: 'Oral Care',       slug: 'oral-care',       gradient: 'linear-gradient(135deg,#E57373,#C62828)', emoji: '🦷' },
  { label: 'Elderly Care',    slug: 'elderly-care',    gradient: 'linear-gradient(135deg,#29B6F6,#0277BD)', emoji: '👴' },
  { label: 'Baby Care',       slug: 'baby-care',       gradient: 'linear-gradient(135deg,#9C27B0,#6A1B9A)', emoji: '🍼' },
  { label: 'Women Care',      slug: 'women-care',      gradient: 'linear-gradient(135deg,#EC407A,#AD1457)', emoji: '🌸' },
  { label: 'Men Grooming',    slug: 'men-grooming',    gradient: 'linear-gradient(135deg,#607D8B,#37474F)', emoji: '💈' },
];

// Maps personal_care brand slug → product ?category= slug
// (brand slug is auto-derived from name, may differ from product category)
const PC_BRAND_TO_CAT = {
  'skin-care':        'skin-care',
  'hair-care':        'hair-care',
  'sexual-wellness':  'sexual-wellness',
  'sexual':           'sexual-wellness', // DB brand named "Sexual" → correct slug
  'oral-care':        'oral-care',    // aliased on backend → 'dental'
  'elderly-care':     'elderly-care', // aliased on backend → 'allopathic'
  'baby-care':        'baby-care',
  'women-care':       'women-care',   // aliased on backend → 'fmcg'
  'men-grooming':     'men-grooming', // aliased on backend → 'fmcg'
};
const PC_EMOJI_BY_LABEL = Object.fromEntries(PERSONAL_CARE_CATS.map(c => [c.label, c.emoji]));
const PC_GRADIENT_BY_LABEL = Object.fromEntries(PERSONAL_CARE_CATS.map(c => [c.label, c.gradient]));

const TRUST_FEATURES = [
  { icon: <Truck size={22} />,       bg: '#FEF2F2', color: '#C0392B', title: 'Free Delivery',           desc: 'On orders above ₹499' },
  { icon: <ShieldCheck size={22} />, bg: '#F0FBF4', color: '#1B8843', title: '100% Genuine',            desc: 'Licensed & verified sources' },
  { icon: <Clock size={22} />,       bg: '#FEF2F2', color: '#C0392B', title: 'Open 9 AM – 11:45 PM',     desc: 'Monday to Sunday' },
  { icon: <Stethoscope size={22} />, bg: '#F0FBF4', color: '#1B8843', title: 'Expert Pharmacists',      desc: 'Free consultation' },
  { icon: <Activity size={22} />,    bg: '#EFF6FF', color: '#2563EB', title: 'Lab Tests at Home',       desc: 'Up to 70% off' },
  { icon: <Users size={22} />,       bg: '#FFFBEB', color: '#D97706', title: '50,000+ Customers',       desc: 'Trusted since 2005' },
];

const STORE_ADDRESS = 'F 41/2, Nafees Road, Batla House, Jamia Nagar, New Delhi - 110025';
const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/W4Qtps1fKbArBvz17';

const HEALTH_TIPS = [
  '💊 Always complete your antibiotic course even if you feel better',
  '🥤 Drink 8–10 glasses of water daily to stay hydrated',
  '🩺 Check blood pressure regularly after age 40',
  '🌿 Ayurvedic herbs can complement modern medicine safely',
  '💉 Keep your vaccine schedule up to date',
  '🍎 Eat 5 portions of fruits & vegetables every day',
  '😴 7–8 hours of sleep boosts your immune system',
  '🚶 30 minutes of daily walking prevents diabetes & heart disease',
  '🧴 Always read medicine labels and check expiry before use',
  '🔬 Annual full-body checkup helps catch problems early',
];

const WHY_CHOOSE = [
  { icon: <Award size={26} />,       bg: '#FEF2F2', color: '#C0392B', title: '20+ Years of Trust',   desc: 'Serving Jamia Nagar since 2005' },
  { icon: <ShieldCheck size={26} />, bg: '#F0FBF4', color: '#1B8843', title: '100% Authentic',        desc: 'Direct from licensed distributors' },
  { icon: <Truck size={26} />,       bg: '#EFF6FF', color: '#2563EB', title: 'Fast Delivery',         desc: 'Same-day delivery in Jamia Nagar' },
  { icon: <Stethoscope size={26} />, bg: '#FDF4FF', color: '#9333EA', title: 'Free Consultation',     desc: 'Expert pharmacists, no charge' },
  { icon: <Clock size={26} />,       bg: '#FFFBEB', color: '#D97706', title: 'Open 7 Days a Week',   desc: 'Monday to Sunday, 9 AM – 11:45 PM' },
  { icon: <Heart size={26} />,       bg: '#FFF0F6', color: '#DB2777', title: 'Patient Care First',   desc: 'Your wellbeing is our mission' },
];

/* ── Horizontal scroll carousel with prev/next arrows ── */
function ScrollRow({ children, title, link, linkLabel = 'See all', accent }) {
  const ref = useRef(null);
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });
  return (
    <section className="scroll-section">
      <div className="container">
        <div className="section__header">
          <h2 className="section__title" style={accent ? { color: accent } : {}}>
            {title}
          </h2>
          {link && (
            <Link to={link} className="section__link">
              {linkLabel} <ChevronRight size={14} />
            </Link>
          )}
        </div>
        <div className="scroll-row-wrap">
          <button className="scroll-row-btn scroll-row-btn--left"  onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft size={18} /></button>
          <div className="scroll-row" ref={ref}>{children}</div>
          <button className="scroll-row-btn scroll-row-btn--right" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight size={18} /></button>
        </div>
      </div>
    </section>
  );
}

/* ── Animated counter ── */
function Counter({ target, suffix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      observer.disconnect();
      let start = 0;
      const step = target / 50;
      const id = setInterval(() => {
        start = Math.min(start + step, target);
        setVal(Math.floor(start));
        if (start >= target) clearInterval(id);
      }, 28);
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

export default function Home() {
  const navigate = useNavigate();
  const ripple = useRipple();
  const heroParallax = useParallaxMouse();

  // AOS scroll animations
  useEffect(() => {
    AOS.init({ duration: 700, easing: 'ease-out-cubic', once: true, offset: 60 });
  }, []);
  const dealTilt = useTilt3D({ maxTilt: 6, perspective: 1000 });
  const [offers, setOffers]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured]     = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [featuredBrands, setFeaturedBrands] = useState([]);
  const [ayurvedaBrands, setAyurvedaBrands] = useState([]);
  const [personalCareBrands, setPersonalCareBrands] = useState([]);
  const [brandPromos, setBrandPromos] = useState([]);
  const [countdown, setCountdown]   = useState({ h: 0, m: 0, s: 0 });
  const [dealEndDate, setDealEndDate] = useState(null);
  const [dealData, setDealData] = useState(null);
  const [labTests, setLabTests]       = useState([]);;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef(null);
  const searchRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const particleCanvasRef = useRef(null);

  // Update dropdown position when showing results
  useEffect(() => {
    if (!showResults || !searchRef.current) return;
    const updatePos = () => {
      const rect = searchRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        zIndex: 99999,
      });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [showResults, searchResults]);

  // ── Interactive particle animation ──
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let mouse = { x: -9999, y: -9999 };

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      mouse.x = src.clientX - rect.left;
      mouse.y = src.clientY - rect.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    const section = canvas.parentElement;
    section.addEventListener('mousemove', onMove);
    section.addEventListener('touchmove', onMove, { passive: true });
    section.addEventListener('mouseleave', onLeave);

    const COLORS = ['rgba(120,147,245,', 'rgba(147,197,253,', 'rgba(104,211,145,', 'rgba(167,243,208,', 'rgba(255,255,255,'];
    const N = 72;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      r: 1.5 + Math.random() * 2.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;

      for (const p of particles) {
        // Mouse repulsion
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 90) {
          const force = (90 - dist) / 90 * 0.6;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
        // Speed cap + friction
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 1.8) { p.vx = p.vx / speed * 1.8; p.vy = p.vy / speed * 1.8; }
        p.vx *= 0.99; p.vy *= 0.99;

        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        else if (p.x > W) { p.x = W; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        else if (p.y > H) { p.y = H; p.vy *= -1; }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + '0.75)';
        ctx.fill();
      }

      // Draw connecting lines
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            const alpha = (1 - d / 130) * 0.35;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(180,200,255,${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      section.removeEventListener('mousemove', onMove);
      section.removeEventListener('touchmove', onMove);
      section.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Live search with debounce
  const handleSearch = useCallback((q) => {
    setSearchQuery(q);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); setShowResults(false); return; }
    searchTimeout.current = setTimeout(() => {
      getProducts({ search: q.trim(), limit: 6 })
        .then(r => { setSearchResults(r.data.products || []); setShowResults(true); })
        .catch(() => {});
    }, 300);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowResults(false);
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target) && !e.target.closest('.hero-search__dropdown'))
        setShowResults(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = dealEndDate && dealEndDate > now
        ? dealEndDate
        : (() => { const e = new Date(); e.setHours(23, 59, 59, 999); return e; })();
      const diff = Math.max(0, end - now);
      setCountdown({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dealEndDate]);

  useEffect(() => {
    getActiveOffers('home').then(r => {
      const allOffers = r.data.offers || [];
      setOffers(allOffers);
      const deal = allOffers.find(o => o.badge === 'deal_of_day');
      if (deal) {
        setDealData({
          title: deal.title,
          subtitle: deal.description || 'Don\'t miss out on today\'s special deal!',
          link: deal.link || '/products',
        });
        if (deal.endDate) setDealEndDate(new Date(deal.endDate));
      }
    }).catch(() => {});
    getCategories().then(r => setCategories(r.data.categories || [])).catch(() => {});
    getProducts({ limit: 8, sort: 'newest' }).then(r => setNewArrivals(r.data.products || [])).catch(() => {});
    getProducts({ limit: 8, sort: 'price_asc' }).then(r => setFeatured(r.data.products || [])).catch(() => {});
    getBrands({ category: 'featured'  }).then(r => setFeaturedBrands(r.data.brands || [])).catch(() => {});
    getBrands({ category: 'ayurvedic' }).then(r => setAyurvedaBrands(r.data.brands || [])).catch(() => {});
    getBrands({ category: 'personal_care' }).then(r => setPersonalCareBrands(r.data.brands || [])).catch(() => {});
    getBrandPromotions('home').then(r => setBrandPromos(r.data.promotions || [])).catch(() => {});
    getLabTests({ limit: 6 }).then(r => setLabTests(r.data.tests || [])).catch(() => {});
  }, []);

  return (
    <main>
      <SEO
        title="Online Pharmacy New Delhi – Buy Medicines, Lab Tests, Ayurvedic Products"
        description="Batla Medicos – trusted pharmacy since 2005. Buy medicines, Ayurvedic products, vitamins, cosmetics & baby care online. Lab tests at home. Free delivery above ₹499. Open 9 AM – 11:45 PM daily."
        path="/"
      />
      {/* ══════════════════════════════ HERO ══════════════════════════════ */}
      <section className="hero" ref={heroParallax}>
        {/* Interactive particle canvas */}
        <canvas ref={particleCanvasRef} className="hero__canvas" aria-hidden="true" />
        <div className="hero__particles" aria-hidden="true" data-depth="3">
          {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map(n => <div key={n} className={`hero__particle hero__particle--${n}`} />)}
        </div>
        {/* 3D floating geometric shapes */}
        <div className="hero__shapes" aria-hidden="true" data-depth="2">
          <div className="hero__shape hero__shape--1" />
          <div className="hero__shape hero__shape--2" />
          <div className="hero__shape hero__shape--3" />
          <div className="hero__shape hero__shape--4" />
          <div className="hero__shape hero__shape--5" />
        </div>
        <div className="hero__layout">
          <OrbitalGlobe />
          <div className="hero__content" data-depth="0.5">
            <span className="hero__tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 2v20M2 12h20"/></svg>
              Trusted Pharmacy Since 2005
            </span>
            <h1>Your Trusted<br /><span className="red">Neighbourhood</span><br />Pharmacy</h1>
            <p>Allopathic · Ayurvedic · Cosmetics · Baby Products · Surgical</p>
            <div className="hero__actions">
              <Link to="/products" className="btn btn--primary btn--lg ripple-btn" onClick={ripple}>Shop Now <ChevronRight size={18} /></Link>
              <Link to="/prescriptions" className="btn btn--ghost btn--lg ripple-btn" onClick={ripple}>
                <FileText size={18} /> Upload Prescription
              </Link>
            </div>
            {/* ── Hero Search Bar ── */}
            <div className="hero-search" ref={searchRef}>
              <form className="hero-search__form" onSubmit={handleSearchSubmit}>
                <Search size={18} className="hero-search__icon" />
                <input
                  type="text"
                  className="hero-search__input"
                  placeholder="Search medicines, health products, brands..."
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                />
                {searchQuery && (
                  <button type="button" className="hero-search__clear" onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false); }}>✕</button>
                )}
                <button type="submit" className="hero-search__btn ripple-btn" onClick={ripple}>Search</button>
              </form>
              {showResults && searchResults.length > 0 && createPortal(
                <div className="hero-search__dropdown" style={dropdownStyle}>
                  {searchResults.map(p => (
                    <Link
                      key={p._id}
                      to={`/products/${p.slug}`}
                      className="hero-search__result"
                      onClick={() => setShowResults(false)}
                    >
                      {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="hero-search__thumb" />}
                      <div className="hero-search__info">
                        <span className="hero-search__name">{p.name}</span>
                        <span className="hero-search__price">₹{p.price} {p.mrp > p.price && <s>₹{p.mrp}</s>}</span>
                      </div>
                    </Link>
                  ))}
                  <Link to={`/products?search=${encodeURIComponent(searchQuery)}`} className="hero-search__all" onClick={() => setShowResults(false)}>
                    View all results <ChevronRight size={14} />
                  </Link>
                </div>,
                document.body
              )}
              {showResults && searchResults.length === 0 && searchQuery.trim() && createPortal(
                <div className="hero-search__dropdown" style={dropdownStyle}>
                  <div className="hero-search__empty">No products found for "{searchQuery}"</div>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ TRUST STRIP ══════════════════════════ */}
      <AnimatedSection animation={getAnimationSetting('trustStrip')} as="section" className="trust-strip">
        <div className="container">
          <div className="trust-strip__grid">
            {TRUST_FEATURES.map((f, i) => (
              <div key={i} className="trust-strip__item ripple-btn" onClick={ripple} style={{ animationDelay: `${i * 0.06}s` }} data-aos="fade-up" data-aos-delay={i * 80}>
                <div className="trust-strip__icon" style={{ background: f.bg, color: f.color }}>{f.icon}</div>
                <div>
                  <div className="trust-strip__title">{f.title}</div>
                  <div className="trust-strip__desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ══════════════════════════ OFFER BANNER ═════════════════════════ */}
      {offers.length > 0 && <OfferBanner offers={offers} />}

      {/* ═════════════════════ BRAND PROMOTION VIDEOS ══════════════════════ */}
      {brandPromos.length > 0 && (
        <section style={{ background: '#0d0d1a', padding: 0, overflow: 'hidden' }}>
          {brandPromos.flatMap(promo => promo.videos.map((v, vi) => (
            <PromoVideo
              key={`${promo.brand._id}-${vi}`}
              url={v.url}
              title={v.title || promo.brand.name}
              brandName={promo.brand.name}
              brandLogoUrl={promo.brand.logoUrl}
              resolveImageUrl={resolveImageUrl}
            />
          )))}
        </section>
      )}

      {/* ═══════════════════ PERSONAL CARE CATEGORIES ═══════════════════ */}
      <AnimatedSection animation={getAnimationSetting('personalCare')} as="section" className="section" data-aos="fade-up">
        <div className="container">
          <div className="section__header">
            <h2 className="section__title">Personal care</h2>
            <Link to="/products" className="section__link">See all <ChevronRight size={14} /></Link>
          </div>
          <div className="personal-care-grid">
            {/* Use DB brands when configured, fall back to hardcoded PERSONAL_CARE_CATS */}
            {(personalCareBrands.length > 0
              ? personalCareBrands
                  .filter(b => b.isActive)
                  .sort((a, b) => a.ord - b.ord)
                  .map(b => ({
                    label:    b.name,
                    slug:     PC_BRAND_TO_CAT[b.slug] || b.slug,
                    gradient: b.gradient || PC_GRADIENT_BY_LABEL[b.name] || 'linear-gradient(135deg,#8BC34A,#5D9E3F)',
                    logoUrl:  b.logoUrl || null,
                    emoji:    PC_EMOJI_BY_LABEL[b.name] || '💊',
                  }))
              : PERSONAL_CARE_CATS
            ).map((cat, idx) => (
              <Link key={cat.slug + cat.label} to={`/products?category=${cat.slug}`} className="pc-cat-card ripple-btn" onClick={ripple} style={{ animationDelay: `${idx * 0.07}s` }}>
                <div className="pc-cat-card__bg" style={{ background: cat.gradient }} />
                {cat.logoUrl
                  ? <img src={resolveImageUrl(cat.logoUrl)} alt={cat.label} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', opacity: 0.92 }} />
                  : <span className="pc-cat-card__emoji" style={{ fontSize: '2rem', position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)' }}>{cat.emoji}</span>
                }
                <span className="pc-cat-card__label">{cat.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ═══════════════════ FEATURED BRANDS CAROUSEL ═══════════════════ */}
      {featuredBrands.length > 0 && (
        <AnimatedSection animation={getAnimationSetting('featuredBrands')} data-aos="fade-up">
        <ScrollRow title="Featured brands" link="/products" accent="">
          {featuredBrands.map(b => (
            <Link key={b._id} to={`/products?brand=${encodeURIComponent(b.name)}`} className="brand-circle-card ripple-btn" onClick={ripple} title={b.name}>
              <div className="brand-circle-card__ring">
                {b.logoUrl
                  ? <img src={resolveImageUrl(b.logoUrl)} alt={b.name} className="brand-circle-card__img" />
                  : <span className="brand-circle-card__fb">{b.name.slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <span className="brand-circle-card__name">{b.name}</span>
            </Link>
          ))}
        </ScrollRow>
        </AnimatedSection>
      )}

      {/* ═══════════════════ SHOP BY CATEGORY ══════════════════════════ */}
      <AnimatedSection animation={getAnimationSetting('shopByCategory')} as="section" className="section section--gray" data-aos="fade-up">
        <div className="container">
          <div className="section__header">
            <h2 className="section__title">Shop by Category</h2>
            <Link to="/products" className="section__link">All Products <ChevronRight size={14} /></Link>
          </div>
          <div className="category-grid-v2">
            {SHOP_CATS.map((cat, idx) => (
              <Link key={cat.slug} to={`/products?category=${cat.slug}`} className="cat-tile ripple-btn" onClick={ripple} style={{ animationDelay: `${idx * 0.04}s` }}>
                <span className="cat-tile__icon" style={{ background: cat.bg, color: cat.color }}>{cat.icon}</span>
                <span className="cat-tile__name">{cat.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ═══════════════════ NEW ARRIVALS ════════════════════════════════ */}
      {newArrivals.length > 0 && (
        <AnimatedSection animation={getAnimationSetting('newArrivals')} as="section" className="section section--gray" data-aos="fade-up">
          <div className="container">
            <div className="section__header">
              <h2 className="section__title">New Arrivals</h2>
              <Link to="/products?sort=newest" className="section__link">View All <ChevronRight size={14} /></Link>
            </div>
            <div className="product-grid">{newArrivals.map(p => <ProductCard key={p._id} product={p} />)}</div>
          </div>
        </AnimatedSection>
      )}

      {/* ════════════════════ AYURVEDA BRANDS ════════════════════════════ */}
      {ayurvedaBrands.length > 0 && (
        <AnimatedSection animation={getAnimationSetting('ayurvedaBrands')}>
        <ScrollRow title="Ayurveda top brands" link="/products?category=ayurveda" accent="#1B8843">
          {ayurvedaBrands.map(b => (
            <Link key={b._id} to={`/products?brand=${encodeURIComponent(b.name)}`} className="brand-ayur-card ripple-btn" onClick={ripple} title={b.name}>
              <div className="brand-ayur-card__box">
                {b.logoUrl
                  ? <img src={resolveImageUrl(b.logoUrl)} alt={b.name} className="brand-ayur-card__img" />
                  : <span className="brand-ayur-card__fb">{b.name.slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <span className="brand-ayur-card__name">{b.name}</span>
            </Link>
          ))}
        </ScrollRow>
        </AnimatedSection>
      )}

      {/* ════════════════════ BEST VALUE PRODUCTS ════════════════════════ */}
      {featured.length > 0 && (
        <AnimatedSection animation={getAnimationSetting('bestValue')} as="section" className="section section--gray">
          <div className="container">
            <div className="section__header">
              <h2 className="section__title">Best Value Medicines</h2>
              <Link to="/products?sort=price_asc" className="section__link">View All <ChevronRight size={14} /></Link>
            </div>
            <div className="product-grid">{featured.map(p => <ProductCard key={p._id} product={p} />)}</div>
          </div>
        </AnimatedSection>
      )}

      {/* ════════════ HEALTH TIPS TICKER ════════════════════════════════ */}
      <div className="health-ticker">
        <div className="health-ticker__label"><Sparkles size={13} /> Health Tips</div>
        <div className="health-ticker__track">
          <div className="health-ticker__inner">
            {[...HEALTH_TIPS, ...HEALTH_TIPS].map((tip, i) => (
              <span key={i} className="health-ticker__item">{tip}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════ DEAL OF THE DAY ════════════════════════════════════ */}
      {dealData && (
      <AnimatedSection animation={getAnimationSetting('dealOfDay')} as="section" className="deal-section" data-aos="fade-up">
        <div className="container">
          <div className="deal-card" ref={dealTilt}>
            <div className="deal-card__badge"><BadgePercent size={16} /> Deal of the Day</div>
            <div className="deal-card__content">
              <div className="deal-card__text">
                <h2>{dealData.title}</h2>
                <p>{dealData.subtitle}</p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.2rem' }}>
                  <Link to={dealData.link || '/products'} className="btn btn--white btn--lg ripple-btn" onClick={ripple}>Shop Now <ChevronRight size={16} /></Link>
                  <Link to="/lab" className="btn btn--outline-white btn--lg ripple-btn" onClick={ripple}>Book Lab Test</Link>
                </div>
              </div>
              <div className="deal-card__timer">
                <p className="deal-card__timer-label">Ends in</p>
                <div className="deal-card__timer-grid">
                  <div className="deal-card__timer-unit">
                    <span>{String(countdown.h).padStart(2, '0')}</span>
                    <small>HRS</small>
                  </div>
                  <div className="deal-card__timer-sep">:</div>
                  <div className="deal-card__timer-unit">
                    <span>{String(countdown.m).padStart(2, '0')}</span>
                    <small>MIN</small>
                  </div>
                  <div className="deal-card__timer-sep">:</div>
                  <div className="deal-card__timer-unit">
                    <span>{String(countdown.s).padStart(2, '0')}</span>
                    <small>SEC</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>
      )}

      {/* ════════════ PATHOLOGY TESTS ══════════════════════════════════ */}
      {labTests.length > 0 && (
        <AnimatedSection animation={getAnimationSetting('labTests')} as="section" className="section" data-aos="fade-up">
          <div className="container">
            <div className="section__header">
              <h2 className="section__title">Pathology Tests <span className="lab-section__badge">UP TO 70% OFF</span></h2>
              <Link to="/lab" className="section__link">See all <ChevronRight size={14} /></Link>
            </div>
            <div className="lab-home-grid">
              {labTests.map(test => (
                <Link key={test._id} to="/lab" className="lab-home-card ripple-btn" onClick={ripple}>
                  <div className="lab-home-card__icon">
                    <FlaskConical size={22} />
                  </div>
                  <div className="lab-home-card__body">
                    <div className="lab-home-card__name">{test.name}</div>
                    {test.parameters?.length > 0 && (
                      <div className="lab-home-card__params">{test.parameters.slice(0, 3).join(', ')}</div>
                    )}
                  </div>
                  <div className="lab-home-card__price">₹{test.price}</div>
                </Link>
              ))}
            </div>
          </div>
        </AnimatedSection>
      )}

      {/* ════════════ WHY CHOOSE US ══════════════════════════════════════ */}
      <AnimatedSection animation={getAnimationSetting('whyChoose')} as="section" className="section why-section" data-aos="fade-up">
        <div className="container">
          <div className="section__header" style={{ flexDirection: 'column', gap: '4px', textAlign: 'center' }}>
            <h2 className="section__title" style={{ justifyContent: 'center' }}>Why Choose Batla Medicos?</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Trusted by 50,000+ families in Jamia Nagar</p>
          </div>
          <div className="why-grid">
            {WHY_CHOOSE.map((w, i) => (
              <div key={i} className="why-card ripple-btn" onClick={ripple} style={{ animationDelay: `${i * 0.08}s` }} data-aos="zoom-in" data-aos-delay={i * 80}>
                <div className="why-card__icon" style={{ background: w.bg, color: w.color }}>{w.icon}</div>
                <h4 className="why-card__title">{w.title}</h4>
                <p className="why-card__desc">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ════════════════════ STORE MAP STRIP ═══════════════════════════ */}
      <AnimatedSection animation={getAnimationSetting('mapStrip')} className="map-strip-wrap">
      <div className="map-strip">
        <div className="map-strip__inner">
          <div className="map-strip__left">
            <div className="map-strip__pin"><MapPin size={18} /></div>
            <div>
              <div className="map-strip__name">Batla Medicos — Batla House, Jamia Nagar</div>
              <div className="map-strip__addr">{STORE_ADDRESS}</div>
            </div>
          </div>
          <div className="map-strip__actions">
            <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="map-strip__btn map-strip__btn--primary">
              <Navigation size={14} /> Get Directions
            </a>
            <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="map-strip__btn map-strip__btn--outline ripple-btn" onClick={ripple}>
              <ExternalLink size={14} /> Open Maps
            </a>
          </div>
        </div>
      </div>
      </AnimatedSection>
    </main>
  );
}
