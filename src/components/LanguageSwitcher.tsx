/**
 * LanguageSwitcher
 * ----------------
 * Globe-icon dropdown showing the 20 supported languages.
 *
 * UX:
 *   • Trigger shows a globe icon + the current language's native name (e.g.
 *     "Español"), or just the flag in `compact` mode (used in tight headers).
 *   • Dropdown rows display flag · native name · English label, so users can
 *     find their language by either spelling or recognition.
 *   • Selecting a row calls i18next.changeLanguage(), which:
 *       1. swaps the active resource bundle (instant — all bundled),
 *       2. persists to localStorage (`mapped.lang`),
 *       3. fires `languageChanged`, which `applyDirection()` listens to and
 *          updates <html lang> + <html dir> (handles RTL flip).
 *   • Languages without a translation file fall back to English content;
 *     they're still selectable (and labelled in their native script) so the
 *     UI is honest about what's coming next.
 */
import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGES, FULLY_TRANSLATED, findLanguage, type LanguageCode } from "@/i18n/languages";
import { cn } from "@/lib/utils";

interface Props {
  /** Compact mode: trigger shows only flag + chevron, no language name. */
  compact?: boolean;
  /** Override className on the trigger button. */
  className?: string;
  /** Dropdown alignment relative to the trigger. */
  align?: "start" | "center" | "end";
}

export default function LanguageSwitcher({ compact = false, className, align = "end" }: Props) {
  const { i18n, t } = useTranslation();
  const current = findLanguage(i18n.language) ?? LANGUAGES[0];

  const onSelect = (code: LanguageCode) => {
    if (code !== i18n.language) i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-text px-2.5 py-1.5 rounded-sm hover:bg-surface2/60 transition-colors",
            className,
          )}
          aria-label={t("common.switchLanguage")}
          title={t("common.switchLanguage")}
        >
          <Globe size={13} strokeWidth={1.75} />
          {!compact && <span className="hidden sm:inline">{current.native}</span>}
          {compact && <span aria-hidden="true">{current.flag}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[260px] max-h-[420px] overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-text-subtle">
          {t("common.language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((lang) => {
          const active = lang.code === current.code;
          const translated = FULLY_TRANSLATED.includes(lang.code);
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              className={cn(
                "flex items-center gap-2 cursor-pointer text-xs",
                active && "bg-surface2",
              )}
              dir={lang.dir}
            >
              <span className="text-base leading-none" aria-hidden="true">{lang.flag}</span>
              <span className="flex-1 min-w-0 truncate font-medium">{lang.native}</span>
              <span className="text-[10px] font-mono text-text-subtle truncate">
                {lang.label}
              </span>
              {!translated && (
                <span
                  className="text-[9px] font-mono uppercase tracking-wider text-text-subtle border border-border rounded-sm px-1 py-px"
                  title="Translation pending — falls back to English"
                >
                  EN
                </span>
              )}
              {active && <Check size={12} className="text-brand shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
