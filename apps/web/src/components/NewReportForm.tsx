'use client';

// "Report from the web" (US-03, US-04, US-06, US-08, US-09, US-10, US-11, US-41, US-44).
// 1. Browser location at the moment of reporting, high accuracy (US-03).
// 2. Photos 1–3 with EXIF capture time and GPS; otherwise draft only (US-04, US-06).
// 3. Category (Traffic / Community), description, "Dangerous right now?" (US-08, US-09).
// 4. Pin within 50 m (US-10).
// 5. Review names the receiving office, then post; the report ID is shown (US-11, US-41).
// Phase 3: once signed in, the first photo is uploaded right away and the category suggested from it is pre-selected
// when the AI is confident (US-14). Before posting, "Already reported?" offers up to 3 matching reports nearby; the
// citizen adds their photo to one of them or posts their own (US-13). Neither step ever blocks posting.
import { CATEGORIES, categoryNeedsDescription, MAX_ACCURACY_M, MAX_PHOTO_AGE_HOURS, MAX_PHOTOS } from '@kiezruf/shared';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { formatDistance, formatNumber, type MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import { api, type ApiResult, type RouteAnswer } from '@/lib/api-client';
import { saveDraft } from '@/lib/drafts';
import { readPhotoMeta } from '@/lib/exif';
import { currentFix, distanceM, LocationError, type Fix, type Point } from '@/lib/geo';
import { reportPath } from '@/lib/paths';
import { ACCEPT_ATTRIBUTE, assessPhoto, composeDecision, type ChosenPhoto } from '@/lib/photo-check';
import { coReport, postReport, uploadPhoto, type Posted, type ShownSuggestion } from '@/lib/post-report';
import { topicLabelKey, topicOf } from '@/lib/petition';
import { categoryToPreselect, duplicateSignature, findDuplicates, requestSuggestion, type DuplicateMatch } from '@/lib/report-assist';
import { AlreadyReported } from './AlreadyReported';
import { Confetti } from './kz/Confetti';
import { ShareButton } from './kz/ShareButton';
import { KzIcon } from './kz/ui';
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

type Outcome = { kind: 'posted'; posted: Posted } | { kind: 'matches'; sig: string; matches: DuplicateMatch[] };

export function NewReportForm() {
  const { t, tp, locale } = useI18n();
  const { runAuthed, signedIn } = useAuth();
  const ids = { description: useId(), descriptionHint: useId(), photos: useId(), photosHint: useId(), dangerous: useId(), title: useId(), verify: useId() };

  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteAnswer | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoMessage, setPhotoMessage] = useState<MessageKey | null>(null);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  // The petition's title (app prototype). It becomes the description's first line, which the feed shows as the title.
  const [title, setTitle] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const [pin, setPin] = useState<Point | null>(null);

  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<Posted | null>(null);
  const [draftSaved, setDraftSaved] = useState(0);
  const [draftError, setDraftError] = useState(false);

  // The first photo, uploaded early for the suggestion and the duplicate check (US-13, US-14).
  const [firstUpload, setFirstUpload] = useState<{ photoId: string; key: string } | null>(null);
  const firstInFlight = useRef<string | null>(null);
  /** The suggestion the citizen saw (pre-selected), sent with the report. */
  const [suggested, setSuggested] = useState<ShownSuggestion | null>(null);
  const [dupCheck, setDupCheck] = useState<{ sig: string; matches: DuplicateMatch[] } | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ publicId: string } | null>(null);

  const photosRef = useRef(photos);
  const categoryRef = useRef(category);
  useEffect(() => {
    photosRef.current = photos;
    categoryRef.current = category;
  });
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  // Signed in with a postable first photo: upload it now and ask for a category suggestion. Failures are silent;
  // posting uploads the photo again and goes on without a suggestion.
  const firstPostableId = photos[0]?.verdict.postable ? photos[0].id : null;
  useEffect(() => {
    if (!signedIn || !firstPostableId || firstInFlight.current === firstPostableId) return;
    const photo = photosRef.current.find((p) => p.id === firstPostableId);
    if (!photo) return;
    firstInFlight.current = firstPostableId;
    void (async () => {
      const uploaded = await uploadPhoto(photo.file);
      if (!uploaded.ok) return;
      setFirstUpload({ photoId: photo.id, key: uploaded.data });
      const suggestion = await requestSuggestion(uploaded.data);
      const pick = categoryToPreselect(suggestion, categoryRef.current);
      if (!pick) return;
      setCategory(pick);
      setSuggested({ category: pick, confidence: suggestion.confidence });
    })();
  }, [signedIn, firstPostableId]);

  async function locate() {
    // Close the phone's keyboard: a text field could keep focus while the location check runs (user testing
    // 2026-11-23, "my keyboard was not going away").
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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
      // Counts as an attempted report where Kiezruf is not live yet (US-44).
      const answer = await api<RouteAnswer>('public/report-attempts', { method: 'POST', body: { lat: next.lat, lon: next.lon } });
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
  if (decision.kind === 'empty') missing.push('kz.needMedia');
  if (decision.kind === 'draft') missing.push('kz.needPostable');
  if (!title.trim()) missing.push('kz.needTitle');
  if (!category) missing.push('kz.needTopic');
  if (needsDescription && !description.trim()) missing.push('kz.needDesc');
  if (!fix) missing.push('kz.needLoc');
  else if (route && !live) missing.push('kz.needLive');
  // The duplicate check runs on the public position (the pin) and the first photo (US-13).
  const where = pin ?? fix;
  const firstKey = firstUpload && photos[0]?.id === firstUpload.photoId ? firstUpload.key : null;
  const currentSig = where && category ? duplicateSignature({ lat: where.lat, lon: where.lon, category, photoKey: firstKey }) : null;
  const openMatches = dupCheck && dupCheck.sig === currentSig ? dupCheck.matches : null;
  if (openMatches) missing.push('kz.needAnswer');
  const canPost = missing.length === 0 && decision.kind === 'post' && fix !== null && live;
  const canSaveDraft = photos.length > 0;
  const suggestionShown = suggested !== null && suggested.category === category;
  /** Title on the first line, the citizen's reasons below (lib/petition.ts reads it back). */
  const fullDescription = [title.trim(), description.trim()].filter(Boolean).join('\n').slice(0, MAX_DESCRIPTION_LENGTH);
  const shownTopic = category ? topicOf(category) : null;

  /** The first photo's key, uploading it now if the early upload has not happened. */
  async function ensureFirstKey(): Promise<ApiResult<string | null>> {
    const photo = photos[0];
    if (!photo) return { ok: true, status: 200, data: null };
    if (firstUpload?.photoId === photo.id) return { ok: true, status: 200, data: firstUpload.key };
    const uploaded = await uploadPhoto(photo.file);
    if (!uploaded.ok) return uploaded;
    firstInFlight.current = photo.id;
    setFirstUpload({ photoId: photo.id, key: uploaded.data });
    return uploaded;
  }

  function send(key: string | null, capturedAt: Date, at: Fix) {
    const moved = pin && distanceM(at, pin) >= 1 ? pin : null;
    return postReport({
      category,
      description: fullDescription,
      dangerous,
      fix: at,
      capturedAt,
      pin: moved,
      files: photos.map((p) => p.file),
      uploadedKeys: [key],
      suggestion: suggested,
    });
  }

  function afterPost(result: ApiResult<Posted> | null) {
    if (!result) return;
    if (!result.ok) {
      if (result.error === 'not_live') setRoute({ live: false, tenant: route?.tenant ?? null });
      setPostError(String(result.error));
      return;
    }
    setPosted(result.data);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canPost || decision.kind !== 'post' || !fix || !where) return;
    setPosting(true);
    setPostError(null);
    const capturedAt = decision.capturedAt;
    const at = fix;
    const result = await runAuthed<Outcome>(async () => {
      const key = await ensureFirstKey();
      if (!key.ok) return key;
      // "Already reported?" first; an answer without matches (or an error) goes straight on to posting.
      const found = await findDuplicates({ lat: where.lat, lon: where.lon, category, photoKey: key.data });
      if (!found.ok) return found;
      if (found.data.length > 0) {
        return { ok: true, status: 200, data: { kind: 'matches', sig: duplicateSignature({ lat: where.lat, lon: where.lon, category, photoKey: key.data }), matches: found.data } };
      }
      const posted = await send(key.data, capturedAt, at);
      return posted.ok ? { ok: true, status: posted.status, data: { kind: 'posted', posted: posted.data } } : posted;
    });
    setPosting(false);
    if (!result) return;
    if (!result.ok) return afterPost(result);
    if (result.data.kind === 'matches') {
      setDupCheck({ sig: result.data.sig, matches: result.data.matches });
      return;
    }
    afterPost({ ok: true, status: result.status, data: result.data.posted });
  }

  /** "No, mine is new": post without checking again. */
  async function postAsNew() {
    if (decision.kind !== 'post' || !fix) return;
    setPosting(true);
    setPostError(null);
    const capturedAt = decision.capturedAt;
    const result = await runAuthed(() => send(firstKey, capturedAt, fix));
    setPosting(false);
    if (result?.ok) setDupCheck(null);
    afterPost(result);
  }

  /** "Add my photo to this report": the same capture and photos go to the matched report (US-13). */
  async function join(match: DuplicateMatch) {
    if (decision.kind !== 'post' || !fix) return;
    setJoining(match.publicId);
    setPostError(null);
    const capturedAt = decision.capturedAt;
    const result = await runAuthed(() => coReport(match.publicId, { fix, capturedAt, files: photos.map((p) => p.file), uploadedKeys: [firstKey] }));
    setJoining(null);
    if (!result) return;
    if (!result.ok) {
      setPostError(String(result.error));
      return;
    }
    setJoined({ publicId: result.data?.publicId || match.publicId });
  }

  if (joined) {
    return (
      <SuccessScreen
        title={t('kz.joined')}
        body={t('dup.joinedBody')}
        publicId={joined.publicId}
        primary={{ href: reportPath({ publicId: joined.publicId }), label: t('dup.showReport') }}
      />
    );
  }

  async function keepAsDraft() {
    setDraftError(false);
    try {
      await saveDraft({
        category,
        description: fullDescription,
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
    const petitionTitle = title.trim() || categoryLabel(t, category);
    return (
      <SuccessScreen
        title={t('kz.live')}
        body={t('kz.livePinned', { title: petitionTitle })}
        publicId={posted.publicId}
        primary={{ href: '/', label: t('kz.seeMap') }}
        share={{ path: reportPath({ publicId: posted.publicId, tenantName: route?.tenant?.name }), title: petitionTitle }}
      />
    );
  }

  return (
    <div className="kz-create">
      <form onSubmit={submit} className="kz-create" noValidate>
        {/* Photos (US-04, US-06) */}
        <fieldset className="kz-group kz-fieldset">
          <legend className="kz-field-label">{t('kz.photoLabel')}</legend>
          {photos.length < MAX_PHOTOS ? (
            <label htmlFor={ids.photos} className="kz-drop">
              <span className="kz-drop__icon">
                <KzIcon name="camera" size={22} stroke={2} />
              </span>
              <span>{photos.length ? t('kz.addPhoto') : t('kz.takePhoto')}</span>
              <span className="kz-drop__sub">{t('kz.shotOnSpot', { max: MAX_PHOTOS })}</span>
              <input id={ids.photos} type="file" accept={ACCEPT_ATTRIBUTE} multiple onChange={addPhotos} aria-describedby={ids.photosHint} />
            </label>
          ) : null}
          <p id={ids.photosHint} className="kz-note">
            {t('compose.photosHint', { max: MAX_PHOTOS, hours: MAX_PHOTO_AGE_HOURS })}
          </p>
          {photoMessage ? (
            <p role="alert" className="error">
              {t(photoMessage, { max: MAX_PHOTOS })}
            </p>
          ) : null}
          <p className="kz-note" aria-live="polite">
            {tp('compose.photoCount', photos.length, { max: MAX_PHOTOS })}
          </p>
          {photos.length > 0 ? (
            <ul className="kz-shots">
              {photos.map((p, i) => (
                <li key={p.id} className="kz-shot" data-ok={p.verdict.postable}>
                  {/* Local preview of the citizen's own file (object URL). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={t('compose.photoAlt', { n: i + 1, name: p.file.name })} />
                  <button type="button" className="kz-shot__remove" onClick={() => removePhoto(p.id)} aria-label={t('compose.removePhoto', { n: i + 1 })}>
                    <KzIcon name="close" size={14} stroke={2.6} />
                  </button>
                  <span className="kz-shot__state" data-ok={p.verdict.postable}>
                    {p.verdict.postable ? t('compose.photoOk') : t(`photo.reason.${p.verdict.reason}` as MessageKey, { hours: MAX_PHOTO_AGE_HOURS })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {decision.kind === 'draft' ? <p className="notice info">{t('compose.draftExplain', { hours: MAX_PHOTO_AGE_HOURS })}</p> : null}
        </fieldset>

        {/* Title */}
        <label className="kz-field" htmlFor={ids.title}>
          {t('kz.petTitle')}
          <input
            id={ids.title}
            type="text"
            maxLength={90}
            enterKeyHint="done"
            placeholder={t('kz.titlePh')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // "Done" on the phone's keyboard closes it instead of submitting the half-filled form.
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            required
            aria-required
          />
        </label>

        {/* The categories of v1 (US-08), grouped Traffic / Community; the AI's suggestion pre-selects one (US-14).
            The prototype's topic follows from the category (ENG-26). */}
        <fieldset className="kz-group kz-fieldset">
          <legend className="kz-field-label">{t('review.category')}</legend>
          <div aria-live="polite">
            {suggestionShown ? (
              <p className="notice info suggestion-note">
                <span aria-hidden="true">✦ </span>
                {t('compose.suggested', { category: categoryLabel(t, suggested.category) })}
              </p>
            ) : null}
          </div>
          {(['traffic', 'community'] as const).map((group) => (
            <fieldset key={group} className="kz-group kz-fieldset">
              <legend className="kz-field-label">{t(`group.${group}` as MessageKey)}</legend>
              <div className="kz-chips">
                {CATEGORIES.filter((c) => c.group === group).map((c) => (
                  <label key={c.key} className="kz-choice kz-choice--radio">
                    <input type="radio" name="category" value={c.key} checked={category === c.key} onChange={() => setCategory(c.key)} />
                    {categoryLabel(t, c.key)}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {shownTopic ? (
            <p className="kz-note">
              {t('kz.topic')}: {t(topicLabelKey(shownTopic))}
            </p>
          ) : null}
        </fieldset>

        {/* Why it matters (required for "Other", US-08) */}
        <div className="kz-field">
          <label htmlFor={ids.description}>{needsDescription ? t('compose.descriptionRequired') : t('kz.why')}</label>
          <textarea
            id={ids.description}
            rows={4}
            maxLength={MAX_DESCRIPTION_LENGTH - title.length - 1}
            placeholder={t('kz.descPh')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required={needsDescription}
            aria-required={needsDescription}
            aria-describedby={ids.descriptionHint}
          />
          <span id={ids.descriptionHint} className="kz-note">
            {needsDescription ? t('compose.otherNeedsDescription') : ''} {t('comments.counter', { used: fullDescription.length, max: MAX_DESCRIPTION_LENGTH })}
          </span>
        </div>

        {/* Dangerous right now? (US-09) */}
        <label className="kz-switch" htmlFor={ids.dangerous}>
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

        {/* Verify you are on site (US-03, US-41, US-44), then the pin (US-10) */}
        <section className="kz-verify" data-ok={Boolean(fix && live)} aria-labelledby={ids.verify}>
          <div className="kz-verify__head">
            <span className="kz-verify__icon">
              <KzIcon name="pin" size={20} stroke={2.2} />
            </span>
            <div className="stack-sm">
              <h2 id={ids.verify} className="kz-verify__title">
                {t('kz.verifyTitle')}
              </h2>
              <p className="kz-note">{t('kz.verifyText')}</p>
            </div>
          </div>
          {locating ? (
            <div role="status" className="kz-status-box">
              <span className="kz-blink" />
              {t('kz.finding')}
            </div>
          ) : fix ? (
            <div role="status" className="kz-status-box">
              <span className="kz-tick">
                <KzIcon name="check" size={14} stroke={2.8} />
              </span>
              <span>
                {t('kz.locVerified')}
                <span className="kz-sub">
                  {t('compose.locationOk', { accuracy: formatDistance(locale, fix.accuracyM) })}
                  {route?.live && route.tenant ? ` ${t('compose.receivingOffice', { office: route.tenant.office ?? route.tenant.name, tenant: route.tenant.name })}` : ''}
                </span>
              </span>
            </div>
          ) : null}
          {!locating ? (
            <button type="button" className="kz-soft-button" onClick={locate}>
              {fix ? t('compose.relocate') : t('kz.useLoc')}
            </button>
          ) : null}
          <ErrorText code={locationError} />
          {locationError === 'accuracy_too_low' ? <p className="kz-note">{t('compose.accuracyAdvice', { max: formatNumber(locale, MAX_ACCURACY_M) })}</p> : null}
          {fix && route && !route.live ? <NotLivePanel point={fix} tenantName={route.tenant?.name} /> : null}
          {fix && pin && live ? (
            <details>
              <summary className="kz-field-label">{t('kz.adjustPin')}</summary>
              <PinAdjuster origin={fix} pin={pin} onChange={setPin} />
            </details>
          ) : null}
        </section>

        {/* "Already reported?" (US-13), before publishing */}
        {openMatches ? <AlreadyReported matches={openMatches} busy={joining ?? posting} onJoin={(m) => void join(m)} onNew={() => void postAsNew()} /> : null}

        <div className="kz-sticky-foot stack-sm">
          {missing.length > 0 ? <p className="kz-hint">{t('kz.stillNeeded', { list: missing.map((key) => t(key)).join(', ') })}</p> : null}
          <ErrorText code={postError} />
          <button type="submit" className="kz-cta" disabled={!canPost || posting}>
            {posting ? t('kz.publishing') : t('kz.publish')}
          </button>
          {canSaveDraft ? (
            <button type="button" className="kz-link-button" onClick={keepAsDraft}>
              {t('kz.saveDraft')}
            </button>
          ) : null}
          {draftError ? <ErrorText code="unknown" /> : null}
          {draftSaved > 0 ? (
            <p role="status" className="kz-hint">
              {t('drafts.saved')}
            </p>
          ) : null}
        </div>
      </form>
      <DraftList refresh={draftSaved} />
    </div>
  );
}

/**
 * "Your petition is live." (app prototype): the whole screen blue, with confetti. After publishing, sharing is the
 * main action and the map a quiet link, and the screen says who sets the signature goal (user testing 2026-11-23).
 */
function SuccessScreen({
  title,
  body,
  publicId,
  primary,
  share,
}: {
  title: string;
  body: string;
  publicId: string;
  primary: { href: string; label: string };
  share?: { path: string; title: string };
}) {
  const { t } = useI18n();
  return (
    <section className="kz-success kz-success--page" aria-labelledby="posted-title">
      <div className="kz-success__inner">
        <span className="kz-success__icon">
          <KzIcon name="check" size={34} stroke={2.8} />
        </span>
        <h1 id="posted-title" tabIndex={-1} ref={(el) => el?.focus()}>
          {title}
        </h1>
        <p>{body}</p>
        <p>
          {t('posted.id')} <span className="kz-success__id">{publicId}</span>
        </p>
        {share ? <p className="kz-success__goal">{t('kz.goalNote')}</p> : null}
      </div>
      <div className="kz-success__actions">
        {share ? (
          <>
            <ShareButton path={share.path} title={share.title} className="kz-cta kz-cta--light" />
            <Link href={primary.href} className="kz-link-button kz-link-button--plain">
              {primary.label}
            </Link>
          </>
        ) : (
          <Link href={primary.href} className="kz-cta kz-cta--light">
            {primary.label}
            <KzIcon name="arrow" size={18} stroke={2.4} />
          </Link>
        )}
        <Link href="/my-reports" className="kz-link-button">
          {t('posted.toMyReports')}
        </Link>
      </div>
      <Confetti />
    </section>
  );
}
