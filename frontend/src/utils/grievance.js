// Shared display helpers for complaints (citizen portal, citizen dashboard, operator register).
import { Droplet, Zap, Construction, Trash2, Waves, Lightbulb, HelpCircle, FileText } from 'lucide-react';

const DEPARTMENTS = [
  { key: 'Water', match: ['water'], Icon: Droplet, color: '#0284C7', bg: '#E0F2FE' },
  { key: 'Electricity', match: ['electric'], Icon: Zap, color: '#CA8A04', bg: '#FEF9C3' },
  { key: 'Roads', match: ['road'], Icon: Construction, color: '#C2410C', bg: '#FFEDD5' },
  { key: 'Sanitation', match: ['sanitation', 'waste'], Icon: Trash2, color: '#15803D', bg: '#DCFCE7' },
  { key: 'Drainage', match: ['drainage'], Icon: Waves, color: '#0F766E', bg: '#CCFBF1' },
  { key: 'Street Lights', match: ['light'], Icon: Lightbulb, color: '#7C3AED', bg: '#EDE9FE' },
];
const UNCLEAR = { key: 'Unclear', Icon: HelpCircle, color: '#64748B', bg: '#F1F5F9' };
const OTHER = { key: 'Other', Icon: FileText, color: '#64748B', bg: '#F1F5F9' };

/** Department display info for a prediction string such as "Sanitation" or "Water Department (Mock)". */
export function deptInfo(prediction) {
  const p = (prediction || '').toLowerCase();
  if (!p) return OTHER;
  if (p.includes('unclear') || p.includes('error') || p.includes('unknown')) return UNCLEAR;
  return DEPARTMENTS.find((d) => d.match.some((m) => p.includes(m))) || { ...OTHER, key: prediction };
}

/** "#000014" */
export const formatRef = (id) => `#${String(id ?? '').padStart(6, '0')}`;

const CLAR_RE = /\s*\[Citizen Clarification\]:\s*(.*)$/s;

/**
 * The backend appends "[Citizen Clarification]: chose X (offered: A, B)" or
 * "[Citizen Clarification]: none of the offered departments (A, B)" to the transcript.
 * Split it off for display; the stored text is unchanged.
 */
export function splitTranscript(text) {
  const raw = text || '';
  const m = raw.match(CLAR_RE);
  if (!m) return { complaint: raw.trim(), clarification: null };
  const complaint = raw.slice(0, m.index).trim();
  const tail = m[1].trim();
  const chose = tail.match(/^chose (.+?) \(offered: (.*)\)$/);
  if (chose) return { complaint, clarification: { type: 'chose', choice: chose[1], offered: chose[2].split(',').map((s) => s.trim()) } };
  const none = tail.match(/^none of the offered departments \((.*)\)$/);
  if (none) return { complaint, clarification: { type: 'none', offered: none[1].split(',').map((s) => s.trim()) } };
  return { complaint, clarification: { type: 'other', text: tail } };
}

/** How the complaint reached its department. tone: 'auto' | 'citizen' | 'officer' | 'waiting' | 'scope' */
export function routingInfo(g) {
  if (g.prediction === 'Unclear' && g.confidence === 'High') return { tone: 'scope', label: 'Out of scope' };
  if (g.confidence === 'Confirmed by citizen') return { tone: 'citizen', label: 'Citizen chose' };
  if (g.confidence === 'Low' || g.prediction === 'Unclear') return { tone: 'officer', label: 'Needs officer' };
  if (g.confidence === 'Medium' || g.clarifying_question) return { tone: 'waiting', label: 'Awaiting citizen' };
  return { tone: 'auto', label: 'Auto-routed' };
}

export const TONE_COLORS = {
  auto: { color: '#047857', bg: '#ECFDF5' },
  citizen: { color: '#1D4ED8', bg: '#EFF6FF' },
  officer: { color: '#B45309', bg: '#FFFBEB' },
  waiting: { color: '#6B7280', bg: '#F3F4F6' },
  scope: { color: '#6B7280', bg: '#F3F4F6' },
};

/**
 * Days/hours left until the SLA deadline (stored as naive UTC).
 * `key` + `count` are for translation: t(sla.key, { count: sla.count }); `text` is the English form.
 */
export function slaInfo(deadline) {
  if (!deadline) return { key: '—', text: '—', color: '#9CA3AF', urgent: false, overdue: false };
  const hours = (new Date(deadline + 'Z') - new Date()) / 3600000;
  if (hours < 0) return { key: 'Overdue', text: 'Overdue', color: '#DC2626', urgent: true, overdue: true };
  if (hours < 24) {
    const count = Math.max(1, Math.floor(hours));
    return { key: '{{count}}h left', count, text: `${count}h left`, color: '#EA580C', urgent: true, overdue: false };
  }
  const count = Math.floor(hours / 24);
  return { key: '{{count}}d left', count, text: `${count}d left`, color: '#4B5563', urgent: false, overdue: false };
}
