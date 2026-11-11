import { AuthProvider } from '@/auth/AuthProvider';
import { SiteHeader } from '@/components/SiteHeader';
import { SkipLink } from '@/components/SkipLink';

// Citizen web: header with the citizen navigation and the citizen session (US-01).
export default function CitizenLayout({ children }: LayoutProps<'/'>) {
  return (
    <AuthProvider>
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </AuthProvider>
  );
}
