/**
 * مربع كتابة الرسالة + مرفقات + رد
 */

import { useRef, useState, KeyboardEvent } from 'react';
import { Paperclip, Send, Loader2, X, CornerUpLeft } from 'lucide-react';
import Button from '../../../shared/components/ui/Button';
import { useUIStore } from '../../../core/stores';
import type { TawathulMessage } from '../types';

interface Props {
  disabled?: boolean;
  sending?: boolean;
  replyTo?: TawathulMessage | null;
  onCancelReply?: () => void;
  onSend: (payload: { text: string; files: File[] }) => Promise<unknown> | unknown;
  placeholder?: string;
  allowFiles?: boolean;
}

export default function MessageComposer({
  disabled,
  sending,
  replyTo,
  onCancelReply,
  onSend,
  placeholder = 'اكتب رسالة… (استخدم @uuid للإشارة)',
  allowFiles = true,
}: Props) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const addToast = useUIStore((s) => s.addToast);
  const maxFiles = 5;
  const maxFileSize = 25 * 1024 * 1024;

  const submit = async () => {
    const value = text.trim();
    if ((!value && !files.length) || disabled || sending) return;
    const payload = { text: value, files };
    setText('');
    setFiles([]);
    await onSend(payload);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
      {replyTo && (
        <div className="max-w-5xl mx-auto mb-2 flex items-start gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800">
          <CornerUpLeft size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">رد على {replyTo.sender_name || 'رسالة'}</div>
            <div className="truncate opacity-80">{replyTo.body}</div>
          </div>
          <button type="button" onClick={onCancelReply} className="p-1 hover:bg-indigo-100 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {!!files.length && (
        <div className="max-w-5xl mx-auto mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1 text-xs bg-slate-100 border border-slate-200 rounded-full px-2 py-1"
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 max-w-5xl mx-auto">
        {allowFiles && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                if (!list.length) return;
                const oversized = list.find((file) => file.size > maxFileSize);
                if (oversized) {
                  addToast(`الملف ${oversized.name} أكبر من 25MB`, 'warning');
                  e.target.value = '';
                  return;
                }
                setFiles((prev) => {
                  const merged = [...prev, ...list];
                  if (merged.length > maxFiles) {
                    addToast(`يمكن إرفاق ${maxFiles} ملفات كحد أقصى`, 'warning');
                  }
                  return merged.slice(0, maxFiles);
                });
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={disabled || sending}
              onClick={() => fileRef.current?.click()}
              className="h-12 w-12 rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center shrink-0"
              title="إرفاق ملف"
            >
              <Paperclip size={18} />
            </button>
          </>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled || sending}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-h-32 min-h-[48px]"
        />
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || sending || (!text.trim() && !files.length)}
          className="rounded-2xl h-12 w-12 p-0 flex items-center justify-center shrink-0"
          aria-label="إرسال"
        >
          {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
        </Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 text-center">
        Enter للإرسال · Shift+Enter لسطر جديد · إرفاق حتى 5 ملفات / 25MB
      </p>
    </div>
  );
}
