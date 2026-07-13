/**
 * اختبارات وحدة لـ utils.ts
 * ════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  isLocalUser,
  getDisplayName,
  getUserInitial,
  getUserRole,
  getUserPosition,
} from '../services/utils';
import type { User } from '../shared/types';

const mockUser: User = {
  id: '123',
  email: 'test@example.com',
  full_name: 'أحمد المحمد',
  name: 'أحمد المحمد',
  role: 'employee',
  department: 'الإنتاج',
  position: 'مشغّل آلات',
};

describe('lib/utils', () => {
  describe('isLocalUser', () => {
    it('should return false for null', () => {
      expect(isLocalUser(undefined)).toBe(false);
      expect(isLocalUser('')).toBe(false);
    });

    it('should return true for emp- prefixed IDs', () => {
      expect(isLocalUser('emp-12345')).toBe(true);
    });

    it('should return true for temp-test- prefixed IDs', () => {
      expect(isLocalUser('temp-test-abc')).toBe(true);
    });

    it('should return false for Supabase UUIDs', () => {
      expect(isLocalUser('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
    });
  });

  describe('getDisplayName', () => {
    it('should return the full_name when available', () => {
      expect(getDisplayName(mockUser)).toBe('أحمد المحمد');
    });

    it('should fallback to name when full_name is missing', () => {
      const user = { ...mockUser, full_name: '', name: 'محمد' };
      expect(getDisplayName(user)).toBe('محمد');
    });

    it('should return fallback for null user', () => {
      expect(getDisplayName(null)).toBe('مستخدم');
      expect(getDisplayName(undefined)).toBe('مستخدم');
    });

    it('should return custom fallback', () => {
      expect(getDisplayName(null, 'ضيف')).toBe('ضيف');
    });

    it('should return fallback when no name fields exist', () => {
      const user = { ...mockUser, full_name: '', name: '' };
      expect(getDisplayName(user)).toBe('مستخدم');
    });
  });

  describe('getUserInitial', () => {
    it('should return first letter capitalized', () => {
      expect(getUserInitial(mockUser)).toBe('أ');
    });

    it('should return U for null user', () => {
      expect(getUserInitial(null)).toBe('U');
      expect(getUserInitial(undefined)).toBe('U');
    });
  });

  describe('getUserRole', () => {
    it('should return user role', () => {
      expect(getUserRole(mockUser)).toBe('employee');
    });

    it('should return employee as default', () => {
      expect(getUserRole(null)).toBe('employee');
      expect(getUserRole(undefined)).toBe('employee');
    });
  });

  describe('getUserPosition', () => {
    it('should return position when available', () => {
      expect(getUserPosition(mockUser)).toBe('مشغّل آلات');
    });

    it('should fallback to role if position is missing', () => {
      const user = { ...mockUser, position: undefined };
      expect(getUserPosition(user)).toBe('employee');
    });

    it('should return empty string for null user', () => {
      expect(getUserPosition(null)).toBe('');
      expect(getUserPosition(undefined)).toBe('');
    });
  });
});
