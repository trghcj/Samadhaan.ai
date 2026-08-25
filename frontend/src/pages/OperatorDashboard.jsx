import React, { useState, useEffect } from 'react';
import { Filter, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const OperatorDashboard = () => {
  const { currentUser, userDepartment } = useAuth();
  
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confidenceFilter, setConfidenceFilter] = useState('All');
  const [selectedGrievance, setSelectedGrievance] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [resolving, setResolving] = useState(false);

  const fetchGrievances = async () => {
    setLoading(true);
    try {
      const url = currentUser ? `https://samadhaan-ai.onrender.com/api/grievances?uid=${currentUser.uid}` : 'https://samadhaan-ai.onrender.com/api/grievances';
      const response = await fetch(url);
      const data = await response.json();
      if (Array.isArray(data)) {
        setGrievances(data);
      } else {
        setGrievances([]);
      }
    } catch (err) {
      console.error("Failed to fetch grievances", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGrievances();
  }, [currentUser]);

  const handleResolve = async () => {
    if (!afterPhoto && !window.confirm("You are resolving this without an 'After' photo. AI Verification will be skipped. Proceed?")) {
      return;
    }
    
    setResolving(true);
    let uploadedUrl = null;
    
    if (afterPhoto) {
      const imgData = new FormData();
      imgData.append("file", afterPhoto);
      imgData.append("upload_preset", "samadhaan_uploads");
      imgData.append("cloud_name", "gd6ovrz6");
      try {
        const res = await fetch("https://api.cloudinary.com/v1_1/gd6ovrz6/image/upload", { method: "POST", body: imgData });
        const cloudData = await res.json();
        if (cloudData.secure_url) uploadedUrl = cloudData.secure_url;
      } catch (err) {
        console.error("After photo upload failed:", err);
      }
    }

    try {
      const response = await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${selectedGrievance.id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          resolution_notes: reviewNotes,
          after_photo_url: uploadedUrl
        })
      });
      const data = await response.json();
      
      if (data.status === 'error') {
        alert(`AI Verification Failed:\n\n${data.reason}\n\nPlease upload a valid photo showing the exact issue repaired.`);
      } else {
        alert("Issue successfully resolved and verified!");
        setSelectedGrievance(null);
        setReviewNotes('');
        setAfterPhoto(null);
      }
      fetchGrievances();
    } catch(err) {
      console.error(err);
      alert("Failed to connect to server for resolution.");
    }
    setResolving(false);
  };

  const getSlaStatus = (deadline) => {
    if (!deadline) return { text: "No SLA", color: "var(--text-muted)" };
    const now = new Date();
    const target = new Date(deadline + 'Z');
    const diffHours = (target - now) / (1000 * 60 * 60);
    
    if (diffHours < 0) return { text: "OVERDUE", color: "#EF4444" };
    if (diffHours < 12) return { text: `${Math.floor(diffHours)}h remaining`, color: "#F59E0B" };
    if (diffHours > 24) return { text: `${Math.floor(diffHours/24)}d remaining`, color: "#10B981" };
    return { text: `${Math.floor(diffHours)}h remaining`, color: "#10B981" };
  };

  let displayGrievances = grievances;
  if (confidenceFilter !== 'All') {
    displayGrievances = displayGrievances.filter(g => g.confidence === confidenceFilter);
  }

  const pending = displayGrievances.filter(g => !g.is_resolved && g.ai_verification_status !== 'Rejected');
  const rejected = displayGrievances.filter(g => !g.is_resolved && g.ai_verification_status === 'Rejected');
  const resolved = displayGrievances.filter(g => g.is_resolved);

  const renderCard = (g) => {
    const sla = getSlaStatus(g.sla_deadline);
    return (
      <div key={g.id} className="card" onClick={() => setSelectedGrievance(g)} style={{ padding: '1rem', marginBottom: '1rem', cursor: 'pointer', borderLeft: `4px solid ${g.priority === 'High' ? '#EF4444' : g.priority === 'Medium' ? '#F59E0B' : '#10B981'}`, transition: 'transform 0.1s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ID: #{g.id}</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: sla.color, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Clock size={12} /> {sla.text}
          </span>
        </div>
        <p style={{ fontSize: '0.95rem', fontWeight: 500, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          "{g.transcript}"
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`badge badge-${g.confidence?.toLowerCase()}`}>{g.confidence} Conf</span>
          {g.ai_verification_status === 'Rejected' && <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700 }}><AlertTriangle size={12}/> Fraud Alert</span>}
          {g.is_resolved && <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700 }}><CheckCircle size={12}/> Verified</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
          {userDepartment ? `${userDepartment === 'All Departments' ? 'Super Admin' : userDepartment + ' Department'} Kanban` : 'Operator Dashboard'}
        </h2>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.35rem 0.85rem' }}>
            <Filter size={16} color="var(--text-muted)" />
            <select 
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-main)', fontSize: '0.95rem', cursor: 'pointer', padding: '0.25rem' }}
            >
              <option value="All">All Confidence</option>
              <option value="High">High Confidence</option>
              <option value="Medium">Medium Confidence</option>
              <option value="Low">Low Confidence</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={fetchGrievances}>
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', flex: 1, minHeight: 0 }}>
        {/* Column 1: Pending */}
        <div style={{ backgroundColor: '#F3F4F6', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>To Do ({pending.length})</h3>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
            {pending.map(renderCard)}
          </div>
        </div>

        {/* Column 2: Rejected Verification */}
        <div style={{ backgroundColor: '#FEF2F2', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#B91C1C', marginBottom: '1rem', textTransform: 'uppercase' }}>AI Rejected Photos ({rejected.length})</h3>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
            {rejected.map(renderCard)}
          </div>
        </div>

        {/* Column 3: Resolved */}
        <div style={{ backgroundColor: '#ECFDF5', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#047857', marginBottom: '1rem', textTransform: 'uppercase' }}>Resolved ({resolved.length})</h3>
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
            {resolved.map(renderCard)}
          </div>
        </div>
      </div>
      
      {/* Detail Modal */}
      {selectedGrievance && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '95vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Review Ticket #{selectedGrievance.id}</h2>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Priority: <strong style={{color: selectedGrievance.priority === 'High' ? '#EF4444' : 'inherit'}}>{selectedGrievance.priority || 'Medium'}</strong></span>
              </div>
              <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--text-muted)' }}>&times;</button>
            </div>
            
            {selectedGrievance.ai_verification_status === 'Rejected' && (
              <div style={{ backgroundColor: '#FEF2F2', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid #F87171' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, color: '#B91C1C', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={16}/> AI Fraud Detection Triggered</label>
                <div style={{ color: '#B91C1C', fontSize: '0.95rem' }}>{selectedGrievance.ai_verification_notes}</div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Citizen Transcript</label>
              <p style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.95rem', border: '1px solid var(--border)' }}>
                "{selectedGrievance.transcript}"
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Routed Department</label>
                <div style={{ fontWeight: 500, fontSize: '1.1rem' }}>{selectedGrievance.prediction}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Location</label>
                <div style={{ fontSize: '1rem', fontWeight: 500 }}>{selectedGrievance.location || 'Not Provided'}</div>
              </div>
            </div>

            {(selectedGrievance.before_photo_url || selectedGrievance.after_photo_url) && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Attached Evidence</label>
                <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto' }}>
                  {selectedGrievance.before_photo_url && (
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textAlign: 'center' }}>Before (Citizen)</p>
                      <img src={selectedGrievance.before_photo_url} alt="Before" style={{ width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                    </div>
                  )}
                  {selectedGrievance.after_photo_url && (
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textAlign: 'center' }}>After (Operator)</p>
                      <img src={selectedGrievance.after_photo_url} alt="After" style={{ width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Operator Resolution Notes</label>
              {selectedGrievance.is_resolved ? (
                <p style={{ backgroundColor: 'var(--bg-main)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.95rem', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', color: 'var(--text-main)', minHeight: '80px' }}>
                  {selectedGrievance.resolution_notes || 'No notes provided.'}
                </p>
              ) : (
                <>
                  <textarea 
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Document action taken..."
                    style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', minHeight: '100px', resize: 'none', fontFamily: 'inherit', marginBottom: '1rem' }}
                  />
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Upload "After" Verification Photo</label>
                    <input type="file" accept="image/*" onChange={(e) => setAfterPhoto(e.target.files[0])} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
              <button className="btn btn-outline" style={{ marginRight: 'auto', borderColor: '#EF4444', color: '#EF4444' }} onClick={async () => {
                if(window.confirm('Delete this issue permanently?')) {
                  await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${selectedGrievance.id}`, { method: 'DELETE' });
                  setSelectedGrievance(null);
                  fetchGrievances();
                }
              }}>Delete Issue</button>
              
              <button className="btn btn-outline" onClick={() => setSelectedGrievance(null)}>Close</button>
              
              {!selectedGrievance.is_resolved && (
                <button className="btn btn-primary" disabled={resolving} onClick={handleResolve}>
                  {resolving ? 'Verifying AI...' : 'Mark as Resolved'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorDashboard;
