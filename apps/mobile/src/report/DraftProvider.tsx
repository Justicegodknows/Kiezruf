// The report being composed: photos with their capture data, category, description, danger flag and pin.
// It lives in memory only; it is cleared after posting or when the citizen leaves the flow.
import { MAX_PHOTOS } from '@kiezruf/shared';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { LatLon } from '../lib/geo';
import type { Capture } from './onsite';

export interface DraftPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  capture: Capture;
  source: 'camera' | 'gallery';
}

export interface Draft {
  photos: DraftPhoto[];
  category: string | null;
  description: string;
  dangerous: boolean;
  /** Adjusted pin (US-10); null means the capture point. */
  pin: LatLon | null;
  /** Receiving office for the capture point (US-41), from GET /public/route. */
  route: { tenantName: string; office: string } | null;
}

export const EMPTY_DRAFT: Draft = { photos: [], category: null, description: '', dangerous: false, pin: null, route: null };

interface DraftContextValue {
  draft: Draft;
  /** The first photo's capture: the report's capture point. */
  anchor: Capture | undefined;
  addPhoto: (photo: DraftPhoto) => void;
  removePhoto: (id: string) => void;
  update: (patch: Partial<Omit<Draft, 'photos'>>) => void;
  reset: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children, initial = EMPTY_DRAFT }: { children: ReactNode; initial?: Draft }) {
  const [draft, setDraft] = useState<Draft>(initial);

  const addPhoto = useCallback((photo: DraftPhoto) => {
    setDraft((d) => (d.photos.length >= MAX_PHOTOS ? d : { ...d, photos: [...d.photos, photo] }));
  }, []);

  const removePhoto = useCallback((id: string) => {
    setDraft((d) => {
      const photos = d.photos.filter((p) => p.id !== id);
      // Removing the first photo moves the capture point, so the pin starts over.
      const anchorChanged = d.photos[0]?.id === id;
      return { ...d, photos, pin: anchorChanged ? null : d.pin, route: photos.length ? d.route : null };
    });
  }, []);

  const update = useCallback((patch: Partial<Omit<Draft, 'photos'>>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const value = useMemo(
    () => ({ draft, anchor: draft.photos[0]?.capture, addPhoto, removePhoto, update, reset }),
    [draft, addPhoto, removePhoto, update, reset],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft needs <DraftProvider>');
  return ctx;
}
