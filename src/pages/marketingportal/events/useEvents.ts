/**
 * useEvents — خطافات بيانات وحدة إدارة الفعاليات.
 */
import { useCallback, useEffect, useState } from 'react';
import { eventService, type MarketingEvent } from '../../../services/sdk';

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

export const useEventsList = () => useAsync<MarketingEvent[]>(() => eventService.listEvents(), []);

export const EVENT_STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', published: 'منشور', live: 'مباشر', completed: 'مكتمل', cancelled: 'ملغى',
};
export const EVENT_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
  published: 'bg-sky-50 text-sky-600 border-sky-200',
  live: 'bg-rose-50 text-rose-600 border-rose-200',
  completed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};
export const REG_STATUS_LABEL: Record<string, string> = {
  registered: 'مسجّل', waitlisted: 'قائمة انتظار', cancelled: 'ملغى',
};
export const REG_STATUS_COLOR: Record<string, string> = {
  registered: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  waitlisted: 'bg-amber-50 text-amber-600 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};
export const PAYMENT_LABEL: Record<string, string> = {
  not_required: 'غير مطلوب', pending: 'قيد الدفع', paid: 'مدفوع', refunded: 'مُسترد',
};
