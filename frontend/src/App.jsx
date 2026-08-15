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
        <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          Report Issue
        </Link>
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
          <button onClick={logout} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>
            <LogOut size={14} /> Logout
          </button>
        ) : (
          <Link to="/auth" className="btn btn-primary" style={{ textDecoration: 'none', padding: '0.4rem 1rem', fontSize: '0.875rem', fontWeight: 600 }}>
            Login / Register
          </Link>
        )}
      </div>
    </header>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <AppHeader />
          
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<CitizenPortal />} />
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
