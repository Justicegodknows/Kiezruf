'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { useRef } from 'react';

// Puts a static script into the server HTML <head> stream once, so it runs while the HTML is
// parsed (before first paint) and React never renders a <script> element on the client.
// This is the pattern the Next.js "Preventing flash before hydration" guide gives for themes.
// Only pass trusted, static code: the content is injected as-is.
export function InlineScript({ html }: { html: string }) {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script dangerouslySetInnerHTML={{ __html: html }} />;
  });
  return null;
}
