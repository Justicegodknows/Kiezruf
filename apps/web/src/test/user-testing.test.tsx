// Fixes from user testing on 2026-11-23 (participant 1): green signature progress, sharing after publishing.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareButton } from '@/components/kz/ShareButton';
import de from '@/i18n/de.json';
import { pressure } from '@/lib/petition';
import { renderWithProviders } from './helpers';

function rgb(color: string): [number, number, number] {
  if (color.startsWith('#')) return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
  return color.match(/\d+/g)!.slice(0, 3).map(Number) as [number, number, number];
}
function contrastWithWhite(color: string): number {
  const [r, g, b] = rgb(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

describe('signature progress colours', () => {
  it('is green, not red, at every stage', () => {
    for (const pct of [0, 30, 50, 75, 90, 99, 100]) {
      const p = pressure(pct);
      for (const c of [p.color, p.fillTop, p.fillBottom]) {
        const [r, g] = rgb(c);
        expect(g, `${pct}% ${c}`).toBeGreaterThan(r);
      }
    }
  });

  it('keeps text readable: badge colour on white, white on the fill', () => {
    for (const pct of [0, 40, 60, 80, 99, 100]) {
      const p = pressure(pct);
      expect(contrastWithWhite(p.color)).toBeGreaterThanOrEqual(4.5);
      expect(contrastWithWhite(p.fillTop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('sharing a new petition', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the phone’s share sheet with the petition’s link', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    renderWithProviders(<ShareButton path="/berlin/neukoelln/nk-2026-0001" title="Ampel reparieren" />);
    fireEvent.click(screen.getByRole('button', { name: de['kz.share'] }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ampel reparieren', url: `${window.location.origin}/berlin/neukoelln/nk-2026-0001` }));
  });

  it('copies the link where there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    renderWithProviders(<ShareButton path="/berlin/neukoelln/nk-2026-0001" title="Ampel reparieren" />);
    fireEvent.click(screen.getByRole('button', { name: de['kz.share'] }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/berlin/neukoelln/nk-2026-0001'));
    expect(await screen.findByRole('status')).toHaveTextContent(de['kz.linkCopied']);
  });
});
