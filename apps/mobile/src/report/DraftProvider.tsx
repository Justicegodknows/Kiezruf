// The report being composed: photos with their capture data, category, description, danger flag and pin.
// It lives in memory only; it is cleared after posting or when the citizen leaves the flow.
// Uploads are cached per photo: the first photo is uploaded early for the category suggestion (US-14), and
// posting or co-reporting reuses that key instead of uploading the photo again.
import { MAX_PHOTOS } from '@kiezruf/shared';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { DuplicateMatch } from '../api/schemas';
import type { LatLon } from '../lib/geo';
import type { Capture } from './onsite';
import { uploadPhoto as uploadPhotoNow } from './submit';

export interface DraftPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
  capture: Capture;
  source: 'camera' | 'gallery';
}

/** A category suggestion the citizen was shown (US-14): it was pre-selected on the compose screen. */
export interface ShownSuggestion {
  photoId: string;
  category: string;
  confidence: number;
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
  /** Set only when a suggestion was shown; sent with POST /reports. */
  suggestion: ShownSuggestion | null;
  /** "Already reported?" matches for the screen between compose and posting (US-13). */
  duplicates: DuplicateMatch[];
}

export const EMPTY_DRAFT: Draft = {
  photos: [],
  category: null,
  description: '',
  dangerous: false,
  pin: null,
  route: null,
  suggestion: null,
  duplicates: [],
};

interface DraftContextValue {
  draft: Draft;
  /** The first photo's capture: the report's capture point. */
  anchor: Capture | undefined;
  addPhoto: (photo: DraftPhoto) => void;
  removePhoto: (id: string) => void;
  update: (patch: Partial<Omit<Draft, 'photos'>>) => void;
  /** Pre-selects a suggested category, unless the first photo changed or the citizen already chose one. */
  applySuggestion: (suggestion: ShownSuggestion) => void;
  /** Uploads a photo once and returns its key; later calls for the same photo share the result. */
  uploadPhoto: (photo: DraftPhoto) => Promise<string>;
  reset: () => void;
}

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({
  children,
  initial = EMPTY_DRAFT,
  upload = uploadPhotoNow,
}: {
  children: ReactNode;
  initial?: Draft;
  /** Test seam: how one photo is uploaded. */
  upload?: (photo: DraftPhoto) => Promise<string>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const uploads = useRef(new Map<string, Promise<string>>());

  const addPhoto = useCallback((photo: DraftPhoto) => {
    setDraft((d) => (d.photos.length >= MAX_PHOTOS ? d : { ...d, photos: [...d.photos, photo] }));
  }, []);

  const removePhoto = useCallback((id: string) => {
    uploads.current.delete(id);
    setDraft((d) => {
      const photos = d.photos.filter((p) => p.id !== id);
      // Removing the first photo moves the capture point, so the pin starts over.
      const anchorChanged = d.photos[0]?.id === id;
      return { ...d, photos, pin: anchorChanged ? null : d.pin, route: photos.length ? d.route : null };
    });
  }, []);

  const update = useCallback((patch: Partial<Omit<Draft, 'photos'>>) => setDraft((d) => ({ ...d, ...patch })), []);

  const applySuggestion = useCallback((suggestion: ShownSuggestion) => {
    setDraft((d) => (d.photos[0]?.id !== suggestion.photoId || d.category !== null ? d : { ...d, category: suggestion.category, suggestion }));
  }, []);

  const uploadPhoto = useCallback(
    (photo: DraftPhoto) => {
      const cached = uploads.current.get(photo.id);
      if (cached) return cached;
      const pending = upload(photo);
      uploads.current.set(photo.id, pending);
      // A failed upload is tried again next time.
      pending.catch(() => {
        if (uploads.current.get(photo.id) === pending) uploads.current.delete(photo.id);
      });
      return pending;
    },
    [upload],
  );

  const reset = useCallback(() => {
    uploads.current.clear();
    setDraft(EMPTY_DRAFT);
  }, []);

  const value = useMemo(
    () => ({ draft, anchor: draft.photos[0]?.capture, addPhoto, removePhoto, update, applySuggestion, uploadPhoto, reset }),
    [draft, addPhoto, removePhoto, update, applySuggestion, uploadPhoto, reset],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft needs <DraftProvider>');
  return ctx;
}
