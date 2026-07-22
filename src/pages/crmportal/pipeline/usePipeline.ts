/**
 * usePipeline — خطافات بيانات الوحدة 2 (خط الأنابيب والصفقات).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  crmPipelineService, crmStageService, crmDealService, crmLossReasonService,
  type CrmPipeline, type CrmStage, type CrmDeal, type CrmLossReason,
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

export const usePipelines = () => useAsync<CrmPipeline[]>(() => crmPipelineService.listPipelines(), []);
export const useStages = (pipelineId: string | null) =>
  useAsync<CrmStage[]>(() => (pipelineId ? crmStageService.listForPipeline(pipelineId) : Promise.resolve([])), [], [pipelineId]);
export const useDeals = (pipelineId: string | null) =>
  useAsync<CrmDeal[]>(() => crmDealService.listDeals(pipelineId ?? undefined), [], [pipelineId]);
export const useLossReasons = () => useAsync<CrmLossReason[]>(() => crmLossReasonService.listReasons(), []);
