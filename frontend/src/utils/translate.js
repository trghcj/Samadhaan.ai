// Complaint translation for operators, through Google Translate's free web endpoint (no API key).
// Unofficial endpoint: fine for the demo; it may change. The complaint text is sent to Google.

const DEVANAGARI = /[ऀ-ॿ]/;

/** True when the text contains Hindi (Devanagari) script. */
export const hasHindiScript = (text) => DEVANAGARI.test(text || '');

/** Translate to English. Resolves to { text, from } (from = detected language code), or throws. */
export async function translateToEnglish(text, signal) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Translate failed: HTTP ${res.status}`);
  const data = await res.json();
  const out = (data?.[0] || []).map((part) => part?.[0] || '').join('').trim();
  if (!out) throw new Error('Translate returned no text');
  return { text: out, from: typeof data?.[2] === 'string' ? data[2] : null };
}
