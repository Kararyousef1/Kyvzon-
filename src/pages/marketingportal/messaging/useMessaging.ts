/**
 * useMessaging — خطافات بيانات وحدة الرسائل.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  messagingGatewayService, messagingContactService, whatsappTemplateService,
  messagingCampaignService, messagingDeliveryService,
  type MessagingGateway, type MessagingContact, type WhatsappTemplate,
  type MessagingCampaign, type MessagingKpis,
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

export const useGateways = () => useAsync<MessagingGateway[]>(() => messagingGatewayService.listGateways(), []);
export const useContacts = () => useAsync<MessagingContact[]>(() => messagingContactService.listContacts(), []);
export const useWaTemplates = () => useAsync<WhatsappTemplate[]>(() => whatsappTemplateService.listTemplates(), []);
export const useMsgCampaigns = () => useAsync<MessagingCampaign[]>(() => messagingCampaignService.listCampaigns(), []);

const EMPTY: MessagingKpis = { sent: 0, delivered: 0, read: 0, clicked: 0, optedOut: 0, failed: 0, deliveryRate: 0, optOutRate: 0, clickRate: 0 };
export const useSmsKpis = () => useAsync<MessagingKpis>(() => messagingDeliveryService.kpis('sms'), EMPTY, []);
export const useWaKpis = () => useAsync<MessagingKpis>(() => messagingDeliveryService.kpis('whatsapp'), EMPTY, []);

export const CHANNEL_LABEL: Record<string, string> = { sms: 'SMS', whatsapp: 'واتساب' };
export const WA_STATUS_LABEL: Record<string, string> = { draft: 'مسودة', pending: 'قيد الموافقة', approved: 'معتمد', rejected: 'مرفوض' };
export const WA_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
  pending: 'bg-amber-50 text-amber-600 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const WA_CATEGORY_LABEL: Record<string, string> = { utility: 'تشغيلي (Utility)', marketing: 'تسويقي (Marketing)', authentication: 'مصادقة (OTP)' };
export const MSG_STATUS_LABEL: Record<string, string> = {
  simulated: 'محاكاة', queued: 'في الطابور', sent: 'أُرسل', delivered: 'وُصِّل',
  read: 'قُرئ', clicked: 'نُقر', failed: 'فشل', opted_out: 'ملغى الاشتراك',
};
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', scheduled: 'مجدولة', sending: 'قيد الإرسال', sent: 'أُرسلت', paused: 'متوقفة', cancelled: 'ملغاة',
};
export const CAMPAIGN_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500', scheduled: 'bg-sky-50 text-sky-600 border border-sky-200',
  sending: 'bg-amber-50 text-amber-600 border border-amber-200', sent: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  paused: 'bg-amber-50 text-amber-600 border border-amber-200', cancelled: 'bg-slate-100 text-slate-400',
};
