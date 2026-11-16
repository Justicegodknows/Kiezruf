// What the console offers, from the grants of GET /staff/me (US-42, US-43, US-46). The API decides in the end;
// these rules only hide what would be refused anyway. A role at a node covers that node and everything below it.
import type { Grant, StaffMe, StaffRole, StaffTenant } from './types';

/** True when the grant's path is the tenant's path or an ancestor of it (ltree `<@`). */
export function covers(grantPath: string, tenantPath: string): boolean {
  return tenantPath === grantPath || tenantPath.startsWith(`${grantPath}.`);
}

export function grantsCovering(me: StaffMe | undefined, tenantPath: string | null | undefined): Grant[] {
  if (!me || !tenantPath) return [];
  return me.grants.filter((g) => covers(g.path, tenantPath));
}

function hasRoleAt(me: StaffMe | undefined, tenantPath: string | null | undefined, roles: StaffRole[]): boolean {
  return grantsCovering(me, tenantPath).some((g) => roles.includes(g.role));
}

function hasRole(me: StaffMe | undefined, roles: StaffRole[]): boolean {
  return !!me && me.grants.some((g) => roles.includes(g.role));
}

/** Roles that change reports. Viewers read; platform admins run the tree, not the queues (prototype ROLES). */
const REPORT_ROLES: StaffRole[] = ['case_worker', 'tenant_admin'];

/**
 * Status, override, forward and merge (US-27, US-28, US-45, US-17): only when the API marks the report editable
 * (owning tenant, ENG-05) and the signed-in grants include a role that changes reports there.
 */
export function canEditReport(me: StaffMe | undefined, report: { editable: boolean; tenant: { path: string | null } }): boolean {
  if (!report.editable) return false;
  return report.tenant.path ? hasRoleAt(me, report.tenant.path, REPORT_ROLES) : hasRole(me, REPORT_ROLES);
}

/** Restore or remove comments, confirm or clear vote spikes (US-26, US-33). */
export function canModerate(me: StaffMe | undefined, tenantPath?: string | null): boolean {
  return tenantPath ? hasRoleAt(me, tenantPath, REPORT_ROLES) : hasRole(me, REPORT_ROLES);
}

/** The Monday briefing email goes to tenant admins only (US-56, D-17); everyone else reads it in the console. */
export function getsBriefingEmail(me: StaffMe | undefined): boolean {
  return hasRole(me, ['tenant_admin']);
}

/** Ban an account: tenant admins only (README). */
export function canBan(me: StaffMe | undefined): boolean {
  return hasRole(me, ['tenant_admin']);
}

type TenantFlags = Pick<StaffTenant, 'path'> & Partial<Pick<StaffTenant, 'canAdmin' | 'canActivate'>>;

/** Activate a node: platform admins (US-46). The API's `canActivate` flag wins when it sends one. */
export function canActivate(me: StaffMe | undefined, tenant: TenantFlags): boolean {
  if (typeof tenant.canActivate === 'boolean') return tenant.canActivate;
  return hasRoleAt(me, tenant.path, ['platform_admin']);
}

/** Thresholds, office name, external contacts and staff at a node (US-46): tenant and platform admins (`canAdmin`). */
export function canManageTenant(me: StaffMe | undefined, tenant: TenantFlags): boolean {
  if (typeof tenant.canAdmin === 'boolean') return tenant.canAdmin;
  return hasRoleAt(me, tenant.path, ['platform_admin', 'tenant_admin']);
}

/** Roles the signed-in staff member may give at a node: never more than their own. */
export function invitableRoles(me: StaffMe | undefined, tenant: Pick<StaffTenant, 'path'>): StaffRole[] {
  if (hasRoleAt(me, tenant.path, ['platform_admin'])) return ['platform_admin', 'tenant_admin', 'case_worker', 'viewer'];
  if (hasRoleAt(me, tenant.path, ['tenant_admin'])) return ['tenant_admin', 'case_worker', 'viewer'];
  return [];
}
