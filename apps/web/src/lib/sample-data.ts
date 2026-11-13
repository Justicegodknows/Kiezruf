// Sample data from the Neukölln UI prototype (neukoelln-ui-prototype.html).
// Used until the API exposes reports. Replace these imports with API queries; keep the shapes.
import { priorityLevel, priorityScore, type Level } from '@kiezruf/shared';
import type { Locale } from '@/i18n/config';

export type Category = 'traffic' | 'facility';
export type Subcategory = 'trafficLight' | 'pothole' | 'playground' | 'youthCentre' | 'bikeLane' | 'toilet';
export type Status = 'open' | 'acknowledged' | 'inProgress' | 'resolved';
export const STATUS_ORDER: Status[] = ['open', 'acknowledged', 'inProgress', 'resolved'];

type Localized = Record<Locale, string>;

export interface Comment {
  author: string;
  ageHours: number;
  text: Localized;
  staff?: boolean;
}

/** What a citizen may see. Never carries score or level (US-24). */
export interface PublicReport {
  id: string;
  title: Localized;
  description: Localized;
  officeNote?: Localized;
  category: Category;
  subcategory: Subcategory;
  place: string;
  distanceMetres: number;
  ageHours: number;
  status: Status;
  coReporters: number;
  commenters: number;
  meToo: number;
  safetyCategory: boolean;
  /** Position on the illustrative district map, in percent. */
  x: number;
  y: number;
  comments: Comment[];
}

interface StaffFields {
  dangerMarks: number;
}

const REPORTS: (PublicReport & StaffFields)[] = [
  {
    id: 'BE-NK-2026-0112',
    title: { de: 'Fußgängerampel ausgefallen', en: 'Pedestrian light not working' },
    description: {
      de: 'Die Ampel bleibt dunkel. Kinder auf dem Schulweg queren ohne Signal.',
      en: 'The light stays dark. Children on their way to school cross without a signal.',
    },
    officeNote: {
      de: 'Die Verkehrslenkung ist informiert. Ein Techniker ist für morgen früh eingeplant.',
      en: 'Traffic management has been informed. A technician is booked for tomorrow morning.',
    },
    category: 'traffic',
    subcategory: 'trafficLight',
    place: 'Karl-Marx-Straße, Höhe Rathaus Neukölln',
    distanceMetres: 80,
    ageHours: 2,
    status: 'acknowledged',
    coReporters: 4,
    commenters: 5,
    meToo: 20,
    dangerMarks: 3,
    safetyCategory: true,
    x: 38,
    y: 42,
    comments: [
      {
        author: 'Lena K.',
        ageHours: 1.5,
        text: { de: 'Heute Morgen immer noch aus.', en: 'Still out this morning.' },
      },
      {
        author: 'Bezirksamt',
        ageHours: 1,
        staff: true,
        text: { de: 'Danke, wir haben die Meldung weitergegeben.', en: 'Thank you, we have passed the report on.' },
      },
    ],
  },
  {
    id: 'BE-NK-2026-0108',
    title: { de: 'Tiefes Schlagloch im Radweg', en: 'Deep pothole in the bike lane' },
    description: {
      de: 'Etwa 30 cm breit, nachts kaum zu sehen.',
      en: 'About 30 cm wide, hard to see at night.',
    },
    category: 'traffic',
    subcategory: 'pothole',
    place: 'Hermannstraße 140',
    distanceMetres: 350,
    ageHours: 26,
    status: 'open',
    coReporters: 3,
    commenters: 2,
    meToo: 11,
    dangerMarks: 1,
    safetyCategory: true,
    x: 62,
    y: 30,
    comments: [
      {
        author: 'Murat Y.',
        ageHours: 20,
        text: { de: 'Bin gestern fast gestürzt.', en: 'I nearly fell off yesterday.' },
      },
    ],
  },
  {
    id: 'BE-NK-2026-0101',
    title: { de: 'Schaukelsitz auf dem Spielplatz kaputt', en: 'Swing seat broken at playground' },
    description: {
      de: 'Der Sitz hängt nur noch an einer Kette.',
      en: 'The seat is hanging from one chain.',
    },
    officeNote: {
      de: 'Die Reparatur ist für nächste Woche beauftragt.',
      en: 'The repair is booked for next week.',
    },
    category: 'facility',
    subcategory: 'playground',
    place: 'Spielplatz Weserstraße',
    distanceMetres: 600,
    ageHours: 50,
    status: 'inProgress',
    coReporters: 2,
    commenters: 1,
    meToo: 2,
    dangerMarks: 0,
    safetyCategory: true,
    x: 24,
    y: 68,
    comments: [],
  },
  {
    id: 'BE-NK-2026-0097',
    title: { de: 'Radweg durch parkenden Transporter blockiert', en: 'Bike lane blocked by parked van' },
    description: {
      de: 'Jeden Morgen zwischen 7 und 9 Uhr.',
      en: 'Every morning between 7 and 9.',
    },
    category: 'traffic',
    subcategory: 'bikeLane',
    place: 'Sonnenallee 62',
    distanceMetres: 900,
    ageHours: 5,
    status: 'open',
    coReporters: 1,
    commenters: 0,
    meToo: 3,
    dangerMarks: 0,
    safetyCategory: false,
    x: 70,
    y: 58,
    comments: [],
  },
  {
    id: 'BE-NK-2026-0090',
    title: { de: 'Öffentliche Toilette seit Wochen geschlossen', en: 'Public toilet closed for weeks' },
    description: {
      de: 'Schild sagt „außer Betrieb“, ohne Datum.',
      en: 'A sign says out of order, with no date.',
    },
    category: 'facility',
    subcategory: 'toilet',
    place: 'Hermannplatz',
    distanceMetres: 1200,
    ageHours: 96,
    status: 'open',
    coReporters: 2,
    commenters: 3,
    meToo: 6,
    dangerMarks: 0,
    safetyCategory: false,
    x: 52,
    y: 16,
    comments: [],
  },
  {
    id: 'BE-NK-2026-0084',
    title: { de: 'Eingangstür des Jugendzentrums defekt', en: 'Front door of youth centre broken' },
    description: {
      de: 'Die Tür lässt sich nicht mehr abschließen.',
      en: 'The door does not lock any more.',
    },
    category: 'facility',
    subcategory: 'youthCentre',
    place: 'Gropiusstadt, Lipschitzallee',
    distanceMetres: 4100,
    ageHours: 74,
    status: 'resolved',
    coReporters: 1,
    commenters: 1,
    meToo: 26,
    dangerMarks: 0,
    safetyCategory: false,
    x: 80,
    y: 80,
    comments: [],
  },
];

