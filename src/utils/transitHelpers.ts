import type { Language } from '../i18n';

export function getClientMalaysiaClock(): {
  time: string;
  hhmm: string;
  date: string;
  dayLabelVi: string;
  dayLabelEn: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const weekdayMapVi: Record<string, string> = {
    Mon: 'Thứ 2',
    Tue: 'Thứ 3',
    Wed: 'Thứ 4',
    Thu: 'Thứ 5',
    Fri: 'Thứ 6',
    Sat: 'Thứ 7',
    Sun: 'Chủ nhật',
  };
  const weekdayMapEn: Record<string, string> = {
    Mon: 'Mon',
    Tue: 'Tue',
    Wed: 'Wed',
    Thu: 'Thu',
    Fri: 'Fri',
    Sat: 'Sat',
    Sun: 'Sun',
  };

  const hh = String(Number.parseInt(get('hour'), 10) % 24).padStart(2, '0');
  const mm = get('minute');
  const ss = get('second');
  const wd = get('weekday');

  return {
    time: `${hh}:${mm}:${ss}`,
    hhmm: `${hh}:${mm}`,
    date: `${get('day')}/${get('month')}`,
    dayLabelVi: weekdayMapVi[wd] || wd,
    dayLabelEn: weekdayMapEn[wd] || wd,
  };
}

export function normalizeSearch(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function bearingToCompass(deg: number, lang: Language = 'vi'): string {
  const dirs =
    lang === 'en'
      ? ['North', 'NE', 'East', 'SE', 'South', 'SW', 'West', 'NW']
      : ['Bắc', 'Đông Bắc', 'Đông', 'Đông Nam', 'Nam', 'Tây Nam', 'Tây', 'Tây Bắc'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return `${dirs[idx]} (${Math.round(deg)}°)`;
}

export function formatCountdown(
  minutesAway: number,
  isTomorrow: boolean,
  lang: Language = 'vi'
): string {
  if (lang === 'en') {
    if (isTomorrow) return 'Tomorrow';
    if (minutesAway <= 0) return 'Arriving';
    if (minutesAway === 1) return '1 min';
    if (minutesAway < 60) return `${minutesAway} min`;
    const h = Math.floor(minutesAway / 60);
    const m = minutesAway % 60;
    return m > 0 ? `${h}h ${m}m` : `${h} hr`;
  }
  if (isTomorrow) return 'Ngày mai';
  if (minutesAway <= 0) return 'Đang vào ga';
  if (minutesAway === 1) return '1 phút';
  if (minutesAway < 60) return `${minutesAway} phút`;
  const h = Math.floor(minutesAway / 60);
  const m = minutesAway % 60;
  return m > 0 ? `${h}g ${m}p` : `${h} giờ`;
}

export function dayTypeLabel(dayType: 'MonFri' | 'Sat' | 'Sun', lang: Language = 'vi'): string {
  if (lang === 'en') {
    if (dayType === 'Sat') return 'Saturday Schedule';
    if (dayType === 'Sun') return 'Sunday Schedule';
    return 'Weekday Schedule';
  }
  if (dayType === 'Sat') return 'Lịch Thứ 7';
  if (dayType === 'Sun') return 'Lịch Chủ nhật';
  return 'Lịch Thứ 2 – Thứ 6';
}

export const POPULAR_KL_HUBS = [
  { stopId: 'KJ10', label: 'KLCC', sub: 'LRT Kelana Jaya' },
  { stopId: 'KJ15', label: 'KL Sentral', sub: 'LRT · Monorail · KLIA' },
  { stopId: 'KG18A', label: 'Bukit Bintang', sub: 'MRT Kajang' },
  { stopId: 'KG16', label: 'Pasar Seni', sub: 'MRT · LRT' },
  { stopId: 'KG20', label: 'Tun Razak Exchange', sub: 'MRT Kajang · Putrajaya' },
  { stopId: 'KJ13', label: 'Masjid Jamek', sub: 'LRT Kelana Jaya · Ampang' },
];

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
