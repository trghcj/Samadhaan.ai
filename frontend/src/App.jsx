import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import CitizenPortal from './pages/CitizenPortal';
import OperatorDashboard from './pages/OperatorDashboard';
import CitizenDashboard from './pages/CitizenDashboard';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut, Globe, Mic, ClipboardList, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE, API_OVERRIDDEN } from './api';
import './index.css';

// Protected Route Wrapper
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;

  if (!currentUser) {
    return <Navigate to="/auth" />;
  }

  // If roles are specified and user's role doesn't match
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
    return <Navigate to="/" />;
  }

  return children;
};

// Header Component so we can use useAuth and useLocation safely inside Router
const LANGUAGES = [
  ['en', 'English'], ['hi', 'हिंदी'], ['bn', 'বাংলা'], ['te', 'తెలుగు'],
  ['ta', 'தமிழ்'], ['mr', 'मराठी'], ['es', 'Español'], ['fr', 'Français'],
];

// Avatar button that opens a small account menu (email, role, department, log out).
const AccountMenu = ({ currentUser, userRole, userDepartment, logout, t }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const label = currentUser.displayName || currentUser.email || 'User';
  const initial = label.trim().charAt(0).toUpperCase();
  const isOperator = userRole === 'operator';

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('Account', { defaultValue: 'Account' })}>
        <span className="avatar">{initial}</span>
        <ChevronDown size={14} className="hide-sm" />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-all' }}>{label}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {isOperator
                ? `${t('Operator', { defaultValue: 'Operator' })}${userDepartment ? ` · ${userDepartment}` : ''}`
                : t('Citizen', { defaultValue: 'Citizen' })}
            </div>
          </div>
          <button type="button" role="menuitem" className="menu-item" onClick={() => { setOpen(false); logout(); }}>
            <LogOut size={15} /> {t('Logout')}
          </button>
        </div>
      )}
    </div>
  );
};

const AppHeader = () => {
  const { currentUser, userRole, userDepartment, logout } = useAuth();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  const isOperator = currentUser && userRole === 'operator';
  const navItems = isOperator ? [] : [
    { to: '/', label: t('Report issue', { defaultValue: 'Report issue' }), Icon: Mic, active: location.pathname === '/' },
    ...(currentUser && userRole === 'citizen'
      ? [{ to: '/dashboard', label: t('My complaints', { defaultValue: 'My complaints' }), Icon: ClipboardList, active: location.pathname.startsWith('/dashboard') }]
      : []),
  ];

  return (
    <header className="app-header">
      <div className="app-header-left">
        <Link to="/" className="brand">
          Samadhaan<span>.ai</span>
        </Link>
        {currentUser && (
          <span className="role-pill">
            {isOperator
              ? <>{t('Operator', { defaultValue: 'Operator' })}{userDepartment && <span className="hide-sm"> · {userDepartment}</span>}</>
              : t('Citizen', { defaultValue: 'Citizen' })}
          </span>
        )}
        {navItems.length > 0 && (
          <nav className="app-nav" aria-label="Main">
            {navItems.map(({ to, label, Icon, active }) => (
              <Link key={to} to={to} className={`app-nav-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={label}>
                <Icon size={16} /> <span className="hide-sm">{label}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="app-header-right">
        <div className="lang-select" style={{ position: 'relative' }}>
          <Globe size={16} color="var(--text-muted)" />
          <select
            onChange={handleLanguageChange}
            value={i18n.resolvedLanguage || 'en'}
            aria-label={t('Language')}
          >
            {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          <ChevronDown size={14} color="var(--text-muted)" style={{ pointerEvents: 'none' }} />
          
          {location.pathname === '/auth' && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 12px)',
              right: '0',
              backgroundColor: '#4F46E5',
              color: 'white',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '600',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
              whiteSpace: 'nowrap',
              zIndex: 50,
              animation: 'bounce 2s infinite'
            }}>
              <div style={{
                position: 'absolute',
                top: '-6px',
                right: '24px',
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '6px solid #4F46E5'
              }}></div>
              🌍 Choose your language here!
              <style>{`
                @keyframes bounce {
                  0%, 100% { transform: translateY(0); }
                  50% { transform: translateY(-5px); }
                }
              `}</style>
            </div>
          )}
        </div>

        {currentUser ? (
          <AccountMenu currentUser={currentUser} userRole={userRole} userDepartment={userDepartment} logout={logout} t={t} />
        ) : (
          <Link to="/auth" className="btn btn-primary" style={{ textDecoration: 'none', padding: '0.45rem 1rem', fontSize: '0.875rem', fontWeight: 600, borderRadius: 8 }}>
            {t("Login / Register")}
          </Link>
        )}
      </div>
    </header>
  );
};

// Home Route Wrapper to redirect Operators away from the Citizen Portal
const HomeRoute = () => {
  const { currentUser, userRole, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (currentUser && userRole === 'operator') {
    return <Navigate to="/operator" />;
  }
  
  return <CitizenPortal />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {API_OVERRIDDEN && (
            <div style={{ background: '#FEF3C7', color: '#92400E', fontSize: '0.8rem', fontWeight: 600, padding: '0.4rem 1rem', textAlign: 'center' }}>
              Demo mode: using custom backend {API_BASE} (open the site with ?api=reset to go back)
            </div>
          )}
          <AppHeader />
          
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route 
                path="/operator" 
                element={
                  <ProtectedRoute allowedRoles={['operator']}>
                    <OperatorDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute allowedRoles={['citizen']}>
                    <CitizenDashboard />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </main>
          
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
