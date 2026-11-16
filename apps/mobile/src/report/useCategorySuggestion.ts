// Category suggestion from the photo (US-14). As soon as the compose screen has a first photo and the citizen is
// signed in (POST /uploads needs a session), the first photo is uploaded and POST /uploads/suggest is asked once
// for it. Only a suggestion with `preselect` (confidence 0.80 or more) is shown, by pre-selecting the category,
// and only while the citizen has not chosen one. A failure or timeout changes nothing: posting never waits for it.
import { CATEGORY_KEYS } from '@kiezruf/shared';
import { useEffect, useRef, useState } from 'react';
import { suggestCategory } from '../api/endpoints';
import { useDraft } from './DraftProvider';

export function useCategorySuggestion(signedIn: boolean): { suggesting: boolean } {
  const { draft, uploadPhoto, applySuggestion } = useDraft();
  const first = draft.photos[0];
  const wanted = signedIn && first !== undefined && draft.category === null;
  const asked = useRef<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!wanted || !first || asked.current === first.id) return;
    asked.current = first.id;
    setSuggesting(true);
    void (async () => {
      try {
        const suggestion = await suggestCategory(await uploadPhoto(first));
        const known = suggestion.category !== null && CATEGORY_KEYS.includes(suggestion.category);
        if (suggestion.preselect && known && suggestion.category && suggestion.confidence !== null) {
          applySuggestion({ photoId: first.id, category: suggestion.category, confidence: suggestion.confidence });
        }
      } catch {
        // No suggestion: the citizen picks the category as before.
      } finally {
        setSuggesting(false);
      }
    })();
  }, [wanted, first, uploadPhoto, applySuggestion]);

  return { suggesting: suggesting && draft.category === null };
}
