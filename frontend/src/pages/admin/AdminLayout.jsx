import { useState, useEffect, Component } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingBag, Users, Tag, Percent, Shield, LogOut, ExternalLink, ChevronLeft, ChevronRight, Bell, FileText, FlaskConical, Menu, X, Truck, Ticket, Star, Sparkles, FolderOpen, Film, ClipboardList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../../components/NotificationBell';
import SEO from '../../components/SEO';

class AdminErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('Admin page error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="admin-page" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h2 style={{ color: '#C0392B', marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 20 }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button className="btn btn--primary" onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Grouped navigation with section labels
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/admin/products',   label: 'Products',   icon: Package },
      { to: '/admin/discounts',  label: 'Discounts',  icon: Percent },
      { to: '/admin/brands',     label: 'Brands',     icon: Star },
      { to: '/admin/categories', label: 'Categories', icon: FolderOpen },
      { to: '/admin/promotions', label: 'Promotions', icon: Film },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { to: '/admin/orders',   label: 'Orders',    icon: ShoppingBag },
      { to: '/admin/users',    label: 'Customers', icon: Users },
      { to: '/admin/coupons',  label: 'Coupons',   icon: Ticket },
      { to: '/admin/offers',   label: 'Offers',    icon: Tag },
      { to: '/admin/requests', label: 'Requests',  icon: ClipboardList },
    ],
  },
  {
    label: 'Medical',
    items: [
      { to: '/admin/prescriptions', label: 'Prescriptions', icon: FileText },
      { to: '/admin/lab-tests',     label: 'Lab Tests',     icon: FlaskConical },
      { to: '/admin/lab-bookings',  label: 'Lab Bookings',  icon: FlaskConical },
      { to: '/admin/delivery',      label: 'Delivery',      icon: Truck },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/site-settings', label: 'Site Settings', icon: Sparkles },
      { to: '/admin/notifications', label: 'Notifications', icon: Bell },
      { to: '/admin/admins',        label: 'Admins',        icon: Shield, superAdminOnly: true },
      { to: '/admin/audit',         label: 'Audit Log',     icon: Shield, superAdminOnly: true },
    ],
  },
];

// Topbar page title lookup
const PAGE_TITLES = {
  '/admin': 'Dashboard',
  '/admin/products': 'Products',
  '/admin/discounts': 'Discounts',
  '/admin/brands': 'Brands',
  '/admin/categories': 'Categories',
  '/admin/orders': 'Orders',
  '/admin/users': 'Customers',
  '/admin/coupons': 'Coupons',
  '/admin/offers': 'Offers',
  '/admin/prescriptions': 'Prescriptions',
  '/admin/lab-tests': 'Lab Tests',
  '/admin/lab-bookings': 'Lab Bookings',
  '/admin/delivery': 'Delivery',
  '/admin/site-settings': 'Site Settings',
  '/admin/notifications': 'Notifications',
  '/admin/admins': 'Admins',
  '/admin/audit': 'Audit Log',
  '/admin/requests': 'Medicine Requests',
};

export default function AdminLayout() {
  const { user, logout, isSuperAdmin } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth > 768) setMobileOpen(false); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const pageTitle = PAGE_TITLES[location.pathname] || 'Admin';

  const SidebarContent = ({ collapsed }) => (
    <>
      {/* Brand header */}
      <div className="admin-sidebar__brand">
        <div className="admin-sidebar__brand-logo">BM</div>
        {!collapsed && <span className="admin-sidebar__brand-name">BatlaAdmin</span>}
        <button
          className="admin-sidebar__toggle"
          onClick={() => setSidebarOpen(o => !o)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Grouped navigation */}
      <nav className="admin-nav">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter(item => !item.superAdminOnly || isSuperAdmin);
          if (!visibleItems.length) return null;
          return (
            <div key={gi} className="admin-nav__group">
              {group.label && !collapsed && (
                <p className="admin-nav__group-label">{group.label}</p>
              )}
              {visibleItems.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={`admin-nav__link ${location.pathname === to ? 'admin-nav__link--active' : ''}`}
                >
                  <Icon size={17} />
                  {!collapsed && <span>{label}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="admin-sidebar__footer">
        {!collapsed && (
          <div className="admin-sidebar__user-info">
            <p className="admin-sidebar__user">{user?.name}</p>
            <span className="admin-sidebar__role-badge">{user?.role?.toUpperCase()}</span>
          </div>
        )}
        <Link to="/" className="admin-sidebar__exit-btn" title="Back to store">
          <ExternalLink size={14} />
          {!collapsed && <span>View Store</span>}
        </Link>
        <button className="admin-sidebar__logout-btn" onClick={logout} title="Logout">
          <LogOut size={14} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="admin-layout">
      <SEO title="Admin Panel" description="Batla Medicos admin dashboard." path="/admin" noIndex />
      {/* Desktop sidebar */}
      <aside className={`admin-sidebar admin-sidebar--desktop ${sidebarOpen ? '' : 'admin-sidebar--collapsed'}`}>
        <SidebarContent collapsed={!sidebarOpen} />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`admin-sidebar admin-sidebar--mobile ${mobileOpen ? 'admin-sidebar--mobile-open' : ''}`}>
        <button className="admin-sidebar__mobile-close" onClick={() => setMobileOpen(false)}>
          <X size={20} />
        </button>
        <SidebarContent collapsed={false} />
      </aside>

      <main className="admin-main">
        <div className="admin-main__topbar">
          {/* Hamburger — mobile only */}
          <button className="admin-hamburger" onClick={() => setMobileOpen(o => !o)} title="Menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div className="admin-topbar__title">
            <span className="admin-topbar__breadcrumb">Admin</span>
            <ChevronRight size={13} className="admin-topbar__sep" />
            <span className="admin-topbar__page">{pageTitle}</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <NotificationBell adminMode={true} />
          </div>
        </div>
        <div className="admin-main__body">
          <AdminErrorBoundary>
            <Outlet />
          </AdminErrorBoundary>
        </div>
      </main>
    </div>
  );
}
