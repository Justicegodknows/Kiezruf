// The posting steps after the citizen taps "Post report" (and has signed in):
//   1. upload every photo (the first may already be uploaded for the suggestion, US-14),
//   2. "Already reported?" (US-13): POST /reports/duplicates with the capture point, category and first photo key;
//      with matches, open the duplicates screen; without, or when the check fails, go straight on,
//   3. POST /reports, then "Report posted".
// From the duplicates screen, "No, mine is new" runs step 3 and "Add my photo to this report" co-reports instead.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { coReport, findDuplicates, postReport } from '../api/endpoints';
import { errorCode, errorMessage } from '../api/errors';
import { type Draft, useDraft } from './DraftProvider';
import { captureBody, reportBody, type SubmitProgress, uploadPhotos } from './submit';

export type PostingProgress = SubmitProgress | { step: 'checking' } | { step: 'co-report' };

export function usePosting() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { uploadPhoto, update, reset } = useDraft();
  const [progress, setProgress] = useState<PostingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback((draft: Draft) => uploadPhotos(draft.photos, uploadPhoto, setProgress), [uploadPhoto]);

  const fail = useCallback(
    (draft: Draft, e: unknown) => {
      if (e instanceof ApiError && e.code === 'not_live') {
        const anchor = draft.photos[0]!.capture;
        router.replace({ pathname: '/not-live', params: { tenant: String(e.details.tenant ?? ''), lat: String(anchor.lat), lon: String(anchor.lon) } });
        return;
      }
      setError(errorMessage(t, e));
    },
    [t],
  );

  const finishPost = useCallback(
    async (draft: Draft, keys: string[]) => {
      setProgress({ step: 'post' });
      const posted = await postReport(reportBody(draft, keys));
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      reset();
      router.replace({ pathname: '/posted', params: { publicId: posted.publicId, office: posted.tenant.office || posted.tenant.name } });
    },
    [queryClient, reset],
  );

  /** From the compose screen: upload, check for duplicates, then post or show the matches. */
  const start = useCallback(
    async (draft: Draft) => {
      setError(null);
      try {
        const keys = await upload(draft);
        setProgress({ step: 'checking' });
        const anchor = draft.photos[0]!.capture;
        // The check helps but never blocks posting: if it fails, the report is posted as new.
        const matches = await findDuplicates({ lat: anchor.lat, lon: anchor.lon, category: draft.category!, photoKey: keys[0] })
          .then((r) => r.matches.slice(0, 3))
          .catch(() => []);
        if (matches.length > 0) {
          update({ duplicates: matches });
          router.push('/duplicates');
          return;
        }
        await finishPost(draft, keys);
      } catch (e) {
        fail(draft, e);
      } finally {
        setProgress(null);
      }
    },
    [upload, update, finishPost, fail],
  );

  /** "No, mine is new": post the draft as its own report. */
  const postAsNew = useCallback(
    async (draft: Draft) => {
      setError(null);
      try {
        await finishPost(draft, await upload(draft));
      } catch (e) {
        fail(draft, e);
      } finally {
        setProgress(null);
      }
    },
    [upload, finishPost, fail],
  );

  /** "Add my photo to this report": the citizen becomes a co-reporter and follows it, then the report opens. */
  const addToReport = useCallback(
    async (draft: Draft, publicId: string) => {
      setError(null);
      try {
        const keys = await upload(draft);
        setProgress({ step: 'co-report' });
        const result = await coReport(publicId, { capture: captureBody(draft), photoKeys: keys });
        void queryClient.invalidateQueries({ queryKey: ['me'] });
        void queryClient.invalidateQueries({ queryKey: ['report', result.publicId] });
        reset();
        router.dismissTo('/');
        router.push({ pathname: '/report/[publicId]', params: { publicId: result.publicId, coReported: '1' } });
      } catch (e) {
        // Beyond 150 m the API answers not_on_site; the Me too wording does not fit here.
        setError(errorCode(e) === 'not_on_site' ? t('dup.notOnSite') : errorMessage(t, e));
      } finally {
        setProgress(null);
      }
    },
    [upload, queryClient, reset, t],
  );

  const progressText =
    progress?.step === 'upload'
      ? t('compose.uploading', { n: progress.n, total: progress.total })
      : progress?.step === 'checking'
        ? t('compose.checking')
        : progress?.step === 'co-report'
          ? t('dup.adding')
          : progress
            ? t('compose.posting')
            : null;

  return { start, postAsNew, addToReport, busy: progress !== null, progressText, error, setError };
}
