/**
 * useImmune — خطافات بيانات نظام المناعة العلائقية.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  relationshipBalanceService, governanceService, culturalCalendarService, immuneService,
  type RelationshipBalance, type GovernanceLogEntry, type CulturalOccasion,
  type ImmuneIncident, type MarketingDebt, type ImmuneSettings,
} from '../../../services/sdk';

interface AsyncState<T> { data: T; loading: boolean; error: string | null; reload: () => void; }
export function useAsync<T>(loader: () => Promise<T>, initial: T, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const run = useCallback(loader, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true; setLoading(true); setError(null);
    run().then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'حدث خطأ'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [run, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export const useBalances = () => useAsync<RelationshipBalance[]>(() => relationshipBalanceService.listBalances(), []);
export const useGovLog = () => useAsync<GovernanceLogEntry[]>(() => governanceService.recentLog(60), []);
export const useOccasions = () => useAsync<CulturalOccasion[]>(() => culturalCalendarService.listOccasions(), []);
export const useIncidents = () => useAsync<ImmuneIncident[]>(() => immuneService.listIncidents(), []);
export const useDebt = () => useAsync<MarketingDebt>(() => governanceService.marketingDebt(90), { totalDebit: 0, totalCredit: 0, netDebt: 0 }, []);
export const useImmuneSettings = () => useAsync<ImmuneSettings | null>(() => immuneService.getSettings(), null, []);

export const DECISION_LABEL: Record<string, string> = { allow: 'سماح', defer: 'تأجيل', block: 'منع' };
export const DECISION_COLOR: Record<string, string> = {
  allow: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  defer: 'bg-amber-50 text-amber-600 border-amber-200',
  block: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const OCCASION_LABEL: Record<string, string> = {
  ramadan: 'رمضان', prayer_window: 'أوقات الصلاة', national_day: 'يوم وطني', weekend: 'عطلة أسبوع', mourning: 'حداد', custom: 'مخصّص',
};
export const EFFECT_LABEL: Record<string, string> = {
  reduce: 'خفض الترويجي', defer: 'تأجيل', suspend_promotional: 'إيقاف الترويجي', suspend_all: 'إيقاف الكل',
};
export const INCIDENT_LABEL: Record<string, string> = {
  unsubscribe_spike: 'طفرة إلغاء اشتراك', complaint_spike: 'طفرة شكاوى', bounce_spike: 'طفرة ارتداد', broken_link: 'رابط معطّل', manual: 'يدوي',
};
export const INCIDENT_STATUS_LABEL: Record<string, string> = { open: 'مفتوح', suspended: 'مُعلَّق تلقائياً', resolved: 'مُغلق' };
