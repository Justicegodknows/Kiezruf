// Public surface of @kiezruf/shared.
// Named re-exports, not `export *`: this package loads as CommonJS under Node + tsx (api features,
// api runtime), and Node can only see named exports it can detect statically. Names passed through
// `export *` are invisible there, which broke `api test:features`. Add new exports here by name.
// Relative imports carry `.ts`: plain Node (the built API) strips types natively and needs full paths.
export { DEFAULT_THRESHOLDS, priorityLevel, priorityScore, scoreBreakdown } from './score.ts';
export type { Level, ScoreBreakdown, ScoreInput } from './score.ts';

export { OPEN_BY_SUBCATEGORY, STATUS_ORDER, WEEKLY_TREND, getPublicReport, listPublicReports, listStaffQueue, reportIds } from './demo.ts';
export type { Category, Comment, Lang, Localized, PublicReport, StaffReport, Status, Subcategory } from './demo.ts';

export { ICON_PATHS } from './icons.ts';
export type { IconName } from './icons.ts';

export { PHOTOS, PHOTO_KEYS } from './photos.ts';
export type { PhotoCredit, PhotoKey } from './photos.ts';

export { KIEZ_MAP } from './kiez-map.ts';
export type { MapLabel } from './kiez-map.ts';
