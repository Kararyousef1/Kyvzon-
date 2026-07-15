/**
 * ═════════════════════════════════════════════════════════════════════════
 *  StorageService.test.ts
 *
 *  التركيز على:
 *    - بناء مسار آمن (لا path traversal)
 *    - استخراج الامتداد
 *    - رمي SdkError عند الفشل (بخلاف SecurityEventService)
 *    - استخدام upsert / cacheControl / contentType الافتراضية
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const createSignedUrlMock = vi.fn();
const removeMock = vi.fn();

vi.mock('../../services/supabase/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
        createSignedUrl: createSignedUrlMock,
        remove: removeMock,
      })),
    },
  },
}));

vi.mock('../../services/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { storageService } from '../../services/sdk/StorageService';
import { SdkError } from '../../services/sdk/BaseService';

function makeFile(name: string, type = 'image/jpeg', size = 1024): File {
  return new File(['x'.repeat(size)], name, { type });
}

describe('StorageService — uploadPublic', () => {
  beforeEach(() => {
    uploadMock.mockReset();
    getPublicUrlMock.mockReset();
    createSignedUrlMock.mockReset();
    removeMock.mockReset();
  });

  it('يرفع الملف ويرجع URL عام', async () => {
    uploadMock.mockResolvedValueOnce({ error: null });
    getPublicUrlMock.mockReturnValueOnce({ data: { publicUrl: 'https://x.co/f.jpg' } });

    const url = await storageService.uploadPublic(
      'public-assets',
      'profiles',
      makeFile('avatar.jpg'),
    );

    expect(url).toBe('https://x.co/f.jpg');
    expect(uploadMock).toHaveBeenCalledOnce();
    const [path, file, opts] = uploadMock.mock.calls[0];
    expect(path).toMatch(/^profiles\/\d+-[a-z0-9]+\.jpg$/);
    expect(opts.upsert).toBe(true);
    expect(opts.cacheControl).toBe('3600');
    expect(opts.contentType).toBe('image/jpeg');
  });

  it('يستخدم fileName مخصص عند تمريره', async () => {
    uploadMock.mockResolvedValueOnce({ error: null });
    getPublicUrlMock.mockReturnValueOnce({ data: { publicUrl: 'https://x.co/f.png' } });

    await storageService.uploadPublic(
      'public-assets',
      'landing',
      makeFile('logo.PNG', 'image/png'),
      { fileName: 'brand-logo' },
    );

    const [path] = uploadMock.mock.calls[0];
    expect(path).toBe('landing/brand-logo.png');
  });

  it('ينظِّف مقاطع المسار (حماية من path traversal)', async () => {
    uploadMock.mockResolvedValueOnce({ error: null });
    getPublicUrlMock.mockReturnValueOnce({ data: { publicUrl: 'https://x.co/f.jpg' } });

    await storageService.uploadPublic(
      'public-assets',
      '../../secret/etc',
      makeFile('a.jpg'),
    );

    const [path] = uploadMock.mock.calls[0];
    // .. يتم استبدالها بـ _ (كل نقطتين متتاليتين)
    expect(path).not.toContain('..');
    expect(path).toContain('secret/etc/');
    expect(path.startsWith('_')).toBe(true);
  });

  it('ينظِّف الاسم المخصص من الأحرف غير الآمنة', async () => {
    uploadMock.mockResolvedValueOnce({ error: null });
    getPublicUrlMock.mockReturnValueOnce({ data: { publicUrl: 'https://x.co/f.jpg' } });

    await storageService.uploadPublic(
      'public-assets',
      'x',
      makeFile('a.jpg'),
      { fileName: 'user@evil<script>' },
    );

    const [path] = uploadMock.mock.calls[0];
    expect(path).not.toContain('<');
    expect(path).not.toContain('@');
    expect(path).not.toContain('>');
  });

  it('يرمي SdkError عند فشل الرفع', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'Quota exceeded' } });

    await expect(
      storageService.uploadPublic('public-assets', 'x', makeFile('a.jpg')),
    ).rejects.toThrow(SdkError);
  });

  it('يستخرج الامتداد بشكل صحيح (case-insensitive)', async () => {
    uploadMock.mockResolvedValue({ error: null });
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'x' } });

    await storageService.uploadPublic('b', 'f', makeFile('doc.PDF'));
    expect(uploadMock.mock.calls[0][0]).toMatch(/\.pdf$/);

    await storageService.uploadPublic('b', 'f', makeFile('no-ext'));
    expect(uploadMock.mock.calls[1][0]).toMatch(/\.bin$/);
  });
});

describe('StorageService — uploadPrivate + signedUrl', () => {
  beforeEach(() => {
    uploadMock.mockReset();
    createSignedUrlMock.mockReset();
  });

  it('uploadPrivate يرجع المسار الداخلي فقط', async () => {
    uploadMock.mockResolvedValueOnce({ error: null });

    const p = await storageService.uploadPrivate('docs', 'contracts', makeFile('c.pdf'));

    expect(p).toMatch(/^contracts\/\d+-[a-z0-9]+\.pdf$/);
    // upsert الافتراضي false للخاص
    expect(uploadMock.mock.calls[0][2].upsert).toBe(false);
  });

  it('signedUrl يرجع الرابط الموقّع', async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: { signedUrl: 'https://x.co/signed?token=abc' },
      error: null,
    });

    const url = await storageService.signedUrl('docs', 'a/b/c.pdf', 60);
    expect(url).toBe('https://x.co/signed?token=abc');
    expect(createSignedUrlMock).toHaveBeenCalledWith('a/b/c.pdf', 60);
  });

  it('signedUrl يرمي SdkError عند الفشل', async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Not found' },
    });

    await expect(
      storageService.signedUrl('docs', 'x'),
    ).rejects.toThrow(SdkError);
  });
});

describe('StorageService — delete', () => {
  beforeEach(() => {
    removeMock.mockReset();
  });

  it('يقبل مساراً واحداً كـ string', async () => {
    removeMock.mockResolvedValueOnce({ error: null });
    await storageService.delete('bucket', 'file.jpg');
    expect(removeMock).toHaveBeenCalledWith(['file.jpg']);
  });

  it('يقبل مصفوفة مسارات', async () => {
    removeMock.mockResolvedValueOnce({ error: null });
    await storageService.delete('bucket', ['a.jpg', 'b.jpg']);
    expect(removeMock).toHaveBeenCalledWith(['a.jpg', 'b.jpg']);
  });

  it('يرمي SdkError عند الفشل', async () => {
    removeMock.mockResolvedValueOnce({ error: { message: 'Permission denied' } });
    await expect(storageService.delete('bucket', 'x')).rejects.toThrow(SdkError);
  });
});
