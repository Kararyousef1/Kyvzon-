/**
 * اختبارات وحدة وسائل التواصل الاجتماعي (التقرير 3) — الجوانب الخالصة.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/supabase/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn() },
}));

import { MARKETING_MODULES } from '../pages/marketingportal/marketingCatalog';
import { PLATFORM_META, POSTING_FREQUENCY } from '../services/sdk';

describe('كتالوج بوابة التسويق — الوحدة 3 (وسائل التواصل)', () => {
  const social = MARKETING_MODULES.find((m) => m.id === 'marketing-social');
  it('الوحدة متاحة بمسار صحيح', () => {
    expect(social?.status).toBe('available');
    expect(social?.path).toBe('/app/marketing/social');
    expect(social?.report).toBe(3);
  });
});

describe('الثوابت المرجعية من التقرير', () => {
  it('يشمل المنصات الأربع الأساسية + TikTok', () => {
    const keys = Object.keys(PLATFORM_META).sort();
    expect(keys).toEqual(['facebook', 'instagram', 'linkedin', 'tiktok', 'x'].sort());
  });
  it('LinkedIn موصوف بأنه الأهم لـ B2B', () => {
    expect(PLATFORM_META.linkedin.bestContent).toContain('B2B');
  });
  it('جدول تردد النشر يتضمّن كل المنصات الأربع', () => {
    const platforms = POSTING_FREQUENCY.map((p) => p.platform);
    expect(platforms).toContain('LinkedIn');
    expect(platforms).toContain('Instagram');
    expect(platforms.length).toBe(4);
  });
});
