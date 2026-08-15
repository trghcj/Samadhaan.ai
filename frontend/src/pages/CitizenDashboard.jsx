import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, CheckCircle, Navigation, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CitizenDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGrievances = async () => {
      if (!currentUser) return;
      try {
        const res = await fetch(`https://samadhaan-ai.onrender.com/api/grievances/me/${currentUser.uid}`);
        const data = await res.json();
        setGrievances(data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchGrievances();
  }, [currentUser]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.25rem', color: '#FF5722', fontWeight: 800 }}>
          My Reported Issues
        </h1>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Navigation size={18} />
          Report New Issue
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ border: '3px solid #E2E8F0', borderTop: '3px solid var(--color-primary)', borderRadius: '50%', width: '30px', height: '30px', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          Loading your reports...
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : grievances.length === 0 ? (
        <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            <Clock size={48} style={{ margin: '0 auto' }} />
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No issues reported yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>When you report a municipal issue, it will appear here so you can track its resolution status.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {grievances.map(g => (
            <div key={g.id} className="card" style={{ padding: '1.5rem', borderLeft: g.is_resolved ? '4px solid #10B981' : '4px solid #F59E0B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 500, lineHeight: 1.5, flex: 1 }}>"{g.transcript}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(g.created_at).toLocaleDateString()}
                  </span>
                  <button 
                    onClick={async () => {
                      if(window.confirm('Are you sure you want to permanently delete this issue?')) {
                        try {
                          await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${g.id}`, { method: 'DELETE' });
                          setGrievances(prev => prev.filter(item => item.id !== g.id));
                        } catch(err) {
                          console.error(err);
                          alert("Failed to delete grievance");
                        }
                      }
                    }} 
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }} 
                    title="Delete Issue"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', backgroundColor: g.is_resolved ? '#D1FAE5' : '#FEF3C7', color: g.is_resolved ? '#065F46' : '#92400E', borderRadius: 'var(--radius-sm)' }}>
                {g.is_resolved ? <CheckCircle size={20} /> : <Clock size={20} />}
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {g.is_resolved 
                    ? `Resolved by ${g.prediction} Dept. on ${new Date(g.resolved_at).toLocaleDateString()}` 
                    : `Pending Review by ${g.prediction} Dept.`}
                </span>
              </div>
              
              {g.is_resolved && g.resolution_notes && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.95rem' }}>
                  <strong>Official Note:</strong> {g.resolution_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CitizenDashboard;