function toPublic(report: PublicReport & StaffFields): PublicReport {
  const { dangerMarks, ...rest } = report;
  void dangerMarks;
  return rest;
}

/** Citizen view: no score, no level, no danger marks (US-24). */
export function listPublicReports(): PublicReport[] {
  return [...REPORTS].sort((a, b) => a.distanceMetres - b.distanceMetres).map(toPublic);
}

export function getPublicReport(id: string): PublicReport | undefined {
  const report = REPORTS.find((r) => r.id === id);
  return report && toPublic(report);
}

export function reportIds(): string[] {
  return REPORTS.map((r) => r.id);
}

export interface ScoreBreakdown {
  coReporterPoints: number;
  commenterPoints: number;
  meTooPoints: number;
  base: number;
  decay: number;
  danger: number;
  safety: number;
  score: number;
}

export interface StaffReport extends PublicReport, StaffFields {
  score: number;
  level: Level;
  breakdown: ScoreBreakdown;
}

/** Staff view for the console, scored with the shared rules (US-22, US-23). */
export function listStaffQueue(): StaffReport[] {
  return REPORTS.filter((r) => r.status !== 'resolved')
    .map((r) => {
      const input = {
        coReporters: r.coReporters,
        commenters: r.commenters,
        meToo: r.meToo,
        ageHours: r.ageHours,
        dangerMarks: r.dangerMarks,
        safetyCategory: r.safetyCategory,
      };
      const score = priorityScore(input);
      const breakdown: ScoreBreakdown = {
        coReporterPoints: r.coReporters * 5,
        commenterPoints: r.commenters * 2,
        meTooPoints: r.meToo,
        base: r.coReporters * 5 + r.commenters * 2 + r.meToo,
        decay: Math.pow(0.5, r.ageHours / (24 * 14)),
        danger: r.dangerMarks >= 3 ? 1.5 : r.dangerMarks >= 1 ? 1.2 : 1,
        safety: r.safetyCategory ? 1.3 : 1,
        score,
      };
      return { ...r, score, level: priorityLevel(score), breakdown };
    })
    .sort((a, b) => b.score - a.score);
}

/** Weekly intake for the console trend chart. */
export const WEEKLY_TREND = [
  { week: 38, received: 42, resolved: 31 },
  { week: 39, received: 47, resolved: 36 },
  { week: 40, received: 39, resolved: 41 },
  { week: 41, received: 55, resolved: 38 },
  { week: 42, received: 51, resolved: 46 },
  { week: 43, received: 58, resolved: 49 },
  { week: 44, received: 49, resolved: 52 },
  { week: 45, received: 61, resolved: 54 },
];

export const OPEN_BY_SUBCATEGORY: { subcategory: Subcategory; count: number }[] = [
  { subcategory: 'pothole', count: 38 },
  { subcategory: 'trafficLight', count: 21 },
  { subcategory: 'bikeLane', count: 17 },
  { subcategory: 'playground', count: 12 },
  { subcategory: 'toilet', count: 9 },
  { subcategory: 'youthCentre', count: 4 },
];
