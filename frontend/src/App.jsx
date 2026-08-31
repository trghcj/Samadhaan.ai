import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import CitizenPortal from './pages/CitizenPortal';
import OperatorDashboard from './pages/OperatorDashboard';
import CitizenDashboard from './pages/CitizenDashboard';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
const AppHeader = () => {
  const { currentUser, userRole, logout } = useAuth();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <header className="header-nav">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--accent)', fontWeight: 900, fontSize: '1.5rem', fontStyle: 'italic', letterSpacing: '-1px' }}>
          Samadhaan<span style={{color: 'var(--text-main)'}}>.ai</span>
        </Link>
      </div>

      <div className="nav-links">
        {userRole !== 'operator' && (
          <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            {t("Report Issue")}
          </Link>
        )}
        {currentUser && userRole === 'operator' && (
          <Link to="/operator" className={`nav-item ${location.pathname.startsWith('/operator') ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            {t("Operator Dashboard")}
          </Link>
        )}
        {currentUser && userRole === 'citizen' && (
          <Link to="/dashboard" className={`nav-item ${location.pathname.startsWith('/dashboard') ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            {t("My Dashboard")}
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f1f5f9', padding: '0.4rem 0.75rem', borderRadius: '8px' }}>
          <Globe size={16} color="var(--text-muted)" />
          <select 
            onChange={handleLanguageChange} 
            value={i18n.resolvedLanguage || 'en'}
            style={{ background: 'transparent', border: 'none', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, outline: 'none', cursor: 'pointer' }}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
            <option value="bn">বাংলা (Bengali)</option>
            <option value="te">తెలుగు (Telugu)</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="mr">मराठी (Marathi)</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
          </select>
          
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
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {currentUser.email || 'Citizen User'}
            </span>
            <button 
              onClick={logout} 
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', fontWeight: 500, padding: '0.5rem', borderRadius: '8px', transition: 'background-color 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <LogOut size={16} /> {t("Logout")}
            </button>
          </div>
        ) : (
          <Link to="/auth" className="btn btn-primary" style={{ textDecoration: 'none', padding: '0.4rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}>
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
