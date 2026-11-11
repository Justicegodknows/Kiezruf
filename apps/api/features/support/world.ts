import { After, Before, setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import { buildApp } from '../../src/app.js';

// One API instance per scenario, called in-process with app.inject() (no network, no port).
export class KiezrufWorld extends World {
  app = buildApp();
  lastResponse?: { statusCode: number; body: unknown };

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(KiezrufWorld);

Before(async function (this: KiezrufWorld) {
  await this.app.ready();
});

After(async function (this: KiezrufWorld) {
  await this.app.close();
});

// Steps return 'pending' until their story is built. Remove a feature's @wip tag only when all its steps are real.
export const PENDING = 'pending' as const;
