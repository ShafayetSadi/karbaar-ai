import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bn from './locales/bn.json';
import en from './locales/en.json';

export const LANGUAGES = ['en', 'bn'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'commerce-os.language';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** A saved choice wins. Otherwise a Bangla browser starts in Bangla (ADR 0060). */
export function detectLanguage(
  stored: string | null,
  navigatorLanguage: string | undefined,
): Language {
  if (isLanguage(stored)) return stored;
  return (navigatorLanguage ?? '').toLowerCase().startsWith('bn') ? 'bn' : 'en';
}

function storedLanguage(): Language {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private mode); fall through to the browser language.
  }
  const nav = typeof navigator === 'undefined' ? undefined : navigator.language;
  return detectLanguage(stored, nav);
}

/** The dashboard's language now, as an Account language (`bn` or `en`). */
export function currentLanguage(): Language {
  return (i18n.language ?? '').startsWith('bn') ? 'bn' : 'en';
}

export function setLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
  return i18n.changeLanguage(language);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, bn: { translation: bn } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

// Keep <html lang> in step so screen readers and fonts pick the right language.
function syncDocumentLang(language: string) {
  document.documentElement.lang = language;
}
syncDocumentLang(i18n.language);
i18n.on('languageChanged', syncDocumentLang);

export default i18n;
