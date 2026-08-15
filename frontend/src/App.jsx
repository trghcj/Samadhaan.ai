import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import CitizenPortal from './pages/CitizenPortal';
import OperatorDashboard from './pages/OperatorDashboard';
import AuthPage from './pages/AuthPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LogOut } from 'lucide-react';
import './index.css';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Navigate to="/auth" />;
  }
  return children;
};

// Header Component so we can use useAuth and useLocation safely inside Router
const AppHeader = () => {
  const { currentUser, logout } = useAuth();
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
          Product
        </Link>
        <Link to="/operator" className={`nav-item ${location.pathname.startsWith('/operator') ? 'active' : ''}`} style={{ textDecoration: 'none' }}>
          Operator Dashboard
        </Link>
      </div>

      <div>
        {currentUser ? (
          <button onClick={logout} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', fontSize: '0.875rem' }}>
            <LogOut size={14} /> Logout
          </button>
        ) : (
          <div style={{ width: '80px' }}></div>
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
                  <ProtectedRoute>
                    <OperatorDashboard />
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
