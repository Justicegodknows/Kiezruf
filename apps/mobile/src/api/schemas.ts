// Response shapes from the API (README "API (citizen core)", apps/api/src). zod strips unknown keys, so even if a
// response ever carried a score or level it would not reach the UI (US-24).
import { z } from 'zod';

const num = z.coerce.number();

/** Statuses a citizen can see. "processing" and "in_moderation" only appear in My reports. */
export const REPORT_STATUSES = [
  'processing',
  'in_moderation',
  'open',
  'acknowledged',
  'in_progress',
  'resolved',
  'rejected',
  'forwarded',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
/** Filterable statuses on the public map (apps/api/src/public/routes.ts PUBLIC_STATUSES). */
export const PUBLIC_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'forwarded'] as const;

const Status = z.string().transform((s): ReportStatus => ((REPORT_STATUSES as readonly string[]).includes(s) ? (s as ReportStatus) : 'open'));

export const PublicReport = z.object({
  publicId: z.string(),
  category: z.string(),
  status: Status,
  description: z.string().nullish(),
  dangerous: z.boolean().optional(),
  lat: num,
  lon: num,
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  meTooCount: num.default(0),
  tenantName: z.string().nullish(),
  office: z.string().nullish(),
  distanceM: num.optional(),
});
export type PublicReport = z.infer<typeof PublicReport>;

export const NearbyReports = z.object({ reports: z.array(PublicReport) });

export const ReportDetail = PublicReport.extend({
  photos: z.array(z.object({ url: z.string() })).default([]),
});
export type ReportDetail = z.infer<typeof ReportDetail>;

const TenantInfo = z.object({ name: z.string(), office: z.string().nullish(), status: z.string().optional() });

export const RouteResult = z.object({ live: z.boolean(), tenant: TenantInfo.nullable() });
export type RouteResult = z.infer<typeof RouteResult>;

export const UploadTicket = z.object({
  key: z.string(),
  url: z.string(),
  method: z.literal('PUT').default('PUT'),
  headers: z.record(z.string(), z.string()).default({}),
  expiresAt: z.string().optional(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const PostedReport = z.object({
  publicId: z.string(),
  status: z.string(),
  tenant: z.object({ name: z.string(), office: z.string().nullish() }),
});
export type PostedReport = z.infer<typeof PostedReport>;

export const MyReport = z.object({
  publicId: z.string(),
  category: z.string(),
  status: Status,
  description: z.string().nullish(),
  createdAt: z.string(),
  tenantName: z.string().nullish(),
  office: z.string().nullish(),
});
export type MyReport = z.infer<typeof MyReport>;
export const MyReports = z.object({ reports: z.array(MyReport) });

/** GET /me/follows. Assumed to list reports like My reports; extra fields are dropped. */
export const FollowedReports = z
  .object({ reports: z.array(MyReport).optional(), follows: z.array(MyReport).optional() })
  .transform((v) => ({ reports: v.reports ?? v.follows ?? [] }));

export const MeTooResult = z.object({ voted: z.boolean(), meTooCount: num });

export const ReportRelation = z.object({
  following: z.boolean().default(false),
  meToo: z.boolean().default(false),
  mine: z.boolean().default(false),
});
export type ReportRelation = z.infer<typeof ReportRelation>;

export const Comment = z.object({ id: z.string(), body: z.string(), createdAt: z.string() });
export type Comment = z.infer<typeof Comment>;
export const Comments = z.object({ comments: z.array(Comment) });
export const PostedComment = z.object({ id: z.string().optional(), held: z.boolean().default(false) });

const Channel = z.object({ push: z.boolean(), email: z.boolean() });
export const NotificationSettings = z.object({ statusChange: Channel, goLive: Channel });
export type NotificationSettings = z.infer<typeof NotificationSettings>;

export const Me = z.object({ id: z.string(), email: z.string(), locale: z.string(), createdAt: z.string().optional() });
export type Me = z.infer<typeof Me>;

export const Session = z.object({ token: z.string(), expiresAt: z.string(), newAccount: z.boolean().optional() });
