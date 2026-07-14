import { type ReactNode, type ComponentType, type SVGProps } from 'react';
import Badge from '../../../../shared/components/ui/Badge';
import { ArrowUp, ArrowDown, type LucideProps } from 'lucide-react';

// LucideIcon يقبل string | number لخاصية size — نستخدم LucideProps مباشرة
type IconComponent = ComponentType<LucideProps>;

interface KPICardProps {
  label: string;
  value: string | number;
  icon: IconComponent;
  color: string;
  bg: string;
  trend?: string;
  trendUp?: boolean;
  suffix?: string;
}

export default function KPICard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  trend,
  trendUp,
  suffix = '',
}: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative overflow-hidden">
      <div 
        className="absolute top-0 left-0 w-20 h-20 rounded-br-[60px] opacity-10" 
        style={{ background: color }} 
      />
      
      <div className="flex items-start justify-between mb-3 relative z-10">
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" 
          style={{ background: bg }}
        >
          <Icon size={18} color={color} />
        </div>
        
        {trend && (
          <Badge 
            variant={trendUp ? 'success' : 'danger'} 
            size="sm" 
            className="font-bold flex items-center gap-1"
          >
            {trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            <span>{trend}</span>
          </Badge>
        )}
      </div>

      <p className="text-3xl font-extrabold text-slate-900 leading-none relative z-10">
        {value}{suffix}
      </p>
      <p className="text-xs text-slate-500 mt-2 relative z-10">{label}</p>
    </div>
  );
}