'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type AppLocale = 'en' | 'zh-Hant';

const STORAGE_KEY = 'ai-workflow-studio-locale';

interface LanguageContextValue {
  readonly locale: AppLocale;
  readonly setLocale: (locale: AppLocale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyDocumentLocale(locale: AppLocale): void {
  document.documentElement.dataset.locale = locale;
  document.documentElement.lang = locale;
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<AppLocale>('zh-Hant');

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (storedLocale === 'en' || storedLocale === 'zh-Hant') {
      setLocaleState(storedLocale);
      applyDocumentLocale(storedLocale);
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale(nextLocale) {
        setLocaleState(nextLocale);
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
        applyDocumentLocale(nextLocale);
      },
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (context === null) {
    throw new Error('LanguageProvider is required.');
  }
  return context;
}

export function LanguageSwitcher({
  inverse = false,
}: Readonly<{
  inverse?: boolean;
}>) {
  const { locale, setLocale } = useLanguage();

  return (
    <div
      aria-label="Language / 語言"
      className={`flex rounded-full border p-1 shadow-sm ${
        inverse ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white/70'
      }`}
      role="group"
    >
      {[
        ['zh-Hant', '中文'],
        ['en', 'EN'],
      ].map(([value, label]) => (
        <button
          aria-pressed={locale === value}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
            locale === value
              ? inverse
                ? 'bg-white text-slate-950'
                : 'bg-slate-950 text-white'
              : inverse
                ? 'text-slate-300 hover:text-white'
                : 'text-slate-500 hover:text-slate-950'
          }`}
          key={value}
          onClick={() => setLocale(value as AppLocale)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function LocalizedText({
  className,
  en,
  zhHant,
}: Readonly<{
  className?: string;
  en: ReactNode;
  zhHant: ReactNode;
}>) {
  const { locale } = useLanguage();

  return (
    <span className={className} lang={locale}>
      {locale === 'en' ? en : zhHant}
    </span>
  );
}
