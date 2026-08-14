import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import CitizenPortal from './pages/CitizenPortal';
import OperatorDashboard from './pages/OperatorDashboard';
import { Mic, LayoutDashboard } from 'lucide-react';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('citizen');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* TestFit-style Header */}
      <header className="header-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Logo / Branding */}
          <div style={{ 
            color: 'var(--accent)', 
            fontWeight: 900, 
            fontSize: '1.5rem',
            fontStyle: 'italic',
            letterSpacing: '-1px' 
          }}>
            Samadhaan<span style={{color: 'var(--text-main)'}}>.ai</span>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="nav-links">
          <span 
            className={`nav-item ${activeTab === 'citizen' ? 'active' : ''}`}
            onClick={() => setActiveTab('citizen')}
          >
            Product
          </span>
          <span 
            className={`nav-item ${activeTab === 'operator' ? 'active' : ''}`}
            onClick={() => setActiveTab('operator')}
          >
            Dashboard
          </span>
        </div>

        {/* Empty spacer to balance flexbox if needed, or just omit action button */}
        <div></div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === 'citizen' ? <CitizenPortal /> : <OperatorDashboard />}
      </main>
      
    </div>
  );
}

export default App;
