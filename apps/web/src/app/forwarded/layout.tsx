import type { Metadata } from 'next';
import { ForwardedShell } from '@/console/pages/ForwardedReport';

// Forward links (US-45) are opened by external authorities without an account: no citizen or staff chrome.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ForwardedLayout({ children }: LayoutProps<'/forwarded'>) {
  return <ForwardedShell>{children}</ForwardedShell>;
}
