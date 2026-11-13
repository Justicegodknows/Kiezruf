// Component tests for the citizen web and the municipal console, named after the prototype screens.
// Placeholders for components not built yet. Each becomes a real test with its component.
// Built and tested: level chip, Me too toggle (src/components/components.test.tsx), i18n (src/i18n/i18n.test.ts).
import { describe, it } from 'vitest';

describe('console: score breakdown panel (US-22, US-24)', () => {
  it.todo('shows co-reporters × 5, commenters × 2 and Me too × 1');
  it.todo('shows decay, danger and safety multipliers, and their product equals the shown score');
  it.todo('shows discounted votes when a spike was handled (US-26)');
});

describe('console: level chip (US-23)', () => {
  it.todo('marks a manual override and shows its reason (US-27)');
});

describe('console: scope breadcrumb (US-42, US-43)', () => {
  it.todo('disables levels above the role scope');
  it.todo('offers only live or pilot tenants below the current level');
});

describe('console: forward form (US-45)', () => {
  it.todo('lists parent tenants, live sibling tenants and saved external contacts');
  it.todo('requires a public note when forwarding');
});

describe('console: override form (US-27)', () => {
  it.todo('blocks saving an override without a reason');
});

describe('citizen web: report card (US-15, US-24)', () => {
  it.todo('shows status, Me too count and co-reporters, and never a score or level');
});

describe('citizen web: Me too button (US-18)', () => {
  it.todo('opens sign-in for a guest and completes the vote after sign-in (US-01)');
});
