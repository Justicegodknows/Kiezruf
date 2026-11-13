'use client';

import { useParams } from 'next/navigation';
import { useT } from '@/i18n/I18nProvider';
import { reportIdFromSegment } from '@/lib/paths';
import { ReportDetailView } from './ReportDetailView';

export function ReportDetailFromParams() {
  const t = useT();
  const { reportId } = useParams<{ reportId: string }>();
  const publicId = reportIdFromSegment(reportId);
  if (!publicId) {
    return (
      <div className="detail">
        <h2>{t('detail.notFound')}</h2>
        <p>{t('detail.notFoundBody')}</p>
      </div>
    );
  }
  return <ReportDetailView key={publicId} publicId={publicId} />;
}
