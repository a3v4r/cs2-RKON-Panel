"use client";

import { I18nProvider } from '@/lib/i18n';

// Client-side context for every page (the root layout itself stays a server component)
export function Providers({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
