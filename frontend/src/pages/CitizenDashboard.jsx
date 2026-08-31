import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, CheckCircle, Navigation, Trash2, Search, X, AlertTriangle, ChevronDown, Calendar, MapPin, Tag, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const getCategoryInfo = (prediction) => {
  const pred = (prediction || '').toLowerCase();
  if (pred.includes('water')) return { icon: '💧', label: 'Water Issue' };
  if (pred.includes('road')) return { icon: '🛣️', label: 'Road Damage' };
  if (pred.includes('electric')) return { icon: '⚡', label: 'Electricity' };
  if (pred.includes('sanitation') || pred.includes('waste')) return { icon: '🗑️', label: 'Sanitation' };
  if (pred.includes('drainage')) return { icon: '🚰', label: 'Drainage' };
  if (pred.includes('light')) return { icon: '💡', label: 'Streetlight' };
  if (pred.includes('error') || pred.includes('unclear') || pred.includes('unknown')) return { icon: '⚠️', label: 'Uncategorized Issue' };
  return { icon: '📄', label: prediction || 'Reported Issue' };
};

const getStatusInfo = (g) => {
  if (g.is_resolved) return { id: 'resolved', label: 'Resolved', color: '#10B981', bg: '#D1FAE5', icon: <CheckCircle size={14} /> };
  if (g.ai_verification_status === 'Rejected') return { id: 'rejected', label: 'Rejected', color: '#EF4444', bg: '#FEE2E2', icon: <AlertTriangle size={14} /> };
  if (g.ai_verification_status === 'Verified') return { id: 'resolved', label: 'Resolved', color: '#10B981', bg: '#D1FAE5', icon: <CheckCircle size={14} /> }; // fallback
  return { id: 'pending', label: 'Pending Review', color: '#F59E0B', bg: '#FEF3C7', icon: <Clock size={14} /> };
};

