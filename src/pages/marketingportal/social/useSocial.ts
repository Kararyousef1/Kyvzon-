/**
 * useSocial — خطافات بيانات وحدة وسائل التواصل الاجتماعي.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  socialAccountService, socialPostService, socialInteractionService,
  socialUtmService, socialListeningService, socialAnalyticsService,
  type SocialAccount, type SocialPost, type SocialInteraction,
  type UtmLink, type ListeningTerm, type ListeningMention, type SocialKpis,
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

export const useAccounts = () => useAsync<SocialAccount[]>(() => socialAccountService.listAccounts(), []);
export const usePosts = () => useAsync<SocialPost[]>(() => socialPostService.listPosts(), []);
export const useInbox = () => useAsync<SocialInteraction[]>(() => socialInteractionService.listInbox(), []);
export const useUtmLinks = () => useAsync<UtmLink[]>(() => socialUtmService.listAll(), []);
export const useTerms = () => useAsync<ListeningTerm[]>(() => socialListeningService.listTerms(), []);
export const useMentions = () => useAsync<ListeningMention[]>(() => socialListeningService.listMentions(), []);

const EMPTY_KPI: SocialKpis = {
  totalReach: 0, totalImpressions: 0, totalEngagements: 0, totalClicks: 0,
  attributedRevenue: 0, publishedPosts: 0, engagementRate: 0, clickThroughRate: 0,
};
export const useSocialKpis = () => useAsync<SocialKpis>(() => socialAnalyticsService.kpis(), EMPTY_KPI, []);

export const PLATFORM_ICON: Record<string, string> = {
  facebook: 'f', instagram: '◐', linkedin: 'in', x: '𝕏', tiktok: '♪',
};
export const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok',
};
export const POST_STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', scheduled: 'مجدول', published: 'منشور', failed: 'فشل',
};
export const POST_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500 border-slate-200',
  scheduled: 'bg-sky-50 text-sky-600 border-sky-200',
  published: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  failed: 'bg-rose-50 text-rose-600 border-rose-200',
};
export const INTERACTION_TYPE_LABEL: Record<string, string> = {
  comment: 'تعليق', dm: 'رسالة مباشرة', mention: 'إشارة', ad_comment: 'تعليق إعلان',
};
export const INTERACTION_STATUS_LABEL: Record<string, string> = {
  pending: 'معلّق', replied: 'تم الرد', assigned: 'مُعيّن', closed: 'مغلق',
};
export const CONTENT_TYPE_LABEL: Record<string, string> = {
  post: 'منشور', reel: 'Reel', story: 'Story', case_study: 'دراسة حالة',
  educational: 'تعليمي', infographic: 'إنفوغرافيك', poll: 'استطلاع',
};
