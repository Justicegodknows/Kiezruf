import { Suspense } from 'react';
import { BrowseShell } from '@/components/BrowseShell';

// List and map stay mounted while the citizen moves between reports; the detail pane is the page.
export default function BrowseLayout({ children }: LayoutProps<'/'>) {
  return (
    <Suspense>
      <BrowseShell>{children}</BrowseShell>
    </Suspense>
  );
}
