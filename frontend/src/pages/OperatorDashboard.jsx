import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, CheckCircle, Search, X, ShieldAlert, Activity, Calendar, MapPin, Download, RefreshCw, ImagePlus, PlayCircle, Undo2, UserCheck, Inbox, AlertTriangle } from 'lucide-react';
import { PageHeader, StatTiles } from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../api';
import { deptInfo, formatRef, splitTranscript, routingInfo, TONE_COLORS, slaInfo } from '../utils/grievance';
import LocationView from '../components/LocationView';
import TranslateBox from '../components/TranslateBox';
import { googleMapsUrl } from '../utils/geo';

// Labels are translation keys (English text); they are passed through t() where shown.
const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'inProgress', label: 'In progress' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'resolved', label: 'Resolved' },
];

const ROUTING_FILTERS = [
  { id: 'all', label: 'All routing' },
  { id: 'auto', label: 'Auto-routed' },
  { id: 'citizen', label: 'Citizen chose' },
  { id: 'officer', label: 'Needs officer' },
  { id: 'waiting', label: 'Awaiting citizen' },
  { id: 'scope', label: 'Out of scope' },
];

const sectionTitle = { fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' };

const DeptBadge = ({ prediction, outOfScope }) => {
  const { t } = useTranslation();
  const d = deptInfo(prediction);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: '#111827', whiteSpace: 'nowrap' }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, background: d.bg, color: d.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <d.Icon size={14} />
      </span>
      {outOfScope ? t('Out of scope') : t(d.key)}
    </span>
  );
};

const RoutingTag = ({ g }) => {
  const { t } = useTranslation();
  const r = routingInfo(g);
  const c = TONE_COLORS[r.tone];
  return <span className="tag" style={{ background: c.bg, color: c.color }}>{t(r.label)}</span>;
};

