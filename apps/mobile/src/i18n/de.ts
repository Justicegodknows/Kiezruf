// German strings for the citizen app. German is the source; en.ts must provide every key
// (the Strings type enforces it, and __tests__/i18n-test.ts checks placeholders).
const de = {
  brandTagline: 'Bürgermeldungen',
  settings: {
    language: 'Sprache',
    toLight: 'Helles Design aktivieren',
    toDark: 'Dunkles Design aktivieren',
    de: 'Deutsch',
    en: 'English',
  },
  home: {
    title: 'Dein Kiez.\nDeine Stimme.',
    lead: 'Kaputte Ampel, Schlagloch im Radweg, defekte Schaukel? Melde es in einer Minute. Das Bezirksamt sieht, was vielen Nachbarn wichtig ist, und kümmert sich zuerst darum.',
    platesLabel: 'Gerade gemeldet',
    district: 'Neukölln',
    figures: '{{open}} offene Meldungen in Neukölln. {{resolved}} in den letzten 30 Tagen erledigt, die erste Antwort kommt im Schnitt nach 1,8 Tagen.',
    stepsTitle: 'So funktioniert es',
    stepsLead: 'Vom Foto bis zur Reparatur: vier Schritte, und du siehst jederzeit, wo deine Meldung steht.',
    steps: {
      photo: { title: 'Foto machen', body: 'Gesichter und Kennzeichen werden automatisch unkenntlich gemacht.' },
      locate: { title: 'Ort bestätigen', body: 'Deine Meldung landet direkt beim zuständigen Bezirksamt.' },
      follow: { title: 'Verfolgen', body: 'Du siehst jeden Statuswechsel und die Antworten der Verwaltung.' },
      fixed: { title: 'Erledigt', body: 'Das Bezirksamt behebt den Schaden, schließt die Meldung und gibt dir Bescheid.' },
    },
    nearbyTitle: 'Meldungen in deiner Nähe',
    nearbyLead: 'Was Nachbarn in Neukölln gerade melden, sortiert nach Entfernung.',
    filterLabel: 'Nach Kategorie filtern',
    filterAll: 'Alle',
    count: '{{n}} Meldungen',
    empty: 'Keine Meldungen in dieser Kategorie.',
  },
  categories: { traffic: 'Verkehr', facility: 'Öffentliche Einrichtung' },
  subcategories: {
    trafficLight: 'Ampel',
    pothole: 'Schlagloch',
    playground: 'Spielplatz',
    youthCentre: 'Jugendzentrum',
    bikeLane: 'Radweg',
    toilet: 'Öffentliche Toilette',
  },
  status: { open: 'Offen', acknowledged: 'Bestätigt', inProgress: 'In Bearbeitung', resolved: 'Erledigt' },
  report: {
    back: 'Zurück',
    meToo: 'Ich auch',
    meTooPressed: 'Du unterstützt diese Meldung',
    affected: '{{n}} Nachbarn betroffen',
    safety: 'Sicherheitsrelevant',
    officeNote: 'Hinweis vom Bezirksamt',
    progress: 'Bearbeitungsstand',
    details: 'Details',
    location: 'Ort',
    distance: '{{distance}} entfernt',
    reported: 'Gemeldet',
    involvement: 'Beteiligung',
    coReporters: '{{n}} Mitmeldende',
    comments: 'Kommentare',
    commentCount: '{{n}} Kommentare',
    noComments: 'Noch keine Kommentare.',
    reference: 'Aktenzeichen',
    notFound: 'Diese Meldung gibt es nicht.',
    photoAlt: 'Illustration: {{title}}',
  },
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Strings = Widen<typeof de>;

export default de satisfies Strings;
