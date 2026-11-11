// Domain rules that belong in packages/shared but are not written yet.
// Each `it.todo` becomes a real test in the same PR that adds the rule (Definition of Done: unit tests for new domain logic).
// Done so far: report IDs (ids.test.ts), the location gate (location-gate.test.ts), spike detection and forward-link
// expiry (scoring.test.ts). Me too votes are API
// behaviour, tested in apps/api/test/integration/citizen-api.int.test.ts.
// Source: product plan stories and the engineering plan's Gherkin scenarios.
import { describe, it } from 'vitest';

describe('briefing validation (US-53)', () => {
  it.todo('keeps at most 5 items');
  it.todo('drops an item that cites a report outside the tenant scope');
  it.todo('drops an item with no citations');
  it.todo('labels every briefing as AI-written');
});

describe('pseudonymisation before AI calls (D-13)', () => {
  it.todo('removes German phone numbers such as "0171 1234567" and "+49 30 1234567"');
  it.todo('removes email addresses');
  it.todo('removes first names that address a person, e.g. "Call me, Anna"');
  it.todo('leaves street names and place names intact, e.g. "Karl-Marx-Straße"');
});
