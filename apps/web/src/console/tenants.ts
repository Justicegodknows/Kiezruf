// Tenant tree helpers (US-40, US-43, US-45). Tenants come from GET /staff/tenants as a flat list with paths.
import type { Contact, ForwardTargets, StaffTenant } from './types';

export const RECEIVING: readonly string[] = ['pilot', 'live'];

export function isReceiving(t: Pick<StaffTenant, 'status'>): boolean {
  return RECEIVING.includes(t.status);
}

export function depth(path: string): number {
  return path.split('.').length;
}

function parentPath(path: string): string | null {
  const i = path.lastIndexOf('.');
  return i < 0 ? null : path.slice(0, i);
}

/** The parent in the list, by parentId or else by path. */
export function parentOf(tenants: StaffTenant[], t: StaffTenant): StaffTenant | undefined {
  if (t.parentId) {
    const byId = tenants.find((x) => x.id === t.parentId);
    if (byId) return byId;
  }
  const p = parentPath(t.path);
  return p ? tenants.find((x) => x.path === p) : undefined;
}

export function childrenOf(tenants: StaffTenant[], t: StaffTenant): StaffTenant[] {
  return tenants.filter((x) => x.id !== t.id && parentOf(tenants, x)?.id === t.id).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Root first, the tenant itself last; only nodes present in the list. */
export function chainTo(tenants: StaffTenant[], t: StaffTenant): StaffTenant[] {
  const chain: StaffTenant[] = [t];
  let current = parentOf(tenants, t);
  while (current && !chain.includes(current)) {
    chain.unshift(current);
    current = parentOf(tenants, current);
  }
  return chain;
}

/** Nodes without a parent in the list, i.e. the tops of the subtrees in scope. */
export function roots(tenants: StaffTenant[]): StaffTenant[] {
  return tenants.filter((t) => !parentOf(tenants, t)).sort((a, b) => depth(a.path) - depth(b.path) || a.name.localeCompare(b.name, 'de'));
}

/** Depth-first order with each node's depth below its root, for indented selects and the tree. */
export function flattenTree(tenants: StaffTenant[]): { tenant: StaffTenant; level: number }[] {
  const out: { tenant: StaffTenant; level: number }[] = [];
  const walk = (t: StaffTenant, level: number) => {
    out.push({ tenant: t, level });
    childrenOf(tenants, t).forEach((c) => walk(c, level + 1));
  };
  roots(tenants).forEach((r) => walk(r, 0));
  return out;
}

/**
 * Forward targets (US-45) when the API does not send them with the report: the parent tenants up the tree
 * (skipping pure groupings), live or pilot siblings, and the saved external contacts.
 */
export function forwardTargetsFrom(tenants: StaffTenant[], tenantId: string, contacts: Contact[]): ForwardTargets {
  const own = tenants.find((t) => t.id === tenantId);
  if (!own) return { parents: [], siblings: [], contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email })) };
  const parents = chainTo(tenants, own)
    .slice(0, -1)
    .reverse()
    .filter((t) => t.status !== 'grouping' || t.type === 'land');
  const parent = parentOf(tenants, own);
  const siblings = parent ? childrenOf(tenants, parent).filter((t) => t.id !== own.id && isReceiving(t)) : [];
  return {
    parents: parents.map(({ id, name }) => ({ id, name })),
    siblings: siblings.map(({ id, name }) => ({ id, name })),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email })),
  };
}