const CitizenDashboard = () => {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, pending, resolved
  const [sortOrder, setSortOrder] = useState('newest'); // newest, oldest
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGrievances = async () => {
      if (!currentUser) return;
      try {
        const res = await fetch(`https://samadhaan-ai.onrender.com/api/grievances/me/${currentUser.uid}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setGrievances(data);
        } else {
          setGrievances([]);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchGrievances();
  }, [currentUser]);

  const handleDeleteClick = (e, id) => {
    e.stopPropagation(); // prevent modal opening
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await fetch(`https://samadhaan-ai.onrender.com/api/grievances/${itemToDelete}`, { method: 'DELETE' });
      setGrievances(prev => prev.filter(item => item.id !== itemToDelete));
      if (selectedIssue && selectedIssue.id === itemToDelete) setSelectedIssue(null);
      setItemToDelete(null);
    } catch(err) {
      console.error(err);
      alert("Failed to delete grievance");
    }
    setIsDeleting(false);
  };

  const filteredAndSorted = useMemo(() => {
    let result = grievances;
    
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(g => 
        (g.transcript || '').toLowerCase().includes(q) ||
        (g.prediction || '').toLowerCase().includes(q) ||
        (g.location || '').toLowerCase().includes(q)
      );
    }
    
    if (filter !== 'all') {
      result = result.filter(g => {
        const s = getStatusInfo(g);
        return s.id === filter;
      });
    }

    result.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [grievances, searchTerm, filter, sortOrder]);

  const stats = useMemo(() => {
    return {
      total: grievances.length,
      pending: grievances.filter(g => getStatusInfo(g).id === 'pending').length,
      resolved: grievances.filter(g => getStatusInfo(g).id === 'resolved').length,
      rejected: grievances.filter(g => getStatusInfo(g).id === 'rejected').length
    };
  }, [grievances]);

  // Modals lock scroll
  useEffect(() => {
    if (selectedIssue) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = 'auto'; }
  }, [selectedIssue]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
      
      {/* Header Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              My Dashboard
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
              Track and manage the civic issues you've reported.
            </p>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/')} 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '12px', padding: '0.875rem 1.5rem' }}
          >
            <Navigation size={18} />
            Report New Issue
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {[
            { label: 'Total Reports', value: stats.total },
            { label: 'Pending', value: stats.pending, color: '#F59E0B' },
            { label: 'Resolved', value: stats.resolved, color: '#10B981' },
            ...(stats.rejected > 0 ? [{ label: 'Rejected', value: stats.rejected, color: '#EF4444' }] : [])
          ].map((stat, idx) => (
            <div key={idx} style={{ backgroundColor: '#ffffff', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', boxShadow: 'var(--shadow-sm)' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</span>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: stat.color || 'var(--text-main)', lineHeight: 1 }}>{stat.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters and Search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '400px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search my reports..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.75rem', borderRadius: '12px', border: '1px solid var(--border)', outline: 'none', fontSize: '0.95rem' }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['all', 'pending', 'resolved'].map(f => (
            <button 
              key={f} 
              onClick={() => setFilter(f)}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '20px', 
                border: filter === f ? 'none' : '1px solid var(--border)', 
                backgroundColor: filter === f ? 'var(--text-main)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          
          <select 
            value={sortOrder} 
            onChange={e => setSortOrder(e.target.value)}
            style={{ padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', outline: 'none' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
      </div>

      {/* Main Issue List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: '140px', backgroundColor: '#f3f4f6', borderRadius: '16px', animation: 'pulse 1.5s infinite' }} />
          ))}
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
      ) : grievances.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid var(--border)', padding: '5rem 2rem', textAlign: 'center', marginTop: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>No issues reported yet</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 2rem auto' }}>
            Report a civic issue and track its progress directly from your dashboard.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/')} style={{ borderRadius: '12px' }}>
            + Report an Issue
          </button>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
          <Search size={40} style={{ margin: '0 auto 1rem auto', opacity: 0.2 }} />
          <p>No reports match your filters.</p>
          <button onClick={() => { setSearchTerm(''); setFilter('all'); }} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, marginTop: '1rem', cursor: 'pointer' }}>
            Clear Filters
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredAndSorted.map(g => {
            const cat = getCategoryInfo(g.prediction);
            const status = getStatusInfo(g);
            return (
              <div 
                key={g.id} 
                onClick={() => setSelectedIssue(g)}
                style={{ 
                  backgroundColor: '#ffffff', 
                  borderRadius: '16px', 
                  border: '1px solid var(--border)', 
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxShadow: 'var(--shadow-sm)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{cat.icon}</span>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{cat.label}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0.35rem 0.75rem', backgroundColor: status.bg, color: status.color, borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, gap: '0.35rem' }}>
                    {status.icon} {status.label}
                  </div>
                </div>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '1.25rem', paddingLeft: '2.25rem' }}>
                  {g.transcript}
                </p>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Tag size={14} /> {(g.prediction || 'Unknown').replace('Department', '').trim()} Dept.
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Calendar size={14} /> {new Date(g.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      View Details <ArrowRight size={14} />
                    </span>
                    <button 
                      onClick={(e) => handleDeleteClick(e, g.id)}
                      style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0.25rem', transition: 'color 0.2s' }} 
                      onMouseOver={(e) => e.currentTarget.style.color = '#EF4444'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#cbd5e1'}
                      title="Delete Report"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      {selectedIssue && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedIssue(null)}>
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
          >
            {/* Modal Header */}
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 10, borderRadius: '20px 20px 0 0' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.75rem' }}>{getCategoryInfo(selectedIssue.prediction).icon}</span>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                    {getCategoryInfo(selectedIssue.prediction).label}
                  </h2>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                  Report ID: #{selectedIssue.id.toString().padStart(6, '0')}
                </div>
              </div>
              <button onClick={() => setSelectedIssue(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-main)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Status Timeline */}
              <div>
                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '1rem' }}>Resolution Status</h4>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  {(() => {
                    const status = getStatusInfo(selectedIssue);
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: status.color }}>
                        <div style={{ padding: '0.5rem', backgroundColor: status.bg, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {status.icon}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{status.label}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {status.id === 'resolved' && selectedIssue.resolved_at 
                              ? `Completed on ${new Date(selectedIssue.resolved_at).toLocaleDateString()}`
                              : `Handled by ${(selectedIssue.prediction || 'Unknown').replace('Department', '').trim()} Dept.`}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Full Description */}
              <div>
                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem' }}>Report Details</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <p style={{ color: 'var(--text-main)', fontSize: '1rem', lineHeight: 1.6, margin: 0 }}>
                    "{selectedIssue.transcript}"
                  </p>
                </div>
              </div>

              {/* Metadata Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>Reported On</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 500, fontSize: '0.95rem' }}>
                    <Calendar size={16} color="var(--text-muted)" />
                    {new Date(selectedIssue.created_at).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                {selectedIssue.location && (
                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>Location</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)', fontWeight: 500, fontSize: '0.95rem' }}>
                      <MapPin size={16} color="var(--text-muted)" />
                      {selectedIssue.location}
                    </div>
                  </div>
                )}
              </div>

              {/* Resolution Notes (If Resolved) */}
              {selectedIssue.is_resolved && selectedIssue.resolution_notes && (
                <div>
                  <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#065F46', fontWeight: 700, marginBottom: '0.75rem' }}>Official Resolution Notes</h4>
                  <div style={{ backgroundColor: '#D1FAE5', padding: '1.25rem', borderRadius: '12px', border: '1px solid #34D399', color: '#064E3B' }}>
                    <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5 }}>
                      {selectedIssue.resolution_notes}
                    </p>
                  </div>
                </div>
              )}

              {/* Uploaded Photos */}
              {(selectedIssue.before_photo_url || selectedIssue.after_photo_url) && (
                <div>
                  <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem' }}>Attached Evidence</h4>
                  <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    {selectedIssue.before_photo_url && (
                      <div style={{ flex: '0 0 auto', width: '200px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>Before</div>
                        <img src={selectedIssue.before_photo_url} alt="Before" style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                      </div>
                    )}
                    {selectedIssue.after_photo_url && (
                      <div style={{ flex: '0 0 auto', width: '200px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>After (Resolved)</div>
                        <img src={selectedIssue.after_photo_url} alt="After" style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }} onClick={() => setItemToDelete(null)}>
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <Trash2 size={24} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.5rem' }}>Delete Report</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete this report? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: '#fff', color: 'var(--text-main)', fontWeight: 600, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: '#EF4444', color: '#fff', fontWeight: 600, cursor: isDeleting ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s' }}
                onMouseOver={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#DC2626')}
                onMouseOut={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = '#EF4444')}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default CitizenDashboard;