const OperatorDashboard = () => {
  const { t } = useTranslation();
  const { currentUser, userDepartment } = useAuth();

  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('open');
  const [routingFilter, setRoutingFilter] = useState('all');

  // "In progress" lives in this browser only (no backend field for it yet).
  const [inProgressIds, setInProgressIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('inProgressIds') || '[]')); }
    catch { return new Set(); }
  });

  const [selectedGrievance, setSelectedGrievance] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [spinning, setSpinning] = useState(false);

  // Refresh button: the icon turns clockwise for at least one full turn, longer if the reload is slower.
  const handleRefresh = async () => {
    if (spinning) return;
    setSpinning(true);
    const started = Date.now();
    await fetchGrievances();
    setTimeout(() => setSpinning(false), Math.max(0, 800 - (Date.now() - started)));
  };

  const afterPhotoUrl = useMemo(() => (afterPhoto ? URL.createObjectURL(afterPhoto) : null), [afterPhoto]);
  useEffect(() => () => { if (afterPhotoUrl) URL.revokeObjectURL(afterPhotoUrl); }, [afterPhotoUrl]);

  const fetchGrievances = async () => {
    setLoading(true);
    try {
      const url = currentUser ? `${API_BASE}/api/grievances?uid=${currentUser.uid}` : `${API_BASE}/api/grievances`;
      const response = await fetch(url);
      const data = await response.json();
      setGrievances(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch grievances", err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchGrievances(); }, [currentUser]);

  useEffect(() => {
    try { localStorage.setItem('inProgressIds', JSON.stringify(Array.from(inProgressIds))); } catch { /* storage unavailable */ }
  }, [inProgressIds]);

  const closeDrawer = () => { setSelectedGrievance(null); setReviewNotes(''); setAfterPhoto(null); };

  const setInProgress = (id, on) => {
    setInProgressIds(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  };

  const handleResolve = async () => {
    if (!afterPhoto && !window.confirm(t("You are resolving this without an 'After' photo. AI Verification will be skipped. Proceed?"))) return;

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
      const response = await fetch(`${API_BASE}/api/grievances/${selectedGrievance.id}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: reviewNotes, after_photo_url: uploadedUrl })
      });
      const data = await response.json();

      if (data.status === 'error') {
        alert(`${t('AI Verification Failed:')}\n\n${data.reason}\n\n${t('Please upload a valid photo showing the exact issue repaired.')}`);
      } else {
        setInProgress(selectedGrievance.id, false);
        closeDrawer();
        fetchGrievances();
      }
    } catch {
      alert(t("Failed to connect to server for resolution."));
    }
    setResolving(false);
  };

  // CSV column names stay in English so exported files are the same whatever the page language.
  const handleExport = () => {
    if (grievances.length === 0) return alert(t("No data to export"));
    const headers = ['ID', 'Transcript', 'Prediction', 'Confidence', 'Priority', 'SLA Deadline', 'Status', 'Location', 'House / Street', 'Landmark', 'PIN Code', 'Latitude', 'Longitude', 'Map Link', 'Submitted Date'];
    const csvRows = [headers.join(',')];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    grievances.forEach(g => {
      const hasPin = g.latitude != null && g.longitude != null;
      const row = [
        g.id,
        q(g.transcript),
        g.prediction,
        g.confidence,
        g.priority,
        g.sla_deadline,
        g.is_resolved ? 'Resolved' : (g.ai_verification_status === 'Rejected' ? 'AI Flagged' : 'Pending'),
        q(g.location),
        q(g.address_line),
        q(g.landmark),
        q(g.pincode),
        hasPin ? g.latitude : '',
        hasPin ? g.longitude : '',
        hasPin ? q(googleMapsUrl(g.latitude, g.longitude)) : '',
        new Date(g.created_at).toISOString()
      ];
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `complaints_export_${new Date().toISOString().slice(0, 10)}.csv`);
    a.click();
  };

  const { byTab, counts } = useMemo(() => {
    const tabOf = (g) => {
      if (g.is_resolved) return 'resolved';
      if (g.ai_verification_status === 'Rejected') return 'flagged';
      if (inProgressIds.has(g.id)) return 'inProgress';
      return 'open';
    };
    let filtered = grievances;
    if (searchTerm) {
      const q = searchTerm.toLowerCase().replace(/^#0*/, '');
      filtered = filtered.filter(g =>
        (g.transcript || '').toLowerCase().includes(q) ||
        g.id.toString().includes(q) ||
        (g.location || '').toLowerCase().includes(q)
      );
    }
    if (routingFilter !== 'all') filtered = filtered.filter(g => routingInfo(g).tone === routingFilter);

    const groups = { open: [], inProgress: [], flagged: [], resolved: [] };
    filtered.forEach(g => groups[tabOf(g)].push(g));
    // Open work: soonest deadline first. Resolved: most recently resolved first.
    const due = (g) => (g.sla_deadline ? new Date(g.sla_deadline + 'Z').getTime() : Infinity);
    ['open', 'inProgress', 'flagged'].forEach(k => groups[k].sort((a, b) => due(a) - due(b)));
    groups.resolved.sort((a, b) => new Date(b.resolved_at || b.created_at) - new Date(a.resolved_at || a.created_at));

    return { byTab: groups, counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])) };
  }, [grievances, searchTerm, routingFilter, inProgressIds]);

  const rows = byTab[activeTab];
  const overdue = byTab.open.concat(byTab.inProgress).filter(g => slaInfo(g.sla_deadline).overdue).length;
  const title = userDepartment === 'All Departments' ? t('All departments') : userDepartment ? t(userDepartment) : t('Department');
  const tabLabel = (id) => t(TABS.find(tab => tab.id === id).label);
  const slaText = (sla) => t(sla.key, { count: sla.count });

  return (
    <div className="page-bg">
      <div className="page">

        <PageHeader
          eyebrow={t('Complaint register')}
          title={title}
          subtitle={t('Complaints routed to your department, soonest deadline first.')}
          actions={<>
            <button className="btn btn-outline" onClick={handleRefresh} disabled={spinning} aria-label={t('Refresh')} aria-busy={spinning}>
              <RefreshCw size={15} className={spinning || loading ? 'spin-cw' : ''} /> {t('Refresh')}
            </button>
            <button className="btn btn-outline" onClick={handleExport}>
              <Download size={15} /> {t('Export CSV')}
            </button>
          </>}
        />

        <StatTiles items={[
          { label: t('Open'), value: counts.open, Icon: Inbox, tone: 'neutral' },
          { label: t('In progress'), value: counts.inProgress, Icon: PlayCircle, tone: 'blue' },
          { label: t('Overdue'), value: overdue, Icon: AlertTriangle, tone: 'red' },
          { label: t('Resolved'), value: counts.resolved, Icon: CheckCircle, tone: 'green' },
        ]} />

        {/* Tabs */}
        <div className="tabs" role="tablist">
          {TABS.map(tab => (
            <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={`tab${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.id === 'flagged' && counts.flagged > 0 && <ShieldAlert size={14} color="#DC2626" />}
              {t(tab.label)} <span className="count">{counts[tab.id]}</span>
            </button>
          ))}
        </div>

        {/* Search + filter */}
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Search size={16} />
              <input className="input" type="text" placeholder={t('Search by reference, text or location')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="toolbar-right">
            <select className="input control" value={routingFilter} onChange={e => setRoutingFilter(e.target.value)} aria-label={t('Filter by routing')}>
              {ROUTING_FILTERS.map(f => <option key={f.id} value={f.id}>{t(f.label)}</option>)}
            </select>
          </div>
        </div>

        {/* Register table */}
        <div className="panel">
          {loading && grievances.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>{t('Loading complaints…')}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#6B7280' }}>
              <Inbox size={32} style={{ opacity: 0.35, marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, color: '#374151' }}>{t('Nothing here')}</div>
              <div style={{ fontSize: '0.875rem' }}>
                {searchTerm || routingFilter !== 'all'
                  ? t('No complaints match your search or filter.')
                  : t('No complaints in "{{tab}}".', { tab: tabLabel(activeTab) })}
              </div>
            </div>
          ) : (
            <>
            <div className="register-scroll">
            <table className="register">
              <thead>
                <tr>
                  <th style={{ width: 96 }}>{t('Ref')}</th>
                  <th>{t('Complaint')}</th>
                  <th>{t('Department')}</th>
                  <th>{t('Location')}</th>
                  <th>{t('Routing')}</th>
                  <th style={{ width: 110 }}>{activeTab === 'resolved' ? t('Resolved') : t('Due')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(g => {
                  const { complaint } = splitTranscript(g.transcript);
                  const sla = slaInfo(g.sla_deadline);
                  const outOfScope = routingInfo(g).tone === 'scope';
                  return (
                    <tr key={g.id} onClick={() => setSelectedGrievance(g)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelectedGrievance(g); }}>
                      <td className="ref">{formatRef(g.id)}</td>
                      <td>
                        <div className="excerpt" dir="auto">{complaint || '—'}</div>
                        <div className="sub"><Calendar size={12} /> {new Date(g.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          {g.ai_verification_status === 'Rejected' && <span className="tag" style={{ background: '#FEF2F2', color: '#DC2626' }}><ShieldAlert size={11} /> {t('Photo rejected')}</span>}
                        </div>
                      </td>
                      <td><DeptBadge prediction={g.prediction} outOfScope={outOfScope} /></td>
                      <td style={{ color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.latitude != null && g.longitude != null && <MapPin size={12} color="var(--accent)" style={{ marginRight: 4, verticalAlign: '-1px' }} aria-label={t('Map pin')} />}
                        {g.location || '—'}
                      </td>
                      <td><RoutingTag g={g} /></td>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600, color: activeTab === 'resolved' ? '#047857' : sla.color }}>
                        {activeTab === 'resolved'
                          ? (g.resolved_at ? new Date(g.resolved_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : t('Done'))
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>{sla.urgent && <Clock size={13} />}{slaText(sla)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="panel-footer">
              {t('{{count}} complaints in "{{tab}}"', { count: rows.length, tab: tabLabel(activeTab) })}
              {(searchTerm || routingFilter !== 'all') && ` · ${t('search or filter applied')}`}
            </div>
            </>
          )}
        </div>
      </div>

      {/* Ticket drawer */}
      {selectedGrievance && (() => {
        const g = selectedGrievance;
        const { complaint, clarification } = splitTranscript(g.transcript);
        const sla = slaInfo(g.sla_deadline);
        const outOfScope = routingInfo(g).tone === 'scope';
        const inProgress = inProgressIds.has(g.id);
        const box = { border: '1px solid #E5E7EB', borderRadius: 10, padding: '0.85rem 1rem' };
        const k = { fontSize: '0.7rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' };
        const v = { fontSize: '0.9rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '0.45rem' };
        const deptList = (list) => list.map(d => t(d)).join(', ');
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(17,24,39,0.35)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={closeDrawer}>
            <div style={{ width: 560, maxWidth: '100%', backgroundColor: '#fff', height: '100%', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease-out' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.85rem', color: '#6B7280' }}>{formatRef(g.id)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    <DeptBadge prediction={g.prediction} outOfScope={outOfScope} />
                    <RoutingTag g={g} />
                    {inProgress && !g.is_resolved && <span className="tag" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>{t('In progress')}</span>}
                  </div>
                </div>
                <button onClick={closeDrawer} className="icon-btn" style={{ color: '#6B7280', boxShadow: 'none', background: '#F3F4F6' }} aria-label={t('Close')}><X size={18} /></button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                {g.ai_verification_status === 'Rejected' && (
                  <div style={{ backgroundColor: '#FEF2F2', padding: '0.9rem 1rem', borderRadius: 10, border: '1px solid #FCA5A5', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                    <ShieldAlert size={20} color="#DC2626" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ color: '#991B1B', fontWeight: 700, fontSize: '0.9rem' }}>{t('"After" photo was rejected')}</div>
                      <div style={{ color: '#7F1D1D', fontSize: '0.85rem' }}>{g.ai_verification_notes}</div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={sectionTitle}>{t('Complaint')}</div>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '1rem' }}>
                    <p dir="auto" style={{ fontSize: '1rem', color: '#111827', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{complaint}</p>
                    <TranslateBox text={complaint} />
                    {clarification && clarification.type !== 'other' && (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #E5E7EB', fontSize: '0.85rem', color: '#4B5563', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                        <UserCheck size={15} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span>
                          {clarification.type === 'chose'
                            ? t('Citizen chose {{dept}} from {{options}}.', { dept: t(clarification.choice), options: deptList(clarification.offered) })
                            : t("Citizen said none of {{options}} fit; needs an officer's decision.", { options: deptList(clarification.offered) })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={sectionTitle}>{t('Location')}</div>
                  <div style={{ ...box, padding: '1rem' }}><LocationView g={g} showDirections /></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={box}><div style={k}>{t('Submitted')}</div><div style={v}><Calendar size={14} color="#6B7280" /> {new Date(g.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
                  <div style={box}><div style={k}>{t('Model confidence')}</div><div style={v}><Activity size={14} color="#6B7280" /> {g.confidence_score != null ? `${Math.round(g.confidence_score * 100)}%` : '—'} <span style={{ fontWeight: 500, color: '#6B7280' }}>({t(g.confidence)})</span></div></div>
                  <div style={box}><div style={k}>{t('Due')}</div><div style={{ ...v, color: g.is_resolved ? '#047857' : sla.color }}><Clock size={14} /> {g.is_resolved ? t('Resolved') : slaText(sla)}</div></div>
                </div>

                {(g.before_photo_url || g.after_photo_url) && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={sectionTitle}>{t('Photos')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      {g.before_photo_url && (
                        <a href={g.before_photo_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, marginBottom: '0.25rem' }}>{t('Citizen (before)')}</div>
                          <img src={g.before_photo_url} alt={t('Citizen (before)')} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid #E5E7EB' }} />
                        </a>
                      )}
                      {g.after_photo_url && (
                        <a href={g.after_photo_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                          <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600, marginBottom: '0.25rem' }}>{t('Officer (after)')}</div>
                          <img src={g.after_photo_url} alt={t('Officer (after)')} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10, border: '1px solid #E5E7EB' }} />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <div style={sectionTitle}>{t('Action')}</div>
                  {g.is_resolved ? (
                    <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '1rem', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 700, marginBottom: '0.35rem' }}>
                        <CheckCircle size={18} />
                        {g.resolved_at ? t('Resolved on {{date}}', { date: new Date(g.resolved_at).toLocaleDateString() }) : t('Resolved')}
                      </div>
                      <p style={{ color: '#14532D', fontSize: '0.9rem' }}>{g.resolution_notes || t('No notes provided.')}</p>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.75rem 1rem', border: '1px solid #E5E7EB', borderRadius: 10, marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#374151' }}>{inProgress ? t('Work has started on this complaint.') : t('Not started yet.')}</span>
                        {inProgress ? (
                          <button className="link-btn muted" onClick={() => setInProgress(g.id, false)}><Undo2 size={14} /> {t('Move back to open')}</button>
                        ) : (
                          <button className="btn btn-outline" style={{ padding: '0.45rem 0.9rem', fontSize: '0.875rem', borderRadius: 8 }} onClick={() => setInProgress(g.id, true)}><PlayCircle size={15} /> {t('Start work')}</button>
                        )}
                      </div>

                      <div className="field">
                        <label className="field-label">{t('Resolution notes for the citizen')}</label>
                        <textarea className="input" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder={t('What was done, and when')} />
                      </div>
                      <div className="field" style={{ marginBottom: '1.25rem' }}>
                        <label className="field-label">{t('"After" photo')} <span className="optional">· {t('used to verify the fix')}</span></label>
                        {afterPhotoUrl ? (
                          <div className="photo-preview">
                            <img src={afterPhotoUrl} alt="" />
                            <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{afterPhoto.name}</div>
                            <button type="button" className="icon-btn" style={{ color: '#6B7280' }} onClick={() => setAfterPhoto(null)} aria-label={t('Remove photo')}><X size={16} /></button>
                          </div>
                        ) : (
                          <label className="photo-drop">
                            <span className="photo-icon"><ImagePlus size={20} /></span>
                            <span>
                              <span style={{ display: 'block', fontWeight: 600, color: '#111827' }}>{t('Add a photo of the repaired spot')}</span>
                              <span style={{ fontSize: '0.82rem' }}>{t("Compared with the citizen's photo before closing")}</span>
                            </span>
                            <input type="file" accept="image/*" hidden onChange={e => setAfterPhoto(e.target.files[0] || null)} />
                          </label>
                        )}
                      </div>
                      <button className="btn btn-primary" disabled={resolving} onClick={handleResolve} style={{ width: '100%', padding: '0.8rem', borderRadius: 10 }}>
                        {resolving ? t('Checking the photo…') : <><CheckCircle size={17} /> {t('Mark as resolved')}</>}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
};

export default OperatorDashboard;
