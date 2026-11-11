'use client';

// Tenants & roles (US-40, US-42, US-46): the tenant tree in the signed-in scope with each node's status. Platform
// admins activate nodes; tenant admins (and platform admins) set the office name and score thresholds, keep the
// external contacts for forwarding and manage the staff at a node. Everyone else reads.
import { DEFAULT_THRESHOLDS, validThresholds } from '@kiezruf/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { ErrorText } from '@/components/ErrorText';
import { useI18n } from '@/i18n/I18nProvider';
import { apiOrThrow, type ApiResult } from '@/lib/api-client';
import { roleLabel, tenantStatusLabel, tenantTypeLabel } from '../format';
import { canActivate, canManageTenant, invitableRoles } from '../permissions';
import { useStaff } from '../StaffProvider';
import { childrenOf, isReceiving, roots } from '../tenants';
import { normalizeContacts, normalizeStaff, sharedThresholds, TENANT_STATUSES, type StaffRole, type StaffTenant, type TenantStatus } from '../types';
import { useStaffTenants } from './QueuePage';

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'staff' && q.queryKey[1] !== 'session' });
}

export function TenantsPage() {
  const { t } = useI18n();
  const tenants = useStaffTenants();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = tenants.data ?? [];
  const selected = list.find((x) => x.id === selectedId) ?? roots(list)[0];

  return (
    <div className="console-page">
      <h1>{t('console.tenants.title')}</h1>
      {tenants.isPending ? <p role="status">{t('common.loading')}</p> : null}
      {tenants.isError ? <ErrorText code={(tenants.error as { code?: string }).code ?? 'unknown'} /> : null}
      {tenants.data && list.length === 0 ? <p>{t('console.tenants.empty')}</p> : null}
      {selected ? (
        <div className="two-col">
          <nav className="panel" aria-labelledby="tree-title">
            <h2 id="tree-title">{t('console.tenants.tree')}</h2>
            <ul className="tree">
              {roots(list).map((root) => (
                <TreeNode key={root.id} tenant={root} tenants={list} selectedId={selected.id} onSelect={setSelectedId} />
              ))}
            </ul>
          </nav>
          <TenantDetail key={selected.id} tenant={selected} />
        </div>
      ) : null}
    </div>
  );
}

