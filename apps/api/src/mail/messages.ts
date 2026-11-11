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

// --- Notifications (US-20, US-29, US-44) -----------------------------------------------------------
// Push texts stay generic: Expo's push service runs in the US, so payloads carry no report details beyond
// the ID in the data field (engineering plan, Push caveat). Email goes through the EU provider and may say more.

const STATUS_LABELS: Record<Locale, Record<string, string>> = {
  de: {
    open: 'Offen',
    acknowledged: 'Bestätigt',
    in_progress: 'In Bearbeitung',
    resolved: 'Erledigt',
    rejected: 'Abgelehnt',
    forwarded: 'Weitergeleitet',
  },
  en: {
    open: 'Open',
    acknowledged: 'Acknowledged',
    in_progress: 'In progress',
    resolved: 'Resolved',
    rejected: 'Rejected',
    forwarded: 'Forwarded',
  },
};

export function statusLabel(locale: Locale, status: string): string {
  return STATUS_LABELS[locale][status] ?? status;
}

export function statusChangePush(locale: Locale): { title: string; body: string } {
  return locale === 'en'
    ? { title: 'Kiezruf', body: 'There is an update on a report you follow.' }
    : { title: 'Kiezruf', body: 'Es gibt Neuigkeiten zu einer Meldung, der Sie folgen.' };
}

export function statusChangeMail(locale: Locale, publicId: string, status: string, url: string): { subject: string; text: string } {
  const label = statusLabel(locale, status);
  return locale === 'en'
    ? {
        subject: `${publicId}: ${label}`,
        text: `The report ${publicId} you follow has a new status: ${label}.\n\n${url}\n\nYou can turn these emails off in your Kiezruf account settings.`,
      }
    : {
        subject: `${publicId}: ${label}`,
        text: `Die Meldung ${publicId}, der Sie folgen, hat einen neuen Status: ${label}.\n\n${url}\n\nSie können diese E-Mails in Ihrem Kiezruf-Konto abschalten.`,
      };
}

export function goLivePush(locale: Locale): { title: string; body: string } {
  return locale === 'en'
    ? { title: 'Kiezruf', body: 'Kiezruf has started in an area you asked about.' }
    : { title: 'Kiezruf', body: 'Kiezruf ist jetzt in einem Gebiet gestartet, nach dem Sie gefragt haben.' };
}

export function goLiveMail(locale: Locale, tenant: string, url: string): { subject: string; text: string } {
  return locale === 'en'
    ? { subject: `Kiezruf has started in ${tenant}`, text: `You can now report problems in ${tenant} with Kiezruf.\n\n${url}` }
    : { subject: `Kiezruf ist in ${tenant} gestartet`, text: `Sie können jetzt mit Kiezruf Probleme in ${tenant} melden.\n\n${url}` };
}
