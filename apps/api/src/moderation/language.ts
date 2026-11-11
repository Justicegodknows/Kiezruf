// Offensive-language filter for comments (US-19): a hit holds the comment for staff review (US-33) instead of
// publishing it. It errs towards holding: a false positive only delays a comment, it never deletes one.
//
// The term list is a starting point for the pilot, not a finished moderation policy. The moderation team should own
// and extend it (per tenant, together with the moderation queue in Phase 2).
const TERMS = [
  // German insults and slurs
  'arschloch', 'wichser', 'wixer', 'hurensohn', 'fotze', 'missgeburt', 'spast', 'spasti', 'schlampe', 'nutte',
  'schwuchtel', 'kanake', 'neger', 'drecksau', 'scheisskerl', 'vollidiot', 'bastard', 'ficken', 'fick',
  // English insults and slurs
  'fuck', 'motherfucker', 'cunt', 'asshole', 'bitch', 'retard', 'faggot', 'nigger',
];

/** Terms this long or longer also match inside compound words ("Drecksarschloch"); shorter ones only as whole words. */
const MIN_INFIX_LENGTH = 5;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

export function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** True when the text should be held for review. */
export function needsReview(text: string): boolean {
  const words = normalise(text);
  // Also catch words split up with dots or spaces, e.g. "f.u.c.k" or "a r s c h l o c h".
  const joined = words.filter((w) => w.length === 1).join('');
  const candidates = joined.length >= 4 ? [...words, joined] : words;
  return candidates.some((word) =>
    TERMS.some((term) => word === term || (term.length >= MIN_INFIX_LENGTH && word.includes(term))),
  );
}
