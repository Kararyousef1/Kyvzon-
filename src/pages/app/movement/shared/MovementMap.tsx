/**
 * MovementMap — الخريطة التفاعلية المشتركة لبوابة الحركة واللوجستيات.
 *
 * لماذا مكوّن واحد لا ثلاثة:
 *   التتبع الحي وإعادة تشغيل المسار وتخطيط المسار تحتاج كلها نفس
 *   الخريطة بعلامات ومسارات. تكرار إعداد Leaflet ثلاث مرات يعني ثلاث
 *   نسخ من إصلاح أيقونة العلامة، وثلاث فرص للتباعد.
 *
 * قرارات مقصودة:
 *   • بلاطات OpenStreetMap: مجانية بلا مفتاح API. الإسناد إلزامي بترخيصها.
 *   • أيقونة العلامة الافتراضية في Leaflet مكسورة مع الحزم (bundlers) لأن
 *     الـ CSS يشير إلى صور نسبية. الحل: divIcon بـ SVG مضمَّن — لا طلبات
 *     شبكة ولا أصول مفقودة.
 *   • الخريطة تحتاج ارتفاعاً صريحاً وإلا انهارت إلى صفر بكسل.
 *   • whenReady + invalidateSize: الخريطة داخل مودال أو تبويب مخفي
 *     تُحسَب أبعادها خطأً؛ هذه إعادة القياس تُصلحها.
 *
 * ⚠️ في معاينة الملفات داخل التطبيق لن تظهر البلاطات (لا شبكة في
 *    الـ iframe المعزول). في المتصفح الحقيقي تظهر كاملةً.
 */
import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  /** يُعرض داخل العلامة نفسها — رقم محطة أو تسلسل */
  badge?: string | number;
  /** عنوان النافذة المنبثقة */
  title?: string;
  /** سطر ثانوي في النافذة المنبثقة */
  subtitle?: string;
  /** لون العلامة — hex */
  color?: string;
}

export interface MovementMapProps {
  points: MapPoint[];
  /** رسم خط يصل النقاط بترتيبها */
  connect?: boolean;
  polylineColor?: string;
  height?: number;
  /** المركز عند غياب النقاط — بغداد افتراضاً */
  fallbackCenter?: [number, number];
  fallbackZoom?: number;
  className?: string;
}

const BAGHDAD: [number, number] = [33.3152, 44.3661];

/** علامة SVG مضمَّنة — لا تعتمد على أي أصل خارجي */
function buildIcon(color: string, badge?: string | number): L.DivIcon {
  const label =
    badge === undefined || badge === null || badge === ''
      ? ''
      : `<text x="12" y="15.5" text-anchor="middle" font-size="10"
             font-weight="700" fill="#ffffff"
             font-family="system-ui, sans-serif">${String(badge)}</text>`;

  return L.divIcon({
    className: 'kyvzon-map-pin',
    html: `<svg width="26" height="36" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z"
              fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="7.5" fill="rgba(0,0,0,0.22)"/>
        ${label}
      </svg>`,
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  });
}

/**
 * ضبط الإطار على كل النقاط + إعادة قياس بعد التركيب.
 * مكوّن داخلي لأن useMap لا يعمل إلا داخل MapContainer.
 */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const signature = points.map((p) => `${p.lat},${p.lng}`).join('|');

  useEffect(() => {
    // الخريطة داخل حاوية كانت مخفية تُحسب بأبعاد خاطئة
    const t = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 16 });
    // signature يجعل التأثير يعيد الحساب عند تغيّر الإحداثيات فعلياً
  }, [map, signature, points]);

  return null;
}

