// @ts-check
/**
 * eslint.config.js — Flat config (ESLint 9 + typescript-eslint 8)
 *
 * فلسفة الإعداد:
 *   - أخطاء حقيقية (errors): أشياء تكسر أو تُخفي أخطاء منطقية.
 *   - ديون تقنية معروفة (warnings): `as any`، console، وغيرها — تُرصد دون كسر CI،
 *     ليُخفَّض عددها تدريجياً بدل حظر شامل يعطّل الفريق.
 *
 * التشغيل:
 *   npm run lint        # فحص
 *   npm run lint:fix    # إصلاح تلقائي لما يمكن
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  // تجاهل المخرجات والبيئة
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      'supabase/functions/**', // Deno runtime — قواعد/استيرادات مختلفة
      '**/*.config.{js,ts,mjs,cjs}',
      'scripts/**',
      'e2e/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // قواعد مشروع الواجهة
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ── أخطاء حقيقية ──────────────────────────────────────────────
      'no-debugger': 'error',
      'no-alert': 'warn', // 33 استخدام legacy (alert/confirm) — دَين UX يُستبدل بـ toasts تدريجياً
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-implicit-coercion': 'off',
      '@typescript-eslint/no-misused-promises': 'off', // يتطلب type-info
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      'react-hooks/rules-of-hooks': 'error',

      // ── ديون تقنية معروفة (warnings) ─────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',      // 226 حالة — تُخفَّض تدريجياً
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── إيقاف قواعد صاخبة غير مجدية هنا ──────────────────────────
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // ملفات الاختبار — تخفيف إضافي
  {
    files: ['src/test/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
