// Twelve weeks of earlier reports for the demo, so the console's trends, hotspots, response times and the public map
// look like a district that has used Kiezruf for a while. Real places in Neukölln and Spandau, German texts as citizens
// and the district offices write them. Deterministic: the same `now` always gives the same reports.
import type { DemoReport } from './demo.js';
import type { Scene } from './demo-photos.js';

const WEEKS = 12;
/** Newer than this is covered by the hand-written reports in demo.ts. */
const NEWEST_AGE_DAYS = 5;

/** Small seeded generator (mulberry32), so every run builds the same history. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Place {
  name: string;
  lat: number;
  lon: number;
}

// Real streets and squares; coordinates inside each Bezirk.
const PLACES: Record<'nk' | 'sp', Place[]> = {
  nk: [
    { name: 'Hermannstraße 140', lat: 52.4706, lon: 13.4282 },
    { name: 'Hermannstraße, S+U Hermannstraße', lat: 52.4675, lon: 13.4313 },
    { name: 'Karl-Marx-Straße 92', lat: 52.4786, lon: 13.4389 },
    { name: 'Karl-Marx-Straße, U Rathaus Neukölln', lat: 52.4815, lon: 13.4347 },
    { name: 'Sonnenallee 67', lat: 52.4846, lon: 13.4335 },
    { name: 'Sonnenallee 160', lat: 52.4794, lon: 13.4499 },
    { name: 'Weserstraße 50', lat: 52.4865, lon: 13.4357 },
    { name: 'Reuterplatz', lat: 52.4891, lon: 13.4296 },
    { name: 'Maybachufer, Wochenmarkt', lat: 52.4925, lon: 13.4268 },
    { name: 'Pannierstraße 20', lat: 52.4884, lon: 13.431 },
    { name: 'Flughafenstraße 40', lat: 52.4809, lon: 13.4258 },
    { name: 'Boddinstraße 12', lat: 52.4797, lon: 13.4279 },
    { name: 'Schillerpromenade', lat: 52.4771, lon: 13.4215 },
    { name: 'Tempelhofer Feld, Eingang Oderstraße', lat: 52.4772, lon: 13.4185 },
    { name: 'Richardplatz', lat: 52.474, lon: 13.4436 },
    { name: 'Kranoldplatz', lat: 52.4685, lon: 13.441 },
    { name: 'Weigandufer', lat: 52.4877, lon: 13.4425 },
    { name: 'Elbestraße 20', lat: 52.4826, lon: 13.446 },
    { name: 'Volkspark Hasenheide, Eingang Columbiadamm', lat: 52.4835, lon: 13.417 },
    { name: 'Britzer Damm 100', lat: 52.4547, lon: 13.4335 },
    { name: 'Blaschkoallee, U-Bahnhof', lat: 52.4524, lon: 13.4489 },
    { name: 'Lipschitzallee 70', lat: 52.4256, lon: 13.4627 },
    { name: 'Johannisthaler Chaussee', lat: 52.43, lon: 13.452 },
    { name: 'Neuköllner Straße, Rudow', lat: 52.418, lon: 13.497 },
  ],
  sp: [
    { name: 'Carl-Schurz-Straße, Altstadt', lat: 52.537, lon: 13.204 },
    { name: 'Altstädter Ring, Rathaus Spandau', lat: 52.535, lon: 13.2 },
    { name: 'Falkenseer Platz', lat: 52.54, lon: 13.2005 },
    { name: 'Pichelsdorfer Straße', lat: 52.524, lon: 13.1975 },
    { name: 'Heerstraße, Wilhelmstadt', lat: 52.5195, lon: 13.192 },
    { name: 'Nonnendammallee, Siemensstadt', lat: 52.537, lon: 13.265 },
    { name: 'Gartenfelder Straße, Haselhorst', lat: 52.542, lon: 13.241 },
    { name: 'Westerwaldstraße, Falkenhagener Feld', lat: 52.552, lon: 13.168 },
    { name: 'Streitstraße, Hakenfelde', lat: 52.56, lon: 13.205 },
    { name: 'Obstallee, Staaken', lat: 52.534, lon: 13.13 },
    { name: 'Zitadelle Spandau, Am Juliusturm', lat: 52.541, lon: 13.213 },
    { name: 'Imchenplatz, Kladow', lat: 52.454, lon: 13.144 },
    { name: 'Kladower Damm, Gatow', lat: 52.47, lon: 13.172 },
  ],
};

interface CategoryText {
  scene: Scene;
  safety: boolean;
  descriptions: string[];
  comments: string[];
  done: string;
  progress: string;
}

// What citizens write and what the office answers, per category.
const TEXTS: Record<string, CategoryText> = {
  illegal_dumping: {
    scene: 'dump', safety: false,
    descriptions: ['Sperrmüll an der Ecke: Sofa, Matratze und mehrere Säcke.', 'Hier wurden über Nacht Bauabfälle abgeladen.', 'Kühlschrank und Kartons stehen seit Tagen auf dem Gehweg.', 'Wieder ein Haufen Müllsäcke neben den Glascontainern.'],
    comments: ['Das ist jede Woche dasselbe hier.', 'Riecht schon ziemlich.', 'Die Ratten freuen sich.'],
    done: 'Die BSR hat den Müll abgeholt. Danke für die Meldung.', progress: 'Die Abholung durch die BSR ist beauftragt.',
  },
  pothole: {
    scene: 'pothole', safety: true,
    descriptions: ['Tiefes Schlagloch auf der Fahrbahn, Radfahrer weichen in den Verkehr aus.', 'Schlagloch am Bordstein, bei Regen nicht zu sehen.', 'Mehrere Löcher hintereinander im Asphalt.', 'Die Gehwegplatten sind abgesackt, Stolperfalle.'],
    comments: ['Bin mit dem Rad fast gestürzt.', 'Mit dem Kinderwagen kaum zu umfahren.', 'Seit dem Frost noch schlimmer.'],
    done: 'Das Straßen- und Grünflächenamt hat die Stelle ausgebessert.', progress: 'Die Ausbesserung ist für diese Woche eingeplant.',
  },
  street_lighting: {
    scene: 'lamp', safety: true,
    descriptions: ['Die Straßenlaterne ist seit Tagen dunkel.', 'Drei Laternen hintereinander aus, der Weg ist nachts stockdunkel.', 'Laterne flackert die ganze Nacht.'],
    comments: ['Nachts unangenehm, hier allein lang zu gehen.', 'Auch gestern noch aus.'],
    done: 'Die Leuchten wurden repariert und brennen wieder.', progress: 'Der Auftrag liegt bei der Firma für die Straßenbeleuchtung.',
  },
  traffic_light: {
    scene: 'light', safety: true,
    descriptions: ['Die Fußgängerampel zeigt kein Grün mehr.', 'Ampel fällt immer wieder aus, besonders morgens.', 'Das Signal für Radfahrer ist dunkel.'],
    comments: ['Hier gehen viele Schulkinder rüber.', 'Autos fahren einfach durch.'],
    done: 'Die Lichtsignalanlage ist wieder in Betrieb.', progress: 'Die Störung ist beim Team für Lichtsignalanlagen gemeldet.',
  },
  bike_lane: {
    scene: 'van', safety: false,
    descriptions: ['Lieferwagen parken jeden Morgen auf dem Radweg.', 'Der Radweg ist durch Baustellenmaterial blockiert.', 'E-Scooter liegen quer über dem Radweg.'],
    comments: ['Jeden Tag dasselbe.', 'Man muss auf die Fahrbahn ausweichen.'],
    done: 'Das Ordnungsamt kontrolliert hier jetzt regelmäßig.', progress: 'Das Ordnungsamt ist informiert.',
  },
  waste_bins: {
    scene: 'bins', safety: false,
    descriptions: ['Die Mülleimer quellen über, Abfall liegt daneben.', 'Papierkorb ist abgerissen.', 'Die Eimer am Spielplatz werden zu selten geleert.'],
    comments: ['Am Wochenende besonders schlimm.', 'Krähen verteilen alles auf der Wiese.'],
    done: 'Die Leerung wurde nachgeholt und der Rhythmus erhöht.', progress: 'Die Leerung ist beauftragt.',
  },
  road_sign: {
    scene: 'sign', safety: true,
    descriptions: ['Verkehrsschild ist umgefahren und liegt am Boden.', 'Das Schild ist zugewachsen und nicht mehr zu sehen.', 'Schild verdreht, zeigt in die falsche Richtung.'],
    comments: ['Gefährlich an dieser Kreuzung.'],
    done: 'Das Schild wurde wieder aufgestellt.', progress: 'Die Reparatur ist beauftragt.',
  },
  playground: {
    scene: 'swing', safety: true,
    descriptions: ['Am Klettergerüst fehlt eine Sprosse.', 'Glasscherben im Sandkasten.', 'Die Schaukel hängt schief, ein Seil ist eingerissen.'],
    comments: ['Meine Kinder spielen hier jeden Tag.', 'Bitte schnell, bevor sich jemand verletzt.'],
    done: 'Das Spielgerät wurde repariert und geprüft.', progress: 'Der Bereich ist abgesperrt, die Reparatur folgt.',
  },
  public_toilet: {
    scene: 'toilet', safety: false,
    descriptions: ['Die öffentliche Toilette ist außer Betrieb.', 'Die Tür der Toilette lässt sich nicht öffnen.'],
    comments: ['Seit über einer Woche.'],
    done: 'Die Toilette ist wieder in Betrieb.', progress: 'Der Betreiber ist informiert.',
  },
  youth_centre: {
    scene: 'door', safety: false,
    descriptions: ['Am Jugendzentrum ist ein Fenster eingeschlagen.', 'Die Beleuchtung am Eingang des Jugendzentrums ist kaputt.'],
    comments: ['Die Jugendlichen warten draußen im Dunkeln.'],
    done: 'Der Schaden am Jugendzentrum ist behoben.', progress: 'Der Hausmeisterdienst ist beauftragt.',
  },
};

// How often each category comes up, per Bezirk. Illegal dumping rises in Neukölln over the twelve weeks (trends).
const MIX: Record<'nk' | 'sp', [string, number][]> = {
  nk: [['illegal_dumping', 5], ['pothole', 3], ['street_lighting', 2], ['bike_lane', 2], ['waste_bins', 2], ['traffic_light', 1], ['playground', 1], ['road_sign', 1], ['public_toilet', 1], ['youth_centre', 1]],
  sp: [['street_lighting', 3], ['pothole', 3], ['waste_bins', 2], ['road_sign', 2], ['illegal_dumping', 1], ['playground', 1], ['bike_lane', 1]],
};

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)]!;
}

function weighted(rnd: () => number, mix: [string, number][], boost: Record<string, number>): string {
  const total = mix.reduce((s, [k, w]) => s + w * (boost[k] ?? 1), 0);
  let x = rnd() * total;
  for (const [k, w] of mix) {
    x -= w * (boost[k] ?? 1);
    if (x <= 0) return k;
  }
  return mix[0]![0];
}

/** Earlier reports, oldest first, each with the office's status changes. */
export function historyReports(now: Date): DemoReport[] {
  const rnd = random(20261118);
  const out: DemoReport[] = [];
  for (const tenant of ['nk', 'sp'] as const) {
    for (let week = WEEKS; week >= 1; week--) {
      // Neukölln about 9 a week, Spandau about 5; more in recent weeks.
      const base = tenant === 'nk' ? 7 : 4;
      const count = base + Math.round((WEEKS - week) / 4) + Math.floor(rnd() * 3);
      // Dumping in Neukölln grows towards the present: the trend the briefing points out.
      const boost: Record<string, number> = tenant === 'nk' ? { illegal_dumping: 0.6 + (WEEKS - week) / 8 } : {};
      for (let i = 0; i < count; i++) {
        const ageDays = Math.max(NEWEST_AGE_DAYS + rnd(), (week - 1) * 7 + rnd() * 7);
        const ageHours = Math.round(ageDays * 24 * 10) / 10;
        const category = weighted(rnd, MIX[tenant], boost);
        const text = TEXTS[category]!;
        const place = pick(rnd, PLACES[tenant]);
        const jitter = () => (rnd() - 0.5) * 0.0012;
        const timeline = officeTimeline(rnd, ageHours, tenant, text);
        const status = timeline.length ? timeline.at(-1)!.status : 'open';
        const danger = text.safety && rnd() < 0.35 ? 1 + Math.floor(rnd() * 3) : 0;
        out.push({
          key: `history-${tenant}-${week}-${i}`,
          tenant,
          category,
          place: place.name,
          lat: place.lat + jitter(),
          lon: place.lon + jitter(),
          ageHours,
          status,
          coReporters: rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0,
          meToo: Math.floor(rnd() * rnd() * 14),
          danger,
          scenes: [text.scene],
          description: pick(rnd, text.descriptions),
          comments: rnd() < 0.45 ? [pick(rnd, text.comments)] : [],
          publicNote: timeline.at(-1)?.note,
          timeline,
          history: true,
        });
      }
    }
  }
  return out;
}

