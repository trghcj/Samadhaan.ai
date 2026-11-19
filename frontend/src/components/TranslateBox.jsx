import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Loader2 } from 'lucide-react';
import { hasHindiScript, translateToEnglish } from '../utils/translate';

/**
 * "Translate to English" for a complaint in the operator ticket panel.
 * The original text is never changed; the English version is shown under it on request.
 */
const TranslateBox = ({ text }) => {
  const { t } = useTranslation();
  const [state, setState] = useState({ status: 'idle', text: null, from: null }); // idle | loading | done | error
  const [shown, setShown] = useState(false);
  const ctrl = useRef(null);

  // A different complaint: forget the previous translation.
  useEffect(() => {
    setState({ status: 'idle', text: null, from: null });
    setShown(false);
    return () => ctrl.current?.abort();
  }, [text]);

  if (!text || !text.trim()) return null;

  const translate = async () => {
    if (state.status === 'done') { setShown(true); return; }
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setState({ status: 'loading', text: null, from: null });
    try {
      const r = await translateToEnglish(text, ctrl.current.signal);
      setState({ status: 'done', text: r.text, from: r.from });
      setShown(true);
    } catch (e) {
      if (e.name !== 'AbortError') setState({ status: 'error', text: null, from: null });
    }
  };

  const alreadyEnglish = state.status === 'done' && state.from === 'en';

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {!shown ? (
        <button type="button" className="btn btn-outline" onClick={translate} disabled={state.status === 'loading'}
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', borderRadius: 8, background: '#fff' }}>
          {state.status === 'loading' ? <Loader2 size={14} className="spin-anim" /> : <Languages size={14} />}
          {state.status === 'loading' ? t('Translating…') : t('Translate to English')}
          {state.status === 'idle' && hasHindiScript(text) && <span className="tag" style={{ background: '#F3F4F6', color: '#4B5563', marginLeft: 4 }}>{t('Hindi')}</span>}
        </button>
      ) : (
        <div className="translation">
          <div className="translation-head">
            <span><Languages size={13} /> {alreadyEnglish ? t('This complaint is already in English.') : t('English translation')}</span>
            <button type="button" className="link-btn muted" style={{ fontSize: '0.78rem' }} onClick={() => setShown(false)}>{t('Show original only')}</button>
          </div>
          {!alreadyEnglish && <p dir="auto" style={{ margin: 0, lineHeight: 1.55 }}>{state.text}</p>}
          <div className="translation-foot">{t('Translated by Google. Check important details with the original.')}</div>
        </div>
      )}
      {state.status === 'error' && !shown && (
        <div style={{ fontSize: '0.8rem', color: '#B45309', marginTop: '0.35rem' }}>{t("Couldn't translate right now. Please try again.")}</div>
      )}
    </div>
  );
};

export default TranslateBox;
