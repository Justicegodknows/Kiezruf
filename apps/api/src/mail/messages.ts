// Email texts. German first, then English (engineering plan goals). Apps localise everything else themselves:
// the API answers with error codes, never with display text.
export const LOCALES = ['de', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function loginCodeMail(locale: Locale, code: string, validMinutes: number): { subject: string; text: string } {
  if (locale === 'en') {
    return {
      subject: `${code} is your Kiezruf code`,
      text: `Your Kiezruf sign-in code is ${code}.\n\nIt is valid for ${validMinutes} minutes. If you did not ask for a code, ignore this email.`,
    };
  }
  return {
    subject: `${code} ist Ihr Kiezruf-Code`,
    text: `Ihr Anmeldecode für Kiezruf lautet ${code}.\n\nEr gilt ${validMinutes} Minuten. Wenn Sie keinen Code angefordert haben, können Sie diese E-Mail ignorieren.`,
  };
}
