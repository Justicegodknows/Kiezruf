// Demo data for local development and staging: the product plan's sample reports (kiezruf-mvp-prototype.html,
// REPORTS) in Neukölln and Spandau, with citizens, photos, comments, Me too votes, co-reporters, status history,
// a forwarded report, a vote spike, a recurring hotspot, demo staff and this week's briefing.
//
// Every demo account uses the reserved domain DEMO_DOMAIN (".invalid" can never receive mail), so demo data is easy to
// find and remove (`--reset`). Demo photos are drawn scenes without people or plates, so they are published directly
// instead of going through the blur pipeline. Never run this against production (see demo-run.ts).
import { randomUUID } from 'node:crypto';
import { berlinYear, formatReportId } from '@kiezruf/shared';
import { sql } from 'drizzle-orm';
import { generateBriefing, weekStartOf } from '../../analysis/briefing.js';
import type { AiProvider } from '../../ai/provider.js';
import { differenceHash, sanitise } from '../../photos/image.js';
import { recomputeScores } from '../../scoring/recompute.js';
import type { PhotoStorage } from '../../storage/photos.js';
import type { Db, Tx } from '../client.js';
import { demoPhoto, type Scene } from './demo-photos.js';

export const DEMO_DOMAIN = 'kiezruf-demo.invalid';
const CITIZENS = 60;
const HOUR = 3_600_000;

type Status = 'open' | 'acknowledged' | 'in_progress' | 'forwarded' | 'resolved';

interface DemoReport {
  key: string;
  tenant: 'nk' | 'sp';
  category: string;
  place: string;
  lat: number;
  lon: number;
  ageHours: number;
  status: Status;
  coReporters: number;
  meToo: number;
  /** Danger confirmations, the reporter's "Dangerous right now?" included. */
  danger: number;
  scenes: Scene[];
  description: string;
  comments: string[];
  /** Further distinct commenters with short generic comments, to reach the prototype's counts. */
  extraCommenters?: number;
  publicNote?: string;
  /** 19 votes within 40 minutes, 15 from accounts younger than 7 days (prototype: BE-NK-2026-0098). */
  spike?: boolean;
  forwardTo?: string;
}

