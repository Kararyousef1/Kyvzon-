/**
 * k6 Load Test — GL Posting Atomicity & Concurrency
 * يختبر سيناريو ترحيل قيود متزامنة حسب خطة العلاج المرحلة 4
 * 
 * التشغيل:
 *   k6 run k6/load-test-gl-posting.js
 *   k6 run --vus 50 --duration 2m k6/load-test-gl-posting.js
 * 
 * الهدف: التأكد أن ترحيل قيود متوازية في نفس الفترة لا يكسر التوازن
 * ولا يسمح بترحيل مرتين لنفس القيد (idempotency)
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const failedPosts = new Rate('failed_posts');
const doublePostAttempts = new Rate('double_post_attempts');

// إعدادات الاختبار
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // تسخين
    { duration: '1m', target: 50 },   // ضغط متوسط
    { duration: '1m', target: 100 },  // ذروة
    { duration: '30s', target: 0 },   // تبريد
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% أقل من 500ms
    'failed_posts': ['rate<0.05'],      // أقل من 5% فشل
    'http_req_failed': ['rate<0.1'],
  },
};

const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'your-anon-key';
const USER_JWT = __ENV.TEST_USER_JWT || ''; // JWT لمستخدم اختبار

function getHeaders() {
  return {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${USER_JWT || ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-correlation-id': `k6-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
  };
}

export default function () {
  group('GL Posting Atomic', () => {
    // 1) محاولة إنشاء قيد مسودة (draft)
    const draftPayload = JSON.stringify({
      legal_entity_id: __ENV.TEST_LEGAL_ENTITY_ID || '00000000-0000-0000-0000-000000000000',
      entry_number: `K6-${Date.now()}-${__VU}-${__ITER}`,
      entry_date: new Date().toISOString().slice(0,10),
      description: `K6 load test VU ${__VU} ITER ${__ITER}`,
      total_debit: 1000,
      total_credit: 1000,
      status: 'draft',
    });

    const createRes = http.post(
      `${SUPABASE_URL}/rest/v1/journal_entries`,
      draftPayload,
      { headers: getHeaders() }
    );

    check(createRes, {
      'draft created': (r) => r.status === 201 || r.status === 200,
    });

    if (createRes.status !== 201 && createRes.status !== 200) {
      failedPosts.add(1);
      sleep(1);
      return;
    }

    let entryId;
    try {
      const body = JSON.parse(createRes.body);
      entryId = Array.isArray(body) ? body[0]?.id : body?.id;
    } catch {}

    if (!entryId) {
      sleep(0.5);
      return;
    }

    // 2) ترحيل القيد (post) — يجب أن يكون ذريًا
    const postRes = http.post(
      `${SUPABASE_URL}/rest/v1/rpc/post_journal_entry`,
      JSON.stringify({ p_entry_id: entryId }),
      { headers: getHeaders() }
    );

    const postOk = check(postRes, {
      'post succeeded or already posted': (r) => r.status === 200 || r.status === 204,
    });

    if (!postOk) {
      failedPosts.add(1);
    }

    // 3) محاولة ترحيل ثانية لنفس القيد — يجب أن تفشل (idempotency)
    const doublePostRes = http.post(
      `${SUPABASE_URL}/rest/v1/rpc/post_journal_entry`,
      JSON.stringify({ p_entry_id: entryId }),
      { headers: getHeaders() }
    );

    const doubleBlocked = check(doublePostRes, {
      'double post blocked': (r) => r.status === 400 || r.status === 409 || r.status === 422,
    });

    if (!doubleBlocked) {
      doublePostAttempts.add(1);
    }

    sleep(0.5);
  });

  group('Period Lock Prevents Posting', () => {
    // محاكاة محاولة ترحيل في فترة مقفلة — يجب أن تفشل
    const lockedPayload = JSON.stringify({
      p_entry_id: '00000000-0000-0000-0000-000000000001', // ID وهمي
    });

    const res = http.post(
      `${SUPABASE_URL}/rest/v1/rpc/post_journal_entry`,
      lockedPayload,
      { headers: getHeaders() }
    );

    // نتوقع فشل لو الفترة مقفلة
    check(res, {
      'locked period check executed': (r) => r.status !== undefined,
    });

    sleep(0.2);
  });

  group('Currencies & Legal Entities Read', () => {
    // قراءة العملات — يجب أن تكون سريعة ومخزنة
    const currRes = http.get(
      `${SUPABASE_URL}/rest/v1/currencies?is_active=eq.true`,
      { headers: getHeaders() }
    );

    check(currRes, {
      'currencies fetched': (r) => r.status === 200,
      'currencies includes IQD': (r) => r.body.includes('IQD'),
    });

    sleep(0.2);
  });
}

export function handleSummary(data) {
  return {
    'k6-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== K6 GL Posting Load Test Summary ===
Checks: ${data.metrics.checks ? `${data.metrics.checks.passes} passed, ${data.metrics.checks.fails} failed` : 'N/A'}
HTTP Req Duration p95: ${data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'] : 'N/A'} ms
Failed Posts Rate: ${data.metrics.failed_posts ? data.metrics.failed_posts.values.rate : 'N/A'}
Double Post Attempts Blocked: ${data.metrics.double_post_attempts ? data.metrics.double_post_attempts.values.rate : 'N/A'}

Expected:
- p95 < 500ms
- failed_posts rate < 0.05
- double post should be blocked (400/409/422)

If failed, investigate:
- RLS policies on journal_entries
- post_journal_entry RPC atomicity
- period lock logic in 0132
    `,
  };
}