/** The office's status changes: acknowledged within hours, then in progress, most resolved within days. */
function officeTimeline(rnd: () => number, ageHours: number, tenant: 'nk' | 'sp', text: CategoryText): NonNullable<DemoReport['timeline']> {
  const steps: NonNullable<DemoReport['timeline']> = [];
  // Neukölln answers faster than Spandau (the comparison in the console's trends).
  let at = (tenant === 'nk' ? 3 : 8) + rnd() * (tenant === 'nk' ? 30 : 50);
  if (rnd() < 0.06 || at >= ageHours) return steps; // a few stay open
  steps.push({ status: 'acknowledged', afterHours: at, note: 'Danke für die Meldung. Wir kümmern uns darum.' });
  at += 12 + rnd() * 60;
  if (at >= ageHours || rnd() < 0.08) return steps;
  steps.push({ status: 'in_progress', afterHours: at, note: text.progress });
  at += 12 + rnd() * 9 * 24;
  if (at >= ageHours) return steps;
  steps.push({ status: 'resolved', afterHours: at, note: text.done });
  return steps;
}

/** Where people tried to report in Bezirke that are not live yet (US-44): demand the console shows. */
export const DEMAND: { path: string; count: number }[] = [
  { path: 'de.be.bec.fk', count: 41 },
  { path: 'de.be.bec.mi', count: 33 },
  { path: 'de.be.bec.ts', count: 22 },
  { path: 'de.be.bec.pa', count: 17 },
  { path: 'de.be.bec.cw', count: 9 },
];
