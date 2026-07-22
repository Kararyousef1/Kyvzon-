/**
 * useSupport — خطافات بيانات الوحدة 5 (الدعم والتذاكر).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  crmTicketService, crmKbService, crmCannedService, crmSlaService, crmRoutingService,
  type CrmTicket, type CrmKbArticle, type CrmCannedResponse, type CrmSlaPolicy, type CrmRoutingRule,
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

export const useTickets = () => useAsync<CrmTicket[]>(() => crmTicketService.listTickets(), []);
export const useKbArticles = () => useAsync<CrmKbArticle[]>(() => crmKbService.listArticles(), []);
export const useCanned = () => useAsync<CrmCannedResponse[]>(() => crmCannedService.listResponses(), []);
export const useSlaPolicies = () => useAsync<CrmSlaPolicy[]>(() => crmSlaService.listPolicies(), []);
export const useRoutingRules = () => useAsync<CrmRoutingRule[]>(() => crmRoutingService.listRules(), []);
