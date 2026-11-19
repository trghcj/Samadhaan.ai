import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import CitizenPortal from './pages/CitizenPortal';
import OperatorDashboard from './pages/OperatorDashboard';
import CitizenDashboard from './pages/CitizenDashboard';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut, Globe, Mic, ClipboardList, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE, API_OVERRIDDEN } from './api';
import Logo from './components/Logo';
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
  { code: 'hi', short: 'हि', native: 'हिंदी', english: 'Hindi', group: 'india' },
  { code: 'bn', short: 'বা', native: 'বাংলা', english: 'Bengali', group: 'india' },
  { code: 'te', short: 'తె', native: 'తెలుగు', english: 'Telugu', group: 'india' },
  { code: 'ta', short: 'த', native: 'தமிழ்', english: 'Tamil', group: 'india' },
  { code: 'mr', short: 'म', native: 'मराठी', english: 'Marathi', group: 'india' },
  { code: 'en', short: 'EN', native: 'English', english: 'English', group: 'other' },
  { code: 'es', short: 'ES', native: 'Español', english: 'Spanish', group: 'other' },
  { code: 'fr', short: 'FR', native: 'Français', english: 'French', group: 'other' },
];

// Close a popover on outside click or Esc.
const useDismiss = (open, setOpen, ref) => {
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open, setOpen, ref]);
};

// Language pill + menu (native name, English name, tick on the current one; arrow keys move between rows).
const LanguageMenu = ({ t, i18n, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  useDismiss(open, setOpen, ref);
  const current = LANGUAGES.find(l => l.code === (i18n.resolvedLanguage || 'en')) || LANGUAGES[5];

  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-checked="true"]')?.focus();
  }, [open]);

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...listRef.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  const choose = (code) => { i18n.changeLanguage(code); setOpen(false); };

  return (
    <div className="hdr-popover" ref={ref}>
      <button type="button" className="hdr-pill" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        aria-label={`${t('Language')}: ${current.english}`} title={t('Language')}>
        <Globe size={16} color="var(--text-muted)" />
        <span className="lang-short">{current.short}</span>
        <ChevronDown size={14} color="var(--text-muted)" />
      </button>
      {open && (
        <div className="hdr-menu lang-menu" role="menu" ref={listRef} onKeyDown={onKeyDown}>
          {[['india', t('Indian languages', { defaultValue: 'Indian languages' })], ['other', t('Other', { defaultValue: 'Other' })]].map(([group, heading]) => (
            <div key={group} role="group" aria-label={heading}>
              <div className="menu-heading">{heading}</div>
              {LANGUAGES.filter(l => l.group === group).map(l => {
                const active = l.code === current.code;
                return (
                  <button key={l.code} type="button" role="menuitemradio" aria-checked={active} className={`lang-item${active ? ' active' : ''}`} onClick={() => choose(l.code)} lang={l.code}>
                    <span>
                      <span className="lang-native">{l.native}</span>
                      {l.native !== l.english && <span className="lang-english">{l.english}</span>}
                    </span>
                    {active && <Check size={16} color="var(--accent)" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
};

// Avatar + name + role chip that opens a small account menu (email, role, department, log out).
const AccountMenu = ({ currentUser, userRole, userDepartment, logout, t }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, setOpen, ref);

  const email = currentUser.email || '';
  const name = currentUser.displayName || email.split('@')[0] || 'User';
  const initial = name.trim().charAt(0).toUpperCase();
  const isOperator = userRole === 'operator';
  const role = isOperator
    ? `${t('Operator', { defaultValue: 'Operator' })}${userDepartment ? ` · ${userDepartment}` : ''}`
    : t('Citizen', { defaultValue: 'Citizen' });

  return (
    <div className="hdr-popover" ref={ref}>
      <button type="button" className="account-chip" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('Account', { defaultValue: 'Account' })}>
        <span className="avatar">{initial}</span>
        <span className="account-text hide-sm">
          <span className="account-name">{name}</span>
          <span className="account-role">{role}</span>
        </span>
        <ChevronDown size={14} color="var(--text-muted)" className="hide-sm" />
      </button>
      {open && (
        <div className="hdr-menu" role="menu" style={{ width: 260 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="avatar" style={{ width: 40, height: 40 }}>{initial}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              {email && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{role}</div>
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

  const isOperator = currentUser && userRole === 'operator';
  const navItems = isOperator
    ? [{ to: '/operator', label: t('Complaint register', { defaultValue: 'Complaint register' }), Icon: ClipboardList, active: location.pathname.startsWith('/operator') }]
    : [
      { to: '/', label: t('Report issue', { defaultValue: 'Report issue' }), Icon: Mic, active: location.pathname === '/' },
      ...(currentUser && userRole === 'citizen'
        ? [{ to: '/dashboard', label: t('My complaints', { defaultValue: 'My complaints' }), Icon: ClipboardList, active: location.pathname.startsWith('/dashboard') }]
        : []),
    ];

  return (
    <header className="app-header">
      <div className="app-header-inner">
      <div className="app-header-left">
        <Link to="/" className="brand" aria-label="Samadhaan.ai home">
          <Logo size={34} />
          <span className="brand-text">Samadhaan<span>.ai</span></span>
        </Link>
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
        <LanguageMenu t={t} i18n={i18n}>
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
        </LanguageMenu>

        {currentUser ? (
          <AccountMenu currentUser={currentUser} userRole={userRole} userDepartment={userDepartment} logout={logout} t={t} />
        ) : (
          <Link to="/auth" className="btn btn-primary" style={{ textDecoration: 'none', height: 40, padding: '0 16px', fontSize: '0.875rem', fontWeight: 600, borderRadius: 8 }}>
            {t("Login / Register")}
          </Link>
        )}
      </div>
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
