import {
  ArrowLeft,
  ArrowRight,
  ArrowRightCircle,
  Bell,
  BellRing,
  Check,
  Clock,
  ExternalLink,
  Navigation,
  Repeat,
  RotateCcw,
  Share2,
  Star,
  TrainFront,
} from 'lucide-react';
import { useState } from 'react';
import { translations, useLanguage } from '../i18n';
import type { RailStation, StationDeparturePayload, UserLocation } from '../types/transit';
import {
  buildGoogleMapsDirectionsUrl,
  openExternalMapUrl,
  type DirectionsTarget,
} from '../utils/directionsHelper';
import { getRailLineNumber, getTransitPalette } from '../utils/transitTheme';
import { dayTypeLabel } from '../utils/transitHelpers';

interface StationDepartureBoardProps {
  data: StationDeparturePayload | null;
  allStations?: RailStation[];
  userLocation?: UserLocation | null;
  loading: boolean;
  error: string | null;
  customTime: string;
  customDay: 'auto' | 'weekday' | 'sat' | 'sun';
  isFavorite: boolean;
  isTracking: boolean;
  onCustomTimeChange: (time: string) => void;
  onCustomDayChange: (day: 'auto' | 'weekday' | 'sat' | 'sun') => void;
  onSelectStation: (stopId: string) => void;
  onToggleFavorite: (stopId: string) => void;
  onToggleTrack: () => void;
  onOpenDirections: (target: DirectionsTarget) => void;
  onBack: () => void;
  onRetry: () => void;
}

