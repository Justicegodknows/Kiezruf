// Schema v1 (engineering plan, "Data model and tenancy"): tenant, account, staff_role, report, photo.
// Tables and indexes live here and drizzle-kit turns them into SQL (`pnpm --filter api db:generate`).
// Triggers, database roles, row-level security and the public_report view are hand-written SQL in
// drizzle/0002_tenant_isolation.sql, because drizzle-kit does not manage them.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// PostgreSQL types Drizzle has no built-in column for. Values travel as text (ltree) or are written with PostGIS functions.
const ltree = customType<{ data: string }>({ dataType: () => 'ltree' });
const multiPolygon = customType<{ data: string }>({ dataType: () => 'geometry(MultiPolygon,4326)' });
const geographyPoint = customType<{ data: string }>({ dataType: () => 'geography(Point,4326)' });
// No fixed dimension yet: it depends on the vlincta.com embedding model (E-01).
const vector = customType<{ data: string }>({ dataType: () => 'vector' });

export const tenantType = pgEnum('tenant_type', [
  'country',
  'land',
  'regierungsbezirk',
  'kreis',
  'kreisfreie_stadt',
  'gemeinde',
  'bezirk',
]);
export const tenantStatus = pgEnum('tenant_status', ['grouping', 'not_live', 'pilot', 'live']);
export const staffRoleKind = pgEnum('staff_role_kind', ['platform_admin', 'tenant_admin', 'case_worker', 'viewer']);
// US-28: Open → Acknowledged → In progress → Resolved; Rejected; Forwarded.
// 'processing' = accepted, blur still running. 'in_moderation' = blur failed 3 times. Neither is ever public.
export const reportStatus = pgEnum('report_status', [
  'processing',
  'in_moderation',
  'open',
  'acknowledged',
  'in_progress',
  'resolved',
  'rejected',
  'forwarded',
  // A duplicate merged into another report (US-17). Never public; merged_into_id names the report it joined.
  'merged',
]);
export const blurStatus = pgEnum('blur_status', ['pending', 'done', 'failed']);
export const reactionKind = pgEnum('reaction_kind', ['co_reporter', 'comment', 'me_too', 'danger']);
// 'held': the language filter stopped it; staff review it in the moderation queue (US-19, US-33).
export const commentState = pgEnum('comment_state', ['visible', 'held', 'removed']);
export const pushPlatform = pgEnum('push_platform', ['ios', 'android']);
export const notificationKind = pgEnum('notification_kind', ['status_change', 'go_live']);
export const spikeState = pgEnum('spike_state', ['none', 'flagged', 'confirmed', 'cleared']);
export const auditKind = pgEnum('audit_kind', [
  'status',
  'override',
  'forward',
  'merge',
  'spike',
  'comment',
  'ban',
  'role_grant',
  'role_revoke',
  'tenant_status',
  'settings',
  'contact',
]);

