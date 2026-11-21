import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Check,
  Clock,
  Navigation,
  Repeat,
  RotateCcw,
  Share2,
  Star,
} from 'lucide-react';
import { useState } from 'react';
import { translations, useLanguage } from '../i18n';
import type { StationDeparturePayload } from '../types/transit';
import type { DirectionsTarget } from '../utils/directionsHelper';
import { dayTypeLabel, formatCountdown } from '../utils/transitHelpers';

interface StationDepartureBoardProps {
  data: StationDeparturePayload | null;
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
  onOpenDirections,
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
      <div className="p-5 space-y-5 animate-pulse">
        <div className="h-4 w-28 bg-slate-200 rounded-full" />
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-200 rounded-xl" />
          <div className="h-4 w-40 bg-slate-100 rounded-lg" />
        </div>
        <div className="h-28 bg-slate-100 rounded-2xl" />
        <div className="h-28 bg-slate-100 rounded-2xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-5 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.backToStations}</span>
        </button>
        <div className="p-4 border border-red-200 bg-red-50 rounded-2xl space-y-3">
          <p className="text-sm font-medium text-red-900">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-xs active:scale-95 transition-all cursor-pointer"
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
    const shareText = `${station.stopId} ${station.displayName} (${station.category} ${station.routeLongName}) — KL Transit Live`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'KL Transit Live', text: shareText, url: url.toString() });
        return;
      } catch {
        // user cancelled or unavailable
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
    <div className="flex flex-col divide-y divide-slate-200/80">
      {/* Station Header */}
      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t.allStationsBack}</span>
          </button>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-600 font-mono font-medium tabular-nums">
            {isLiveTime
              ? scheduleMode === 'timetable'
                ? t.liveBadge(queryTimeMyt)
                : t.staticScheduleBadge(queryTimeMyt)
              : t.previewBadge(queryTimeMyt)}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <span
            className="shrink-0 mt-0.5 px-2.5 py-1 rounded-xl font-mono text-xs font-bold tracking-tight text-white tabular-nums shadow-xs"
            style={{ backgroundColor: station.routeColor }}
          >
            {station.stopId}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-slate-950 leading-tight truncate">
              {station.displayName}
            </h2>
            <p className="mt-1 text-xs text-slate-500 flex items-center flex-wrap gap-1.5">
              <span className="font-semibold text-slate-700">
                {station.category} {station.routeLongName}
              </span>
              <span aria-hidden="true">·</span>
              <span>{dayTypeLabel(dayType, lang)}</span>
            </p>
          </div>
        </div>

        {/* Material 3 Action Pills: Directions, Lock-Screen Live Track, Save, Share */}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          <button
            type="button"
            onClick={() =>
              onOpenDirections({
                name: station.displayName,
                subtitle: `${station.category} ${station.routeLongName}`,
                badge: station.stopId,
                color: station.routeColor,
                lat: station.lat,
                lon: station.lon,
                kind: 'rail',
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{t.directionsBtn}</span>
          </button>

          <button
            type="button"
            onClick={onToggleTrack}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold active:scale-95 transition-all cursor-pointer border ${
              isTracking
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'bg-emerald-50 border-emerald-200/80 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            {isTracking ? (
              <BellRing className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span>{isTracking ? t.liveTrackActive : t.liveTrackStart}</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleFavorite(station.stopId)}
            aria-pressed={isFavorite}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold active:scale-95 transition-all cursor-pointer border ${
              isFavorite
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'
              }`}
            />
            <span>{isFavorite ? t.savedStation : t.saveStation}</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            aria-label={t.shareBtn}
            title={t.shareBtn}
            className="w-8.5 h-8.5 inline-flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200/80 active:scale-95 text-slate-700 transition-all cursor-pointer ml-auto"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Interchange platform quick switcher */}
        {station.interchanges.length > 0 && (
          <div className="pt-1 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Repeat className="w-3.5 h-3.5 text-slate-400" />
              <span>{t.interchangePrompt}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {station.interchanges.map((ic) => (
                <button
                  key={ic.stopId}
                  type="button"
                  onClick={() => onSelectStation(ic.stopId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-full text-slate-800 shadow-2xs active:scale-95 transition-all cursor-pointer"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ic.routeColor }}
                  />
                  <span className="font-mono font-bold">{ic.stopId}</span>
                  <span>{ic.routeShortName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Time & Day Schedule Checker */}
      <div className="px-4 sm:px-5 py-3.5 bg-slate-50/70 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-600 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>{t.checkTimeLabel}</span>
          </span>
          <select
            aria-label={t.selectDayAria}
            value={customDay}
            onChange={(e) =>
              onCustomDayChange(e.target.value as 'auto' | 'weekday' | 'sat' | 'sun')
            }
            className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
          >
            <option value="auto">{t.dayAuto}</option>
            <option value="weekday">{t.dayWeekday}</option>
            <option value="sat">{t.daySat}</option>
            <option value="sun">{t.daySun}</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {presetTimes.map((preset) => {
            const active = customTime === preset.value;
            return (
              <button
                key={preset.value || 'now'}
                type="button"
                onClick={() => onCustomTimeChange(preset.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <label
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
              customTime && !presetTimes.some((p) => p.value === customTime)
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono tabular-nums">
              {customTime || t.customTimePickLabel}
            </span>
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

      {/* Direction Frequency & Schedule Boards */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-display text-sm font-bold text-slate-900">
            {scheduleMode === 'timetable' ? t.nextTrains : t.railFrequencyHeader}
          </h3>
          <div className="flex items-center gap-2">
            {loading && <span className="text-xs text-slate-400">{t.updating}</span>}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                scheduleMode === 'timetable'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {scheduleMode === 'timetable' ? t.scheduleModeTimetable : t.scheduleModeFrequency}
            </span>
          </div>
        </div>

        {directions.length === 0 ? (
          <div className="p-4 border border-slate-200 rounded-2xl text-sm text-slate-600">
            {t.noDeparturesData}
          </div>
        ) : (
          <div className="space-y-3">
            {directions.map((dir) => {
              const first = dir.upcoming[0];
              const isTimetable = scheduleMode === 'timetable';
              const estTrains = dir.upcoming.slice(0, 4);
              const rest = dir.upcoming.slice(1, 5);
              const isArrivingNow = first && !first.isTomorrow && first.minutesAway <= 1;

              return (
                <div
                  key={dir.tripId}
                  className="border border-slate-200/90 rounded-2xl bg-white p-4 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs text-slate-500">{t.towards}</p>
                      <p className="font-display text-base font-bold text-slate-950 truncate">
                        {dir.destinationName}
                      </p>
                      {dir.nextStopName && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <span>{t.nextStop}</span>
                          <span className="font-medium text-slate-700">{dir.nextStopName}</span>
                          {dir.nextStopMinutes !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {t.minsShort(dir.nextStopMinutes)}
                              </span>
                            </>
                          )}
                        </p>
                      )}
                    </div>

                    {isTimetable ? (
                      first && (
                        <div className="text-right shrink-0">
                          <div
                            className={`font-mono text-2xl font-bold tabular-nums leading-none ${
                              first.isTomorrow
                                ? 'text-amber-700'
                                : isArrivingNow
                                  ? 'text-emerald-700'
                                  : 'text-slate-950'
                            }`}
                          >
                            {formatCountdown(first.minutesAway, first.isTomorrow, lang)}
                          </div>
                          <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                            {first.isTomorrow
                              ? t.firstTrainAt(first.arrivalTime)
                              : t.atTime(first.arrivalTime)}
                          </div>
                        </div>
                      )
                    ) : first?.isTomorrow ? (
                      <div className="text-right shrink-0">
                        <div className="font-display text-sm font-bold text-amber-700 leading-tight">
                          {t.serviceEnded}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                          {t.firstTrainAt(dir.firstTrain)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-right shrink-0">
                        <div
                          className={`font-display text-lg font-extrabold tabular-nums leading-tight ${
                            dir.isPeakNow ? 'text-emerald-700' : 'text-blue-700'
                          }`}
                        >
                          {t.everyXMin(dir.currentHeadwayMinutes)}
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1">
                          {dir.isPeakNow ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
                              {t.peakHours}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">
                              {t.currentFrequencyLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {first?.isTomorrow && (
                    <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                      {t.afterHoursNotice(dir.lastTrain)}
                    </div>
                  )}

                  {isTimetable ? (
                    <>
                      {rest.length > 0 && (
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-500 shrink-0">{t.followingTrains}</span>
                          <div className="flex items-center gap-2 font-mono tabular-nums text-slate-800 overflow-x-auto no-scrollbar">
                            {rest.map((item, idx) => (
                              <span key={`${item.arrivalTime}-${idx}`} className="whitespace-nowrap">
                                {idx > 0 && (
                                  <span className="text-slate-300 mr-2" aria-hidden="true">
                                    ·
                                  </span>
                                )}
                                <span className="font-semibold">{item.arrivalTime}</span>
                                {!item.isTomorrow && (
                                  <span className="text-slate-400 ml-1">
                                    ({item.minutesAway}
                                    {t.minUnitShort})
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
                        <span>
                          {t.headwayEvery}{' '}
                          <strong className="font-mono text-slate-800 tabular-nums">
                            {dir.currentHeadwayMinutes} {t.minutesWord}
                          </strong>
                          {dir.isPeakNow ? ` · ${t.peakHours}` : ''}
                        </span>
                        <span className="font-mono tabular-nums">
                          {dir.firstTrain} – {dir.lastTrain}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Primary Operating Hours Bar: First Train & Last Train */}
                      <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-600">
                          {t.firstTrainShort}:{' '}
                          <strong className="font-mono text-slate-900 tabular-nums">
                            {dir.firstTrain}
                          </strong>
                        </span>
                        <span className="text-slate-300" aria-hidden="true">
                          |
                        </span>
                        <span className="text-slate-600">
                          {t.lastTrainShort}:{' '}
                          <strong className="font-mono text-slate-900 tabular-nums">
                            {dir.lastTrain}
                          </strong>
                        </span>
                      </div>

                      {/* Secondary Estimated Static GTFS Reference Times (~HH:MM) */}
                      {!first?.isTomorrow && estTrains.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-slate-400 shrink-0">{t.estStaticTimesLabel}</span>
                          <div className="flex items-center gap-1.5 font-mono tabular-nums text-slate-500 overflow-x-auto no-scrollbar">
                            {estTrains.map((item, idx) => (
                              <span key={`${item.arrivalTime}-${idx}`} className="whitespace-nowrap">
                                {idx > 0 && (
                                  <span className="text-slate-300 mr-1.5" aria-hidden="true">
                                    ·
                                  </span>
                                )}
                                <span>~{item.arrivalTime}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-[11px] leading-relaxed text-slate-500">
            {scheduleMode === 'timetable' ? t.dataNoticeTimetable : t.dataNoticeFrequency}
          </p>
          {syncedTimeFormatted && (
            <p className="text-[10px] font-mono text-slate-400 tabular-nums">
              {t.gtfsSyncedLabel(syncedTimeFormatted)}
            </p>
          )}
        </div>
      </div>

      {/* Ordered Stations on Current Line */}
      <div className="p-4 sm:p-5 space-y-3 pb-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-slate-900">
            {t.stationsOnLine(station.routeLongName)}
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {t.stationsCount(lineStations.length)}
          </span>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
          {lineStations.map((st) => (
            <button
              key={st.stopId}
              type="button"
              onClick={() => onSelectStation(st.stopId)}
              className={`w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                st.isCurrent
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border-2"
                  style={{
                    borderColor: st.isCurrent ? '#FFFFFF' : station.routeColor,
                    backgroundColor: st.isCurrent ? station.routeColor : '#FFFFFF',
                  }}
                />
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    st.isCurrent ? 'text-blue-100 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {st.stopId}
                </span>
                <span className="text-sm font-medium truncate">{st.displayName}</span>
              </div>
              {!st.isCurrent && <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
