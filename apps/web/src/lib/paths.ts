// Report URLs mirror the tenant tree, as in the web prototype: /berlin/neukoelln/be-nk-2026-0112.
import { REPORT_ID_PATTERN } from '@kiezruf/shared';

/** URL slug for a tenant name: lower case, German umlauts spelled out, everything else a hyphen. */
export function tenantSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The report ID in a URL segment (lower case) back to the API form, or null if it is not a report ID. */
export function reportIdFromSegment(segment: string): string | null {
  const id = decodeURIComponent(segment).toUpperCase();
  return REPORT_ID_PATTERN.test(id) ? id : null;
}

export function reportPath(report: { publicId: string; tenantName?: string | null }): string {
  const tenant = report.tenantName ? tenantSlug(report.tenantName) : 'berlin';
  return `/berlin/${tenant || 'berlin'}/${report.publicId.toLowerCase()}`;
}

/** Statuses a citizen can open on the public map; the others (processing, moderation, rejected) are private. */
export const PUBLIC_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'forwarded'] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const ALL_STATUSES = [...PUBLIC_STATUSES, 'processing', 'in_moderation', 'rejected'] as const;
export type ReportStatus = (typeof ALL_STATUSES)[number];

export function isPublicStatus(status: string): status is PublicStatus {
  return (PUBLIC_STATUSES as readonly string[]).includes(status);
}