export const tenant = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => tenant.id, { onDelete: 'restrict' }),
    // Materialised path, e.g. de.be.bec.nk. A trigger checks it extends the parent's path and never changes.
    path: ltree('path').notNull(),
    type: tenantType('type').notNull(),
    name: text('name').notNull(),
    // Receiving office shown to the citizen before posting (US-41), e.g. "Bezirksamt Neukölln".
    office: text('office'),
    // Amtlicher Gemeindeschlüssel, or Berlin's 8-digit Bezirk key (11000008).
    agsKey: text('ags_key'),
    // Short code used in report IDs: BE (Land), NK (tenant) → BE-NK-2026-0118.
    code: text('code'),
    status: tenantStatus('status').notNull().default('grouping'),
    boundary: multiPolygon('boundary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenant_path_key').on(t.path),
    index('tenant_path_gist').using('gist', t.path),
    index('tenant_boundary_gist').using('gist', t.boundary),
    index('tenant_parent_idx').on(t.parentId),
    // A tenant that receives reports needs a boundary to route by and a code for report IDs.
    check(
      'tenant_receiving_complete',
      sql`${t.status} NOT IN ('pilot', 'live') OR (${t.boundary} IS NOT NULL AND ${t.code} IS NOT NULL)`,
    ),
  ],
);

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The Supabase Auth user (ENG-22). Null until the person first signs in (e.g. invited staff).
    authUserId: uuid('auth_user_id'),
    email: text('email'),
    phone: text('phone'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    locale: text('locale').notNull().default('de'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Set by the delete job (US-34), which also clears email and phone.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Banned by a moderator (US-33): no sign-in, no session.
    bannedAt: timestamp('banned_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('account_email_key').on(sql`lower(${t.email})`),
    uniqueIndex('account_phone_key').on(t.phone),
    uniqueIndex('account_auth_user_key').on(t.authUserId),
    check(
      'account_has_contact',
      sql`${t.deletedAt} IS NOT NULL OR ${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`,
    ),
  ],
);

// One role per account and node. A role applies to the node and everything below it (US-42).
export const staffRole = pgTable(
  'staff_role',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    role: staffRoleKind('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.tenantId] }), index('staff_role_tenant_idx').on(t.tenantId)],
);

export const report = pgTable(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicId: text('public_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'restrict' }),
    // Copy of the tenant's path, filled by a trigger on insert, so row-level security is one indexed <@ check.
    // The default only satisfies NOT NULL until the trigger overwrites it.
    tenantPath: ltree('tenant_path')
      .notNull()
      .default(sql`''::ltree`),
    // Category key. Becomes a foreign key when the category table arrives in Phase 1.
    category: text('category').notNull(),
    status: reportStatus('status').notNull().default('processing'),
    description: text('description'),
    dangerous: boolean('dangerous').notNull().default(false),
    // Where the report is shown on the public map.
    location: geographyPoint('location').notNull(),
    // Private: the GPS fix and time at capture (US-31, US-32). Never in a public payload.
    captureLocation: geographyPoint('capture_location').notNull(),
    captureAccuracyM: real('capture_accuracy_m'),
    captureAt: timestamp('capture_at', { withTimezone: true }).notNull(),
    // Null after the author deletes their account: the report stays, attributed to "a neighbour" (US-34).
    createdBy: uuid('created_by').references(() => account.id, { onDelete: 'set null' }),
    // The office's note to citizens, shown with the status (US-28).
    publicNote: text('public_note'),
    mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => report.id, { onDelete: 'set null' }),
    // Set when a report was forwarded to another tenant: the original tenant keeps reading it (US-45).
    forwardedFromTenantId: uuid('forwarded_from_tenant_id').references(() => tenant.id, { onDelete: 'set null' }),
    forwardedFromPath: ltree('forwarded_from_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('report_public_id_key').on(t.publicId),
    index('report_tenant_path_gist').using('gist', t.tenantPath),
    index('report_location_gist').using('gist', t.location),
    index('report_tenant_status_idx').on(t.tenantId, t.status),
    index('report_created_by_idx').on(t.createdBy),
  ],
);

export const photo = pgTable(
  'photo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    // Object key of the original in the private bucket.
    originalKey: text('original_key').notNull(),
    // Object key of the blurred, EXIF-free copy in the public bucket. Null until blur succeeds (US-16).
    publicKey: text('public_key'),
    blurStatus: blurStatus('blur_status').notNull().default('pending'),
    phash: text('phash'),
    embedding: vector('embedding'),
    // Photo pipeline (Phase 3): tries so far, why it failed for good, and the AI's category suggestion.
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    failureReason: text('failure_reason'),
    aiCategory: text('ai_category'),
    aiConfidence: real('ai_confidence'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('photo_report_idx').on(t.reportId),
    check('photo_public_only_when_blurred', sql`${t.publicKey} IS NULL OR ${t.blurStatus} = 'done'`),
  ],
);

// --- Phase 1: sign-in, posting, votes -------------------------------------------------------------

// Report ID sequence per tenant and year (US-41). Advanced only by the next_report_sequence() function.
export const reportSequence = pgTable(
  'report_sequence',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    lastValue: integer('last_value').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.year] })],
);

// An attempt to post where Kiezruf is not live (US-44), counted per area as demand for onboarding.
// No account and no exact location: only the deepest tenant at the point, or null outside every boundary.
export const demandSignal = pgTable(
  'demand_signal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('demand_signal_tenant_idx').on(t.tenantId)],
);