// From the prototype's sample reports, in German as the apps show them first. Places are real; coordinates checked
// against the Bezirk boundaries.
export const DEMO_REPORTS: DemoReport[] = [
  {
    key: 'light', tenant: 'nk', category: 'traffic_light', place: 'Karl-Marx-Straße, Höhe Rathaus Neukölln', lat: 52.4812, lon: 13.4352,
    ageHours: 2, status: 'acknowledged', coReporters: 4, meToo: 20, danger: 3, scenes: ['light'],
    description: 'Die Fußgängerampel ist seit heute Morgen dunkel. Autos halten nicht an.',
    comments: ['Auf der anderen Straßenseite genauso.', 'Hier queren um 8 Uhr die Kinder von der Schule.'], extraCommenters: 3,
    publicNote: 'Danke. Die Störung ist an das Team für Lichtsignalanlagen weitergegeben.',
  },
  {
    key: 'pothole-nk', tenant: 'nk', category: 'pothole', place: 'Sonnenallee 112', lat: 52.4823, lon: 13.444,
    ageHours: 24, status: 'open', coReporters: 3, meToo: 11, danger: 1, scenes: ['pothole'],
    description: 'Etwa 30 cm breit, im Radweg, nachts kaum zu sehen.',
    comments: ['Bin gestern hier fast gestürzt.'], extraCommenters: 1,
  },
  {
    // A second report of nearly the same spot: the console suggests merging it (US-17).
    key: 'pothole-nk-dup', tenant: 'nk', category: 'pothole', place: 'Sonnenallee 108', lat: 52.48255, lon: 13.44345,
    ageHours: 5, status: 'open', coReporters: 0, meToo: 2, danger: 0, scenes: ['pothole'],
    description: 'Schlagloch im Radweg vor Nr. 108.', comments: [],
  },
  {
    key: 'dump', tenant: 'nk', category: 'illegal_dumping', place: 'Hermannplatz, U-Bahn-Ausgang', lat: 52.4869, lon: 13.4247,
    ageHours: 12, status: 'open', coReporters: 5, meToo: 14, danger: 0, scenes: ['dump', 'dump'],
    description: 'Wieder Matratze und Säcke, dieselbe Ecke wie letzten Montag.',
    comments: ['Jeden Montagmorgen nach dem Wochenende.', 'Die BSR war erst Freitag hier.'], extraCommenters: 1,
  },
  {
    key: 'door', tenant: 'nk', category: 'youth_centre', place: 'Weserstraße 34', lat: 52.488, lon: 13.433,
    ageHours: 72, status: 'open', coReporters: 1, meToo: 26, danger: 0, scenes: ['door'],
    description: 'Die Eingangstür des Jugendzentrums schließt nicht mehr ab.', comments: ['Seit Wochen so.'], spike: true,
  },
  {
    key: 'toilet', tenant: 'nk', category: 'public_toilet', place: 'Rixdorfer Höhe', lat: 52.479, lon: 13.4215,
    ageHours: 96, status: 'open', coReporters: 2, meToo: 6, danger: 0, scenes: ['toilet'],
    description: 'Schild sagt „außer Betrieb“, ohne Datum.',
    comments: ['Seit mindestens drei Wochen zu.', 'Im Sommer ein echtes Problem.'], extraCommenters: 2,
  },
  {
    key: 'swing', tenant: 'nk', category: 'playground', place: 'Körnerpark', lat: 52.4706, lon: 13.4398,
    ageHours: 48, status: 'in_progress', coReporters: 2, meToo: 2, danger: 0, scenes: ['swing'],
    description: 'Der Sitz der Schaukel hängt nur noch an einer Kette.', comments: ['Kinder spielen trotzdem darauf.'],
    publicNote: 'Die Reparatur ist für nächste Woche gebucht.',
  },
  {
    key: 'van', tenant: 'nk', category: 'bike_lane', place: 'Karl-Marx-Straße 200', lat: 52.47, lon: 13.444,
    ageHours: 5, status: 'open', coReporters: 1, meToo: 3, danger: 0, scenes: ['van'],
    description: 'Jeden Morgen zwischen 7 und 9 Uhr parkt ein Lieferwagen auf dem Radweg.', comments: [],
  },
  {
    key: 'lamps', tenant: 'sp', category: 'street_lighting', place: 'Lindenufer', lat: 52.5372, lon: 13.2063,
    ageHours: 30, status: 'open', coReporters: 3, meToo: 17, danger: 2, scenes: ['lamp'],
    description: 'Fünf Laternen hintereinander sind dunkel. Nachts ein sehr dunkler Weg an der Havel.',
    comments: ['Gestern Abend auch noch aus.', 'Ich gehe da nachts nicht mehr lang.'], extraCommenters: 2,
  },
  {
    key: 'sign', tenant: 'sp', category: 'road_sign', place: 'Klosterstraße', lat: 52.5345, lon: 13.201,
    ageHours: 50, status: 'forwarded', coReporters: 1, meToo: 4, danger: 1, scenes: ['sign'],
    description: 'Das Schild „Vorfahrt achten“ liegt auf dem Gehweg.', comments: ['Liegt immer noch da.'],
    publicNote: 'Per E-Mail an die Verkehrslenkung Berlin weitergeleitet, die für diese Straße zuständig ist.',
    forwardTo: 'Verkehrslenkung Berlin',
  },
  {
    key: 'pothole-sp', tenant: 'sp', category: 'pothole', place: 'Seegefelder Straße, Bushaltestelle', lat: 52.537, lon: 13.18,
    ageHours: 20, status: 'acknowledged', coReporters: 2, meToo: 7, danger: 1, scenes: ['pothole'],
    description: 'Beim Aussteigen aus dem Bus tritt man direkt hinein.', comments: ['Meine Mutter ist hier umgeknickt.'],
    publicNote: 'Das Straßen- und Grünflächenamt füllt es diese Woche.',
  },
  {
    key: 'bins', tenant: 'sp', category: 'waste_bins', place: 'Münsingerpark', lat: 52.5359, lon: 13.1948,
    ageHours: 60, status: 'open', coReporters: 1, meToo: 3, danger: 0, scenes: ['bins'],
    description: 'Die Mülleimer sind seit dem Wochenende voll.', comments: [],
  },
];

