"use client";

import React from 'react';

// UI texts inline as pairs t('Обзор', 'Overview'): no key files, the Russian original stays visible.
export type Lang = 'ru' | 'en';

const KEY = 'cs2panel.lang';

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (ru: string, en: string) => string;
  locale: string;
}

const I18nContext = React.createContext<I18n>({
  lang: 'ru',
  setLang: () => {},
  t: (ru) => ru,
  locale: 'ru-RU',
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>('ru');

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'en' || saved === 'ru') setLangState(saved);
    } catch {}
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = React.useMemo<I18n>(() => ({
    lang,
    setLang: (next) => {
      setLangState(next);
      try { localStorage.setItem(KEY, next); } catch {}
    },
    t: (ru, en) => (lang === 'en' ? en : ru),
    locale: lang === 'en' ? 'en-GB' : 'ru-RU',
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useT = () => React.useContext(I18nContext);

// for code outside React (fetch helpers etc.): current page language
export function tNow(ru: string, en: string) {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? en : ru;
}

// actor as written in audit.log by the panel server ("судья" / "трансляция")
const AUDIT_WHO: Record<string, string> = { 'судья': 'referee', 'трансляция': 'broadcast' };
export const auditWho = (who: string, lang: Lang) => (lang === 'en' ? AUDIT_WHO[who] ?? who : who);

export type Text = { ru: string; en: string };
export const pick = (text: Text, lang: Lang) => text[lang];