export function MovementMap({
  points,
  connect = false,
  polylineColor = '#4338ca',
  height = 420,
  fallbackCenter = BAGHDAD,
  fallbackZoom = 11,
  className = '',
}: MovementMapProps) {
  // نستبعد الإحداثيات غير الصالحة بدل رسم علامات في المحيط الأطلسي
  const valid = useMemo(
    () =>
      points.filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          Math.abs(p.lat) <= 90 &&
          Math.abs(p.lng) <= 180 &&
          !(p.lat === 0 && p.lng === 0),
      ),
    [points],
  );

  const line = useMemo(
    () => valid.map((p) => [p.lat, p.lng] as [number, number]),
    [valid],
  );

  return (
    <div
      className={`rounded-2xl overflow-hidden border border-slate-200 ${className}`}
      style={{ height }}
    >
      <MapContainer
        center={valid.length > 0 ? [valid[0].lat, valid[0].lng] : fallbackCenter}
        zoom={valid.length > 0 ? 13 : fallbackZoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />

        {connect && line.length > 1 && (
          <Polyline positions={line} pathOptions={{ color: polylineColor, weight: 4, opacity: 0.75 }} />
        )}

        {valid.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={buildIcon(p.color ?? '#4338ca', p.badge)}
          >
            {(p.title || p.subtitle) && (
              <Popup>
                <div dir="rtl" style={{ fontFamily: 'Tajawal, sans-serif', minWidth: 140 }}>
                  {p.title && <strong style={{ display: 'block' }}>{p.title}</strong>}
                  {p.subtitle && (
                    <span style={{ fontSize: 12, color: '#475569' }}>{p.subtitle}</span>
                  )}
                  <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </span>
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        <FitBounds points={valid} />
      </MapContainer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   منتقي الإحداثيات — نقرة على الخريطة تضبط الموقع.
   يُستعمل في نموذج إنشاء المواقع بدل الإدخال اليدوي للأرقام.
   ══════════════════════════════════════════════════════════════════ */

interface PickerProps {
  value: { lat: number | null; lng: number | null };
  onChange: (lat: number, lng: number) => void;
  /** نصف قطر السور الجغرافي بالمتر — يُرسم كدائرة حول النقطة */
  radiusMeters?: number;
  height?: number;
}

/** يلتقط النقر ويحرّك العلامة — منطق Leaflet خام لأن react-leaflet لا يغلّفه */
function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  const handlerRef = useRef(onPick);
  handlerRef.current = onPick;

  useEffect(() => {
    const fn = (e: L.LeafletMouseEvent) => {
      // 7 منازل عشرية = دقة ~1 سم، ويطابق numeric(10,7) في المخطط
      handlerRef.current(
        Number(e.latlng.lat.toFixed(7)),
        Number(e.latlng.lng.toFixed(7)),
      );
    };
    map.on('click', fn);
    const t = window.setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.off('click', fn);
      window.clearTimeout(t);
    };
  }, [map]);

  return null;
}

/** يرسم دائرة نصف القطر ويحدّثها دون إعادة إنشاء الخريطة */
function RadiusCircle({
  lat,
  lng,
  radius,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
}) {
  const map = useMap();
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (lat === null || lng === null || !Number.isFinite(radius) || radius <= 0) {
      if (circleRef.current) {
        circleRef.current.remove();
        circleRef.current = null;
      }
      return;
    }
    if (!circleRef.current) {
      circleRef.current = L.circle([lat, lng], {
        radius,
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(radius);
    }
  }, [map, lat, lng, radius]);

  useEffect(
    () => () => {
      circleRef.current?.remove();
      circleRef.current = null;
    },
    [],
  );

  return null;
}

export function CoordinatePicker({
  value,
  onChange,
  radiusMeters = 0,
  height = 320,
}: PickerProps) {
  const hasPoint = value.lat !== null && value.lng !== null;

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height }}>
      <MapContainer
        center={hasPoint ? [value.lat as number, value.lng as number] : BAGHDAD}
        zoom={hasPoint ? 15 : 11}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        {hasPoint && (
          <Marker
            position={[value.lat as number, value.lng as number]}
            icon={buildIcon('#059669')}
          />
        )}
        <RadiusCircle lat={value.lat} lng={value.lng} radius={radiusMeters} />
        <ClickCapture onPick={onChange} />
      </MapContainer>
    </div>
  );
}

export default MovementMap;