const FILLER_COMMENTS = ['Kann ich bestätigen.', 'Habe ich heute auch gesehen.', 'Bitte schnell beheben.', 'Danke fürs Melden!'];

export const DEMO_STAFF = [
  { email: `fallbearbeitung.neukoelln@${DEMO_DOMAIN}`, path: 'de.be.bec.nk', role: 'case_worker' },
  { email: `admin.neukoelln@${DEMO_DOMAIN}`, path: 'de.be.bec.nk', role: 'tenant_admin' },
  { email: `admin.spandau@${DEMO_DOMAIN}`, path: 'de.be.bec.sp', role: 'tenant_admin' },
  { email: `senatsverwaltung@${DEMO_DOMAIN}`, path: 'de.be', role: 'viewer' },
  { email: `plattform@${DEMO_DOMAIN}`, path: 'de', role: 'platform_admin' },
] as const;

export interface DemoDeps {
  db: Db;
  storage: PhotoStorage;
  ai?: AiProvider;
  now?: Date;
  log?: (line: string) => void;
}

export interface DemoResult {
  skipped: boolean;
  citizens: number;
  staff: number;
  reports: number;
  photos: number;
  comments: number;
  votes: number;
}

export async function hasDemoData(db: Db): Promise<boolean> {
  const [row] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM account WHERE email LIKE ${`%@${DEMO_DOMAIN}`}`);
  return row!.n > 0;
}

/**
 * Removes every demo account and what hangs off it: their reports (with photos, votes, comments, follows), briefings
 * that cite those reports, audit rows, roles and the demo contact. Real accounts and reports are not touched.
 */
export async function removeDemoData(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    const demoAccounts = sql`(SELECT id FROM account WHERE email LIKE ${`%@${DEMO_DOMAIN}`})`;
    const demoReports = await tx.execute<{ id: string; public_id: string }>(sql`SELECT id, public_id FROM report WHERE created_by IN ${demoAccounts}`);
    if (demoReports.length) {
      const ids = `{${demoReports.map((r) => r.public_id).join(',')}}`;
      await tx.execute(sql`DELETE FROM briefing WHERE id IN (SELECT briefing_id FROM briefing_item WHERE citations && ${ids}::text[])`);
      await tx.execute(sql`DELETE FROM audit_event WHERE report_id IN (SELECT id FROM report WHERE created_by IN ${demoAccounts})`);
      await tx.execute(sql`DELETE FROM report WHERE created_by IN ${demoAccounts}`);
    }
    await tx.execute(sql`DELETE FROM audit_event WHERE actor_id IN ${demoAccounts}`);
    await tx.execute(sql`DELETE FROM external_contact WHERE email LIKE ${`%@${DEMO_DOMAIN}`}`);
    const removed = await tx.execute(sql`DELETE FROM account WHERE email LIKE ${`%@${DEMO_DOMAIN}`} RETURNING id`);
    return removed.length;
  });
}

const geography = (lat: number, lon: number) => sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;

/** The last Mondays before `now`, 10:00 Berlin time, for the recurring Hermannplatz reports. */
function previousMondays(now: Date, count: number): Date[] {
  const out: Date[] = [];
  const d = new Date(now);
  d.setUTCHours(9, 0, 0, 0);
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() === 1 && now.getTime() - d.getTime() > 24 * HOUR) out.push(new Date(d));
  }
  return out;
}

export async function seedDemo(deps: DemoDeps): Promise<DemoResult> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? new Date();
  if (await hasDemoData(deps.db)) {
    log('Demo data is already there. Run with --reset to replace it.');
    return { skipped: true, citizens: 0, staff: 0, reports: 0, photos: 0, comments: 0, votes: 0 };
  }

  // Photos first, outside the transaction: one drawn scene per photo, stored like a citizen's upload.
  const photoFiles = new Map<string, { originalKey: string; publicKey: string; phash: string; id: string }>();
  let variant = 0;
  const reportsToSeed = [...DEMO_REPORTS, ...recurringReports(now)];
  for (const r of reportsToSeed) {
    for (const [i, scene] of r.scenes.entries()) {
      const id = randomUUID();
      const original = await demoPhoto(scene, variant++);
      const clean = await sanitise(original);
      const file = { id, originalKey: `originals/demo/${id}.jpg`, publicKey: `public/${id}.jpg`, phash: await differenceHash(clean) };
      await deps.storage.putOriginal(file.originalKey, original, 'image/jpeg');
      await deps.storage.putPublic(file.publicKey, clean, 'image/jpeg');
      photoFiles.set(`${r.key}:${i}`, file);
    }
  }
  log(`Stored ${photoFiles.size} demo photos.`);

  const result = await deps.db.transaction(async (tx) => {
    const citizens = await createCitizens(tx, now);
    const staff = await createStaff(tx);
    const tenants = new Map(
      (await tx.execute<{ code: string; id: string }>(sql`SELECT lower(code) AS code, id FROM tenant WHERE path IN ('de.be.bec.nk', 'de.be.bec.sp')`)).map((t) => [t.code, t.id]),
    );
    const [contact] = await tx.execute<{ id: string }>(sql`
      INSERT INTO external_contact (tenant_id, name, email)
      SELECT id, 'Verkehrslenkung Berlin', ${`verkehrslenkung@${DEMO_DOMAIN}`} FROM tenant WHERE path = 'de.be' RETURNING id`);

    let pick = 0;
    const nextCitizen = () => citizens[pick++ % citizens.length]!;
    const counts = { reports: 0, photos: 0, comments: 0, votes: 0 };

    for (const r of reportsToSeed) {
      const created = new Date(now.getTime() - r.ageHours * HOUR);
      const author = nextCitizen();
      const tenantId = tenants.get(r.tenant)!;
      const year = berlinYear(created);
      const [seq] = await tx.execute<{ n: number }>(sql`SELECT next_report_sequence(${tenantId}, ${year}) AS n`);
      const publicId = formatReportId({ land: 'BE', tenant: r.tenant.toUpperCase(), year, sequence: seq!.n });
      const at = geography(r.lat, r.lon);
      const [report] = await tx.execute<{ id: string }>(sql`
        INSERT INTO report (public_id, tenant_id, category, status, description, dangerous, location, capture_location,
                            capture_accuracy_m, capture_at, created_by, created_at, updated_at, public_note)
        VALUES (${publicId}, ${tenantId}, ${r.category}, ${r.status}::report_status, ${r.description}, ${r.danger > 0}, ${at}, ${at},
                12, ${created.toISOString()}::timestamptz, ${author}, ${created.toISOString()}::timestamptz,
                ${new Date(created.getTime() + Math.min(r.ageHours, 2) * HOUR / 2).toISOString()}::timestamptz, ${r.publicNote ?? null})
        RETURNING id`);
      const reportId = report!.id;
      counts.reports++;

      for (const [i] of r.scenes.entries()) {
        const f = photoFiles.get(`${r.key}:${i}`)!;
        await tx.execute(sql`
          INSERT INTO photo (id, report_id, original_key, public_key, blur_status, phash, attempts, processed_at, created_at)
          VALUES (${f.id}, ${reportId}, ${f.originalKey}, ${f.publicKey}, 'done', ${f.phash}, 1, ${created.toISOString()}::timestamptz,
                  ${created.toISOString()}::timestamptz)`);
        counts.photos++;
      }
      await tx.execute(sql`INSERT INTO follow (report_id, account_id, created_at) VALUES (${reportId}, ${author}, ${created.toISOString()}::timestamptz)`);

      // Votes spread between posting and now; voters and co-reporters follow, as in the app (US-20).
      const spread = (i: number, of: number) => new Date(created.getTime() + ((now.getTime() - created.getTime()) * (i + 1)) / (of + 1));
      const react = async (account: string, kind: string, when: Date) => {
        await tx.execute(sql`
          INSERT INTO reaction (report_id, account_id, kind, created_at) VALUES (${reportId}, ${account}, ${kind}::reaction_kind, ${when.toISOString()}::timestamptz)
          ON CONFLICT DO NOTHING`);
        await tx.execute(sql`INSERT INTO follow (report_id, account_id) VALUES (${reportId}, ${account}) ON CONFLICT DO NOTHING`);
      };
      for (let i = 0; i < r.coReporters; i++) await react(nextCitizen(), 'co_reporter', spread(i, r.coReporters));
      for (let i = 0; i < r.danger - 1; i++) await react(nextCitizen(), 'danger', spread(i, r.danger));
      if (r.spike) {
        // 15 brand-new accounts and 4 older ones within 40 minutes, then 7 more votes later.
        const burst = new Date(created.getTime() + 2 * HOUR);
        const fresh = await createSpikeAccounts(tx, burst, 15);
        for (let i = 0; i < 19; i++) await react(i < 15 ? fresh[i]! : nextCitizen(), 'me_too', new Date(burst.getTime() + i * 2 * 60_000));
        for (let i = 0; i < r.meToo - 19; i++) await react(nextCitizen(), 'me_too', spread(i, r.meToo - 19));
      } else {
        for (let i = 0; i < r.meToo; i++) await react(nextCitizen(), 'me_too', spread(i, r.meToo));
      }
      counts.votes += r.meToo;

      const texts = [...r.comments, ...Array.from({ length: r.extraCommenters ?? 0 }, (_, i) => FILLER_COMMENTS[i % FILLER_COMMENTS.length]!)];
      for (const [i, body] of texts.entries()) {
        await tx.execute(sql`
          INSERT INTO comment (report_id, account_id, body, created_at)
          VALUES (${reportId}, ${nextCitizen()}, ${body}, ${spread(i, texts.length).toISOString()}::timestamptz)`);
        counts.comments++;
      }

      // Status history as the office wrote it (US-28), one hour after posting.
      const office = staff.get(r.tenant === 'nk' ? 'fallbearbeitung.neukoelln' : 'admin.spandau')!;
      const when = new Date(created.getTime() + Math.min(1, r.ageHours / 2) * HOUR).toISOString();
      if (r.status !== 'open') {
        await tx.execute(sql`
          INSERT INTO audit_event (kind, report_id, tenant_id, actor_id, from_value, to_value, public_note, created_at)
          VALUES ('status', ${reportId}, ${tenantId}, ${office}, 'open', ${r.status}, ${r.publicNote ?? null}, ${when}::timestamptz)`);
      }
      if (r.forwardTo) {
        await tx.execute(sql`
          INSERT INTO forward (report_id, contact_id, public_note, actor_id, expires_at, created_at)
          VALUES (${reportId}, ${contact!.id}, ${r.publicNote ?? null}, ${office}, now() + interval '90 days', ${when}::timestamptz)`);
      }
      // Something for the moderation queue (US-33): a held comment and a flagged one.
      if (r.key === 'dump') {
        await tx.execute(sql`
          INSERT INTO comment (report_id, account_id, body, state) VALUES (${reportId}, ${nextCitizen()}, 'Die Leute hier sind doch alles Arschlöcher.', 'held')`);
      }
      if (r.key === 'toilet') {
        const [spam] = await tx.execute<{ id: string }>(sql`
          INSERT INTO comment (report_id, account_id, body) VALUES (${reportId}, ${nextCitizen()}, 'Günstige Sonnenbrillen auf sonnenbrillen-guenstig.example!') RETURNING id`);
        for (let i = 0; i < 3; i++) {
          await tx.execute(sql`INSERT INTO comment_flag (comment_id, account_id, reason) VALUES (${spam!.id}, ${nextCitizen()}, 'Werbung') ON CONFLICT DO NOTHING`);
        }
        counts.comments++;
      }
    }
    return { citizens: citizens.length + 15, staff: staff.size, ...counts };
  });

  await recomputeScores(deps.db, { all: true });
  for (const path of ['de.be.bec.nk', 'de.be.bec.sp']) {
    const [t] = await deps.db.execute<{ id: string }>(sql`SELECT id FROM tenant WHERE path = ${path}::ltree`);
    // Replace this week's briefing so it covers the demo reports.
    await deps.db.execute(sql`DELETE FROM briefing WHERE tenant_id = ${t!.id} AND week_start = ${weekStartOf(now)}`);
    await generateBriefing({ db: deps.db, ai: deps.ai }, t!.id, now);
  }
  log(`Seeded ${result.reports} reports, ${result.photos} photos, ${result.comments} comments, ${result.votes} Me too votes, ${result.citizens} citizens and ${result.staff} staff.`);
  return { skipped: false, ...result };
}

/** Two earlier Monday reports at Hermannplatz, resolved: with today's, the place is recurring, "mostly Mondays" (US-52). */
function recurringReports(now: Date): DemoReport[] {
  return previousMondays(now, 2).map((monday, i) => ({
    key: `dump-earlier-${i}`, tenant: 'nk', category: 'illegal_dumping', place: 'Hermannplatz, U-Bahn-Ausgang',
    lat: 52.48695 + i * 0.0002, lon: 13.4249, ageHours: (now.getTime() - monday.getTime()) / HOUR, status: 'resolved',
    coReporters: 1, meToo: 4, danger: 0, scenes: ['dump'], description: 'Sperrmüll und Säcke an der Ecke zum U-Bahn-Ausgang.',
    comments: [], publicNote: 'Die BSR hat den Müll abgeholt.',
  }));
}

async function createCitizens(tx: Tx, now: Date): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= CITIZENS; i++) {
    // Between 30 and 400 days old: settled accounts, so normal votes count fully (US-37).
    const created = new Date(now.getTime() - (30 + ((i * 37) % 370)) * 24 * HOUR).toISOString();
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO account (email, verified_at, locale, created_at)
      VALUES (${`buerger.${String(i).padStart(2, '0')}@${DEMO_DOMAIN}`}, ${created}::timestamptz, ${i % 5 === 0 ? 'en' : 'de'}, ${created}::timestamptz)
      RETURNING id`);
    ids.push(row!.id);
  }
  return ids;
}

async function createSpikeAccounts(tx: Tx, burst: Date, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const created = new Date(burst.getTime() - (1 + (i % 3)) * 24 * HOUR).toISOString();
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO account (email, verified_at, created_at) VALUES (${`neu.${String(i).padStart(2, '0')}@${DEMO_DOMAIN}`}, ${created}::timestamptz, ${created}::timestamptz)
      RETURNING id`);
    ids.push(row!.id);
  }
  return ids;
}

/** Demo staff, linked to Supabase users by email the first time they sign in (ENG-22). */
async function createStaff(tx: Tx): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const s of DEMO_STAFF) {
    const [row] = await tx.execute<{ id: string }>(sql`INSERT INTO account (email) VALUES (${s.email}) RETURNING id`);
    await tx.execute(sql`
      INSERT INTO staff_role (account_id, tenant_id, role) SELECT ${row!.id}, id, ${s.role}::staff_role_kind FROM tenant WHERE path = ${s.path}::ltree`);
    out.set(s.email.split('@')[0]!, row!.id);
  }
  return out;
}