// Citizen reactions that feed the score (US-18, US-22). One per account, report and kind.
// A spike discount sets the weight to 0.5 (US-26).
export const reaction = pgTable(
  'reaction',
  {
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    kind: reactionKind('kind').notNull(),
    weight: real('weight').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.accountId, t.kind] }), index('reaction_account_idx').on(t.accountId)],
);

// --- Phase 1: comments, follow, notifications --------------------------------------------------------

// Flat comments on a report (US-19). The author is never shown publicly.
export const comment = pgTable(
  'comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    state: commentState('state').notNull().default('visible'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('comment_report_idx').on(t.reportId, t.createdAt),
    check('comment_body_length', sql`char_length(${t.body}) BETWEEN 1 AND 500`),
  ],
);

// "Flag on every comment" (US-19). One flag per account and comment.
export const commentFlag = pgTable(
  'comment_flag',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => comment.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.accountId] })],
);

// Followers get every status change (US-20). Reporters and Me too voters follow automatically.
export const follow = pgTable(
  'follow',
  {
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.accountId] }), index('follow_account_idx').on(t.accountId)],
);

// Expo push tokens (US-29). A token belongs to the account last signed in on that device.
export const pushToken = pgTable(
  'push_token',
  {
    token: text('token').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    platform: pushPlatform('platform').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_token_account_idx').on(t.accountId)],
);

// Per-type notification switches (US-29). No row means everything is on.
export const notificationSetting = pgTable('notification_setting', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => account.id, { onDelete: 'cascade' }),
  statusChangePush: boolean('status_change_push').notNull().default(true),
  statusChangeEmail: boolean('status_change_email').notNull().default(true),
  goLivePush: boolean('go_live_push').notNull().default(true),
  goLiveEmail: boolean('go_live_email').notNull().default(true),
});

// "Tell me when it starts here" (US-44).
export const goLiveAlert = pgTable(
  'go_live_alert',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.tenantId] }), index('go_live_alert_tenant_idx').on(t.tenantId)],
);

// Outbox: written by database triggers in the same transaction as the change, delivered by the worker.
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    kind: notificationKind('kind').notNull(),
    reportId: uuid('report_id').references(() => report.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [index('notification_pending_idx').on(t.createdAt).where(sql`${t.sentAt} IS NULL`)],
);

// --- Phase 2: admin console -------------------------------------------------------------------------

// The priority score per report (US-22, US-23, US-26, US-27). The worker recomputes rows marked dirty;
// triggers mark them when votes, comments or the report change. Staff-only (US-24).
export const reportScore = pgTable('report_score', {
  reportId: uuid('report_id')
    .primaryKey()
    .references(() => report.id, { onDelete: 'cascade' }),
  score: real('score').notNull().default(0),
  // The computed level, before any override.
  level: text('level').notNull().default('Low'),
  breakdown: jsonb('breakdown').notNull().default({}),
  overrideLevel: text('override_level'),
  overrideReason: text('override_reason'),
  overrideBy: uuid('override_by').references(() => account.id, { onDelete: 'set null' }),
  overrideAt: timestamp('override_at', { withTimezone: true }),
  // The level staff see: the override if set, else the computed level. Compared on each recompute.
  effectiveLevel: text('effective_level').notNull().default('Low'),
  // When the effective level last changed (US-23).
  levelChangedAt: timestamp('level_changed_at', { withTimezone: true }).notNull().defaultNow(),
  spikeState: spikeState('spike_state').notNull().default('none'),
  spikeReason: text('spike_reason'),
  dirty: boolean('dirty').notNull().default(true),
  computedAt: timestamp('computed_at', { withTimezone: true }),
});

// Per-tenant score thresholds (US-23, US-46). No row means the defaults 60 / 25 / 10.
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    critical: real('critical').notNull().default(60),
    high: real('high').notNull().default(25),
    medium: real('medium').notNull().default(10),
  },
  (t) => [check('tenant_settings_falling', sql`${t.critical} > ${t.high} AND ${t.high} > ${t.medium} AND ${t.medium} > 0`)],
);

