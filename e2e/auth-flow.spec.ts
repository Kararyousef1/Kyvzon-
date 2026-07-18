import { test, expect } from '@playwright/test';

test.describe('Auth & RBAC', () => {
  test('unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/app/hr/dashboard');
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('role redirect after login', async ({ page }) => {
    // بعد تسجيل الدخول كـ employee → يجب redirect لـ /app/employee/dashboard
    // بعد تسجيل الدخول كـ admin → /app/admin/dashboard
  });

  test('admin cannot self-demote via Edge Function', async ({ request }) => {
    // Attempt admin-update-role with target_user_id = caller.id and new_role != admin → 400
  });

  test('privilege escalation blocked — cannot promote to developer', async ({ request }) => {
    // Attempt new_role=developer → 403
  });
});
