'use client';

// Which tenant an analysis view (briefing, hotspots, trends, export) looks at (US-43, US-53). The choice is in the
// URL as `tenantId`, so a link can open a tenant's briefing directly. Every node the signed-in grants cover can be
// picked, roll-up nodes included; without a choice the view opens at the tenant of the first grant.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { useStaffTenants } from '../pages/QueuePage';
import { grantsCovering } from '../permissions';
import { useStaff } from '../StaffProvider';
import { flattenTree } from '../tenants';
import type { StaffTenant } from '../types';

export interface AnalysisScope {
  /** The tenant in view; '' while the tenant list loads and when nothing is in scope. */
  tenantId: string;
  tenant: StaffTenant | undefined;
  options: { tenant: StaffTenant; level: number }[];
  loading: boolean;
  select: (tenantId: string) => void;
}

export function useAnalysisScope(): AnalysisScope {
  const { me } = useStaff();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tenants = useStaffTenants();
  const list = tenants.data ?? [];
  const options = flattenTree(list).filter(({ tenant }) => !me || grantsCovering(me, tenant.path).length > 0);
  const fromUrl = (params.get('tenantId') ?? '').slice(0, 64);
  const firstGrant = me?.grants.map((g) => options.find((o) => o.tenant.id === g.tenantId)).find(Boolean);
  const tenant = options.find((o) => o.tenant.id === fromUrl)?.tenant ?? firstGrant?.tenant ?? options[0]?.tenant;
  return {
    tenantId: tenant?.id ?? '',
    tenant,
    options,
    loading: tenants.isPending,
    select: (id) => router.replace(`${pathname}?${new URLSearchParams({ tenantId: id }).toString()}`, { scroll: false }),
  };
}

/** A select of the tenants in scope, indented by tree depth; just the name when there is only one. */
export function TenantPicker({ scope }: { scope: AnalysisScope }) {
  const { t } = useI18n();
  const id = useId();
  if (scope.options.length <= 1) return null;
  return (
    <div className="field tenant-picker">
      <label htmlFor={id}>{t('console.analysis.tenant')}</label>
      <select id={id} value={scope.tenantId} onChange={(e) => scope.select(e.target.value)}>
        {scope.options.map(({ tenant, level }) => (
          <option key={tenant.id} value={tenant.id}>
            {`${' '.repeat(level * 2)}${tenant.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}
