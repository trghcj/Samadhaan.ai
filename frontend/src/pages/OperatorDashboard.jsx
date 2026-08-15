import React, { useState, useEffect } from 'react';
import { Filter } from 'lucide-react';

const OperatorDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confidenceFilter, setConfidenceFilter] = useState('All');
  const [selectedGrievance, setSelectedGrievance] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  const fetchGrievances = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://samadhaan-ai.onrender.com/api/grievances');
      const data = await response.json();
      setGrievances(data);
    } catch (err) {
      console.error("Failed to fetch grievances", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGrievances();
  }, []);

  const pendingGrievances = grievances.filter(g => !g.is_resolved);
  const resolvedGrievances = grievances.filter(g => g.is_resolved);
  
  let displayGrievances = activeTab === 'pending' ? pendingGrievances : resolvedGrievances;

  if (confidenceFilter !== 'All') {
    displayGrievances = displayGrievances.filter(g => g.confidence === confidenceFilter);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem' }}>
        <div>
          <h1 style={{ 
            fontSize: '2.25rem', 
            marginBottom: '1.5rem', 
            background: 'linear-gradient(90deg, #FF6A00, #222222)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent',
            fontWeight: 800,
            letterSpacing: '-0.02em'
          }}>
            Operator Dashboard
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--border)' }}>
            <button 
              onClick={() => setActiveTab('pending')}
              style={{ background: 'none', border: 'none', borderBottom: activeTab === 'pending' ? '2px solid var(--accent)' : '2px solid transparent', padding: '0.5rem 0', fontWeight: activeTab === 'pending' ? 600 : 400, color: activeTab === 'pending' ? 'var(--text-main)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem' }}
            >
              Pending Review
            </button>
            <button 
              onClick={() => setActiveTab('resolved')}
              style={{ background: 'none', border: 'none', borderBottom: activeTab === 'resolved' ? '2px solid var(--accent)' : '2px solid transparent', padding: '0.5rem 0', fontWeight: activeTab === 'resolved' ? 600 : 400, color: activeTab === 'resolved' ? 'var(--text-main)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem' }}
            >
              Resolved Issues
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.85rem' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select 
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-main)', fontSize: '0.95rem', cursor: 'pointer', padding: '0.25rem' }}
            >
              <option value="All">All Confidence</option>
              <option value="High">High Confidence</option>
              <option value="Moderate">Moderate Confidence</option>
              <option value="Low">Low Confidence</option>
            </select>
          </div>
          <button 
            className="btn btn-primary" 
            style={{ padding: '0.5rem 1rem' }}
            onClick={fetchGrievances}
          >
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ backgroundColor: 'var(--color-surface-hover)', borderBottom: '1px solid var(--color-border)' }}>
            <tr>
              <th style={{ padding: '1.75rem 1.5rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ID</th>
              <th style={{ padding: '1.75rem 1.5rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transcript Snippet</th>
              <th style={{ padding: '1.75rem 1.5rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prediction Set</th>
              <th style={{ padding: '1.75rem 1.5rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence</th>
              <th style={{ padding: '1.75rem 1.5rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</th>
              <th style={{ padding: '1.75rem 1.5rem', fontWeight: 700, color: 'var(--text-muted)', fontSize: '1.05rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{padding: '2rem', textAlign: 'center'}}>Loading data...</td></tr>
            ) : displayGrievances.length === 0 ? (
              <tr><td colSpan="6" style={{padding: '2rem', textAlign: 'center', color: 'var(--text-muted)'}}>No grievances found in this tab.</td></tr>
            ) : displayGrievances.map((g, idx) => (
              <tr key={g.id} style={{ borderBottom: idx === displayGrievances.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <td style={{ padding: '1.25rem 1.5rem', fontWeight: 500 }}>{g.id}</td>
                <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)' }}>"{g.transcript}"</td>
                <td style={{ padding: '1.25rem 1.5rem', fontWeight: 500 }}>{g.prediction}</td>
                <td style={{ padding: '1.25rem 1.5rem' }}>
                  <span className={`badge badge-${g.confidence?.toLowerCase()}`}>
                    {g.confidence}
                  </span>
                </td>
                <td style={{ padding: '1.25rem 1.5rem', color: 'var(--text-muted)' }}>
                  {new Date(g.created_at + 'Z').toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </td>
                <td style={{ padding: '1.25rem 1.5rem' }}>
                  <button 
                    className="btn btn-outline" 
                    style={{ padding: '0.35rem 1rem', fontSize: '0.875rem' }}
                    onClick={() => {
                      setSelectedGrievance(g);
                      setReviewNotes(g.resolution_notes || '');
                    }}
                  >
                    {g.is_resolved ? 'View Record' : 'Review'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {selectedGrievance && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '550px', margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Review Grievance #{selectedGrievance.id}</h2>
              <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--text-muted)' }}>&times;</button>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Full Transcript</label>
              <p style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.95rem', border: '1px solid var(--border)' }}>
                "{selectedGrievance.transcript}"
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Routed Department</label>
                <div style={{ fontWeight: 500, fontSize: '1.1rem' }}>{selectedGrievance.prediction}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>AI Confidence</label>
                <span className={`badge badge-${selectedGrievance.confidence?.toLowerCase()}`}>{selectedGrievance.confidence}</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Operator Resolution Notes</label>
              {selectedGrievance.is_resolved ? (
                <p style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.95rem', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', color: 'var(--text-main)', minHeight: '100px' }}>
                  {selectedGrievance.resolution_notes || 'No notes provided.'}
                </p>
              ) : (
                <textarea 
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add documentation, contact info, or action taken..."
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', minHeight: '100px', resize: 'none', fontFamily: 'inherit' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
              <button className="btn btn-outline" onClick={() => setSelectedGrievance(null)}>Close</button>
              {!selectedGrievance.is_resolved && (
                <button className="btn btn-primary" onClick={async () => {
                  try {
                    await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${selectedGrievance.id}/resolve`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ notes: reviewNotes })
                    });
                    setSelectedGrievance(null);
                    setReviewNotes('');
                    fetchGrievances();
                  } catch(err) {
                    console.error(err);
                    alert("Failed to resolve grievance");
                  }
                }}>Mark as Resolved</button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorDashboard;
