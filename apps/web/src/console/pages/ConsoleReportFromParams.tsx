'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useT } from '@/i18n/I18nProvider';
import { CONSOLE_QUEUE } from '@/lib/console-paths';
import { reportIdFromSegment } from '@/lib/paths';
import { ReportPage } from './ReportPage';

export function ConsoleReportFromParams() {
  const t = useT();
  const { publicId: segment } = useParams<{ publicId: string }>();
  const publicId = reportIdFromSegment(segment);
  if (!publicId) {
    return (
      <div className="console-page">
        <p className="small">
          <Link href={CONSOLE_QUEUE}>{t('console.report.back')}</Link>
        </p>
        <h1>{t('console.report.notFound')}</h1>
        <p>{t('console.report.notFoundBody')}</p>
      </div>
    );
  }
  return <ReportPage key={publicId} publicId={publicId} />;
}
