import { Phone, MessageCircle, MapPin, Plus, Shield, Mail, Clock, Navigation, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/W4Qtps1fKbArBvz17';

const QUICK_LINKS = [
  { label: 'All Products',        to: '/products' },
  { label: 'Upload Prescription', to: '/prescriptions' },
  { label: 'My Orders',           to: '/orders' },
  { label: 'My Account',          to: '/account' },
];

const POLICY_LINKS = [
  { label: 'Privacy Policy',    to: '/privacy-policy' },
  { label: 'Terms & Conditions', to: '/terms' },
  { label: 'Refund Policy',     to: '/refund-policy' },
];

export default function Footer() {
  const WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || '919990165925';
  const { pathname } = useLocation();
  const isMinimal = pathname.startsWith('/admin') || pathname.startsWith('/login') || pathname.startsWith('/register');

  if (isMinimal) {
    return (
      <footer className="footer footer--minimal">
        <span>&copy; {new Date().getFullYear()} <strong>Batla Medicos</strong> — All rights reserved.</span>
        <a href="tel:+919990165925" className="footer--minimal__link"><Phone size={13} /> 9990165925</a>
        <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="footer--minimal__link"><MessageCircle size={13} /> WhatsApp</a>
        <a href="mailto:ordersupport@batlamedicos.shop" className="footer--minimal__link"><Mail size={13} /> Email Us</a>
      </footer>
    );
  }

  return (
    <footer className="footer">
      <div className="footer__inner">

        {/* ── Column 1: Brand ── */}
        <div className="footer__brand">
          <div className="footer__logo">
            <img src="/logo.png?v=3" alt="Batla Medicos" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 10 }} />
            <div className="footer__logo-text">
              <span className="footer__logo-name">Batla Medicos</span>
              <span className="footer__logo-tagline">Chemist &amp; Cosmetics</span>
            </div>
          </div>
          <p>Your trusted neighbourhood pharmacy serving Batla House, Jamia Nagar since 2005. Genuine medicines, free delivery.</p>
          <div className="footer__services">
            {['Allopathic', 'Ayurvedic', 'Cosmetics', 'Baby Care', 'Surgical', 'Free Delivery'].map(s => (
              <span key={s} className="footer__service-chip"><Shield size={10} /> {s}</span>
            ))}
          </div>
        </div>

        {/* ── Column 2: Store Info ── */}
        <div className="footer__info">
          <h4>Store Information</h4>
          <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer">
            <MapPin size={15} />
            <span>F 41/2, Nafees Road, Batla House,<br />Jamia Nagar, New Delhi – 110025</span>
          </a>
          <a href="tel:+919990165925"><Phone size={14} /> +91 99901 65925</a>
          <a href="mailto:ordersupport@batlamedicos.shop"><Mail size={14} /> ordersupport@batlamedicos.shop</a>
          <div className="footer__hours">
            <Clock size={14} />
            <div>
              <div className="footer__hours-row"><span>Mon – Sat</span><span>9:00 AM – 11:45 PM</span></div>
              <div className="footer__hours-row"><span>Sunday</span><span>9:00 AM – 11:45 PM</span></div>
            </div>
          </div>
          <a href={GOOGLE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="footer__map-link">
            <Navigation size={13} /> Get Directions on Google Maps
          </a>
        </div>

        {/* ── Column 3: Quick Links ── */}
        <div className="footer__links">
          <h4>Quick Links</h4>
          <ul>
            {QUICK_LINKS.map(l => (
              <li key={l.to}>
                <Link to={l.to}><ChevronRight size={13} /> {l.label}</Link>
              </li>
            ))}
          </ul>
          <h4 style={{ marginTop: 18 }}>Legal</h4>
          <ul>
            {POLICY_LINKS.map(l => (
              <li key={l.to}>
                <Link to={l.to}><ChevronRight size={13} /> {l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Column 4: Contact ── */}
        <div className="footer__contact">
          <h4>Quick Contact</h4>
          <a
            href={`https://wa.me/${WHATSAPP}?text=Hi%2C%20I%20want%20to%20place%20an%20order`}
            target="_blank" rel="noopener noreferrer"
            className="footer__contact-btn footer__contact-btn--wa"
          >
            <MessageCircle size={17} /> WhatsApp Order
          </a>
          <a href="tel:+919990165925" className="footer__contact-btn footer__contact-btn--phone">
            <Phone size={17} /> Call the Store
          </a>
          <a href="mailto:ordersupport@batlamedicos.shop" className="footer__contact-btn footer__contact-btn--email">
            <Mail size={17} /> Email Support
          </a>
          <div className="footer__note">
            <Shield size={12} /> 100% Genuine &amp; Licensed medicines
          </div>
        </div>

      </div>
      <div className="footer__copy">
        &copy; {new Date().getFullYear()} Batla Medicos Chemist &amp; Cosmetics, New Delhi — All rights reserved.
        <span className="footer__policy-links">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms">Terms</Link>
          <span>·</span>
          <Link to="/refund-policy">Refund Policy</Link>
        </span>
      </div>
    </footer>
  );
}

