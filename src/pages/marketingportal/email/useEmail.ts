/**
 * useEmail — خطافات بيانات وحدة البريد الإلكتروني.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  senderDomainService, emailListService, emailSubscriberService,
  emailTemplateService, emailCampaignService, emailDeliveryService,
  type SenderDomain, type EmailList, type EmailSubscriber,
  type EmailTemplate, type EmailCampaign, type EmailKpis,
} from '../../../services/sdk';

interface AsyncState<T> { data: T; loading: boolean; error: string | null; reload: () => void; }

function useAsync<T>(loader: () => Promise<T>, initial: T, deps: unknown[] = []): AsyncState<T> {
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

export const useDomains = () => useAsync<SenderDomain[]>(() => senderDomainService.listDomains(), []);
export const useLists = () => useAsync<EmailList[]>(() => emailListService.listAll(), []);
export const useSubscribers = () => useAsync<EmailSubscriber[]>(() => emailSubscriberService.listAll(), []);
export const useTemplates = () => useAsync<EmailTemplate[]>(() => emailTemplateService.listAll(), []);
export const useCampaigns = () => useAsync<EmailCampaign[]>(() => emailCampaignService.listAll(), []);

const EMPTY_KPI: EmailKpis = {
  sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, complained: 0,
  openRate: 0, ctor: 0, ctr: 0, unsubscribeRate: 0, spamRate: 0, bounceRate: 0,
};
export const useOverallKpis = () => useAsync<EmailKpis>(() => emailDeliveryService.overallKpis(), EMPTY_KPI, []);

export const SUBSCRIBER_STATUS_LABEL: Record<string, string> = {
  pending: 'بانتظار التأكيد', confirmed: 'مؤكّد', unsubscribed: 'ملغى الاشتراك',
  bounced: 'مرتد', complained: 'شكوى إسبام', cleaned: 'مُنظَّف',
};
export const SUBSCRIBER_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  unsubscribed: 'bg-slate-100 text-slate-500 border-slate-200',
  bounced: 'bg-rose-50 text-rose-600 border-rose-200',
  complained: 'bg-rose-50 text-rose-600 border-rose-200',
  cleaned: 'bg-slate-100 text-slate-400 border-slate-200',
};
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', scheduled: 'مجدولة', sending: 'قيد الإرسال', sent: 'أُرسلت', paused: 'متوقفة', cancelled: 'ملغاة',
};
export const CAMPAIGN_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500', scheduled: 'bg-sky-50 text-sky-600 border border-sky-200',
  sending: 'bg-amber-50 text-amber-600 border border-amber-200', sent: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  paused: 'bg-amber-50 text-amber-600 border border-amber-200', cancelled: 'bg-slate-100 text-slate-400',
};
export const AUTH_LABEL: Record<string, string> = { pending: 'قيد الانتظار', verified: 'مُوثّق', failed: 'فشل' };
export const AUTH_COLOR: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  verified: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  failed: 'bg-rose-50 text-rose-600 border-rose-200',
};
