'use client';

// Report actions for staff who may change the report (US-17, US-26, US-27, US-28, US-45). Each form validates
// what the API would refuse (required reason or note) before sending, and shows the API's error codes translated.
// The forms get a `submit` callback, so the page decides which endpoint they call.
import { REPORT_ID_PATTERN, type Level } from '@kiezruf/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Dialog } from '@/components/Dialog';
import { ErrorText } from '@/components/ErrorText';
import { statusLabel } from '@/components/labels';
import type { MessageKey } from '@/i18n';
import { useI18n } from '@/i18n/I18nProvider';
import type { ApiResult } from '@/lib/api-client';
import { levelLabel } from '../format';
import { LEVELS, SETTABLE_STATUSES, type ForwardTargets, type Override, type SettableStatus } from '../types';

export const MAX_NOTE_LENGTH = 1000;
export const MAX_REASON_LENGTH = 500;

type Submit<P> = (payload: P) => Promise<ApiResult<unknown>>;

/** busy / API error / client-side problem / success message, shared by every form. */
function useFormState() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<MessageKey | null>(null);
  async function run(action: () => Promise<ApiResult<unknown>>, success: MessageKey): Promise<boolean> {
    setBusy(true);
    setError(null);
    setProblem(null);
    setDone(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(String(result.error));
      return false;
    }
    setDone(success);
    return true;
  }
  function invalid(key: MessageKey) {
    setDone(null);
    setError(null);
    setProblem(key);
  }
  return { busy, error, problem, done, run, invalid };
}

function Feedback({ id, state }: { id: string; state: ReturnType<typeof useFormState> }) {
  const { t } = useI18n();
  return (
    <>
      {state.problem ? (
        <p id={id} role="alert" className="error">
          <span aria-hidden="true">⚠ </span>
          {t(state.problem)}
        </p>
      ) : (
        <ErrorText id={id} code={state.error} />
      )}
      {state.done ? (
        <p role="status" className="success">
          {t(state.done)}
        </p>
      ) : null}
    </>
  );
}

function TextArea({
  label,
  value,
  onChange,
  max,
  required,
  invalid,
  errorId,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  required?: boolean;
  invalid?: boolean;
  errorId?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={hintId} className="small muted">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        rows={3}
        maxLength={max}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={[hint ? hintId : null, invalid && errorId ? errorId : null].filter(Boolean).join(' ') || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// --- Status (US-28) -------------------------------------------------------------------------------------------

export function StatusForm({ current, submit }: { current: string; submit: Submit<{ status: SettableStatus; publicNote?: string; reason?: string }> }) {
  const { t } = useI18n();
  const state = useFormState();
  const selectId = useId();
  const errorId = useId();
  const initial = (SETTABLE_STATUSES as readonly string[]).includes(current) ? (current as SettableStatus) : 'acknowledged';
  const [status, setStatus] = useState<SettableStatus>(initial);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const needsReason = status === 'rejected';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (needsReason && !reason.trim()) return state.invalid('console.status.reasonRequired');
    const payload: { status: SettableStatus; publicNote?: string; reason?: string } = { status };
    if (note.trim()) payload.publicNote = note.trim();
    if (needsReason) payload.reason = reason.trim();
    if (await state.run(() => submit(payload), 'console.status.saved')) {
      setNote('');
      setReason('');
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-sm action-form" aria-labelledby={`${selectId}-legend`} noValidate>
      <h3 id={`${selectId}-legend`}>{t('console.status.title')}</h3>
      <div className="field">
        <label htmlFor={selectId}>{t('console.status.label')}</label>
        <select id={selectId} value={status} onChange={(e) => setStatus(e.target.value as SettableStatus)}>
          {SETTABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(t, s)}
            </option>
          ))}
        </select>
      </div>
      <TextArea label={t('console.status.publicNote')} hint={t('console.status.publicNoteHint')} value={note} onChange={setNote} max={MAX_NOTE_LENGTH} />
      {needsReason ? (
        <TextArea
          label={t('console.status.reason')}
          value={reason}
          onChange={setReason}
          max={MAX_REASON_LENGTH}
          required
          invalid={state.problem === 'console.status.reasonRequired'}
          errorId={errorId}
        />
      ) : null}
      <Feedback id={errorId} state={state} />
      <button type="submit" className="btn primary" disabled={state.busy}>
        {state.busy ? t('common.sending') : t('console.status.submit')}
      </button>
    </form>
  );
}

// --- Override (US-27) -----------------------------------------------------------------------------------------

