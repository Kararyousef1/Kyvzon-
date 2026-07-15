/**
 * زر «فتح نقاش» — يُستورد من أي صفحة ERP
 */

import { useState } from 'react';
import { MessagesSquare, Loader2 } from 'lucide-react';
import Button from '../../../shared/components/ui/Button';
import { tawathulConversationService } from '../services';
import { useUIStore } from '../../../core/stores';
import { ensureDefaultTenantCached } from '../utils/tenant';
import type { TawathulEntityType } from '../types';
import { useNavigate } from 'react-router-dom';

interface Props {
  entityType: TawathulEntityType | string;
  entityId: string;
  title: string;
  memberIds?: string[];
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md';
  label?: string;
}

export default function OpenEntityDiscussionButton({
  entityType,
  entityId,
  title,
  memberIds,
  className,
  variant = 'secondary',
  size = 'sm',
  label = 'فتح نقاش',
}: Props) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);

  const open = async () => {
    if (!entityId) {
      addToast('لا يوجد معرّف للسجل', 'warning');
      return;
    }
    setLoading(true);
    ensureDefaultTenantCached();
    try {
      const conv = await tawathulConversationService.openEntityDiscussion({
        entityType,
        entityId,
        title,
        memberIds,
      });
      sessionStorage.setItem('tawathul_open_conversation', conv.id);
      navigate('/app/tawathul');
      addToast('تم فتح نقاش التواصل', 'success');
    } catch (e: any) {
      console.error(e);
      addToast(e?.message || 'تعذّر فتح النقاش', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={open}
      disabled={loading || !entityId}
      icon={loading ? <Loader2 size={14} className="animate-spin" /> : <MessagesSquare size={14} />}
      iconPosition="right"
    >
      {label}
    </Button>
  );
}
