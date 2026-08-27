import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import CitizenPortal from './pages/CitizenPortal';
import OperatorDashboard from './pages/OperatorDashboard';
import CitizenDashboard from './pages/CitizenDashboard';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut } from 'lucide-react';
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
            Report Issue
          </Link>
        )}
        {currentUser && userRole === 'operator' && (
          <Link to="/operator" className={`nav-item ${location.pathname.startsWith('/operator') ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            Operator Dashboard
          </Link>
        )}
        {currentUser && userRole === 'citizen' && (
          <Link to="/dashboard" className={`nav-item ${location.pathname.startsWith('/dashboard') ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
            My Dashboard
          </Link>
        )}
      </div>

      <div>
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
              <LogOut size={16} /> Logout
            </button>
          </div>
        ) : (
          <Link to="/auth" className="btn btn-primary" style={{ textDecoration: 'none', padding: '0.4rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Login / Register
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
