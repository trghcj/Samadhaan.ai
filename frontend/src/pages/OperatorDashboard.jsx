import React, { useState, useEffect, useMemo } from 'react';
import { Filter, Clock, AlertTriangle, CheckCircle, Search, X, ShieldAlert, ShieldCheck, Activity, Calendar, MapPin, Download, RefreshCw, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Helper for category icons
const getCategoryIcon = (prediction) => {
  const p = (prediction || '').toLowerCase();
  if (p.includes('water')) return '💧';
  if (p.includes('road')) return '🛣️';
  if (p.includes('electric')) return '⚡';
  if (p.includes('sanitation') || p.includes('waste')) return '🗑️';
  if (p.includes('drainage')) return '🚰';
  if (p.includes('light')) return '💡';
  return '📄';
};

const OperatorDashboard = () => {
  const { currentUser, userDepartment } = useAuth();
  
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState([]); // Array of string filters
  
  // Local state to simulate "In Progress" without altering backend DB schema
  const [inProgressIds, setInProgressIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('inProgressIds') || '[]')); }
    catch { return new Set(); }
  });

  const [selectedGrievance, setSelectedGrievance] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const fetchGrievances = async () => {
    setLoading(true);
    try {
      const url = currentUser ? `https://samadhaan-ai.onrender.com/api/grievances?uid=${currentUser.uid}` : 'https://samadhaan-ai.onrender.com/api/grievances';
      const response = await fetch(url);
      const data = await response.json();
      if (Array.isArray(data)) setGrievances(data);
      else setGrievances([]);
    } catch (err) {
      console.error("Failed to fetch grievances", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchGrievances(); }, [currentUser]);

  // Persist In Progress state
  useEffect(() => {
    localStorage.setItem('inProgressIds', JSON.stringify(Array.from(inProgressIds)));
  }, [inProgressIds]);

  const handleResolve = async () => {
    if (!afterPhoto && !window.confirm("You are resolving this without an 'After' photo. AI Verification will be skipped. Proceed?")) return;
    
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
      } catch (err) { console.error("Photo upload failed:", err); }
    }

    try {
      const response = await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${selectedGrievance.id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: reviewNotes, after_photo_url: uploadedUrl })
      });
      const data = await response.json();
      
      if (data.status === 'error') {
        alert(`AI Verification Failed:\n\n${data.reason}\n\nPlease upload a valid photo showing the exact issue repaired.`);
      } else {
        alert("Issue successfully resolved and verified!");
        setSelectedGrievance(null);
        setReviewNotes('');
        setAfterPhoto(null);
        setInProgressIds(prev => { const n = new Set(prev); n.delete(selectedGrievance.id); return n; });
        fetchGrievances();
      }
    } catch(err) {
      alert("Failed to connect to server for resolution.");
    }
    setResolving(false);
  };

  const handleExport = () => {
    if (grievances.length === 0) return alert("No data to export");
    const headers = ['ID', 'Transcript', 'Prediction', 'Confidence', 'Priority', 'SLA Deadline', 'Status', 'Location', 'Submitted Date'];
    const csvRows = [headers.join(',')];
    grievances.forEach(g => {
      const row = [
        g.id,
        `"${(g.transcript || '').replace(/"/g, '""')}"`,
        g.prediction,
        g.confidence,
        g.priority,
        g.sla_deadline,
        g.is_resolved ? 'Resolved' : (g.ai_verification_status === 'Rejected' ? 'AI Flagged' : 'Pending'),
        `"${(g.location || '').replace(/"/g, '""')}"`,
        new Date(g.created_at).toISOString()
      ];
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `complaints_export_${new Date().toISOString().slice(0,10)}.csv`);
    a.click();
  };

  // Process data for columns
  const processedData = useMemo(() => {
    let filtered = grievances;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(g => 
        (g.transcript||'').toLowerCase().includes(q) || 
        g.id.toString().includes(q) || 
        (g.location||'').toLowerCase().includes(q)
      );
    }
    if (activeFilters.includes('High Priority')) filtered = filtered.filter(g => g.priority === 'High' || g.priority === 'Critical');
    if (activeFilters.includes('Fraud Alert')) filtered = filtered.filter(g => g.ai_verification_status === 'Rejected');
    if (activeFilters.includes('High Confidence')) filtered = filtered.filter(g => g.confidence === 'High');

    const toReview = [];
    const inProgress = [];
    const flagged = [];
    const resolved = [];

    filtered.forEach(g => {
      if (g.is_resolved) {
        resolved.push(g);
      } else if (g.ai_verification_status === 'Rejected') {
        flagged.push(g);
      } else if (inProgressIds.has(g.id)) {
        inProgress.push(g);
      } else {
        toReview.push(g);
      }
    });

    return { toReview, inProgress, flagged, resolved, total: grievances.length, resolvedToday: resolved.length };
  }, [grievances, searchTerm, activeFilters, inProgressIds]);

  const toggleFilter = (f) => {
    setActiveFilters(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const getSlaInfo = (deadline) => {
    if (!deadline) return { text: "No SLA", color: "var(--text-muted)", urgent: false };
    const diffHours = (new Date(deadline + 'Z') - new Date()) / 3600000;
    if (diffHours < 0) return { text: "OVERDUE", color: "#DC2626", urgent: true };
    if (diffHours < 24) return { text: `${Math.floor(diffHours)}h left`, color: "#EA580C", urgent: true };
    return { text: `${Math.floor(diffHours/24)}d left`, color: "#16A34A", urgent: false };
  };

  const getPriorityColor = (p) => {
    if (p === 'Critical' || p === 'High') return '#DC2626';
    if (p === 'Medium') return '#EAB308';
    return '#6B7280';
  };

  // Drag and Drop Handlers
  const handleDragStart = (e, g, sourceCol) => {
    setDraggedItem({ grievance: g, sourceCol });
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDraggedItem(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    if (dragOverCol !== colId) setDragOverCol(colId);
  };

  const handleDrop = (e, colId) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggedItem) return;
    
    const { grievance, sourceCol } = draggedItem;
    if (sourceCol === colId) return;

    if (colId === 'inProgress') {
      if (grievance.is_resolved) return; 
      setInProgressIds(prev => new Set(prev).add(grievance.id));
    } 
    else if (colId === 'toReview') {
      if (grievance.is_resolved) return;
      setInProgressIds(prev => { const n = new Set(prev); n.delete(grievance.id); return n; });
    }
    else if (colId === 'resolved') {
      setSelectedGrievance(grievance);
    }
  };

  const renderCard = (g, colId) => {
    const sla = getSlaInfo(g.sla_deadline);
    const priColor = getPriorityColor(g.priority);
    const confScore = Math.round((g.confidence_score || 0.8) * 100);
    const isFraud = g.ai_verification_status === 'Rejected';
    
    return (
      <div 
        key={g.id} 
        draggable
        onDragStart={(e) => handleDragStart(e, g, colId)}
        onDragEnd={handleDragEnd}
        onClick={() => setSelectedGrievance(g)}
        style={{ 
          backgroundColor: '#fff', 
          borderRadius: '10px', 
          padding: '1rem', 
          marginBottom: '1rem', 
          cursor: 'grab', 
          boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
          border: '1px solid #E5E7EB',
          borderLeft: `4px solid ${priColor}`,
          position: 'relative'
        }}
        className="op-card"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280' }}>#{g.id}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: priColor, backgroundColor: priColor+'1A', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
              {g.priority || 'Medium'}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: sla.color, backgroundColor: sla.urgent ? '#FEE2E2' : 'transparent', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
            {sla.text}
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span>{getCategoryIcon(g.prediction)}</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>{(g.prediction || 'Issue').replace('Department', '').trim()}</span>
        </div>
        
        <p style={{ fontSize: '0.85rem', color: '#4B5563', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
          {g.transcript}
        </p>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F3F4F6', paddingTop: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: confScore > 80 ? '#10B981' : '#F59E0B', display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#F9FAFB', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              <Activity size={12}/> {confScore}% Conf
            </span>
            {isFraud ? (
              <span style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#FEF2F2', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                <ShieldAlert size={12}/> High Risk
              </span>
            ) : (
              <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#ECFDF5', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                <ShieldCheck size={12}/> Safe
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderColumn = (title, id, items, bgTint, countColor) => (
    <div 
      onDragOver={(e) => handleDragOver(e, id)}
      onDrop={(e) => handleDrop(e, id)}
      style={{ 
        backgroundColor: dragOverCol === id ? '#E5E7EB' : bgTint, 
        borderRadius: '12px', 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        minWidth: '300px',
        border: dragOverCol === id ? '2px dashed #9CA3AF' : '2px solid transparent',
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ padding: '1.25rem 1rem 0.75rem 1rem', borderBottom: '2px solid rgba(0,0,0,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</h3>
        <span style={{ backgroundColor: countColor, color: '#fff', fontSize: '0.75rem', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '12px' }}>{items.length}</span>
      </div>
      <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
        {items.length === 0 ? (
          <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '0.85rem', fontWeight: 500, border: '2px dashed #D1D5DB', borderRadius: '8px' }}>
            No complaints here
          </div>
        ) : (
          items.map(g => renderCard(g, id))
        )}
      </div>
    </div>
  );

  return (
    <div style={{ backgroundColor: '#F9FAFB', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Workspace Header */}
      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #E5E7EB', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <div style={{ width: '40px', height: '40px', backgroundColor: '#FFF7ED', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EA580C' }}>
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.2 }}>
                  {userDepartment === 'All Departments' ? 'Central Operations' : `${userDepartment} Operations`}
                </h1>
                <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>Manage, verify, and resolve civic complaints.</p>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', backgroundColor: '#F3F4F6', borderRadius: '8px', padding: '0.25rem' }}>
              {['Total', 'Pending', 'AI Flagged', 'Resolved'].map((s, i) => (
                <div key={s} style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: i < 3 ? '1px solid #E5E7EB' : 'none' }}>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 700, color: '#6B7280', marginBottom: '0.15rem' }}>{s}</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                    {i===0 ? processedData.total : i===1 ? processedData.toReview.length : i===2 ? processedData.flagged.length : processedData.resolvedToday}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={fetchGrievances} style={{ backgroundColor: '#fff', border: '1px solid #D1D5DB', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#4B5563', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <RefreshCw size={16} className={loading ? 'spin-anim' : ''} />
            </button>
            <button onClick={handleExport} style={{ backgroundColor: '#fff', border: '1px solid #D1D5DB', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4B5563', fontSize: '0.875rem', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input 
              type="text" 
              placeholder="Search complaints, IDs, locations..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.25rem', borderRadius: '8px', border: '1px solid #D1D5DB', outline: 'none', fontSize: '0.875rem', backgroundColor: '#F9FAFB' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderLeft: '1px solid #E5E7EB', paddingLeft: '1rem' }}>
            <Filter size={14} color="#6B7280" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6B7280', marginRight: '0.25rem' }}>FILTERS:</span>
            {['High Priority', 'High Confidence', 'Fraud Alert'].map(f => (
              <button 
                key={f}
                onClick={() => toggleFilter(f)}
                style={{ 
                  backgroundColor: activeFilters.includes(f) ? '#DBEAFE' : '#fff', 
                  color: activeFilters.includes(f) ? '#1E40AF' : '#4B5563', 
                  border: `1px solid ${activeFilters.includes(f) ? '#BFDBFE' : '#D1D5DB'}`, 
                  padding: '0.35rem 0.75rem', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem', 
                  fontWeight: 600, 
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div style={{ flex: 1, padding: '1.5rem 2rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '1.5rem', height: '100%', minWidth: '1200px' }}>
          {renderColumn('To Review', 'toReview', processedData.toReview, '#F3F4F6', '#6B7280')}
          {renderColumn('In Progress', 'inProgress', processedData.inProgress, '#EFF6FF', '#3B82F6')}
          {renderColumn('AI Flagged', 'flagged', processedData.flagged, '#FEF2F2', '#EF4444')}
          {renderColumn('Resolved', 'resolved', processedData.resolved, '#F0FDF4', '#10B981')}
        </div>
      </div>

      {/* Right Drawer for Details */}
      {selectedGrievance && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(2px)' }} onClick={() => setSelectedGrievance(null)}>
          <div 
            style={{ width: '600px', maxWidth: '90%', backgroundColor: '#fff', height: '100%', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827', margin: 0 }}>Ticket #{selectedGrievance.id}</h2>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: getPriorityColor(selectedGrievance.priority), backgroundColor: getPriorityColor(selectedGrievance.priority)+'1A', padding: '0.25rem 0.6rem', borderRadius: '20px' }}>
                  {selectedGrievance.priority || 'Medium'} PRIORITY
                </span>
              </div>
              <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%' }} className="hover-bg-gray">
                <X size={20} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
              
              {selectedGrievance.ai_verification_status === 'Rejected' && (
                <div style={{ backgroundColor: '#FEF2F2', padding: '1rem', borderRadius: '8px', border: '1px solid #FCA5A5', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <ShieldAlert size={24} color="#DC2626" style={{ flexShrink: 0 }} />
                  <div>
                    <h4 style={{ color: '#991B1B', margin: '0 0 0.25rem 0', fontWeight: 700, fontSize: '0.9rem' }}>High Fraud Risk Detected</h4>
                    <p style={{ color: '#7F1D1D', fontSize: '0.85rem', margin: 0 }}>{selectedGrievance.ai_verification_notes}</p>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>Complaint Details</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{getCategoryIcon(selectedGrievance.prediction)}</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{(selectedGrievance.prediction || 'Unknown').replace('Department', '').trim()} Classification</span>
                </div>
                <p style={{ fontSize: '1rem', color: '#374151', lineHeight: 1.6, backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                  "{selectedGrievance.transcript}"
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Location</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MapPin size={14}/> {selectedGrievance.location || 'Not Provided'}</div>
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Submitted</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={14}/> {new Date(selectedGrievance.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '0.25rem' }}>AI Confidence</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={14}/> {Math.round((selectedGrievance.confidence_score||0.8)*100)}% ({selectedGrievance.confidence})</div>
                </div>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '0.25rem' }}>SLA Deadline</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: getSlaInfo(selectedGrievance.sla_deadline).color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={14}/> {getSlaInfo(selectedGrievance.sla_deadline).text}</div>
                </div>
              </div>

              {(selectedGrievance.before_photo_url || selectedGrievance.after_photo_url) && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>Evidence Photos</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {selectedGrievance.before_photo_url && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, marginBottom: '0.25rem' }}>Citizen Photo (Before)</div>
                        <img src={selectedGrievance.before_photo_url} alt="Before" style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                      </div>
                    )}
                    {selectedGrievance.after_photo_url && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, marginBottom: '0.25rem' }}>Operator Photo (After)</div>
                        <img src={selectedGrievance.after_photo_url} alt="After" style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E5E7EB' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>Resolution Workflow</h3>
                {selectedGrievance.is_resolved ? (
                  <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '1.25rem', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 700, marginBottom: '0.5rem' }}>
                      <CheckCircle size={18} /> Officially Resolved
                    </div>
                    <p style={{ color: '#14532D', fontSize: '0.9rem', margin: 0 }}>{selectedGrievance.resolution_notes || 'No official notes provided.'}</p>
                  </div>
                ) : (
                  <div style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', padding: '1.5rem', borderRadius: '8px' }}>
                    <textarea 
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Enter official resolution notes for the citizen..."
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #D1D5DB', minHeight: '100px', resize: 'vertical', fontFamily: 'inherit', marginBottom: '1rem', fontSize: '0.9rem', outline: 'none' }}
                    />
                    <div style={{ marginBottom: '1.25rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#4B5563', marginBottom: '0.5rem' }}>Attach "After" Verification Photo</label>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => setAfterPhoto(e.target.files[0])} 
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px dashed #9CA3AF', background: '#fff', fontSize: '0.85rem' }} 
                      />
                    </div>
                    <button 
                      className="btn btn-primary" 
                      disabled={resolving} 
                      onClick={handleResolve}
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '0.75rem', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 600, backgroundColor: '#EA580C', color: '#fff', border: 'none', cursor: 'pointer' }}
                    >
                      {resolving ? 'Verifying AI Evidence...' : 'Mark as Resolved'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      <style>{`
        .op-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
        }
        .hover-bg-gray:hover {
          background-color: #E5E7EB !important;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes spinAnim {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-anim {
          animation: spinAnim 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default OperatorDashboard;
