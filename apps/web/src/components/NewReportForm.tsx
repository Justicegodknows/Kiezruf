'use client';

// "Report from the web" (US-03, US-04, US-06, US-08, US-09, US-10, US-11, US-41, US-44).
// 1. Browser location at the moment of reporting, high accuracy (US-03).
// 2. Photos 1–3 with EXIF capture time and GPS; otherwise draft only (US-04, US-06).
// 3. Category (Traffic / Community), description, "Dangerous right now?" (US-08, US-09).
// 4. Pin within 50 m (US-10).
// 5. Review names the receiving office, then post; the report ID is shown (US-11, US-41).
import { CATEGORIES, categoryNeedsDescription, MAX_ACCURACY_M, MAX_PHOTO_AGE_HOURS, MAX_PHOTOS } from '@kiezruf/shared';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { formatDistance, formatNumber, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { api, type RouteAnswer } from '@/lib/api-client';
import { saveDraft } from '@/lib/drafts';
import { readPhotoMeta } from '@/lib/exif';
import { currentFix, distanceM, LocationError, type Fix, type Point } from '@/lib/geo';
import { ACCEPT_ATTRIBUTE, assessPhoto, composeDecision, type ChosenPhoto } from '@/lib/photo-check';
import { postReport, type Posted } from '@/lib/post-report';
import { DraftList } from './DraftList';
import { ErrorText } from './ErrorText';
import { categoryLabel } from './labels';
import { NotLivePanel } from './NotLivePanel';
import { PinAdjuster } from './PinAdjuster';

export const MAX_DESCRIPTION_LENGTH = 1000;

interface Photo extends ChosenPhoto {
  id: string;
  preview: string;
}

export function NewReportForm() {
  const { t, tp, locale } = useI18n();
  const { runAuthed } = useAuth();
  const ids = { description: useId(), descriptionHint: useId(), photos: useId(), photosHint: useId(), dangerous: useId() };

  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteAnswer | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoMessage, setPhotoMessage] = useState<MessageKey | null>(null);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const [pin, setPin] = useState<Point | null>(null);

  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [draftSaved, setDraftSaved] = useState(0);
  const [draftError, setDraftError] = useState(false);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  });
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  async function locate() {
    setLocating(true);
    setLocationError(null);
    setRoute(null);
    try {
      const next = await currentFix();
      if (next.accuracyM > MAX_ACCURACY_M) {
        setFix(null);
        setLocationError('accuracy_too_low');
        return;
      }
      setFix(next);
      setPin({ lat: next.lat, lon: next.lon });
      const answer = await api<RouteAnswer>(`public/route?lat=${next.lat.toFixed(6)}&lon=${next.lon.toFixed(6)}`);
      if (answer.ok) setRoute(answer.data);
      else setLocationError(String(answer.error));
    } catch (err) {
      setFix(null);
      setLocationError(err instanceof LocationError ? err.code : 'location_unavailable');
    } finally {
      setLocating(false);
    }
  }

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    setPhotoMessage(files.length > room ? 'photos.tooMany' : null);
    const now = new Date();
    const chosen = await Promise.all(
      files.slice(0, Math.max(0, room)).map(async (file) => {
        const meta = await readPhotoMeta(file);
        return { id: crypto.randomUUID(), file, meta, verdict: assessPhoto(file, meta, now), preview: URL.createObjectURL(file) };
      }),
    );
    setPhotos((prev) => [...prev, ...chosen].slice(0, MAX_PHOTOS));
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
    setPhotoMessage(null);
  }

  const decision = composeDecision(photos);
  const needsDescription = categoryNeedsDescription(category);
  const live = route?.live === true;
  const missing: MessageKey[] = [];
  if (!fix) missing.push('review.missingLocation');
  else if (route && !live) missing.push('review.missingLive');
  if (decision.kind === 'empty') missing.push('review.missingPhoto');
  if (decision.kind === 'draft') missing.push('review.photoDraftOnly');
  if (!category) missing.push('review.missingCategory');
  if (needsDescription && !description.trim()) missing.push('review.missingDescription');
  const canPost = missing.length === 0 && decision.kind === 'post' && fix !== null && live;
  const canSaveDraft = photos.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canPost || decision.kind !== 'post' || !fix) return;
    setPosting(true);
    setPostError(null);
    const moved = pin && distanceM(fix, pin) >= 1 ? pin : null;
    const result = await runAuthed(() =>
      postReport({ category, description, dangerous, fix, capturedAt: decision.capturedAt, pin: moved, files: photos.map((p) => p.file) }),
    );
    setPosting(false);
    if (!result) return;
    if (!result.ok) {
      if (result.error === 'not_live') setRoute({ live: false, tenant: route?.tenant ?? null });
      setPostError(String(result.error));
      return;
    }
    setPosted(result.data);
  }

  async function keepAsDraft() {
    setDraftError(false);
    try {
      await saveDraft({
        category,
        description,
        dangerous,
        reasons: decision.kind === 'draft' ? decision.reasons : [],
        photos: photos.map((p) => ({ name: p.file.name, type: p.file.type, blob: p.file })),
      });
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setDraftSaved((n) => n + 1);
    } catch {
      setDraftError(true);
    }
  }

  if (posted) {
    return (
      <section className="notice success-box" aria-labelledby="posted-title">
        <h2 id="posted-title" tabIndex={-1} ref={(el) => el?.focus()}>
          {t('posted.title')}
        </h2>
        <p>{t('posted.id')}</p>
        <p className="report-id">{posted.publicId}</p>
        <p>{t('posted.processing')}</p>
        <p>{t('posted.following')}</p>
        <p className="row">
          <Link href="/my-reports" className="btn primary">
            {t('posted.toMyReports')}
          </Link>
          <Link href="/" className="btn">
            {t('posted.toMap')}
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="stack">
      <p className="notice info">{t('compose.onSiteNote')}</p>
      <form onSubmit={submit} className="stack compose" noValidate>
        {/* 1. Location */}
        <fieldset className="step">
          <legend>{t('compose.step.location')}</legend>
          <p className="small">{t('compose.locationHint')}</p>
          <button type="button" className="btn" onClick={locate} disabled={locating}>
            {locating ? t('compose.locating') : fix ? t('compose.relocate') : t('compose.locate')}
          </button>
          <div aria-live="polite">
            {fix ? (
              <p className="success">
                <span aria-hidden="true">✓ </span>
                {t('compose.locationOk', { accuracy: formatDistance(locale, fix.accuracyM) })}
              </p>
            ) : null}
            {route?.live && route.tenant ? <p>{t('compose.receivingOffice', { office: route.tenant.office ?? route.tenant.name, tenant: route.tenant.name })}</p> : null}
          </div>
          <ErrorText code={locationError} />
          {locationError === 'accuracy_too_low' ? <p className="small">{t('compose.accuracyAdvice', { max: formatNumber(locale, MAX_ACCURACY_M) })}</p> : null}
          {fix && route && !route.live ? <NotLivePanel point={fix} tenantName={route.tenant?.name} /> : null}
        </fieldset>

        {/* 2. Photos */}
        <fieldset className="step">
          <legend>{t('compose.step.photos')}</legend>
          <p id={ids.photosHint} className="small">
            {t('compose.photosHint', { max: MAX_PHOTOS, hours: MAX_PHOTO_AGE_HOURS })}
          </p>
          <label htmlFor={ids.photos} className="label">
            {t('compose.choosePhotos')}
          </label>
          <input
            id={ids.photos}
            className="file-input"
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            onChange={addPhotos}
            disabled={photos.length >= MAX_PHOTOS}
            aria-describedby={ids.photosHint}
          />
          {photoMessage ? (
            <p role="alert" className="error">
              {t(photoMessage, { max: MAX_PHOTOS })}
            </p>
          ) : null}
          <p className="small muted" aria-live="polite">
            {tp('compose.photoCount', photos.length, { max: MAX_PHOTOS })}
          </p>
          {photos.length > 0 ? (
            <ul className="photo-picks">
              {photos.map((p, i) => (
                <li key={p.id} className={p.verdict.postable ? 'ok' : 'draft'}>
                  {/* Local preview of the citizen's own file (object URL). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={t('compose.photoAlt', { n: i + 1, name: p.file.name })} />
                  <p className="small">
                    {p.verdict.postable ? (
                      <span className="success">
                        <span aria-hidden="true">✓ </span>
                        {t('compose.photoOk')}
                      </span>
                    ) : (
                      <span className="error">
                        <span aria-hidden="true">⚠ </span>
                        {t(`photo.reason.${p.verdict.reason}` as MessageKey, { hours: MAX_PHOTO_AGE_HOURS })}
                      </span>
                    )}
                  </p>
                  <button type="button" className="btn ghost sm" onClick={() => removePhoto(p.id)}>
                    {t('compose.removePhoto', { n: i + 1 })}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {decision.kind === 'draft' ? <p className="notice info">{t('compose.draftExplain', { hours: MAX_PHOTO_AGE_HOURS })}</p> : null}
        </fieldset>

        {/* 3. Category and description */}
        <fieldset className="step">
          <legend>{t('compose.step.category')}</legend>
          {(['traffic', 'community'] as const).map((group) => (
            <fieldset key={group} className="radio-group">
              <legend>{t(`group.${group}` as MessageKey)}</legend>
              {CATEGORIES.filter((c) => c.group === group).map((c) => (
                <label key={c.key} className="radio">
                  <input type="radio" name="category" value={c.key} checked={category === c.key} onChange={() => setCategory(c.key)} />
                  {categoryLabel(t, c.key)}
                </label>
              ))}
            </fieldset>
          ))}
          <div className="field">
            <label htmlFor={ids.description}>
              {needsDescription ? t('compose.descriptionRequired') : t('compose.descriptionOptional')}
            </label>
            <textarea
              id={ids.description}
              rows={4}
              maxLength={MAX_DESCRIPTION_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required={needsDescription}
              aria-required={needsDescription}
              aria-describedby={ids.descriptionHint}
            />
            <p id={ids.descriptionHint} className="small muted">
              {needsDescription ? t('compose.otherNeedsDescription') : ''} {t('comments.counter', { used: description.length, max: MAX_DESCRIPTION_LENGTH })}
            </p>
          </div>
          <label className="checkbox" htmlFor={ids.dangerous}>
            <input id={ids.dangerous} type="checkbox" role="switch" checked={dangerous} onChange={(e) => setDangerous(e.target.checked)} />
            {t('compose.dangerous')}
          </label>
          {dangerous ? (
            <div className="notice emergency" role="alert">
              <p>
                <strong>{t('emergency.title')}</strong>
              </p>
              <p>
                {t('emergency.fire')} <a href="tel:112">112</a> · {t('emergency.police')} <a href="tel:110">110</a>
              </p>
              <p className="small">{t('emergency.note')}</p>
            </div>
          ) : null}
        </fieldset>

        {/* 4. Pin */}
        <fieldset className="step">
          <legend>{t('compose.step.pin')}</legend>
          {fix && pin ? <PinAdjuster origin={fix} pin={pin} onChange={setPin} /> : <p className="small muted">{t('compose.pinNeedsLocation')}</p>}
        </fieldset>

        {/* 5. Review */}
        <fieldset className="step">
          <legend>{t('compose.step.review')}</legend>
          <dl className="facts">
            <dt>{t('review.photos')}</dt>
            <dd>{tp('compose.photoCount', photos.length, { max: MAX_PHOTOS })}</dd>
            <dt>{t('review.category')}</dt>
            <dd>{category ? categoryLabel(t, category) : '–'}</dd>
            <dt>{t('review.description')}</dt>
            <dd>{description.trim() || '–'}</dd>
            <dt>{t('review.dangerous')}</dt>
            <dd>{dangerous ? t('common.yes') : t('common.no')}</dd>
            <dt>{t('review.location')}</dt>
            <dd>{pin ? t('pin.coords', { lat: pin.lat.toFixed(5), lon: pin.lon.toFixed(5) }) : '–'}</dd>
            <dt>{t('review.office')}</dt>
            <dd>{route?.live && route.tenant ? `${route.tenant.office ?? route.tenant.name} (${route.tenant.name})` : '–'}</dd>
          </dl>
          {missing.length > 0 ? (
            <div className="small">
              <p>{t('review.missingIntro')}</p>
              <ul className="bullets">
                {missing.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ErrorText code={postError} />
          <div className="row">
            <button type="submit" className="btn primary" disabled={!canPost || posting}>
              {posting ? t('review.posting') : t('review.post')}
            </button>
            {canSaveDraft ? (
              <button type="button" className="btn" onClick={keepAsDraft}>
                {t('review.saveDraft')}
              </button>
            ) : null}
          </div>
          {draftError ? <ErrorText code="unknown" /> : null}
          {draftSaved > 0 ? (
            <p role="status" className="success">
              {t('drafts.saved')}
            </p>
          ) : null}
        </fieldset>
      </form>
      <DraftList refresh={draftSaved} />
    </div>
  );
}
