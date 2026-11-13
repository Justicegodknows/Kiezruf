'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nProvider } from '@/i18n/I18nProvider';

// Shared by the citizen web and the console. The citizen session (AuthProvider) lives in (citizen)/layout.tsx,
// the staff session (StaffProvider) in console/layout.tsx: neither part ever asks for the other's session.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );
}
