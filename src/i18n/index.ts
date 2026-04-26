/**
 * i18next bootstrap.
 *
 * Strategy:
 *   • Detect language from localStorage → navigator → fallback to "en".
 *   • Persist the user's choice to localStorage under `mapped.lang`.
 *   • English is the always-loaded fallback; other locales are imported
 *     statically so the language switch is instant (no async chunk wait).
 *     This adds ~5-15kb gzipped per locale; acceptable for the launch set.
 *   • RTL handling lives in `applyDirection()` — wire it up once at app
 *     boot AND re-run on every language change so <html dir> stays in sync.
 *
 * Adding a new language:
 *   1. Add it to LANGUAGES in ./languages.ts
 *   2. Create src/i18n/locales/{code}.json (copy en.json as a stub)
 *   3. Import + register it in the `resources` map below
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { LANGUAGES, isRtl, type LanguageCode } from "./languages";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  ar: { translation: ar },
} as const;

// Stub locales (no translation file yet) all fall back to English. Listing them
// here lets the LanguageSwitcher offer them without i18next warning at runtime.
const STUB_FALLBACK = LANGUAGES
  .map((l) => l.code)
  .filter((c) => !(c in resources));

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // matches "fr" → "fr-CA" if needed
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "mapped.lang",
      caches: ["localStorage"],
    },
    returnEmptyString: false, // empty stub strings → use fallback
  });

// For stub languages we explicitly map them to the English bundle so
// `t()` returns English text rather than the raw key.
STUB_FALLBACK.forEach((code) => {
  if (!i18n.hasResourceBundle(code, "translation")) {
    i18n.addResourceBundle(code, "translation", en, true, true);
  }
});

/** Sync <html lang> + <html dir> with the active language. */
export function applyDirection(lang: string) {
  const root = document.documentElement;
  root.setAttribute("lang", lang);
  root.setAttribute("dir", isRtl(lang) ? "rtl" : "ltr");
}

// Initial sync + listen for changes
applyDirection(i18n.language || "en");
i18n.on("languageChanged", (lng) => applyDirection(lng));

export const setLanguage = (code: LanguageCode) => i18n.changeLanguage(code);

export default i18n;
