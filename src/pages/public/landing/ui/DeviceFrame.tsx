import React, { type ReactNode } from 'react';
import { Lock } from 'lucide-react';

interface BrowserFrameProps {
  children: ReactNode;
  url?: string;
  className?: string;
}

/** إطار متصفح مبسّط (macOS-style) لعرض واجهات سطح المكتب داخل الـ mockups */
export function BrowserFrame({ children, url = 'app.kyvzon.com', className = '' }: BrowserFrameProps) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        background: '#0b0d18',
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#ff5f57' }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#febc2e' }} />
          <span style={{ width: 9, height: 9, borderRadius: 99, background: '#28c840' }} />
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            margin: '0 8px',
            padding: '4px 12px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--kv-text-muted)',
            fontSize: '0.72rem',
          }}
        >
          <Lock size={10} />
          {url}
        </div>
      </div>
      {children}
    </div>
  );
}

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

/** إطار جوال مبسّط لعرض تجربة الموبايل داخل قسم لقطات الشاشة */
export function PhoneFrame({ children, className = '' }: PhoneFrameProps) {
  return (
    <div
      className={className}
      style={{
        width: 260,
        maxWidth: '100%',
        margin: '0 auto',
        borderRadius: 36,
        padding: 10,
        background: '#0b0d18',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', background: '#05070f' }}>
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 72,
            height: 18,
            borderRadius: 99,
            background: '#000',
            zIndex: 2,
          }}
        />
        {children}
      </div>
    </div>
  );
}