export function OverrideForm({ override, submit }: { override: Override | null; submit: Submit<{ level: Level | null; reason: string }> }) {
  const { t } = useI18n();
  const state = useFormState();
  const selectId = useId();
  const errorId = useId();
  const [level, setLevel] = useState<Level | ''>(override?.level ?? '');
  const [reason, setReason] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return state.invalid('console.override.reasonRequired');
    if (await state.run(() => submit({ level: level || null, reason: reason.trim() }), level ? 'console.override.saved' : 'console.override.cleared')) setReason('');
  }

  return (
    <form onSubmit={onSubmit} className="stack-sm action-form" aria-labelledby={`${selectId}-legend`} noValidate>
      <h3 id={`${selectId}-legend`}>{t('console.override.title')}</h3>
      <div className="field">
        <label htmlFor={selectId}>{t('console.override.level')}</label>
        <select id={selectId} value={level} onChange={(e) => setLevel(e.target.value as Level | '')}>
          <option value="">{t('console.override.useScore')}</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {levelLabel(t, l)}
            </option>
          ))}
        </select>
      </div>
      <TextArea
        label={t('console.override.reason')}
        hint={t('console.override.reasonHint')}
        value={reason}
        onChange={setReason}
        max={MAX_REASON_LENGTH}
        required
        invalid={state.problem === 'console.override.reasonRequired'}
        errorId={errorId}
      />
      <Feedback id={errorId} state={state} />
      <button type="submit" className="btn" disabled={state.busy}>
        {state.busy ? t('common.sending') : t('console.override.submit')}
      </button>
    </form>
  );
}

// --- Forward (US-45) ------------------------------------------------------------------------------------------

export type ForwardPayload = ({ tenantId: string } | { contactId: string }) & { publicNote: string };

