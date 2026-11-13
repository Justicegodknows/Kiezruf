import { STATUS_ORDER, type Status } from '@kiezruf/shared';
import Link from 'next/link';
import { StatusBadge } from './Badges';
import { Icon } from './Icon';

/**
 * A phone-sized rendering of the app's report screen, built from the real report data (not a
 * screenshot), so it stays in step with the design and the language. It is a picture of the app:
 * a pointer can click through to the report, while keyboard and screen-reader users get the
 * visible text link next to it, so the report is never announced twice.
 */
export function AppPreview({
  href,
  breadcrumb,
  title,
  status,
  statusLabel,
  statusLabels,
  note,
  noteTitle,
  meToo,
  affected,
}: {
  href: string;
  breadcrumb: string;
  title: string;
  status: Status;
  statusLabel: string;
  statusLabels: Record<Status, string>;
  note?: string;
  noteTitle: string;
  meToo: string;
  affected: string;
}) {
  const step = STATUS_ORDER.indexOf(status);
  return (
    <Link href={href} className="device" aria-hidden="true" tabIndex={-1}>
      <span className="device__screen">
        <span className="device__bar">
          <span className="device__time">9:41</span>
          <span className="device__notch" />
        </span>
        <span className="device__nav">
          <Icon name="arrowLeft" size={14} />
        </span>
        <span className="device__body">
          <span className="device__crumb">{breadcrumb}</span>
          <span className="device__title">{title}</span>
          <StatusBadge status={status} label={statusLabel} />
          <span className="device__timeline">
            {STATUS_ORDER.map((s, i) => (
              <span key={s} className="device__step" data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
                <span className="device__dot" />
                <span className="device__step-label">{statusLabels[s]}</span>
              </span>
            ))}
          </span>
          {note && (
            <span className="device__note">
              <strong>{noteTitle}</strong>
              {note}
            </span>
          )}
        </span>
        <span className="device__action">
          <span className="device__button">
            <Icon name="hand" size={15} />
            {meToo}
          </span>
          <span className="device__affected">{affected}</span>
        </span>
      </span>
    </Link>
  );
}