function TreeNode({ tenant, tenants, selectedId, onSelect }: { tenant: StaffTenant; tenants: StaffTenant[]; selectedId: string; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const children = childrenOf(tenants, tenant);
  return (
    <li>
      <button type="button" className="tree-node" aria-current={tenant.id === selectedId ? 'true' : undefined} onClick={() => onSelect(tenant.id)}>
        <span>{tenant.name}</span> <span className={`tag tenant-${tenant.status}`}>{tenantStatusLabel(t, tenant.status)}</span>
      </button>
      {children.length ? (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.id} tenant={c} tenants={tenants} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TenantDetail({ tenant }: { tenant: StaffTenant }) {
  const { t } = useI18n();
  const { me } = useStaff();
  const manage = canManageTenant(me, tenant);
  const thresholds = tenant.thresholds ?? { critical: DEFAULT_THRESHOLDS.Critical, high: DEFAULT_THRESHOLDS.High, medium: DEFAULT_THRESHOLDS.Medium };
  return (
    <section className="panel stack" aria-labelledby="tenant-title">
      <div>
        <h2 id="tenant-title">{tenant.name}</h2>
        <p className="small muted">
          {tenant.type ? `${tenantTypeLabel(t, tenant.type)} · ` : ''}
          <span className="mono">{tenant.path}</span>
        </p>
        {!manage ? <p className="notice small">{t('console.tenants.readOnly')}</p> : null}
      </div>
      <StatusSection tenant={tenant} />
      {manage ? (
        <SettingsForm tenant={tenant} />
      ) : (
        <dl className="facts small">
          <dt>{t('console.tenants.office')}</dt>
          <dd>{tenant.office ?? '—'}</dd>
          {isReceiving(tenant) ? (
            <>
              <dt>{t('console.tenants.thresholds')}</dt>
              <dd className="mono">{t('console.tenants.thresholdsLine', { critical: thresholds.critical, high: thresholds.high, medium: thresholds.medium })}</dd>
            </>
          ) : null}
        </dl>
      )}
      <ContactsSection tenant={tenant} manage={manage} />
      <StaffSection tenant={tenant} roles={invitableRoles(me, tenant)} manage={manage} />
    </section>
  );
}

function StatusSection({ tenant }: { tenant: StaffTenant }) {
  const { t } = useI18n();
  const { me, call } = useStaff();
  const refresh = useRefresh();
  const id = useId();
  const errorId = useId();
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canActivate(me, tenant)) {
    return (
      <p>
        <span className="label">{t('console.tenants.status')}: </span>
        {tenantStatusLabel(t, tenant.status)}
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await call(`staff/tenants/${tenant.id}`, { method: 'PATCH', body: { status } });
    setBusy(false);
    if (!result.ok) return setError(String(result.error));
    setSaved(true);
    await refresh();
  }

  return (
    <form onSubmit={onSubmit} className="row align-end">
      <div className="field">
        <label htmlFor={id}>{t('console.tenants.status')}</label>
        <select id={id} value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)} aria-describedby={error ? errorId : undefined}>
          {TENANT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tenantStatusLabel(t, s)}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn" disabled={busy || status === tenant.status}>
        {t('console.tenants.saveStatus')}
      </button>
      <ErrorText id={errorId} code={error} />
      {saved ? (
        <p role="status" className="success">
          {t('console.saved')}
        </p>
      ) : null}
    </form>
  );
}

/** Critical > High > Medium > 0 (shared rule, US-23), and real numbers. */
export function thresholdsOk(v: { critical: number; high: number; medium: number }): boolean {
  return [v.critical, v.high, v.medium].every(Number.isFinite) && validThresholds(sharedThresholds(v));
}

function SettingsForm({ tenant }: { tenant: StaffTenant }) {
  const { t } = useI18n();
  const { call } = useStaff();
  const refresh = useRefresh();
  const ids = { office: useId(), critical: useId(), high: useId(), medium: useId(), error: useId(), hint: useId() };
  const start = tenant.thresholds ?? { critical: DEFAULT_THRESHOLDS.Critical, high: DEFAULT_THRESHOLDS.High, medium: DEFAULT_THRESHOLDS.Medium };
  const [office, setOffice] = useState(tenant.office ?? '');
  const [values, setValues] = useState({ critical: String(start.critical), high: String(start.high), medium: String(start.medium) });
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const thresholds = { critical: Number(values.critical), high: Number(values.high), medium: Number(values.medium) };
    setSaved(false);
    setError(null);
    if (!thresholdsOk(thresholds)) return setInvalid(true);
    setInvalid(false);
    setBusy(true);
    const result = await call(`staff/tenants/${tenant.id}/settings`, { method: 'PUT', body: { thresholds, office: office.trim() || null } });
    setBusy(false);
    if (!result.ok) return setError(String(result.error));
    setSaved(true);
    await refresh();
  }

  const number = (key: 'critical' | 'high' | 'medium', label: string) => (
    <div className="field">
      <label htmlFor={ids[key]}>{label}</label>
      <input
        id={ids[key]}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${ids.hint} ${ids.error}` : ids.hint}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="stack-sm" aria-labelledby={`${ids.office}-title`} noValidate>
      <h3 id={`${ids.office}-title`}>{t('console.tenants.settings')}</h3>
      <div className="field">
        <label htmlFor={ids.office}>{t('console.tenants.office')}</label>
        <input id={ids.office} type="text" maxLength={200} value={office} onChange={(e) => setOffice(e.target.value)} />
      </div>
      <fieldset className="stack-sm">
        <legend>{t('console.tenants.thresholds')}</legend>
        <p id={ids.hint} className="small muted">
          {t('console.tenants.thresholdsHint')}
        </p>
        <div className="filters">
          {number('critical', t('console.tenants.critical'))}
          {number('high', t('console.tenants.high'))}
          {number('medium', t('console.tenants.medium'))}
        </div>
      </fieldset>
      {invalid ? (
        <p id={ids.error} role="alert" className="error">
          <span aria-hidden="true">⚠ </span>
          {t('console.tenants.thresholdsInvalid')}
        </p>
      ) : (
        <ErrorText id={ids.error} code={error} />
      )}
      {saved ? (
        <p role="status" className="success">
          {t('console.saved')}
        </p>
      ) : null}
      <button type="submit" className="btn primary" disabled={busy}>
        {t('console.tenants.saveSettings')}
      </button>
    </form>
  );
}

/** A button that asks before it removes something. */
function ConfirmButton({ label, title, body, onConfirm }: { label: string; title: string; body: string; onConfirm: () => Promise<ApiResult<unknown>> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Dialog open={open} title={title} onClose={() => setOpen(false)}>
        <p>{body}</p>
        <ErrorText code={error} />
        <div className="row">
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              const result = await onConfirm();
              if (result.ok) setOpen(false);
              else setError(String(result.error));
            }}
          >
            {label}
          </button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </Dialog>
    </>
  );
}

function ContactsSection({ tenant, manage }: { tenant: StaffTenant; manage: boolean }) {
  const { t } = useI18n();
  const { call } = useStaff();
  const refresh = useRefresh();
  const contacts = useQuery({ queryKey: ['staff', 'contacts', tenant.id], queryFn: async () => normalizeContacts(await apiOrThrow<unknown>(`staff/tenants/${tenant.id}/contacts`)), retry: false });
  const ids = { name: useId(), email: useId(), error: useId(), title: useId() };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return setError('invalid_request');
    setBusy(true);
    setError(null);
    const result = await call(`staff/tenants/${tenant.id}/contacts`, { method: 'POST', body: { name: name.trim(), email: email.trim() } });
    setBusy(false);
    if (!result.ok) return setError(String(result.error));
    setName('');
    setEmail('');
    await refresh();
  }

  return (
    <section aria-labelledby={ids.title} className="stack-sm">
      <h3 id={ids.title}>{t('console.contacts.title')}</h3>
      <p className="small muted">{t('console.contacts.explain')}</p>
      {contacts.isError ? <ErrorText code={(contacts.error as { code?: string }).code ?? 'unknown'} /> : null}
      {contacts.data && contacts.data.length === 0 ? <p className="small">{t('console.contacts.empty')}</p> : null}
      {contacts.data && contacts.data.length > 0 ? (
        <ul className="plain-list">
          {contacts.data.map((c) => (
            <li key={c.id} className="row list-row">
              <span className="grow">
                {c.name} <span className="muted small">{c.email}</span>
              </span>
              {manage ? (
                <ConfirmButton
                  label={t('console.contacts.remove', { name: c.name })}
                  title={t('console.contacts.removeTitle')}
                  body={t('console.contacts.removeBody', { name: c.name })}
                  onConfirm={async () => {
                    const result = await call(`staff/tenants/${tenant.id}/contacts/${c.id}`, { method: 'DELETE' });
                    if (result.ok) await refresh();
                    return result;
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {manage ? (
        <form onSubmit={add} className="row align-end" noValidate>
          <div className="field">
            <label htmlFor={ids.name}>{t('console.contacts.name')}</label>
            <input id={ids.name} type="text" maxLength={200} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={ids.email}>{t('console.contacts.email')}</label>
            <input id={ids.email} type="email" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn" disabled={busy}>
            {t('console.contacts.add')}
          </button>
          <ErrorText id={ids.error} code={error} />
        </form>
      ) : null}
    </section>
  );
}

function StaffSection({ tenant, roles, manage }: { tenant: StaffTenant; roles: StaffRole[]; manage: boolean }) {
  const { t } = useI18n();
  const { me, call } = useStaff();
  const refresh = useRefresh();
  const staff = useQuery({ queryKey: ['staff', 'members', tenant.id], queryFn: async () => normalizeStaff(await apiOrThrow<unknown>(`staff/tenants/${tenant.id}/staff`)), retry: false });
  const ids = { email: useId(), role: useId(), error: useId(), title: useId() };
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole | ''>(roles.includes('case_worker') ? 'case_worker' : (roles[0] ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setSent(false);
    if (!email.trim() || !role) return setError('invalid_request');
    setBusy(true);
    setError(null);
    const result = await call(`staff/tenants/${tenant.id}/staff`, { method: 'POST', body: { email: email.trim(), role } });
    setBusy(false);
    if (!result.ok) return setError(String(result.error));
    setEmail('');
    setSent(true);
    await refresh();
  }

  return (
    <section aria-labelledby={ids.title} className="stack-sm">
      <h3 id={ids.title}>{t('console.staff.title')}</h3>
      {staff.isError ? <ErrorText code={(staff.error as { code?: string }).code ?? 'unknown'} /> : null}
      {staff.data && staff.data.length === 0 ? <p className="small">{t('console.staff.empty')}</p> : null}
      {staff.data && staff.data.length > 0 ? (
        <ul className="plain-list">
          {staff.data.map((s) => (
            <li key={s.accountId} className="row list-row">
              <span className="grow">
                {s.email} <span className="muted small">{roleLabel(t, s.role)}</span>
              </span>
              {manage && s.accountId !== me?.id ? (
                <ConfirmButton
                  label={t('console.staff.remove', { email: s.email })}
                  title={t('console.staff.removeTitle')}
                  body={t('console.staff.removeBody', { email: s.email, tenant: tenant.name })}
                  onConfirm={async () => {
                    const result = await call(`staff/tenants/${tenant.id}/staff/${s.accountId}`, { method: 'DELETE' });
                    if (result.ok) await refresh();
                    return result;
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {manage && roles.length > 0 ? (
        <form onSubmit={invite} className="row align-end" noValidate aria-label={t('console.staff.invite')}>
          <div className="field">
            <label htmlFor={ids.email}>{t('console.staff.email')}</label>
            <input id={ids.email} type="email" maxLength={254} required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={ids.role}>{t('console.staff.role')}</label>
            <select id={ids.role} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(t, r)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn" disabled={busy}>
            {t('console.staff.invite')}
          </button>
          <ErrorText id={ids.error} code={error} />
          {sent ? (
            <p role="status" className="success">
              {t('console.staff.invited')}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
