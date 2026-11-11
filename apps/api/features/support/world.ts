import { After, AfterAll, Before, setDefaultTimeout, setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { Db } from '../../src/db/client.js';
import { buildTestApp, type TestApp } from '../../test/support/app.js';
import { createMigratedDatabase, startDatabase } from '../../test/support/database.js';

setDefaultTimeout(30_000);

// The scenarios' clock. Fixed, because the Gherkin text names the year ("BE-NK-2026-\d{4}").
export const SCENARIO_NOW = new Date('2026-11-11T10:00:00Z');

// One PostgreSQL (infra/postgres image, via Testcontainers) for the whole run, migrated and seeded once.
// Started on first use, so a run without scenarios needs no Docker.
let shared: Promise<{ db: Db; stop: () => Promise<void> }> | undefined;
function database() {
  shared ??= (async () => {
    const server = await startDatabase();
    const db = await createMigratedDatabase(server.url, 'features', { seed: true });
    return {
      db,
      stop: async () => {
        await db.$client.end();
        await server.stop();
      },
    };
  })();
  return shared;
}

// One API instance per scenario, called in-process with app.inject() (no network, no port).
export class KiezrufWorld extends World {
  db!: Db;
  t!: TestApp;
  token?: string;
  lastResponse?: { statusCode: number; body: Record<string, unknown> };
  capture = { lat: 52.4795, lon: 13.4365, accuracyM: 20 };
  before: { reports: number; signals: Map<string, number> } = { reports: 0, signals: new Map() };
  /** Session tokens of the same account on several devices. */
  devices: string[] = [];
  email?: string;
  publicId?: string;
  /** A signed-in citizen, created on first use. */
  citizen?: string;
  /** The signed-in staff member's session. */
  staffToken?: string;
  /** Report IDs a step created or looked at. */
  reportIds: string[] = [];
  /** The token of the last forward link. */
  forwardToken?: string;
  mailsBefore = 0;
  spike?: { votes: number; minutes: number; fresh?: number };

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(KiezrufWorld);

Before({ timeout: 600_000 }, async function (this: KiezrufWorld) {
  this.db = (await database()).db;
  this.t = await buildTestApp(this.db, { clock: () => SCENARIO_NOW });
});

After(async function (this: KiezrufWorld) {
  await this.t?.app.close();
});

AfterAll({ timeout: 60_000 }, async () => {
  if (shared) await (await shared).stop();
});

// Steps return 'pending' until their story is built. Remove a feature's @wip tag only when all its steps are real.
export const PENDING = 'pending' as const;
