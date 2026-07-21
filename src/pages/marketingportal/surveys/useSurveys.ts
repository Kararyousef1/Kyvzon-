/**
 * useSurveys — خطافات بيانات وحدة الاستبيانات.
 */
import { useCallback, useEffect, useState } from 'react';
import { marketingSurveyService, type MarketingSurvey } from '../../../services/sdk';

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

export const useSurveysList = () => useAsync<MarketingSurvey[]>(() => marketingSurveyService.listSurveys(), []);

export const SURVEY_STATUS_LABEL: Record<string, string> = { draft: 'مسودة', active: 'نشط', closed: 'مغلق' };
export const SURVEY_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
  active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  closed: 'bg-slate-100 text-slate-400 border-slate-200',
};
export const QUESTION_TYPE_LABEL: Record<string, string> = {
  nps: 'NPS (0-10)', csat: 'CSAT (1-5)', ces: 'CES (1-7)', likert: 'Likert', rating: 'تقييم نجوم',
  multiple_choice: 'اختيار متعدد', single_choice: 'اختيار واحد', text: 'نص حر', yes_no: 'نعم/لا', number: 'رقم',
};
export const NPS_CAT_LABEL: Record<string, string> = { promoter: 'مروّج', passive: 'محايد', detractor: 'منتقد' };
export const NPS_CAT_COLOR: Record<string, string> = {
  promoter: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  passive: 'bg-amber-50 text-amber-600 border-amber-200',
  detractor: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const LOOP_STATUS_LABEL: Record<string, string> = {
  open: 'مفتوح', assigned: 'مُعيّن', resolved: 'مُغلق', not_needed: 'لا يحتاج',
};
