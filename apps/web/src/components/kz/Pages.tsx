'use client';

// The citizen screens with a back button (app prototype): new petition, account, and the citizen's petition lists.
// Each brings the top bar and the pale blue page; the content components hold the logic.
import { useI18n } from '@/i18n/I18nProvider';
import { AccountSettings } from '../AccountSettings';
import { DraftList } from '../DraftList';
import { NewReportForm } from '../NewReportForm';
import { OwnReportList } from '../OwnReportList';
import { KzTopBar } from './ui';

export function NewPetitionPage() {
  const { t } = useI18n();
  return (
    <div className="kz-page">
      <KzTopBar title={t('kz.newPetition')} backLabel={t('kz.closeNew')} />
      <div className="kz-page__inner">
        <NewReportForm />
      </div>
    </div>
  );
}

export function AccountPage() {
  const { t } = useI18n();
  return (
    <div className="kz-page">
      <KzTopBar title={t('kz.yourAccount')} right={<span />} />
      <div className="kz-page__inner">
        <AccountSettings />
      </div>
    </div>
  );
}

export function PetitionListPage({ kind }: { kind: 'reports' | 'follows' }) {
  const { t } = useI18n();
  return (
    <div className="kz-page">
      <KzTopBar title={kind === 'reports' ? t('kz.myPetitions') : t('kz.followed')} backHref="/account" backLabel={t('kz.yourAccount')} />
      <div className="kz-page__inner">
        {kind === 'follows' ? <p className="kz-note">{t('following.intro')}</p> : null}
        <OwnReportList kind={kind} />
        {kind === 'reports' ? <DraftList refresh={0} /> : null}
      </div>
    </div>
  );
}
