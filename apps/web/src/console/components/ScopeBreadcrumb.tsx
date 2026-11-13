'use client';

// Scope breadcrumb (US-42, US-43), as in the console prototype: the chain from the top of the tree to the level
// being looked at. Levels above the signed-in role's scope are shown but disabled; below the current level,
// only live or pilot tenants inside the scope can be picked.
import { useId } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { grantsCovering } from '../permissions';
import { chainTo, childrenOf, isReceiving } from '../tenants';
import type { StaffMe, StaffTenant } from '../types';

export function ScopeBreadcrumb({
  tenants,
  current,
  me,
  onSelect,
}: {
  tenants: StaffTenant[];
  current: StaffTenant;
  me: StaffMe | undefined;
  onSelect: (tenant: StaffTenant) => void;
}) {
  const { t } = useI18n();
  const belowId = useId();
  const allowed = (tenant: StaffTenant) => grantsCovering(me, tenant.path).length > 0;
  const chain = chainTo(tenants, current);
  const below = childrenOf(tenants, current).filter((c) => allowed(c) && isReceiving(c));

  return (
    <nav aria-label={t('console.scope.label')} className="crumb scope-crumb">
      <ol>
        {chain.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="btn ghost sm"
              aria-current={node.id === current.id ? 'page' : undefined}
              disabled={!allowed(node)}
              onClick={() => onSelect(node)}
            >
              {node.name}
            </button>
          </li>
        ))}
      </ol>
      {below.length > 0 ? (
        <span className="field-inline">
          <label htmlFor={belowId} className="visually-hidden">
            {t('console.scope.below')}
          </label>
          <select
            id={belowId}
            value=""
            onChange={(e) => {
              const next = below.find((c) => c.id === e.target.value);
              if (next) onSelect(next);
            }}
          >
            <option value="">{t('console.scope.belowPlaceholder')}</option>
            {below.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
      ) : null}
    </nav>
  );
}