export function StationDepartureBoard({
  data,
  allStations = [],
  userLocation = null,
  loading,
  error,
  customTime,
  customDay,
  isFavorite,
  isTracking,
  onCustomTimeChange,
  onCustomDayChange,
  onSelectStation,
  onToggleFavorite,
  onToggleTrack,
  onOpenDirections: _onOpenDirections,
  onBack,
  onRetry,
}: StationDepartureBoardProps) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [copied, setCopied] = useState(false);

  const presetTimes = [
    { label: t.presetNow, value: '' },
    { label: '08:00', value: '08:00' },
    { label: '12:00', value: '12:00' },
    { label: '18:00', value: '18:00' },
    { label: '22:00', value: '22:00' },
  ];

  if (loading && !data) {
    return (
      <div className="p-5 space-y-4 animate-pulse bg-[#0b0f17] min-h-full">
        <div className="h-7 w-28 bg-white/10 rounded-full" />
        <div className="h-10 w-56 bg-white/10 rounded-2xl" />
        <div className="h-32 bg-white/8 rounded-3xl" />
        <div className="h-32 bg-white/8 rounded-3xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-5 space-y-4 bg-[#0b0f17] min-h-full">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold text-white bg-white/12 hover:bg-white/18 active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.backToStations}</span>
        </button>
        <div className="p-4 border border-red-500/30 bg-red-950/50 rounded-3xl space-y-3">
          <p className="text-sm font-bold text-red-100">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-extrabold bg-emerald-500 text-slate-950 rounded-full active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.retryLoad}</span>
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    station,
    directions,
    lineStations,
    queryTimeMyt,
    isLiveTime,
    dayType,
    scheduleMode,
    gtfsSyncedAt,
  } = data;

  const palette = getTransitPalette(station.routeColor, 'rail', station.routeId);
  const lineNum = getRailLineNumber(station.routeId, station.routeShortName);

  const syncedTimeFormatted = gtfsSyncedAt
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(gtfsSyncedAt))
    : null;

  const handleShare = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('station', station.stopId);
    url.searchParams.set('lang', lang);
    const shareText = `${station.stopId} ${station.displayName} (${station.category} ${station.routeLongName}) — KL Transit`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'KL Transit', text: shareText, url: url.toString() });
        return;
      } catch {
        // user cancelled
      }
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="flex flex-col min-h-full text-white pb-8"
      style={{ backgroundColor: palette.bandBg }}
    >
      {/* Top Bar + Transit Line Header + Big GO Button */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold text-white bg-black/25 hover:bg-black/40 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.allStationsBack}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleTrack}
              aria-label={isTracking ? t.liveTrackActive : t.liveTrackStart}
              title={isTracking ? t.liveTrackActive : t.liveTrackStart}
              className={`w-9 h-9 inline-flex items-center justify-center rounded-full active:scale-95 transition-all cursor-pointer ${
                isTracking ? 'bg-white text-slate-950' : 'bg-black/25 text-white hover:bg-black/40'
              }`}
            >
              {isTracking ? (
                <BellRing className="w-4 h-4 animate-pulse" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onToggleFavorite(station.stopId)}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? t.savedStation : t.saveStation}
              className={`w-9 h-9 inline-flex items-center justify-center rounded-full active:scale-95 transition-all cursor-pointer ${
                isFavorite
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-black/25 text-white hover:bg-black/40'
              }`}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-slate-950' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label={t.shareBtn}
              className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-black/25 text-white hover:bg-black/40 active:scale-95 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Share2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Transit App Iconic Badge Row (Circle Train + Line Number + Line Name + Big GO) */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-950 font-black shrink-0"
                style={{ backgroundColor: palette.accent }}
              >
                <TrainFront className="w-5 h-5 stroke-[2.5]" />
              </span>
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-slate-950 text-base font-black shrink-0"
                style={{ backgroundColor: palette.accent }}
              >
                {lineNum}
              </span>
              <span
                className="px-3 py-1 rounded-full text-slate-950 text-xs font-black tracking-tight"
                style={{ backgroundColor: palette.accent }}
              >
                {station.routeLongName.replace(/\s*Line$/i, '')}
              </span>
            </div>

            <h2 className="font-display text-3xl font-black text-white leading-tight tracking-tight truncate">
              {station.displayName}
            </h2>
            <p className="text-xs font-bold flex items-center gap-1.5 flex-wrap" style={{ color: palette.muted }}>
              <span className="font-mono">{station.stopId}</span>
              <span>·</span>
              <span>{dayTypeLabel(dayType, lang)}</span>
              <span>·</span>
              <span className="font-mono">{queryTimeMyt} MYT</span>
            </p>
          </div>

          {/* Iconic Transit Green GO Button: 1-tap straight to Google Maps (travelmode=transit) */}
          <button
            type="button"
            onClick={() => {
              const url = buildGoogleMapsDirectionsUrl(
                userLocation,
                {
                  name: station.displayName,
                  subtitle: `${station.category} ${station.routeLongName}`,
                  badge: station.stopId,
                  color: station.routeColor,
                  lat: station.lat,
                  lon: station.lon,
                  kind: 'rail',
                },
                'transit'
              );
              openExternalMapUrl(url);
            }}
            title={t.checkOnGoogleMaps}
            className="shrink-0 mt-1 px-5 py-3 rounded-2xl bg-[#16a34a] hover:bg-[#15803d] text-white font-black text-lg italic tracking-tight shadow-lg shadow-black/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Navigation className="w-4 h-4 not-italic" />
            <span>GO</span>
          </button>
        </div>

        {/* Interchange platform quick switcher */}
        {station.interchanges.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <Repeat className="w-3.5 h-3.5 text-white/60 shrink-0" />
            {station.interchanges.map((ic) => (
              <button
                key={ic.stopId}
                type="button"
                onClick={() => onSelectStation(ic.stopId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-black/25 hover:bg-black/40 rounded-full text-white active:scale-95 transition-all cursor-pointer"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: ic.routeColor }}
                />
                <span>{ic.routeShortName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Direction Frequency / Schedule Big Transit Cards */}
      <div className="px-4 sm:px-5 space-y-3">
        {directions.length === 0 ? (
          <div
            className="p-5 rounded-3xl text-sm font-bold text-white/80"
            style={{ backgroundColor: palette.surfaceBg }}
          >
            {t.noDeparturesData}
          </div>
        ) : (
          directions.map((dir) => {
            const first = dir.upcoming[0];
            const estTrains = dir.upcoming.slice(0, 3);

            return (
              <div
                key={dir.tripId}
                className="rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-md"
                style={{ backgroundColor: palette.surfaceBg }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <ArrowRightCircle
                        className="w-4.5 h-4.5 shrink-0"
                        style={{ color: palette.accent }}
                      />
                      <span className="font-display text-xl font-black text-white leading-tight truncate">
                        {dir.destinationName}
                      </span>
                    </div>
                    {dir.nextStopName && (
                      <p className="text-xs font-semibold truncate" style={{ color: palette.muted }}>
                        {t.nextStop} {dir.nextStopName}
                        {dir.nextStopMinutes !== null ? ` · ~${dir.nextStopMinutes}m` : ''}
                      </p>
                    )}
                  </div>

                  {/* Frequency Pill (Secondary) */}
                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-black/25 text-[11px] font-extrabold text-white/85">
                    {dir.isPeakNow
                      ? `${dir.currentHeadwayMinutes}m · ${t.peakHours}`
                      : t.everyXMin(dir.currentHeadwayMinutes)}
                  </span>
                </div>

                {/* Transit-App Style Horizontal Estimated Arrival Countdown Cards (5m · 15m · 25m + SCHEDULED badge!) */}
                {first?.isTomorrow ? (
                  <div className="px-3.5 py-3 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-amber-300">{t.serviceEnded}</span>
                    <span className="text-xs font-bold text-amber-100 font-mono">
                      {t.firstTrainAt(dir.firstTrain)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
                    {estTrains.map((item, idx) => (
                      <div
                        key={`${item.arrivalTime}-${idx}`}
                        className="min-w-[96px] flex-1 rounded-2xl p-3 text-center flex flex-col items-center justify-center shadow-sm"
                        style={{
                          backgroundColor: idx === 0 ? palette.vivid : 'rgba(0,0,0,0.24)',
                        }}
                      >
                        <div className="font-display text-3xl font-black text-white leading-none tabular-nums">
                          {item.minutesAway <= 0 ? '<1' : item.minutesAway}
                        </div>
                        <div className="text-[11px] font-bold text-white/90 mt-0.5">
                          {t.minutesWord} · ~{item.arrivalTime}
                        </div>
                        <span className="mt-1.5 px-2 py-0.5 rounded-md bg-white/90 text-slate-950 text-[9px] font-black tracking-wide uppercase">
                          {scheduleMode === 'timetable'
                            ? lang === 'en'
                              ? 'TIMETABLE'
                              : 'LỊCH TRÌNH'
                            : lang === 'en'
                              ? 'SCHEDULED'
                              : 'DỰ KIẾN'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Clean First - Last Train Strip + 1-Tap Google Maps Transit check for THIS direction */}
                <div className="px-3.5 py-2 rounded-2xl bg-black/22 flex items-center justify-between gap-2 text-xs font-bold flex-wrap">
                  <span style={{ color: palette.muted }}>
                    <strong className="text-white font-mono">
                      {dir.firstTrain} – {dir.lastTrain}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSt = dir.nextStopName
                        ? allStations.find(
                            (s) =>
                              s.routeId === station.routeId &&
                              s.displayName.toLowerCase() === dir.nextStopName!.toLowerCase()
                          )
                        : null;
                      const destLat = nextSt ? nextSt.lat : station.lat;
                      const destLon = nextSt ? nextSt.lon : station.lon;
                      const fromOrigin: UserLocation | null = nextSt
                        ? {
                            lat: station.lat,
                            lon: station.lon,
                            accuracyMeters: 10,
                            timestamp: Date.now(),
                          }
                        : userLocation;
                      const url = buildGoogleMapsDirectionsUrl(
                        fromOrigin,
                        {
                          name: nextSt ? nextSt.displayName : station.displayName,
                          lat: destLat,
                          lon: destLon,
                          kind: 'rail',
                        },
                        'transit'
                      );
                      openExternalMapUrl(url);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/12 hover:bg-white/22 text-white text-[11px] font-extrabold active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{t.checkOnGoogleMaps}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Compact Time & Day Simulator Pills */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold inline-flex items-center gap-1.5" style={{ color: palette.muted }}>
              <Clock className="w-3.5 h-3.5" />
              <span>{isLiveTime ? t.checkTimeLabel : t.previewBadge(queryTimeMyt)}</span>
            </span>
            <select
              aria-label={t.selectDayAria}
              value={customDay}
              onChange={(e) =>
                onCustomDayChange(e.target.value as 'auto' | 'weekday' | 'sat' | 'sun')
              }
              className="text-xs font-extrabold text-white bg-black/30 border border-white/15 rounded-xl px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              <option value="auto" className="bg-slate-900">
                {t.dayAuto}
              </option>
              <option value="weekday" className="bg-slate-900">
                {t.dayWeekday}
              </option>
              <option value="sat" className="bg-slate-900">
                {t.daySat}
              </option>
              <option value="sun" className="bg-slate-900">
                {t.daySun}
              </option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {presetTimes.map((preset) => {
              const active = customTime === preset.value;
              return (
                <button
                  key={preset.value || 'now'}
                  type="button"
                  onClick={() => onCustomTimeChange(preset.value)}
                  className={`px-3 py-1.5 text-xs font-extrabold rounded-full transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                    active ? 'text-slate-950 shadow-xs' : 'bg-black/25 text-white/80 hover:bg-black/40'
                  }`}
                  style={active ? { backgroundColor: palette.accent } : undefined}
                >
                  {preset.label}
                </button>
              );
            })}
            <label className="relative inline-flex items-center gap-1 px-3 py-1.5 text-xs font-extrabold rounded-full bg-black/25 text-white/85 cursor-pointer whitespace-nowrap shrink-0">
              <Clock className="w-3 h-3" />
              <span>{customTime || t.customTimePickLabel}</span>
              <input
                type="time"
                aria-label={t.customTimeAria}
                value={customTime}
                onChange={(e) => onCustomTimeChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Honest compact footnote */}
        <p className="text-[11px] leading-relaxed opacity-70 pt-1" style={{ color: palette.muted }}>
          {scheduleMode === 'timetable' ? t.dataNoticeTimetable : t.dataNoticeFrequency}
          {syncedTimeFormatted ? ` · ${t.gtfsSyncedLabel(syncedTimeFormatted)}` : ''}
        </p>
      </div>

      {/* Clean Vertical Timeline of Stations on Current Line */}
      <div className="px-4 sm:px-5 pt-5 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-display text-sm font-black text-white">
            {t.stationsOnLine(station.routeLongName)}
          </h3>
          <span className="text-xs font-bold" style={{ color: palette.muted }}>
            {t.stationsCount(lineStations.length)}
          </span>
        </div>

        <div
          className="rounded-3xl overflow-hidden divide-y divide-white/8"
          style={{ backgroundColor: palette.surfaceBg }}
        >
          {lineStations.map((st) => (
            <button
              key={st.stopId}
              type="button"
              onClick={() => onSelectStation(st.stopId)}
              className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                st.isCurrent ? 'text-slate-950 font-black' : 'hover:bg-white/6 text-white'
              }`}
              style={st.isCurrent ? { backgroundColor: palette.accent } : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 border-2"
                  style={{
                    borderColor: st.isCurrent ? '#0f172a' : palette.accent,
                    backgroundColor: st.isCurrent ? '#ffffff' : 'transparent',
                  }}
                />
                <span className="text-sm font-extrabold truncate">{st.displayName}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={`font-mono text-[11px] font-bold ${
                    st.isCurrent ? 'text-slate-900' : 'text-white/55'
                  }`}
                >
                  {st.stopId}
                </span>
                {!st.isCurrent && <ArrowRight className="w-3.5 h-3.5 text-white/35" />}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