// Saved outside authorities a tenant forwards to by email, e.g. Verkehrslenkung Berlin (US-45, D-10).
export const externalContact = pgTable(
  'external_contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('external_contact_tenant_idx').on(t.tenantId)],
);

// One forwarding of a report (US-45): to another tenant, or to an external contact with a login-free link.
export const forward = pgTable(
  'forward',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => report.id, { onDelete: 'cascade' }),
    targetTenantId: uuid('target_tenant_id').references(() => tenant.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => externalContact.id, { onDelete: 'set null' }),
    // SHA-256 of the link token; only for external contacts.
    tokenHash: text('token_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    publicNote: text('public_note'),
    actorId: uuid('actor_id').references(() => account.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('forward_report_idx').on(t.reportId),
    uniqueIndex('forward_token_key').on(t.tokenHash),
    check('forward_one_target', sql`(${t.targetTenantId} IS NULL) <> (${t.contactId} IS NULL)`),
  ],
);

// Audit log: status changes, overrides, forwards, merges, moderation, bans, role grants, tenant changes.
// Retained for 3 years (engineering plan, Security: "Audit"). Written only by the API's staff paths.
export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: auditKind('kind').notNull(),
    reportId: uuid('report_id').references(() => report.id, { onDelete: 'set null' }),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => account.id, { onDelete: 'set null' }),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    publicNote: text('public_note'),
    reason: text('reason'),
    data: jsonb('data').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_event_report_idx').on(t.reportId, t.createdAt), index('audit_event_tenant_idx').on(t.tenantId, t.createdAt)],
);

// --- Phase 3: analysis and AI ------------------------------------------------------------------------

// What the photo AI suggested and what the citizen chose (US-14: "corrections are logged as training feedback").
export const categoryFeedback = pgTable('category_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => report.id, { onDelete: 'cascade' }),
  suggested: text('suggested').notNull(),
  confidence: real('confidence'),
  chosen: text('chosen').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The weekly briefing per tenant and roll-up node (US-53). Items cite report IDs; ratings come from staff (US-54).
export const briefing = pgTable(
  'briefing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    // Monday of the briefing's week, Europe/Berlin.
    weekStart: text('week_start').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    aiWritten: boolean('ai_written').notNull(),
    fallback: boolean('fallback').notNull(),
    model: text('model'),
    promptVersion: text('prompt_version'),
    // SHA-256 of the input sent to the provider, so a briefing can be traced without storing the input.
    inputHash: text('input_hash'),
    droppedItems: integer('dropped_items').notNull().default(0),
  },
  (t) => [uniqueIndex('briefing_tenant_week_key').on(t.tenantId, t.weekStart)],
);

export const briefingItem = pgTable(
  'briefing_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    briefingId: uuid('briefing_id')
      .notNull()
      .references(() => briefing.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    level: text('level').notNull(),
    kind: text('kind').notNull(),
    headline: text('headline').notNull(),
    text: text('text').notNull(),
    citations: text('citations').array().notNull(),
  },
  (t) => [index('briefing_item_briefing_idx').on(t.briefingId, t.position)],
);

export const briefingRating = pgTable(
  'briefing_rating',
  {
    itemId: uuid('item_id')
      .notNull()
      .references(() => briefingItem.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    useful: boolean('useful').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.accountId] })],
);

// The Monday email to tenant admins (US-56, D-17): one row per recipient, retried until sent.
export const briefingDelivery = pgTable(
  'briefing_delivery',
  {
    briefingId: uuid('briefing_id')
      .notNull()
      .references(() => briefing.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => account.id, { onDelete: 'cascade' }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [primaryKey({ columns: [t.briefingId, t.accountId] })],
);

// Staff choices, e.g. no Monday email (US-56: "Staff can unsubscribe").
export const staffPreference = pgTable('staff_preference', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => account.id, { onDelete: 'cascade' }),
  briefingEmail: boolean('briefing_email').notNull().default(true),
});

export type StaffRoleKind = (typeof staffRoleKind.enumValues)[number];
export type TenantStatus = (typeof tenantStatus.enumValues)[number];
export type ReportStatus = (typeof reportStatus.enumValues)[number];
