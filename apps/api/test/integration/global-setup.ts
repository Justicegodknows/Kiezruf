import type { TestProject } from 'vitest/node';
import { startDatabase } from '../support/database.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const database = await startDatabase();
  project.provide('databaseUrl', database.url);
  return database.stop;
}
