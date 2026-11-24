"use client";

import { I18nProvider } from '@/lib/i18n';

// client context; the root layout stays a server component
export function Providers({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}
