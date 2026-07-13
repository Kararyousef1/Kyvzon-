/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — API Service Layer
 *  تغليف كامل لخدمات SDK مع معالجة الأخطاء والتخزين المؤقت
 * ════════════════════════════════════════════════════════════════
 */

import { tenantService } from '../../../services/sdk/TenantService';
import type { Company, Subscription, AuditEntry, PlatformStats, CompanyStats } from '../types';

// ════════════════════════════════════════════════════════════════
//  Cache بسيط لتقليل استدعاءات API
// ════════════════════════════════════════════════════════════════

const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 30_000; // 30 ثانية

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) {
    return Promise.resolve(entry.data as T);
  }
  return fetcher().then((data) => {
    cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

function invalidate(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// ════════════════════════════════════════════════════════════════
//  Companies API
// ════════════════════════════════════════════════════════════════

export const companiesApi = {
  getAll: () =>
    cached<Company[]>('companies:all', () =>
      tenantService.getAllCompanies().then((c) => c as Company[]),
    ),

  getById: (id: string) => tenantService.getCompany(id).then((c) => c as Company | null),

  create: (input: Parameters<typeof tenantService.createCompany>[0]) =>
    tenantService.createCompany(input).then((c) => {
      invalidate('companies:');
      invalidate('stats:');
      return c as Company;
    }),

  update: (id: string, updates: Record<string, unknown>) =>
    tenantService.updateCompany(id, updates as any).then((c) => {
      invalidate('companies:');
      return c as Company;
    }),

  softDelete: (id: string) =>
    tenantService.deleteCompany(id).then(() => {
      invalidate('companies:');
      invalidate('stats:');
    }),

  suspend: (id: string) =>
    tenantService.suspendCompany(id).then((c) => {
      invalidate('companies:');
      invalidate('stats:');
      return c as Company;
    }),

  activate: (id: string) =>
    tenantService.activateCompany(id).then((c) => {
      invalidate('companies:');
      invalidate('stats:');
      return c as Company;
    }),

  getStats: (tenantId: string) =>
    tenantService.getCompanyStats(tenantId) as Promise<CompanyStats>,

  search: (query: string) =>
    tenantService.searchCompanies(query).then((c) => c as Company[]),

  isSlugAvailable: (slug: string, excludeId?: string) =>
    tenantService.isSlugAvailable(slug, excludeId),
};

// ════════════════════════════════════════════════════════════════
//  Subscriptions API
// ════════════════════════════════════════════════════════════════

export const subscriptionsApi = {
  getByCompany: (tenantId: string) =>
    tenantService.getCompanySubscriptions(tenantId) as Promise<Subscription[]>,

  create: (tenantId: string, data: Partial<Subscription>, actorId?: string) =>
    tenantService.addSubscription(tenantId, data as any, actorId).then((s) => {
      invalidate('subscriptions:');
      invalidate('stats:');
      return s as Subscription;
    }),

  refresh: () => invalidate('subscriptions:'),
};

// ════════════════════════════════════════════════════════════════
//  Platform Stats API
// ════════════════════════════════════════════════════════════════

export const statsApi = {
  get: () => cached<PlatformStats>('stats:platform', () =>
    tenantService.getPlatformStats(),
  ),

  refresh: () => {
    invalidate('stats:');
    return statsApi.get();
  },
};

// ════════════════════════════════════════════════════════════════
//  Audit Log API
// ════════════════════════════════════════════════════════════════

export const auditApi = {
  getLogs: (limit = 100) =>
    tenantService.getPlatformAuditLogs(limit) as Promise<AuditEntry[]>,

  log: (entry: Parameters<typeof tenantService.logPlatformAction>[0]) =>
    tenantService.logPlatformAction(entry),
};
