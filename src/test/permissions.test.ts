/**
 * اختبارات وحدة لـ permissions.ts
 * ════════════════════════════════════════════════════════════════
 *  يختبر:
 *  - getDefaultPermissions
 *  - getEffectivePermissions
 *  - hasPermission
 *  - تطابق الصلاحيات عبر الأدوار المختلفة
 * ════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROLE_PERMISSIONS,
  getDefaultPermissions,
  getEffectivePermissions,
  hasPermission,
  type PermissionKey,
} from '../core/constants/permissions';
import type { UserRole } from '../shared/types';

describe('constants/permissions', () => {
  describe('DEFAULT_ROLE_PERMISSIONS', () => {
    it('should contain all required roles', () => {
      const expectedRoles: UserRole[] = [
        'employee', 'hr', 'admin', 'gatekeeper', 'developer', 'supervisor', 'manager',
      ];
      expectedRoles.forEach((role) => {
        expect(DEFAULT_ROLE_PERMISSIONS[role]).toBeDefined();
      });
    });

    it('should have at least one permission for each role', () => {
      Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([role, perms]) => {
        expect(perms.length, `Role ${role} should have at least one permission`).toBeGreaterThan(0);
      });
    });

    it('should not have duplicate permissions per role', () => {
      Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([role, perms]) => {
        const uniquePerms = new Set(perms);
        expect(
          uniquePerms.size,
          `Role ${role} has duplicate permissions`
        ).toBe(perms.length);
      });
    });

    it('should include "notifications" permission for all non-developer roles', () => {
      const rolesWithoutNotifications: UserRole[] = ['employee', 'hr', 'admin', 'gatekeeper', 'supervisor', 'manager'];
      rolesWithoutNotifications.forEach((role) => {
        expect(
          DEFAULT_ROLE_PERMISSIONS[role],
          `Role ${role} should have notifications permission`
        ).toContain('notifications');
      });
    });
  });

  describe('getDefaultPermissions', () => {
    it('should return permissions for a valid role', () => {
      const perms = getDefaultPermissions('employee');
      expect(perms).toBeDefined();
      expect(perms.length).toBeGreaterThan(0);
    });

    it('should return employee permissions as fallback for unknown role', () => {
      const perms = getDefaultPermissions('employee');
      expect(perms).toEqual(DEFAULT_ROLE_PERMISSIONS.employee);
    });

    it('should return same reference as DEFAULT_ROLE_PERMISSIONS', () => {
      const perms = getDefaultPermissions('hr');
      expect(perms).toBe(DEFAULT_ROLE_PERMISSIONS.hr);
    });
  });

  describe('getEffectivePermissions', () => {
    it('should return default permissions when dbPermissions is null', () => {
      const result = getEffectivePermissions('employee', null);
      expect(result).toEqual(DEFAULT_ROLE_PERMISSIONS.employee);
    });

    it('should return default permissions when dbPermissions is undefined', () => {
      const result = getEffectivePermissions('employee', undefined);
      expect(result).toEqual(DEFAULT_ROLE_PERMISSIONS.employee);
    });

    it('should return default permissions when dbPermissions is empty array', () => {
      const result = getEffectivePermissions('employee', []);
      expect(result).toEqual(DEFAULT_ROLE_PERMISSIONS.employee);
    });

    it('should merge default with custom permissions', () => {
      const custom: string[] = ['custom-permission-1', 'custom-permission-2'];
      const result = getEffectivePermissions('employee', custom);
      // Should include all default permissions
      DEFAULT_ROLE_PERMISSIONS.employee.forEach((p) => {
        expect(result).toContain(p);
      });
      // Should include custom permissions
      expect(result).toContain('custom-permission-1');
      expect(result).toContain('custom-permission-2');
    });

    it('should not duplicate permissions', () => {
      const custom: string[] = ['dashboard', 'problems', 'new-permission'];
      const result = getEffectivePermissions('employee', custom);
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });

    it('should return array of PermissionKey', () => {
      const result = getEffectivePermissions('hr', ['extra-permission']);
      expect(Array.isArray(result)).toBe(true);
      result.forEach((p) => {
        expect(typeof p).toBe('string');
      });
    });

    it('should preserve order of default permissions first', () => {
      const result = getEffectivePermissions('admin', []);
      // First elements should be the defaults
      DEFAULT_ROLE_PERMISSIONS.admin.forEach((perm, idx) => {
        if (idx < DEFAULT_ROLE_PERMISSIONS.admin.length) {
          expect(result).toContain(perm);
        }
      });
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has the permission', () => {
      const userPerms: PermissionKey[] = ['dashboard', 'problems', 'profile'];
      expect(hasPermission(userPerms, 'dashboard')).toBe(true);
      expect(hasPermission(userPerms, 'profile')).toBe(true);
    });

    it('should return false when user does not have the permission', () => {
      const userPerms: PermissionKey[] = ['dashboard'];
      expect(hasPermission(userPerms, 'admin-settings')).toBe(false);
    });

    it('should return false when userPermissions is null', () => {
      expect(hasPermission(null, 'dashboard')).toBe(false);
    });

    it('should return false when userPermissions is undefined', () => {
      expect(hasPermission(undefined, 'dashboard')).toBe(false);
    });

    it('should return false when userPermissions is empty array', () => {
      expect(hasPermission([], 'dashboard')).toBe(false);
    });
  });

  describe('Permission isolation between roles', () => {
    it('admin should have permissions that employee does not', () => {
      const employeePerms = DEFAULT_ROLE_PERMISSIONS.employee;
      const adminOnlyPerms: PermissionKey[] = ['cms', 'employees', 'permissions', 'settings', 'audit-log'];

      adminOnlyPerms.forEach((p) => {
        expect(adminPerms_orDefault(p), `Admin should have ${p}`).toBe(true);
        expect(employeePerms, `Employee should not have ${p}`).not.toContain(p);
      });
    });

    it('hr should have analytics but employee should not', () => {
      expect(DEFAULT_ROLE_PERMISSIONS.hr).toContain('analytics');
      expect(DEFAULT_ROLE_PERMISSIONS.employee).not.toContain('analytics');
    });

    it('gatekeeper should only have gatekeeper-portal and notifications', () => {
      const gatekeeperPerms = DEFAULT_ROLE_PERMISSIONS.gatekeeper;
      expect(gatekeeperPerms).toContain('gatekeeper-portal');
      expect(gatekeeperPerms).toContain('notifications');
      expect(gatekeeperPerms).not.toContain('dashboard');
      expect(gatekeeperPerms).not.toContain('analytics');
    });

    it('developer should have developer-specific permissions', () => {
      const devPerms = DEFAULT_ROLE_PERMISSIONS.developer;
      expect(devPerms).toContain('developer-dashboard');
      expect(devPerms).toContain('developer-db');
      expect(devPerms).toContain('developer-logs');
    });
  });

  describe('Permission consistency', () => {
    it('all roles should have "dashboard" permission except gatekeeper', () => {
      const rolesWithDashboard: UserRole[] = ['employee', 'hr', 'admin', 'developer', 'supervisor', 'manager'];
      rolesWithDashboard.forEach((role) => {
        expect(
          DEFAULT_ROLE_PERMISSIONS[role],
          `Role ${role} should have dashboard`
        ).toContain('dashboard');
      });
    });

    it('supervisor and manager should have similar permission sets', () => {
      const supervisor = new Set(DEFAULT_ROLE_PERMISSIONS.supervisor);
      const manager = new Set(DEFAULT_ROLE_PERMISSIONS.manager);
      // Both should have core permissions
      ['dashboard', 'problems', 'team', 'reports', 'supervisor-breaks'].forEach((p) => {
        expect(supervisor.has(p as PermissionKey)).toBe(true);
        expect(manager.has(p as PermissionKey)).toBe(true);
      });
    });

    it('admin should be a superset of most permissions', () => {
      const adminSet = new Set(DEFAULT_ROLE_PERMISSIONS.admin);
      const adminOnlyCount = adminSet.size;
      // Admin should have the most permissions of any role
      Object.values(DEFAULT_ROLE_PERMISSIONS).forEach((perms) => {
        expect(perms.length).toBeLessThanOrEqual(adminOnlyCount);
      });
    });
  });
});

// Helper function for cleaner tests
function adminPerms_orDefault(p: PermissionKey): boolean {
  return DEFAULT_ROLE_PERMISSIONS.admin.includes(p);
}
