import { useState, useEffect } from 'react';
import { Mail, Inbox, Send, ChevronRight, Loader, Archive, Check, Eye } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { messageService, HrMessageRecord } from '../../services/sdk';
import { supabase } from '../../services/supabase/supabase';

interface Message {
  id: string;
  subject: string;
  message: string;
  priority: string;
  status: 'new' | 'read' | 'replied';
  created_at: string;
  profiles?: { full_name: string, department: string } | null;
}

const priorityStyles: Record<string, string> = {
  low: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  normal: 'border-indigo-300 bg-indigo-50 text-indigo-700',
  urgent: 'border-red-300 bg-red-50 text-red-700',
};

export default function HRCommunicationPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
    // Realtime subscription - this is an acceptable exception
    const channel = supabase.channel('hr-messages-listener')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hr_messages' }, fetchMessages)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchMessages = async () => {
    const data = await messageService.findAllWithProfiles();
    setMessages(data || []);
    setLoading(false);
  };

  const handleSelectMessage = async (msg: Message) => {
    setSelected(msg);
    if (msg.status === 'new') {
      try {
        await messageService.updateMessageStatus(msg.id, 'read');
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader className="animate-spin" /></div>;

  return (
    <div className="grid md:grid-cols-3 gap-6 h-[calc(100vh-120px)]">
      {/* Message List */}
      <Card padding="none" className="md:col-span-1 flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox size={18} /> صندوق البريد</CardTitle>
          <Badge>{messages.length}</Badge>
        </CardHeader>
        <div className="flex-1 overflow-y-auto">
          {messages.map(msg => (
            <button
              key={msg.id}
              onClick={() => handleSelectMessage(msg)}
              className={`w-full text-right p-4 border-b border-slate-100 flex items-start gap-3 transition-colors ${selected?.id === msg.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
            >
              {msg.status === 'new' && <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <p className="font-bold text-sm text-slate-800 truncate">{(msg.profiles?.full_name ?? "")}</p>
                  <p className="text-xs text-slate-400 flex-shrink-0">{formatDistanceToNow(new Date(msg.created_at), { locale: ar, addSuffix: true })}</p>
                </div>
                <p className="text-xs text-slate-600 truncate">{msg.subject}</p>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Message Viewer */}
      <Card className="md:col-span-2 flex flex-col">
        {selected ? (
          <div className="flex flex-col h-full">
            <div className="pb-4 border-b border-slate-100">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">{selected.subject}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    من: <span className="font-semibold text-slate-700">{(selected.profiles?.full_name ?? "")}</span> ({(selected.profiles?.department ?? "")})
                  </p>
                </div>
                <Badge className={priorityStyles[selected.priority]}>{selected.priority === 'urgent' ? 'عاجلة' : selected.priority === 'low' ? 'منخفضة' : 'عادية'}</Badge>
              </div>
            </div>
            <div className="flex-1 py-4 overflow-y-auto">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.message}</p>
            </div>
            <div className="pt-4 border-t border-slate-100 flex gap-2">
              <Button variant="success" icon={<Check size={14}/>}>وضع علامة كمكتمل</Button>
              <Button variant="outline" icon={<Archive size={14}/>}>أرشفة</Button>
              <Button className="mr-auto" icon={<Send size={14}/>}>رد</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Mail size={48} className="mb-4 opacity-50" />
            <p className="font-bold">اختر رسالة لعرضها</p>
            <p className="text-sm">سيتم عرض تفاصيل الرسالة هنا</p>
          </div>
        )}
      </Card>
    </div>
  );
}