import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.js';
import hi from './locales/hi.js';
import bn from './locales/bn.js';
import te from './locales/te.js';
import ta from './locales/ta.js';
import mr from './locales/mr.js';
import es from './locales/es.js';
import fr from './locales/fr.js';

// Keys are the English text itself; a missing translation shows the English key.
// Run `npm run check:i18n` to list keys used in the code that a language does not have.
export const LOCALES = { en, hi, bn, te, ta, mr, es, fr };

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: Object.fromEntries(Object.entries(LOCALES).map(([lng, translation]) => [lng, { translation }])),
    fallbackLng: 'en',
    supportedLngs: Object.keys(LOCALES),
    // Keys contain '.' and ':' ("Water Dept.", "The AI encountered an error:"), so no key/namespace separators.
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
  });

// Keep <html lang> in step with the chosen language (screen readers, fonts, hyphenation).
const setHtmlLang = (lng) => { if (typeof document !== 'undefined') document.documentElement.lang = lng || 'en'; };
setHtmlLang(i18n.resolvedLanguage);
i18n.on('languageChanged', setHtmlLang);

export default i18n;
