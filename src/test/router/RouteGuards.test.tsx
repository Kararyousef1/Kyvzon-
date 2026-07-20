/**
 * ═════════════════════════════════════════════════════════════════════════
 *  RouteGuards.test.tsx — اختبار RequireAuth / RequireRole / RoleRedirect
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock useAuthStore قبل الاستيراد
const mockState = {
  isAuthenticated: false,
  loading: false,
  user: null as any,
};

vi.mock('../../core/stores', () => ({
  useAuthStore: () => mockState,
  useUIStore: () => ({ sidebarOpen: false, setSidebarOpen: vi.fn() }),
}));

vi.mock('../../core/constants/permissions', () => ({
  hasPermission: (perms: string[] | undefined, key: string) =>
    Array.isArray(perms) && perms.includes(key),
}));

// Mock useTenantModules — RoleRedirect يعتمد عليه؛ نحاكي شركة غير هجينة
// (يمنع أيضاً استيراد عميل supabase الحقيقي الذي يتطلب متغيرات بيئة).
vi.mock('../../shared/hooks/useTenantModules', () => ({
  useTenantModules: () => ({
    subscriptionPlan: null,
    enabledPages: [],
    loaded: true,
    loading: false,
  }),
}));

import { RequireAuth } from '../../router/guards/RequireAuth';
import { RequireRole } from '../../router/guards/RequireRole';
import { RoleRedirect } from '../../router/guards/RoleRedirect';

// Helper لإنشاء shell صغير للاختبار
function renderRoute(pathname: string, element: React.ReactNode, extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN_PAGE</div>} />
        <Route path="/app/employee" element={<div>EMPLOYEE_DASH</div>} />
        <Route path="/app/hr" element={<div>HR_DASH</div>} />
        <Route path="/app/admin" element={<div>ADMIN_DASH</div>} />
        <Route path="/dev" element={<div>DEV_PORTAL</div>} />
        {element}
        {extra}
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    mockState.isAuthenticated = false;
    mockState.loading = false;
    mockState.user = null;
  });

  it('يُوجِّه إلى /login عندما لا يكون المستخدم مصادَق عليه', () => {
    renderRoute(
      '/protected',
      <Route path="/protected" element={<RequireAuth><div>SECRET</div></RequireAuth>} />,
    );
    expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.getByText('LOGIN_PAGE')).toBeDefined();
  });

  it('يعرض المحتوى عندما يكون مصادَق عليه', () => {
    mockState.isAuthenticated = true;
    mockState.user = { role: 'employee' };
    renderRoute(
      '/protected',
      <Route path="/protected" element={<RequireAuth><div>SECRET</div></RequireAuth>} />,
    );
    expect(screen.getByText('SECRET')).toBeDefined();
  });

  it('يعرض null (لا يُوجِّه) أثناء loading', () => {
    mockState.loading = true;
    const { container } = renderRoute(
      '/protected',
      <Route path="/protected" element={<RequireAuth><div>SECRET</div></RequireAuth>} />,
    );
    expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.queryByText('LOGIN_PAGE')).toBeNull();
  });
});

describe('RequireRole', () => {
  beforeEach(() => {
    mockState.isAuthenticated = true;
    mockState.loading = false;
  });

  it('يعرض المحتوى للدور المطابق', () => {
    mockState.user = { role: 'hr' };
    renderRoute(
      '/hr-only',
      <Route
        path="/hr-only"
        element={<RequireRole roles={['hr', 'admin']}><div>HR_SECRET</div></RequireRole>}
      />,
    );
    expect(screen.getByText('HR_SECRET')).toBeDefined();
  });

  it('يُعيد التوجيه لصفحة الدور الافتراضية عند عدم المطابقة', () => {
    mockState.user = { role: 'employee' };
    renderRoute(
      '/hr-only',
      <Route
        path="/hr-only"
        element={<RequireRole roles={['hr', 'admin']}><div>HR_SECRET</div></RequireRole>}
      />,
    );
    expect(screen.queryByText('HR_SECRET')).toBeNull();
    expect(screen.getByText('EMPLOYEE_DASH')).toBeDefined();
  });

  it('يعمل مع دور واحد فقط', () => {
    mockState.user = { role: 'admin' };
    renderRoute(
      '/admin-only',
      <Route
        path="/admin-only"
        element={<RequireRole roles={['admin']}><div>ADMIN_SECRET</div></RequireRole>}
      />,
    );
    expect(screen.getByText('ADMIN_SECRET')).toBeDefined();
  });
});

describe('RoleRedirect', () => {
  beforeEach(() => {
    mockState.isAuthenticated = true;
    mockState.loading = false;
  });

  it('يُوجِّه HR إلى /app/hr', () => {
    mockState.user = { role: 'hr' };
    renderRoute(
      '/app',
      <Route path="/app" element={<RoleRedirect />} />,
    );
    expect(screen.getByText('HR_DASH')).toBeDefined();
  });

  it('يُوجِّه developer إلى /dev', () => {
    mockState.user = { role: 'developer' };
    renderRoute(
      '/app',
      <Route path="/app" element={<RoleRedirect />} />,
    );
    expect(screen.getByText('DEV_PORTAL')).toBeDefined();
  });

  it('يُوجِّه الأدوار غير المعروفة إلى /app/employee (fallback)', () => {
    mockState.user = { role: 'unknown_role' };
    renderRoute(
      '/app',
      <Route path="/app" element={<RoleRedirect />} />,
    );
    expect(screen.getByText('EMPLOYEE_DASH')).toBeDefined();
  });
});
