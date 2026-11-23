import { DM_Sans, Space_Grotesk } from 'next/font/google';
import { AuthProvider } from '@/auth/AuthProvider';
import { SkipLink } from '@/components/SkipLink';
import './kiezruf.css';

// Citizen web after the app prototype (kiezruf-app-prototype.html, the frontend's source of truth since 2026-11-18):
// Space Grotesk for headings, DM Sans for text, self-hosted by next/font. The `.kz` wrapper carries the prototype's
// theme and sits outside the AuthProvider, so the sign-in dialog takes it too. Each screen brings its own top bar.
const head = Space_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700'], variable: '--font-kz-head' });
const body = DM_Sans({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700', '800'], variable: '--font-kz-body' });

export default function CitizenLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={`kz ${head.variable} ${body.variable}`}>
      <AuthProvider>
        <SkipLink />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </AuthProvider>
    </div>
  );
}