export function ForwardForm({ targets, submit }: { targets: ForwardTargets; submit: Submit<ForwardPayload> }) {
  const { t } = useI18n();
  const state = useFormState();
  const selectId = useId();
  const errorId = useId();
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const empty = targets.parents.length + targets.siblings.length + targets.contacts.length === 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!target) return state.invalid('console.forward.targetRequired');
    if (!note.trim()) return state.invalid('console.forward.noteRequired');
    const [kind, id] = target.split(':') as ['tenant' | 'contact', string];
    const payload: ForwardPayload = kind === 'tenant' ? { tenantId: id, publicNote: note.trim() } : { contactId: id, publicNote: note.trim() };
    if (await state.run(() => submit(payload), 'console.forward.done')) {
      setTarget('');
      setNote('');
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-sm action-form" aria-labelledby={`${selectId}-legend`} noValidate>
      <h3 id={`${selectId}-legend`}>{t('console.forward.title')}</h3>
      {empty ? (
        <p className="small muted">{t('console.forward.none')}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor={selectId}>{t('console.forward.target')}</label>
            <select
              id={selectId}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-invalid={state.problem === 'console.forward.targetRequired' || undefined}
              aria-describedby={state.problem === 'console.forward.targetRequired' ? errorId : undefined}
            >
              <option value="">{t('console.forward.choose')}</option>
              {targets.parents.length ? (
                <optgroup label={t('console.forward.parents')}>
                  {targets.parents.map((x) => (
                    <option key={x.id} value={`tenant:${x.id}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {targets.siblings.length ? (
                <optgroup label={t('console.forward.siblings')}>
                  {targets.siblings.map((x) => (
                    <option key={x.id} value={`tenant:${x.id}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {targets.contacts.length ? (
                <optgroup label={t('console.forward.contacts')}>
                  {targets.contacts.map((x) => (
                    <option key={x.id} value={`contact:${x.id}`}>
                      {x.email ? `${x.name} (${x.email})` : x.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          <TextArea
            label={t('console.forward.note')}
            hint={t('console.forward.noteHint')}
            value={note}
            onChange={setNote}
            max={MAX_NOTE_LENGTH}
            required
            invalid={state.problem === 'console.forward.noteRequired'}
            errorId={errorId}
          />
          <Feedback id={errorId} state={state} />
          <button type="submit" className="btn" disabled={state.busy}>
            {state.busy ? t('common.sending') : t('console.forward.submit')}
          </button>
        </>
      )}
    </form>
  );
}

// --- Merge (US-17) --------------------------------------------------------------------------------------------

export function MergeForm({
  publicId,
  candidates,
  submit,
  onMerged,
}: {
  publicId: string;
  /** Report IDs of the same tenant, offered as suggestions. */
  candidates: string[];
  submit: Submit<{ into: string }>;
  onMerged?: (into: string) => void;
}) {
  const { t } = useI18n();
  const state = useFormState();
  const inputId = useId();
  const listId = useId();
  const errorId = useId();
  const hintId = useId();
  const [into, setInto] = useState('');
  const [confirming, setConfirming] = useState(false);
  const target = into.trim().toUpperCase();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!REPORT_ID_PATTERN.test(target)) return state.invalid('console.merge.invalidId');
    if (target === publicId) return state.invalid('console.merge.sameReport');
    setConfirming(true);
  }

  async function confirm() {
    setConfirming(false);
    if (await state.run(() => submit({ into: target }), 'console.merge.done')) onMerged?.(target);
  }

  const invalid = state.problem === 'console.merge.invalidId' || state.problem === 'console.merge.sameReport';
  return (
    <form onSubmit={onSubmit} className="stack-sm action-form" aria-labelledby={`${inputId}-legend`} noValidate>
      <h3 id={`${inputId}-legend`}>{t('console.merge.title')}</h3>
      <div className="field">
        <label htmlFor={inputId}>{t('console.merge.into')}</label>
        <p id={hintId} className="small muted">
          {t('console.merge.hint')}
        </p>
        <input
          id={inputId}
          type="text"
          list={listId}
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          value={into}
          onChange={(e) => setInto(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
        />
        <datalist id={listId}>
          {candidates
            .filter((c) => c !== publicId)
            .map((c) => (
              <option key={c} value={c} />
            ))}
        </datalist>
      </div>
      <Feedback id={errorId} state={state} />
      <button type="submit" className="btn" disabled={state.busy}>
        {state.busy ? t('common.sending') : t('console.merge.submit')}
      </button>
      <Dialog open={confirming} title={t('console.merge.confirmTitle')} onClose={() => setConfirming(false)}>
        <p>{t('console.merge.confirmBody', { from: publicId, into: target })}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => void confirm()}>
            {t('console.merge.confirm')}
          </button>
          <button type="button" className="btn" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </Dialog>
    </form>
  );
}

// --- Vote spike (US-26, US-37) --------------------------------------------------------------------------------

export function SpikeActions({ submit }: { submit: Submit<{ action: 'confirm' | 'clear'; reason: string }> }) {
  const { t } = useI18n();
  const state = useFormState();
  const errorId = useId();
  const [reason, setReason] = useState('');

  async function act(action: 'confirm' | 'clear') {
    if (!reason.trim()) return state.invalid('console.spike.reasonRequired');
    if (await state.run(() => submit({ action, reason: reason.trim() }), action === 'confirm' ? 'console.spike.confirmed' : 'console.spike.cleared')) setReason('');
  }

  return (
    <div className="stack-sm">
      <TextArea
        label={t('console.spike.reason')}
        value={reason}
        onChange={setReason}
        max={MAX_REASON_LENGTH}
        required
        invalid={state.problem === 'console.spike.reasonRequired'}
        errorId={errorId}
      />
      <Feedback id={errorId} state={state} />
      <div className="row">
        <button type="button" className="btn primary sm" disabled={state.busy} onClick={() => void act('confirm')}>
          {t('console.spike.confirm')}
        </button>
        <button type="button" className="btn sm" disabled={state.busy} onClick={() => void act('clear')}>
          {t('console.spike.clear')}
        </button>
      </div>
    </div>
  );
}

// --- Reason prompt (comment moderation, bans) -----------------------------------------------------------------

/** A button that asks for a reason in a dialog before it acts. */
export function ReasonButton({
  label,
  title,
  className = 'btn sm',
  submit,
  success,
}: {
  label: string;
  title: string;
  className?: string;
  submit: (reason: string) => Promise<ApiResult<unknown>>;
  success: MessageKey;
}) {
  const { t } = useI18n();
  const state = useFormState();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return state.invalid('console.reasonRequired');
    if (await state.run(() => submit(reason.trim()), success)) {
      setReason('');
      setOpen(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {state.done && !open ? (
        <span role="status" className="small success">
          {t(state.done)}
        </span>
      ) : null}
      <Dialog open={open} title={title} onClose={() => setOpen(false)}>
        <form onSubmit={onSubmit} className="stack-sm" noValidate>
          <TextArea
            label={t('console.reason')}
            value={reason}
            onChange={setReason}
            max={MAX_REASON_LENGTH}
            required
            invalid={state.problem === 'console.reasonRequired'}
            errorId={errorId}
          />
          <Feedback id={errorId} state={{ ...state, done: null }} />
          <div className="row">
            <button type="submit" className="btn primary" disabled={state.busy}>
              {state.busy ? t('common.sending') : label}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
