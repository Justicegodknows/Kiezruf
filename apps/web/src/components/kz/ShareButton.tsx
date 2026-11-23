'use client';

// "Share with friends" after publishing (user testing 2026-11-23: the first thing a participant wanted after
// publishing was to share it, and "See it on the map" was no help). Uses the phone's share sheet where the browser
// has one, else copies the link. Nothing is sent anywhere by Kiezruf itself.
import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { KzIcon } from './ui';

export function ShareButton({ path, title, className = 'kz-cta' }: { path: string; title: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    const text = t('kz.shareText', { title });
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        // The citizen closed the sheet: nothing to do. Any other failure falls back to copying.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void share()}>
        <KzIcon name="share" size={18} stroke={2.4} />
        {t('kz.share')}
      </button>
      <p role="status" className="kz-note kz-share-status">
        {copied === 'copied' ? t('kz.linkCopied') : copied === 'failed' ? t('kz.copyFailed', { url: new URL(path, window.location.origin).toString() }) : ''}
      </p>
    </>
  );
}
