'use client';

// Forward link (US-45, apps/api/features/forward-by-email.feature): an external authority opens the report from
// the email without an account. Read-only: blurred photos, location, description, the office's public note. No
// score or level (US-24). After 90 days the API answers 410 link_expired: "This link has expired".
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ErrorText } from '@/components/ErrorText';
import { SkipLink } from '@/components/SkipLink';
import { categoryLabel, groupLabel, statusLabel } from '@/components/labels';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, LOCALES, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow } from '@/lib/api-client';
import { LocationMap } from '../components/LocationMap';

/** GET /forwarded/:token. Assumed shape: the public report fields plus the forwarding office and note. */
export interface ForwardedReport {
  publicId: string;
  category: string;
  status: string;
  description: string | null;
  lat: number | null;
  lon: number | null;
  createdAt: string | null;
  tenantName: string | null;
  office: string | null;
  photos: { url: string }[];
  publicNote: string | null;
  forwardedAt: string | null;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

function normalize(value: unknown): ForwardedReport {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const report = (raw.report && typeof raw.report === 'object' ? raw.report : raw) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const tenant = report.tenant && typeof report.tenant === 'object' ? (report.tenant as Record<string, unknown>) : {};
  return {
    publicId: s(report.publicId) ?? '',
    category: s(report.category) ?? '',
    status: s(report.status) ?? 'forwarded',
    description: s(report.description),
    lat: n(report.lat),
    lon: n(report.lon),
    createdAt: s(report.createdAt),
    tenantName: s(report.tenantName) ?? s(tenant.name) ?? (typeof report.tenant === 'string' ? report.tenant : null),
    office: s(report.office) ?? s(raw.office),
    photos: (Array.isArray(report.photos) ? report.photos : [])
      .map((p) => s((p as Record<string, unknown>)?.url ?? (p as Record<string, unknown>)?.blurredUrl))
      .filter((u): u is string => u !== null)
      .map((url) => ({ url })),
    publicNote: s(report.publicNote) ?? s(raw.publicNote) ?? s(raw.note),
    forwardedAt: s(raw.forwardedAt) ?? s(report.forwardedAt),
  };
}

export function ForwardedShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <SkipLink />
      <header className="site-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Kiezruf
        </span>
        <div className="header-tools">
          <div role="group" aria-label={t('nav.language')} className="lang-switch">
            {LOCALES.map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => setLocale(l)} className="btn ghost sm">
                {t(`language.${l}` as MessageKey)}
              </button>
            ))}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}

export function ForwardedFromParams() {
  const { token } = useParams<{ token: string }>();
  return <ForwardedView token={token} />;
}

export function ForwardedView({ token }: { token: string }) {
  const { t, locale } = useI18n();
  const valid = TOKEN_PATTERN.test(token);
  const query = useQuery({
    queryKey: ['forwarded', token],
    queryFn: async () => normalize(await apiOrThrow<unknown>(`forwarded/${token}`)),
    enabled: valid,
    retry: false,
  });

  const code = !valid ? 'not_found' : query.isError ? ((query.error as { code?: string }).code ?? 'unknown') : null;
  if (code) {
    return (
      <div className="page narrow">
        <h1>{code === 'link_expired' ? t('forwarded.expired') : code === 'not_found' ? t('forwarded.notFound') : t('forwarded.title')}</h1>
        {code === 'link_expired' ? <p>{t('forwarded.expiredBody')}</p> : code === 'not_found' ? <p>{t('forwarded.notFoundBody')}</p> : <ErrorText code={code} />}
      </div>
    );
  }
  const r = query.data;
  if (!r) return <p className="page narrow" role="status">{t('common.loading')}</p>;

  return (
    <article className="page narrow detail stack" aria-labelledby="fwd-title">
      <div>
        <p className="small muted">
          {t('forwarded.intro', { office: r.office ?? r.tenantName ?? 'Kiezruf' })}
        </p>
        <p className="small muted">
          {groupLabel(t, r.category)} · <span className="mono">{r.publicId}</span>
        </p>
        <h1 id="fwd-title">{categoryLabel(t, r.category)}</h1>
        <StatusBadge status={r.status} label={statusLabel(t, r.status)} />
      </div>
      {r.photos.length > 0 ? (
        <ul className="photos">
          {r.photos.map((p, i) => (
            <li key={p.url}>
              {/* Blurred photos from storage; next/image would proxy them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={t('detail.photoAlt', { n: i + 1, total: r.photos.length, category: categoryLabel(t, r.category) })} loading="lazy" />
            </li>
          ))}
        </ul>
      ) : null}
      {r.description ? <p className="card-desc">{r.description}</p> : null}
      {r.publicNote ? (
        <section className="notice info" aria-labelledby="fwd-note">
          <h2 id="fwd-note">{t('forwarded.note')}</h2>
          <p>{r.publicNote}</p>
        </section>
      ) : null}
      {r.lat !== null && r.lon !== null ? <LocationMap lat={r.lat} lon={r.lon} label={t('forwarded.location')} /> : null}
      <dl className="facts small">
        {r.tenantName ? (
          <>
            <dt>{t('forwarded.from')}</dt>
            <dd>{r.office ? `${r.office} (${r.tenantName})` : r.tenantName}</dd>
          </>
        ) : null}
        {r.createdAt ? (
          <>
            <dt>{t('detail.reported')}</dt>
            <dd>{formatDateTime(locale, r.createdAt)}</dd>
          </>
        ) : null}
        {r.forwardedAt ? (
          <>
            <dt>{t('forwarded.forwardedAt')}</dt>
            <dd>{formatDateTime(locale, r.forwardedAt)}</dd>
          </>
        ) : null}
      </dl>
      <p className="small muted">{t('forwarded.privacy')}</p>
    </article>
  );
}
