'use client';

// A report as a petition card (app prototype): photo with "Topic · Bezirk", the heat badge, and below the title the
// share of the signature goal as a rising fill. Signatures are the report's Me too votes; never score or level (US-24).
import Link from 'next/link';
import { formatNumber, type Translate } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import type { PublicReport } from '@/lib/api-client';
import { reportPath } from '@/lib/paths';
import { badgeKey, petitionNumbers, pressure, splitDescription, topicLabelKey, topicOf } from '@/lib/petition';
import { categoryLabel } from '../labels';
import { KzIcon } from './ui';

export type FeedReport = PublicReport & { photoUrl?: string | null };

export function petitionView(report: FeedReport, t: Translate) {
  const nums = petitionNumbers(report.meTooCount, report.status);
  const heat = pressure(nums.pct);
  const { title, body } = splitDescription(report.description);
  return {
    nums,
    heat,
    title: title ?? categoryLabel(t, report.category),
    body,
    topic: t(topicLabelKey(topicOf(report.category))),
    badge: badgeKey(report.status, heat.level),
  };
}

export function HeatBadge({ text, level, color }: { text: string; level: number; color: string }) {
  return (
    <span className="kz-badge" data-level={level} style={{ color }}>
      <KzIcon name="flame" size={13} fill />
      {text}
    </span>
  );
}

export function PetitionCard({ report, selected, onLocate }: { report: FeedReport; selected?: boolean; onLocate?: () => void }) {
  const { t, locale } = useI18n();
  const v = petitionView(report, t);
  const n = (x: number) => formatNumber(locale, x);
  const nums = (
    <div className="kz-card__row">
      <h3 className="kz-card__title">{v.title}</h3>
      <div className="kz-card__nums">
        <span className="kz-pct" style={{ color: v.heat.wet ? undefined : v.heat.color }}>
          {v.nums.pct}%
        </span>
        <span className="kz-count">
          <strong>{n(v.nums.count)}</strong> {t('kz.of')} {n(v.nums.goal)} {t('kz.signatures')}
        </span>
      </div>
    </div>
  );
  return (
    <article className="kz-card" data-selected={selected ? 'true' : undefined}>
      <Link href={reportPath(report)} className="kz-card__open" scroll={false}>
        <div className="kz-card__media">
          {report.photoUrl ? (
            // Public, blurred copies from the photo bucket; next/image would proxy them through Vercel.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={report.photoUrl} alt="" loading="lazy" />
          ) : (
            <span className="kz-card__noimg">
              <KzIcon name="image" size={40} stroke={1.6} />
            </span>
          )}
          <span className="kz-card__tag">
            {v.topic} · {report.tenantName}
          </span>
          <HeatBadge text={t(v.badge, { n: n(v.nums.left) })} level={report.status === 'open' || report.status === 'acknowledged' ? v.heat.level : 0} color={v.heat.color} />
        </div>
        <div
          className="kz-card__progress"
          role="progressbar"
          aria-label={t('kz.signaturesCollected')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={v.nums.pct}
          aria-valuetext={`${n(v.nums.count)} ${t('kz.of')} ${n(v.nums.goal)} ${t('kz.signatures')}`}
        >
          <span aria-hidden="true" className="kz-fill" style={{ height: `${v.nums.pct}%`, background: `linear-gradient(0deg, ${v.heat.fillBottom} 0%, ${v.heat.fillTop} 100%)` }} />
          {nums}
          <div aria-hidden="true" className="kz-card__wet" style={{ clipPath: `inset(calc(100% - ${v.nums.pct}%) 0 0 0)` }}>
            {nums}
          </div>
        </div>
      </Link>
      {onLocate ? (
        <button type="button" className="kz-card__locate" onClick={onLocate} aria-label={t('kz.showOnMap')}>
          <KzIcon name="target" size={16} stroke={2} />
        </button>
      ) : null}
    </article>
  );
}

export function PetitionTile({ report }: { report: FeedReport }) {
  const { t } = useI18n();
  const v = petitionView(report, t);
  return (
    <Link href={reportPath(report)} className="kz-tile" scroll={false}>
      {report.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={report.photoUrl} alt="" loading="lazy" />
      ) : (
        <span className="kz-card__noimg">
          <KzIcon name="image" size={30} stroke={1.6} />
        </span>
      )}
      <span className="kz-tile__shade">
        <span className="kz-tile__title">{v.title}</span>
        <span className="kz-tile__pct">{v.nums.pct}%</span>
      </span>
    </Link>
  );
}
