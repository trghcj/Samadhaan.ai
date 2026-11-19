import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Check, Trash2, Search, X, AlertTriangle, Calendar, MapPin, ChevronRight, UserCheck, ClipboardList, Mic, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../api';
import { deptInfo, formatRef, splitTranscript, routingInfo } from '../utils/grievance';
import LocationView from '../components/LocationView';
import { PageHeader, StatTiles } from '../components/PageLayout';

const CATEGORY_LABELS = { Water: 'Water Supply', Roads: 'Roads', Electricity: 'Electricity', Sanitation: 'Sanitation', Drainage: 'Drainage', 'Street Lights': 'Street Lights', Unclear: 'Under officer review' };

const getCategoryInfo = (prediction) => {
  const d = deptInfo(prediction);
  return { ...d, label: CATEGORY_LABELS[d.key] || prediction || 'Reported Issue' };
};

const CategoryIcon = ({ prediction, size = 18 }) => {
  const d = deptInfo(prediction);
  return (
    <span style={{ width: size + 18, height: size + 18, borderRadius: 10, background: d.bg, color: d.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <d.Icon size={size} />
    </span>
  );
};

// "You chose Sanitation" / "Sent to an officer": the citizen's answer, shown as a chip instead of raw text.
const ClarificationChip = ({ clarification, t }) => {
  if (!clarification || clarification.type === 'other') return null;
  const chose = clarification.type === 'chose';
  return (
    <span className="tag" style={{ background: chose ? '#EFF6FF' : '#FFFBEB', color: chose ? '#1D4ED8' : '#B45309' }}>
      <UserCheck size={12} />
      {chose
        ? t('You chose {{dept}}', { dept: clarification.choice, defaultValue: 'You chose {{dept}}' })
        : t('Sent to an officer', { defaultValue: 'Sent to an officer' })}
    </span>
  );
};

const statusOf = (g) => (g.is_resolved || g.ai_verification_status === 'Verified' ? 'resolved' : 'progress');

const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Submitted -> With <department> -> Resolved
const ProgressTracker = ({ g, t }) => {
  const resolved = statusOf(g) === 'resolved';
  const officer = ['officer', 'scope'].includes(routingInfo(g).tone);
  const dept = deptInfo(g.prediction).key;
  const steps = [
    { label: t('Submitted', { defaultValue: 'Submitted' }), sub: shortDate(g.created_at) },
    {
      label: officer
        ? t('With an officer', { defaultValue: 'With an officer' })
        : t('With {{dept}} dept.', { dept: t(dept, { defaultValue: dept }), defaultValue: 'With {{dept}} dept.' }),
      sub: g.ai_verification_status === 'Rejected' ? t('Fix not verified yet', { defaultValue: 'Fix not verified yet' }) : null,
      warn: g.ai_verification_status === 'Rejected',
    },
    { label: t('Resolved'), sub: resolved && g.resolved_at ? shortDate(g.resolved_at) : null },
  ];
  const doneCount = resolved ? 3 : 2; // routing happens at submission, so step 2 is reached straight away

  return (
    <ol className="tracker">
      {steps.map((s, i) => {
        const done = i < doneCount;
        const current = !resolved && i === 1;
        return (
          <li key={i} className={`tracker-step${done ? ' done' : ''}${current ? ' current' : ''}${s.warn ? ' warn' : ''}`}>
            <span className="tracker-dot">{done && !current ? <Check size={12} strokeWidth={3} /> : null}</span>
            <span className="tracker-text">
              <span className="tracker-label">{s.label}</span>
              {s.sub && <span className="tracker-sub">{s.sub}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

const ExpectedBy = ({ g, t }) => {
  if (statusOf(g) === 'resolved') {
    return <span style={{ color: '#047857', fontWeight: 600 }}>{t('Resolved on {{date}}', { date: shortDate(g.resolved_at || g.created_at), defaultValue: 'Resolved on {{date}}' })}</span>;
  }
  if (!g.sla_deadline) return null;
  const due = new Date(g.sla_deadline + 'Z');
  const overdue = due < new Date();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: overdue ? '#DC2626' : '#374151', fontWeight: 600 }}>
      <Clock size={14} />
      {overdue
        ? t('Overdue since {{date}}', { date: shortDate(due), defaultValue: 'Overdue since {{date}}' })
        : t('Expected by {{date}}', { date: shortDate(due), defaultValue: 'Expected by {{date}}' })}
    </span>
  );
};

const CitizenDashboard = () => {
  const { t } = useTranslation();
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // all, progress, resolved
  const [sortOrder, setSortOrder] = useState('newest');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGrievances = async () => {
      if (!currentUser) return;
      try {
        const res = await fetch(`${API_BASE}/api/grievances/me/${currentUser.uid}`);
        const data = await res.json();
        setGrievances(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchGrievances();
  }, [currentUser]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await fetch(`${API_BASE}/api/grievances/${itemToDelete}`, { method: 'DELETE' });
      setGrievances(prev => prev.filter(item => item.id !== itemToDelete));
      if (selectedIssue && selectedIssue.id === itemToDelete) setSelectedIssue(null);
      setItemToDelete(null);
    } catch (err) {
      console.error(err);
      alert(t("Failed to delete grievance"));
    }
    setIsDeleting(false);
  };

  const filteredAndSorted = useMemo(() => {
    let result = grievances;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().replace(/^#0*/, '');
      result = result.filter(g =>
        (g.transcript || '').toLowerCase().includes(q) ||
        (g.prediction || '').toLowerCase().includes(q) ||
        (g.location || '').toLowerCase().includes(q) ||
        String(g.id).includes(q)
      );
    }
    if (filter !== 'all') result = result.filter(g => statusOf(g) === filter);
    return [...result].sort((a, b) => {
      const diff = new Date(b.created_at) - new Date(a.created_at);
      return sortOrder === 'newest' ? diff : -diff;
    });
  }, [grievances, searchTerm, filter, sortOrder]);

  const stats = useMemo(() => ({
    total: grievances.length,
    progress: grievances.filter(g => statusOf(g) === 'progress').length,
    resolved: grievances.filter(g => statusOf(g) === 'resolved').length,
    overdue: grievances.filter(g => statusOf(g) === 'progress' && g.sla_deadline && new Date(g.sla_deadline + 'Z') < new Date()).length,
  }), [grievances]);

  useEffect(() => {
    document.body.style.overflow = selectedIssue ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [selectedIssue]);

  const FILTERS = [
    ['all', t('All', { defaultValue: 'All' })],
    ['progress', t('In progress', { defaultValue: 'In progress' })],
    ['resolved', t('Resolved')],
  ];
  const sectionTitle = { fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.6rem' };

  return (
    <div className="page-bg">
    <div className="page">

      <PageHeader
        eyebrow={t('Citizen portal', { defaultValue: 'Citizen portal' })}
        title={t('My complaints', { defaultValue: 'My complaints' })}
        subtitle={t('Track the civic problems you have reported.', { defaultValue: 'Track the civic problems you have reported.' })}
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            <Mic size={16} /> {t('New complaint', { defaultValue: 'New complaint' })}
          </button>
        }
      />

      <StatTiles items={[
        { label: t('Total', { defaultValue: 'Total' }), value: loading ? '–' : stats.total, Icon: ClipboardList, tone: 'neutral' },
        { label: t('In progress', { defaultValue: 'In progress' }), value: loading ? '–' : stats.progress, Icon: Clock, tone: 'amber' },
        { label: t('Overdue', { defaultValue: 'Overdue' }), value: loading ? '–' : stats.overdue, Icon: AlertTriangle, tone: 'red' },
        { label: t('Resolved'), value: loading ? '–' : stats.resolved, Icon: Check, tone: 'green' },
      ]} />

      {/* Search, filter, sort */}
      {grievances.length > 0 && (
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Search size={16} />
              <input className="input" type="text" placeholder={t('Search by text, place or reference', { defaultValue: 'Search by text, place or reference' })} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="toolbar-right">
            <div className="segmented" role="group" aria-label={t('Filter by status')}>
              {FILTERS.map(([id, label]) => (
                <button key={id} type="button" className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            <select className="input control" value={sortOrder} onChange={e => setSortOrder(e.target.value)} aria-label={t('Sort')}>
              <option value="newest">{t("Newest First")}</option>
              <option value="oldest">{t("Oldest First")}</option>
            </select>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2].map(i => <div key={i} style={{ height: 170, backgroundColor: '#F3F4F6', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)}
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
        </div>
      ) : grievances.length === 0 ? (
        <div className="panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FFF7F3', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <ClipboardList size={28} />
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t('No complaints yet', { defaultValue: 'No complaints yet' })}</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto 1.5rem' }}>
            {t('Report a civic problem by voice or text and follow its progress here.', { defaultValue: 'Report a civic problem by voice or text and follow its progress here.' })}
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/')} style={{ borderRadius: 10 }}><Mic size={17} /> {t('New complaint', { defaultValue: 'New complaint' })}</button>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
          <Search size={36} style={{ opacity: 0.25, marginBottom: '0.75rem' }} />
          <p>{t('No complaints match your search.', { defaultValue: 'No complaints match your search.' })}</p>
          <button className="link-btn" style={{ marginTop: '0.75rem' }} onClick={() => { setSearchTerm(''); setFilter('all'); }}>{t('Clear filters', { defaultValue: 'Clear filters' })}</button>
        </div>
      ) : (
        <div className="complaint-list">
          {filteredAndSorted.map(g => {
            const cat = getCategoryInfo(g.prediction);
            const { complaint, clarification } = splitTranscript(g.transcript);
            return (
              <div key={g.id} role="button" tabIndex={0} className="complaint-card" onClick={() => setSelectedIssue(g)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIssue(g); } }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                  <CategoryIcon prediction={g.prediction} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>{t(cat.label, { defaultValue: cat.label })}</span>
                      <span className="mono-ref">{formatRef(g.id)}</span>
                    </div>
                    <p dir="auto" style={{ color: '#374151', fontSize: '0.95rem', margin: '0.3rem 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {complaint}
                    </p>
                  </div>
                  <ChevronRight size={20} color="#9CA3AF" style={{ flexShrink: 0, marginTop: 6 }} />
                </div>

                <ProgressTracker g={g} t={t} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    {g.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><MapPin size={14} /> {g.location}</span>}
                    <ClarificationChip clarification={clarification} t={t} />
                  </div>
                  <ExpectedBy g={g} t={t} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details modal */}
      {selectedIssue && (() => {
        const g = selectedIssue;
        const cat = getCategoryInfo(g.prediction);
        const { complaint, clarification } = splitTranscript(g.transcript);
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setSelectedIssue(null)}>
            <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
              style={{ backgroundColor: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CategoryIcon prediction={g.prediction} size={20} />
                  <div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>{t(cat.label, { defaultValue: cat.label })}</h2>
                    <span className="mono-ref">{t('Reference number', { defaultValue: 'Reference number' })} {formatRef(g.id)}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedIssue(null)} className="icon-btn" style={{ background: '#F3F4F6', color: 'var(--text-main)', boxShadow: 'none' }} aria-label={t('Close')}><X size={18} /></button>
              </div>

              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <ProgressTracker g={g} t={t} />
                  <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}><ExpectedBy g={g} t={t} /></div>
                </div>

                <div>
                  <div style={sectionTitle}>{t('Your complaint', { defaultValue: 'Your complaint' })}</div>
                  <div style={{ backgroundColor: '#F8FAFC', padding: '1.1rem', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <p dir="auto" style={{ fontSize: '1rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{complaint}</p>
                    {clarification && (
                      <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <ClarificationChip clarification={clarification} t={t} />
                        {clarification.offered && <span>{t('Options offered', { defaultValue: 'Options offered' })}: {clarification.offered.join(', ')}</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <div style={sectionTitle}>{t('Reported on', { defaultValue: 'Reported on' })}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
                      <Calendar size={16} color="var(--text-muted)" />
                      {new Date(g.created_at).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                </div>

                {(g.location || g.latitude != null) && (
                  <div>
                    <div style={sectionTitle}>{t('Location', { defaultValue: 'Location' })}</div>
                    <LocationView g={g} showDirections={false} />
                  </div>
                )}

                {g.ai_verification_status === 'Rejected' && !g.is_resolved && (
                  <div style={{ display: 'flex', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: '0.9rem' }}>
                    <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                    {t('The department reported a fix, but its photo did not match your complaint. It is still open.', { defaultValue: 'The department reported a fix, but its photo did not match your complaint. It is still open.' })}
                  </div>
                )}

                {g.is_resolved && g.resolution_notes && (
                  <div>
                    <div style={{ ...sectionTitle, color: '#065F46' }}>{t('Note from the department', { defaultValue: 'Note from the department' })}</div>
                    <div style={{ backgroundColor: '#ECFDF5', padding: '1.1rem', borderRadius: 12, border: '1px solid #A7F3D0', color: '#064E3B', fontSize: '0.95rem', lineHeight: 1.5 }}>
                      {g.resolution_notes}
                    </div>
                  </div>
                )}

                {(g.before_photo_url || g.after_photo_url) && (
                  <div>
                    <div style={sectionTitle}>{t('Photos', { defaultValue: 'Photos' })}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                      {g.before_photo_url && (
                        <a href={g.before_photo_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>{t('Your photo', { defaultValue: 'Your photo' })}</div>
                          <img src={g.before_photo_url} alt={t('Your photo', { defaultValue: 'Your photo' })} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                        </a>
                      )}
                      {g.after_photo_url && (
                        <a href={g.after_photo_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>{t('After the fix', { defaultValue: 'After the fix' })}</div>
                          <img src={g.after_photo_url} alt={t('After the fix', { defaultValue: 'After the fix' })} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                  <button type="button" className="link-btn" style={{ color: '#B91C1C' }} onClick={() => setItemToDelete(g.id)}>
                    <Trash2 size={15} /> {t('Delete complaint', { defaultValue: 'Delete complaint' })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {itemToDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setItemToDelete(null)}>
          <div onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true"
            style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#FEE2E2', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Trash2 size={22} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>{t('Delete this complaint?', { defaultValue: 'Delete this complaint?' })}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.75rem', lineHeight: 1.5 }}>
              {t("Are you sure you want to permanently delete this report?")} {t('This cannot be undone.', { defaultValue: 'This cannot be undone.' })}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setItemToDelete(null)} disabled={isDeleting} className="btn btn-outline" style={{ flex: 1, borderRadius: 8 }}>{t("Cancel")}</button>
              <button onClick={confirmDelete} disabled={isDeleting} className="btn" style={{ flex: 1, borderRadius: 8, background: '#DC2626', color: '#fff' }}>
                {isDeleting ? t("Deleting...") : t("Yes, Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default CitizenDashboard;
