/**
 * Supported language registry for the MAPPED platform.
 *
 * Each entry carries:
 *   • `code`    — BCP-47 tag used by i18next, <html lang>, and Intl APIs.
 *   • `label`   — human-readable name in English (for QA / debug).
 *   • `native`  — endonym shown in the language switcher dropdown so users
 *                 can find their language without knowing English.
 *   • `dir`     — text direction. Drives `<html dir>` so RTL scripts (Arabic,
 *                 Persian, Urdu) flip the layout automatically.
 *   • `flag`    — emoji shorthand for the dropdown row.
 *
 * The 20-language launch set targets the World Bank Youth Summit 2026
 * audience: major youth-employment regions across LATAM, MENA, sub-Saharan
 * Africa, South + East Asia, francophone Africa, and CIS countries.
 *
 * Phase 1 fully translated: en, es, fr, ar.
 * Other locales fall back to English via i18next's `fallbackLng` until a
 * follow-up batch translation pass populates them.
 */
export type LanguageCode =
  | "en" | "es" | "fr" | "ar" | "pt" | "de" | "zh" | "hi" | "bn" | "ja"
  | "ru" | "sw" | "tr" | "id" | "vi" | "fa" | "ur" | "am" | "ha" | "fr-CA";

export type Direction = "ltr" | "rtl";

export interface LanguageDef {
  code: LanguageCode;
  label: string;
  native: string;
  dir: Direction;
  flag: string;
}

export const LANGUAGES: LanguageDef[] = [
  { code: "en",    label: "English",                native: "English",      dir: "ltr", flag: "🇬🇧" },
  { code: "es",    label: "Spanish",                native: "Español",      dir: "ltr", flag: "🇪🇸" },
  { code: "fr",    label: "French",                 native: "Français",     dir: "ltr", flag: "🇫🇷" },
  { code: "ar",    label: "Arabic",                 native: "العربية",       dir: "rtl", flag: "🇸🇦" },
  { code: "pt",    label: "Portuguese",             native: "Português",    dir: "ltr", flag: "🇵🇹" },
  { code: "de",    label: "German",                 native: "Deutsch",      dir: "ltr", flag: "🇩🇪" },
  { code: "zh",    label: "Chinese (Simplified)",   native: "简体中文",      dir: "ltr", flag: "🇨🇳" },
  { code: "hi",    label: "Hindi",                  native: "हिन्दी",        dir: "ltr", flag: "🇮🇳" },
  { code: "bn",    label: "Bengali",                native: "বাংলা",         dir: "ltr", flag: "🇧🇩" },
  { code: "ja",    label: "Japanese",               native: "日本語",         dir: "ltr", flag: "🇯🇵" },
  { code: "ru",    label: "Russian",                native: "Русский",      dir: "ltr", flag: "🇷🇺" },
  { code: "sw",    label: "Swahili",                native: "Kiswahili",    dir: "ltr", flag: "🇰🇪" },
  { code: "tr",    label: "Turkish",                native: "Türkçe",       dir: "ltr", flag: "🇹🇷" },
  { code: "id",    label: "Indonesian",             native: "Bahasa Indonesia", dir: "ltr", flag: "🇮🇩" },
  { code: "vi",    label: "Vietnamese",             native: "Tiếng Việt",   dir: "ltr", flag: "🇻🇳" },
  { code: "fa",    label: "Persian",                native: "فارسی",         dir: "rtl", flag: "🇮🇷" },
  { code: "ur",    label: "Urdu",                   native: "اردو",          dir: "rtl", flag: "🇵🇰" },
  { code: "am",    label: "Amharic",                native: "አማርኛ",         dir: "ltr", flag: "🇪🇹" },
  { code: "ha",    label: "Hausa",                  native: "Hausa",        dir: "ltr", flag: "🇳🇬" },
  { code: "fr-CA", label: "French (Canadian)",      native: "Français (CA)", dir: "ltr", flag: "🇨🇦" },
];

/** Languages with full Phase-1 translations. Others render English content. */
export const FULLY_TRANSLATED: LanguageCode[] = ["en", "es", "fr", "ar"];

export const isRtl = (code: string) =>
  LANGUAGES.find((l) => l.code === code)?.dir === "rtl";

export const findLanguage = (code: string): LanguageDef | undefined =>
  LANGUAGES.find((l) => l.code === code) ??
  LANGUAGES.find((l) => l.code === code.split("-")[0]);
