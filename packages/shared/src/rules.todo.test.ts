// Domain rules that belong in packages/shared but are not written yet.
// Each `it.todo` becomes a real test in the same PR that adds the rule (Definition of Done: unit tests for new domain logic).
// Done so far: report IDs (ids.test.ts) and the location gate (location-gate.test.ts). Me too votes are API
// behaviour, tested in apps/api/test/integration/citizen-api.int.test.ts.
// Source: product plan stories and the engineering plan's Gherkin scenarios.
import { describe, it } from 'vitest';

describe('spike detection (US-26, US-37)', () => {
  it.todo('flags 19 votes in 40 min when 15 come from accounts younger than 7 days');
  it.todo('does not flag 19 votes in 40 min when only 4 come from new accounts');
  it.todo('does not flag 10 votes in 60 min (the rule needs more than 10)');
  it.todo('counts flagged new-account votes at half weight');
  it.todo('counts each account once per report, after duplicates are merged (US-17)');
});

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

describe('forward links (US-45)', () => {
  it.todo('creates a link that opens the report without a login');
  it.todo('expires the link after 90 days');
});
