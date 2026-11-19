import React from 'react';

// Shared page frame pieces so the operator register and the citizen page line up exactly.

export const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <div className="page-header">
    <div style={{ minWidth: 0 }}>
      {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-sub">{subtitle}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
);

const TONES = {
  neutral: { color: '#374151', bg: '#F3F4F6' },
  amber: { color: '#B45309', bg: '#FEF3C7' },
  blue: { color: '#1D4ED8', bg: '#DBEAFE' },
  red: { color: '#B91C1C', bg: '#FEE2E2' },
  green: { color: '#047857', bg: '#D1FAE5' },
};

/** items: [{ label, value, Icon, tone: 'neutral'|'amber'|'blue'|'red'|'green' }] — always four equal tiles. */
export const StatTiles = ({ items }) => (
  <div className="stat-grid">
    {items.map(({ label, value, Icon, tone = 'neutral' }) => {
      const c = TONES[tone];
      return (
        <div key={label} className="stat-tile">
          <span className="stat-icon" style={{ background: c.bg, color: c.color }}><Icon size={18} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="stat-value" style={{ color: tone === 'red' && value > 0 ? c.color : undefined }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        </div>
      );
    })}
  </div>
);
