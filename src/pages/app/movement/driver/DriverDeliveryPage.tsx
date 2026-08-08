/**
 * D02 — تطبيق السائق: إثبات التسليم (ePOD)
 *
 * التوقيع الرقمي:
 *   canvas خام لا مكتبة — التوقيع خطوط بسيطة، وإضافة تبعية لأجلها
 *   تُثقل حزمة يُحمّلها السائق على شبكة هاتف ضعيفة.
 *   يعمل باللمس والفأرة: pointer events تغطي الاثنين بمسار واحد.
 *
 * الحماية من الازدواج:
 *   كل عملية تحمل client_uuid ثابتاً محفوظاً محلياً. إعادة المحاولة
 *   بعد انقطاع الشبكة تُرجع الصف الأصلي لا صفّاً ثانياً (0294).
 *
 * لماذا لا رفع صور هنا:
 *   الرفع يحتاج Supabase Storage bucket وسياسات وصول لم تُنشأ لهذه
 *   البوابة بعد. الادعاء بوجوده وهو غير موجود أسوأ من غيابه —
 *   الحقل موجود في المخطط (photo_proof_url) والواجهة تُفصح بصراحة.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Eraser, Loader2, PenLine, Truck,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import {
  driverAppService,
  EPOD_STATUS_LABELS,
  type DriverTrip,
  type EpodStatus,
} from '../../../../services/sdk/DriverAppService';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';

export default function DriverDeliveryPage() {
  const { dispatchId } = useParams<{ dispatchId: string }>();
  const navigate = useNavigate();
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState<DriverTrip | null>(null);

  const [recipient, setRecipient] = useState('');
  const [status, setStatus] = useState<EpodStatus>('delivered');
  const [notes, setNotes] = useState('');
  const [hasSignature, setHasSignature] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const loadTrip = useCallback(async () => {
    setLoading(true);
    try {
      // نقرأ من قائمة رحلاتي: الخادم يضمن أنها رحلة هذا السائق
      const all = await driverAppService.findMyTrips(true);
      setTrip(all.find((t) => t.dispatch_id === dispatchId) ?? null);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [dispatchId, addToast]);

  useEffect(() => { void loadTrip(); }, [loadTrip]);

  /* تهيئة اللوحة بدقة الشاشة — بدونها يظهر الخط مُهشَّماً */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trip?.has_epod) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [trip]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    // setPointerCapture: الخط لا ينقطع إن خرج الإصبع عن حدود اللوحة
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => { drawingRef.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const submit = async () => {
    if (!dispatchId) return;
    if (recipient.trim().length < 2) {
      addToast('اسم المستلم مطلوب', 'error');
      return;
    }
    if ((status === 'rejected' || status === 'disputed') && notes.trim().length < 5) {
      addToast('الرفض والنزاع يتطلبان بيان السبب', 'error');
      return;
    }

    setSaving(true);
    try {
      /*
        التوقيع يُخزَّن كـ data URL في signature_url.
        PNG لأن التوقيع خطوط حادة على خلفية شفافة — JPEG يُشوّهها.
        هذا حل مؤقت صريح: الأصوب رفعه إلى Storage وتخزين رابطه، لكن
        الـ bucket غير مُنشأ لهذه البوابة.
      */
      const signature = hasSignature && canvasRef.current
        ? canvasRef.current.toDataURL('image/png')
        : null;

      /*
        معرّف ثابت للعملية: لو ضاع الرد في تغطية ضعيفة وأعاد السائق
        المحاولة، يُرجع الخادم الصف الأصلي بدل إنشاء ثانٍ (0294).
      */
      const clientUuid = driverAppService.getOrCreateEpodClientUuid(dispatchId);

      await driverAppService.recordDeliveryProof({
        dispatchId,
        recipientName: recipient.trim(),
        status,
        signatureUrl: signature,
        notes: notes.trim() || null,
        clientUuid,
      });

      driverAppService.clearEpodClientUuid(dispatchId);
      addToast('سُجّل إثبات التسليم', 'success');
      navigate('/app/movement/driver/trips');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center" dir="rtl">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="p-4" dir="rtl">
        <Card>
          <div className="py-16 text-center text-slate-400">
            <Truck className="mx-auto mb-2" size={32} />
            <p className="text-sm font-bold text-slate-600">الرحلة غير موجودة</p>
            <p className="text-xs mt-1">قد تكون غير مُسنَدة إليك.</p>
            <Button
              onClick={() => navigate('/app/movement/driver/trips')}
              className="mt-4"
            >
              العودة لرحلاتي
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-emerald-700 to-slate-900 rounded-2xl p-5 text-white">
        <button
          type="button"
          onClick={() => navigate('/app/movement/driver/trips')}
          className="text-white/70 text-xs flex items-center gap-1 mb-2"
        >
          <ArrowRight size={14} /> رحلاتي
        </button>
        <p className="text-white/60 text-xs font-semibold">Driver App • D02</p>
        <h2 className="text-xl font-extrabold mt-0.5 flex items-center gap-2">
          <CheckCircle2 /> إثبات التسليم
        </h2>
        <p className="text-white/75 text-sm mt-1 font-mono">{trip.dispatch_code}</p>
        <p className="text-white/60 text-xs mt-1">{trip.destination_address}</p>
      </div>

      {trip.has_epod ? (
        <Card>
          <div className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={38} />
            <p className="font-bold text-slate-800">سُجّل إثبات التسليم لهذه الرحلة</p>
            <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto">
              لا يمكن تسجيله مرتين. لتصحيح خطأ راجع المُرسِل — التعديل
              يمر بمسار تدقيق لا يملكه تطبيق السائق.
            </p>
            <Button
              onClick={() => navigate('/app/movement/driver/trips')}
              className="mt-5 !min-h-[48px]"
            >
              العودة لرحلاتي
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600">اسم المستلم *</label>
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="الاسم الكامل للمستلم"
                  className="!min-h-[48px]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">حالة التسليم</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {(Object.keys(EPOD_STATUS_LABELS) as EpodStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`min-h-[48px] rounded-xl border-2 text-sm font-bold px-2 ${
                        status === s
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {EPOD_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600">
                  ملاحظات{' '}
                  {(status === 'rejected' || status === 'disputed') && (
                    <span className="text-rose-600">* إلزامية</span>
                  )}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border rounded-xl p-3 text-sm mt-1"
                  placeholder={
                    status === 'rejected' ? 'سبب رفض المستلم للشحنة'
                      : status === 'disputed' ? 'تفاصيل النزاع'
                      : 'أي ملاحظة على التسليم'
                  }
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <PenLine size={15} /> توقيع المستلم
              </h3>
              {hasSignature && (
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-xs font-bold text-rose-600 flex items-center gap-1"
                >
                  <Eraser size={13} /> مسح
                </button>
              )}
            </div>
            <canvas
              ref={canvasRef}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
              className="w-full h-40 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50"
              style={{ touchAction: 'none' }}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              {hasSignature
                ? 'التوقيع مُسجَّل — يُحفظ مع إثبات التسليم.'
                : 'وقّع بالإصبع أو القلم داخل الإطار. التوقيع اختياري.'}
            </p>
          </Card>

          <p className="text-[11px] text-slate-400 px-1">
            رفع صور الشحنة غير متاح بعد — مساحة التخزين لهذه البوابة لم
            تُهيَّأ. الحقل محجوز في قاعدة البيانات ويُفعَّل لاحقاً دون تغيير
            هذه الشاشة.
          </p>

          <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t">
            <Button
              onClick={() => void submit()}
              loading={saving}
              className="w-full !min-h-[54px] !text-base"
              icon={<CheckCircle2 size={19} />}
              iconPosition="left"
            >
              تسجيل إثبات التسليم
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
