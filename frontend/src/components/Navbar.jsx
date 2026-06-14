import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ShoppingCart, Menu, X, LogOut, ClipboardList, LayoutDashboard, Truck, Clock, Phone, Heart, FileText, Bell as BellIcon, User, FlaskConical } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import CartDrawer from './CartDrawer';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const { totalItems } = useCart();
  const { items: wishItems } = useWishlist();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const WHATSAPP = import.meta.env.VITE_WHATSAPP_NUMBER || '919990165925';

  return (
    <>
      {/* ── Top Announcement Bar ─────────────────────────────── */}
      <div className="topbar">
        <span className="topbar__item"><Truck size={13} /> Free Delivery above ₹499</span>
        <span className="topbar__divider" />
        <span className="topbar__item"><Clock size={13} /> Open 9 AM – 11:45 PM daily</span>
        <span className="topbar__divider" />
        <a
          href={`https://wa.me/${WHATSAPP}`}
          target="_blank" rel="noopener noreferrer"
          className="topbar__item"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          <Phone size={13} /> 9990165925
        </a>
      </div>

      {/* ── Main Navbar ──────────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar__inner">
          {/* Logo */}
          <Link to="/" className="navbar__brand">
            <div className="navbar__logo">
              <img src="/logo.png?v=3" className="navbar__logo-img" alt="Batla Medicos" />
            </div>
            <div className="navbar__brand-text">
              <span className="navbar__brand-red">Batla Medicos</span>
              <span className="navbar__brand-green">Chemist &amp; Cosmetics</span>
            </div>
          </Link>

          {/* Nav links */}
          <div className={`navbar__links ${mobileOpen ? 'navbar__links--open' : ''}`}>
            <NavLink to="/" end onClick={() => setMobileOpen(false)}>Home</NavLink>
            <NavLink to="/products" onClick={() => setMobileOpen(false)}>Products</NavLink>
            {user ? (
              <>
                <NavLink to="/orders" onClick={() => setMobileOpen(false)}>
                  <ClipboardList size={15} /> My Orders
                </NavLink>
                <NavLink to="/prescriptions" onClick={() => setMobileOpen(false)}>
                  <FileText size={15} /> Prescriptions
                </NavLink>
                <NavLink to="/lab" onClick={() => setMobileOpen(false)}>
                  <FlaskConical size={15} /> Lab Tests
                </NavLink>
                <NavLink to="/reminders" onClick={() => setMobileOpen(false)}>
                  <BellIcon size={15} /> Reminders
                </NavLink>
                <NavLink to="/account" onClick={() => setMobileOpen(false)}>
                  <User size={15} /> Account
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin" onClick={() => setMobileOpen(false)}>
                    <LayoutDashboard size={15} /> Admin
                  </NavLink>
                )}
                <button className="navbar__logout" onClick={() => { logout(); setMobileOpen(false); }}>
                  <LogOut size={15} /> Logout
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" onClick={() => setMobileOpen(false)}>Login</NavLink>
                <Link
                  to="/register"
                  className="btn btn--primary btn--sm"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="navbar__actions">
            <Link to="/wishlist" className="navbar__wish-btn" aria-label="Wishlist">
              <Heart size={18} />
              {wishItems.length > 0 && <span className="navbar__wish-count">{wishItems.length}</span>}
            </Link>
            {user && <NotificationBell adminMode={false} />}
            <button className="navbar__cart-btn" onClick={() => setDrawerOpen(true)} aria-label="Open cart">
              <ShoppingCart size={18} />
              <span>Cart</span>
              {totalItems > 0 && <span className="navbar__cart-count">{totalItems}</span>}
            </button>
            <button
              className="navbar__menu-btn"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </nav>
      <CartDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
