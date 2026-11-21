import {
  ArrowLeft,
  ArrowRightCircle,
  ArrowUpDown,
  Bike,
  Bus,
  ChevronDown,
  ExternalLink,
  Footprints,
  MapPin,
  Navigation,
  RefreshCw,
  TrainFront,
  Wifi,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n';
import type { KlPlaceResult } from '../services/placeSearch';
import type { LiveBusVehicle, RailLine, RailStation } from '../types/transit';
import {
  buildGoogleMapsDirectionsUrl,
  openExternalMapUrl,
  type TravelMode,
} from '../utils/directionsHelper';
import {
  planMultimodalJourney,
  type MultimodalJourneyOption,
  type MultimodalPlanResult,
} from '../utils/multimodalRouter';
import { getRailLineNumber, getTransitPalette } from '../utils/transitTheme';

interface JourneyPlannerViewProps {
  origin: KlPlaceResult;
  destination: KlPlaceResult;
  railStations: RailStation[];
  railLines: RailLine[];
  liveVehicles: LiveBusVehicle[];
  onSwap: () => void;
  onChangeOrigin: () => void;
  onChangeDestination: () => void;
  onTrackLiveBus?: (busId: string) => void;
  onOpenStation?: (stopId: string) => void;
  onBack: () => void;
}

function formatClockPlusMinutes(addMin: number): string {
  const d = new Date(Date.now() + Math.max(0, addMin) * 60_000);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function JourneyPlannerView({
  origin,
  destination,
  railStations,
  railLines,
  liveVehicles,
  onSwap,
  onChangeOrigin,
  onChangeDestination,
  onTrackLiveBus,
  onOpenStation,
  onBack,
}: JourneyPlannerViewProps) {
  const { lang } = useLanguage();
  const [result, setResult] = useState<MultimodalPlanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<MultimodalJourneyOption | null>(null);
  const [expandedLegs, setExpandedLegs] = useState<Record<number, boolean>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelectedOption(null);
    planMultimodalJourney({
      origin,
      destination,
      railStations,
      railLines,
      liveVehicles,
    })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origin.lat, origin.lon, destination.lat, destination.lon, railStations.length, refreshTick]);

  const openGoogleMaps = (mode: TravelMode) => {
    const url = buildGoogleMapsDirectionsUrl(
      { lat: origin.lat, lon: origin.lon, accuracyMeters: 15, timestamp: Date.now() },
      { name: destination.name, lat: destination.lat, lon: destination.lon, kind: 'rail' },
      mode
    );
    openExternalMapUrl(url);
  };

  // ---------- SELECTED JOURNEY DETAIL (Transit App 00:19–00:45 & 01:13–01:30!) ----------
  if (selectedOption) {
    const pal = getTransitPalette(
      selectedOption.primaryColor,
      selectedOption.primaryKind,
      selectedOption.primaryRouteId
    );
    const leaveTimeStr = formatClockPlusMinutes(selectedOption.leaveInMinutes);
    const arriveTimeStr = formatClockPlusMinutes(
      selectedOption.leaveInMinutes + selectedOption.totalMinutes
    );

    let runningMin = selectedOption.leaveInMinutes;

    return (
      <div
        className="fixed inset-0 z-[1060] flex flex-col text-white safe-area-shell overflow-hidden"
        style={{ backgroundColor: pal.bandBg }}
      >
        {/* Top Navigation Row + Iconic Floating GO Button */}
        <div className="px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedOption(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black/25 hover:bg-black/40 text-xs font-extrabold text-white active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{lang === 'en' ? 'All routes' : 'Các lộ trình'}</span>
          </button>

          <button
            type="button"
            onClick={() => openGoogleMaps('transit')}
            className="px-5 py-2.5 rounded-2xl text-white font-black text-lg italic tracking-tight shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            style={{ backgroundColor: pal.vivid }}
          >
            <Navigation className="w-4 h-4 not-italic" />
            <span>GO</span>
          </button>
        </div>

        {/* Scrollable Transit-Style Journey Breakdown */}
        <div className="flex-1 overflow-y-auto transit-scroll px-4 pb-8 space-y-4">
          {/* Leave / Arrive Hero Summary Card */}
          <div
            className="rounded-3xl p-4 sm:p-5 space-y-3 shadow-md"
            style={{ backgroundColor: pal.surfaceBg }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-2xl font-black text-white leading-tight">
                  {lang === 'en' ? `Leave at ${leaveTimeStr}` : `Đi lúc ${leaveTimeStr}`}
                </div>
                <div className="text-sm font-bold mt-0.5" style={{ color: pal.muted }}>
                  {lang === 'en' ? `Arrive at ${arriveTimeStr}` : `Đến lúc ${arriveTimeStr}`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-xl font-black text-white tabular-nums">
                  {selectedOption.totalMinutes} {lang === 'en' ? 'min' : 'phút'}
                </div>
                <div className="text-xs font-extrabold text-emerald-300 font-mono">
                  RM {selectedOption.fareMyr.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Segmented Mode Progress Bar (just like Transit App!) */}
            <div className="flex items-center gap-1.5 pt-1">
              {selectedOption.legs.map((leg, i) => {
                if (leg.kind === 'walk') {
                  return (
                    <div
                      key={i}
                      className="h-2 rounded-full border-b-4 border-dotted border-white/45"
                      style={{ flex: Math.max(1, leg.minutes) }}
                    />
                  );
                }
                const legColor = leg.kind === 'rail' ? leg.routeColor : leg.color;
                return (
                  <div
                    key={i}
                    className="h-2.5 rounded-full"
                    style={{
                      flex: Math.max(2, leg.rideMinutes),
                      backgroundColor: legColor,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Step-by-Step Legs */}
          {selectedOption.legs.map((leg, idx) => {
            if (leg.kind === 'walk') {
              runningMin += leg.minutes;
              return (
                <div key={idx} className="pl-3 flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                  </div>
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-black/25 text-xs font-extrabold text-white">
                    <Footprints className="w-4 h-4 text-white/85" />
                    <span>
                      {leg.minutes <= 1
                        ? lang === 'en'
                          ? 'A few steps'
                          : 'Đi bộ vài bước'
                        : lang === 'en'
                          ? `Walk ${leg.minutes} min (${leg.distanceMeters}m)`
                          : `Đi bộ ${leg.minutes} phút (${leg.distanceMeters}m)`}
                    </span>
                  </div>
                </div>
              );
            }

            if (leg.kind === 'rail') {
              const legPal = getTransitPalette(leg.routeColor, 'rail', leg.routeId);
              const lineNum = getRailLineNumber(leg.routeId, leg.routeShortName);
              const boardTime = formatClockPlusMinutes(runningMin);
              runningMin += leg.rideMinutes;
              const alightTime = formatClockPlusMinutes(runningMin);
              const isExpanded = !!expandedLegs[idx];

              return (
                <div key={idx} className="space-y-2.5">
                  {/* Horizontal Upcoming Departure Cards (SCHEDULED!) */}
                  <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {leg.upcomingWaits.map((w, wi) => (
                      <div
                        key={wi}
                        className="min-w-[104px] flex-1 max-w-[132px] rounded-3xl p-3 text-center flex flex-col items-center justify-center shadow-md"
                        style={{
                          backgroundColor: wi === 0 ? legPal.vivid : legPal.surfaceBg,
                        }}
                      >
                        <span className="font-display text-4xl font-black text-white leading-none tabular-nums">
                          {w.minutesAway}
                        </span>
                        <span className="text-[11px] font-bold text-white/90 mt-0.5">
                          {lang === 'en' ? 'minutes' : 'phút'}
                        </span>
                        <span className="mt-1.5 px-2 py-0.5 rounded-md bg-white/90 text-slate-950 text-[9px] font-black tracking-wide uppercase">
                          {lang === 'en' ? 'SCHEDULED' : 'DỰ KIẾN'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Rail Leg Stop Card */}
                  <div
                    className="rounded-3xl p-4 space-y-3 shadow-md"
                    style={{ backgroundColor: legPal.surfaceBg }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-950 shrink-0"
                          style={{ backgroundColor: legPal.accent }}
                        >
                          <TrainFront className="w-4.5 h-4.5 stroke-[2.5]" />
                        </span>
                        <span
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-950 text-sm font-black shrink-0"
                          style={{ backgroundColor: legPal.accent }}
                        >
                          {lineNum}
                        </span>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-slate-950 text-xs font-black truncate"
                          style={{ backgroundColor: legPal.accent }}
                        >
                          {leg.routeLongName.replace(/\s*Line$/i, '')}
                        </span>
                      </div>
                      {onOpenStation && (
                        <button
                          type="button"
                          onClick={() => {
                            onBack();
                            onOpenStation(leg.boardStation.stopId);
                          }}
                          className="text-[11px] font-extrabold text-white/80 underline cursor-pointer shrink-0"
                        >
                          {leg.boardStation.stopId}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-base font-black text-white">
                      <ArrowRightCircle className="w-4 h-4 shrink-0" style={{ color: legPal.accent }} />
                      <span className="truncate">{leg.directionName}</span>
                    </div>

                    {/* Vertical Track */}
                    <div className="relative pl-6 space-y-2.5">
                      <div className="absolute left-1.5 top-2 bottom-2 w-2 rounded-full bg-white/25" />

                      <div className="relative flex items-center justify-between gap-2">
                        <span className="absolute -left-[20px] w-3 h-3 rounded-full bg-white" />
                        <span className="text-sm font-black text-white truncate">
                          {leg.boardStation.displayName}
                        </span>
                        <span className="text-xs font-bold text-white/80 shrink-0">{boardTime}</span>
                      </div>

                      {leg.intermediateStations.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedLegs((prev) => ({ ...prev, [idx]: !prev[idx] }))
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-white/75 hover:text-white cursor-pointer"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                          <span>
                            {lang === 'en'
                              ? `${leg.stopCount} stops (${leg.rideMinutes} min)`
                              : `${leg.stopCount} trạm (${leg.rideMinutes} phút)`}
                          </span>
                        </button>
                      )}

                      {isExpanded &&
                        leg.intermediateStations.map((stName, si) => (
                          <div key={si} className="relative text-xs font-bold text-white/70">
                            <span className="absolute -left-[18px] top-1.5 w-2 h-2 rounded-full bg-white/50" />
                            <span>{stName}</span>
                          </div>
                        ))}

                      <div className="relative flex items-center justify-between gap-2">
                        <span className="absolute -left-[20px] w-3 h-3 rounded-full bg-white" />
                        <span className="text-sm font-black text-white truncate">
                          {leg.alightStation.displayName}
                        </span>
                        <span className="text-xs font-bold text-white/80 shrink-0">{alightTime}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Bus leg (Live GPS or Scheduled!)
            const busPal = getTransitPalette(
              leg.color,
              leg.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
            );
            const boardTime = formatClockPlusMinutes(runningMin);
            runningMin += leg.rideMinutes;
            const alightTime = formatClockPlusMinutes(runningMin);

            return (
              <div key={idx} className="space-y-2.5">
                {/* Horizontal Live Bus ETA Cards */}
                <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  {leg.upcomingWaits.map((w, wi) => (
                    <button
                      key={wi}
                      type="button"
                      onClick={() => {
                        if (w.busId && onTrackLiveBus) {
                          onBack();
                          onTrackLiveBus(w.busId);
                        }
                      }}
                      className="min-w-[104px] flex-1 max-w-[132px] rounded-3xl p-3 text-center flex flex-col items-center justify-center shadow-md cursor-pointer"
                      style={{
                        backgroundColor: wi === 0 ? busPal.vivid : busPal.surfaceBg,
                      }}
                    >
                      <span className="px-2 py-0.5 rounded-md bg-white text-[11px] font-black" style={{ color: busPal.vivid }}>
                        {leg.routeShortName}
                      </span>
                      <div className="mt-1.5 flex items-start justify-center gap-0.5">
                        <span className="font-display text-4xl font-black text-white leading-none tabular-nums">
                          {w.minutesAway}
                        </span>
                        {w.isLive && <Wifi className="w-3.5 h-3.5 text-white rotate-45 -mt-0.5" />}
                      </div>
                      <span className="text-[11px] font-bold text-white/90 mt-0.5">
                        {lang === 'en' ? 'minutes' : 'phút'}
                      </span>
                      {!w.isLive && (
                        <span className="mt-1 px-2 py-0.5 rounded-md bg-white/90 text-slate-950 text-[9px] font-black uppercase">
                          {lang === 'en' ? 'SCHEDULED' : 'DỰ KIẾN'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Bus Leg Stop Card */}
                <div
                  className="rounded-3xl p-4 space-y-3 shadow-md"
                  style={{ backgroundColor: busPal.surfaceBg }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bus className="w-5 h-5 shrink-0" style={{ color: busPal.accent }} />
                      <span className="font-display text-3xl font-black text-white leading-none">
                        {leg.routeShortName}
                      </span>
                    </div>
                    {leg.liveBusId && onTrackLiveBus && (
                      <button
                        type="button"
                        onClick={() => {
                          onBack();
                          onTrackLiveBus(leg.liveBusId!);
                        }}
                        className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs font-extrabold text-white cursor-pointer"
                      >
                        {lang === 'en' ? 'Track GPS' : 'Xem GPS'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-sm font-black text-white">
                    <ArrowRightCircle className="w-4 h-4 shrink-0" style={{ color: busPal.accent }} />
                    <span className="truncate">{leg.headsign || leg.routeLongName}</span>
                  </div>

                  <div className="relative pl-6 space-y-2.5">
                    <div className="absolute left-1.5 top-2 bottom-2 w-2 rounded-full bg-white/25" />
                    <div className="relative flex items-center justify-between gap-2">
                      <span className="absolute -left-[20px] w-3 h-3 rounded-full bg-white" />
                      <span className="text-sm font-black text-white truncate">
                        {leg.boardStopName}
                      </span>
                      <span className="text-xs font-bold text-white/80 shrink-0">{boardTime}</span>
                    </div>
                    <div className="text-xs font-bold text-white/70">
                      {lang === 'en'
                        ? `${leg.stopCount} stops · ~${leg.rideMinutes} min`
                        : `${leg.stopCount} trạm · ~${leg.rideMinutes} phút`}
                    </div>
                    <div className="relative flex items-center justify-between gap-2">
                      <span className="absolute -left-[20px] w-3 h-3 rounded-full bg-white" />
                      <span className="text-sm font-black text-white truncate">
                        {leg.alightStopName}
                      </span>
                      <span className="text-xs font-bold text-white/80 shrink-0">{alightTime}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Destination Pin Footer Card */}
          <div className="rounded-3xl p-4 bg-[#141a26] border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MapPin className="w-5 h-5 text-white shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-black text-white truncate">{destination.name}</div>
                <div className="text-xs text-slate-400 truncate">{destination.subtitle}</div>
              </div>
            </div>
            <span className="text-xs font-extrabold text-slate-300 shrink-0">{arriveTimeStr}</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------- ROUTE OPTIONS OVERVIEW LIST (Transit App 00:13–00:18 & 01:04–01:12!) ----------
  return (
    <div className="fixed inset-0 z-[1060] flex flex-col bg-[#0b0f17] text-white safe-area-shell overflow-hidden">
      {/* Green Transit From -> To Header */}
      <div className="bg-[#166534] px-3 pt-3 pb-3.5 shadow-lg space-y-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/15 active:scale-95 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 space-y-1.5">
            <button
              type="button"
              onClick={onChangeOrigin}
              className="w-full px-3.5 py-2 rounded-xl bg-black/22 hover:bg-black/32 text-left text-sm font-extrabold text-white truncate cursor-pointer flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 shrink-0" />
              <span className="truncate">{origin.name}</span>
            </button>
            <button
              type="button"
              onClick={onChangeDestination}
              className="w-full px-3.5 py-2 rounded-xl bg-black/22 hover:bg-black/32 text-left text-sm font-extrabold text-white truncate cursor-pointer flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white shrink-0" />
              <span className="truncate">{destination.name}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onSwap}
            aria-label="Swap"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/15 active:scale-95 cursor-pointer shrink-0"
          >
            <ArrowUpDown className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pl-11 pr-1">
          <span className="px-3 py-1 rounded-full bg-black/25 text-xs font-extrabold text-emerald-50">
            {lang === 'en' ? 'Leave now' : 'Đi ngay bây giờ'}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRefreshTick((x) => x + 1)}
              className="w-8 h-8 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => openGoogleMaps('transit')}
              className="px-3 py-1.5 rounded-full bg-white text-slate-950 text-xs font-black inline-flex items-center gap-1 active:scale-95 cursor-pointer"
            >
              <span>Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Options Body */}
      <div className="flex-1 overflow-y-auto transit-scroll p-3.5 space-y-3">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-3xl bg-white/8" />
            ))}
          </div>
        ) : (
          <>
            {result?.options.length ? (
              <div className="space-y-2.5">
                {result.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedOption(opt)}
                    className="w-full p-4 rounded-3xl bg-[#131926] hover:bg-[#1a2234] border border-white/10 active:scale-[0.99] text-left space-y-2.5 transition-all cursor-pointer shadow-sm"
                  >
                    {/* Visual Transit Timeline Pills (Identical to Transit App 01:04!) */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {opt.legs.map((leg, i) => {
                        if (leg.kind === 'walk') {
                          return (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400"
                            >
                              {i > 0 && <span className="opacity-40">→</span>}
                              <Footprints className="w-3.5 h-3.5" />
                              <span>{leg.minutes}m</span>
                            </span>
                          );
                        }
                        if (leg.kind === 'rail') {
                          return (
                            <span key={i} className="inline-flex items-center gap-1">
                              {i > 0 && <span className="text-xs text-slate-500">→</span>}
                              <span
                                className="px-2.5 py-1 rounded-xl text-xs font-black text-white shadow-xs"
                                style={{ backgroundColor: leg.routeColor }}
                              >
                                {leg.routeShortName}
                              </span>
                            </span>
                          );
                        }
                        return (
                          <span key={i} className="inline-flex items-center gap-1">
                            {i > 0 && <span className="text-xs text-slate-500">→</span>}
                            <span
                              className="px-2.5 py-1 rounded-xl text-xs font-black text-white shadow-xs"
                              style={{
                                backgroundColor:
                                  leg.category === 'rapid-bus-mrtfeeder' ? '#ef4436' : '#2563eb',
                              }}
                            >
                              {leg.routeShortName}
                            </span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Timing + Live Signal + Fare Summary */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-extrabold">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            opt.hasLiveBus ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        >
                          <span>
                            {opt.leaveInMinutes <= 1
                              ? lang === 'en'
                                ? 'Go now'
                                : 'Đi ngay'
                              : lang === 'en'
                                ? `Go in ${opt.leaveInMinutes} min`
                                : `Khởi hành sau ${opt.leaveInMinutes}p`}
                          </span>
                          {opt.hasLiveBus && <Wifi className="w-3.5 h-3.5 rotate-45" />}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono text-emerald-300">
                          RM {opt.fareMyr.toFixed(2)}
                        </span>
                      </div>

                      <div className="font-display text-lg font-black text-white tabular-nums shrink-0">
                        {opt.totalMinutes} {lang === 'en' ? 'min' : 'phút'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-3xl bg-[#131926] border border-white/10 space-y-3 text-center">
                <p className="text-sm font-bold text-slate-300">
                  {lang === 'en'
                    ? 'No direct Rapid KL rail/bus option found nearby. Open Google Maps for full transit routing.'
                    : 'Không tìm thấy tuyến tàu/bus Rapid KL gần trực tiếp. Mở Google Maps để xem lộ trình kết hợp đầy đủ.'}
                </p>
                <button
                  type="button"
                  onClick={() => openGoogleMaps('transit')}
                  className="px-4 py-2.5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{lang === 'en' ? 'Open Google Maps Transit' : 'Mở Google Maps Công cộng'}</span>
                </button>
              </div>
            )}

            {/* OTHER OPTIONS: Walk & Bike (Exact Transit App 00:13 Layout!) */}
            {result && (
              <div className="pt-3 space-y-2">
                <div className="px-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {lang === 'en' ? 'Other options' : 'Lựa chọn khác'}
                </div>

                <button
                  type="button"
                  onClick={() => openGoogleMaps('walking')}
                  className="w-full px-4 py-3.5 rounded-2xl bg-[#131926] hover:bg-[#1a2234] flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Footprints className="w-5 h-5 text-slate-300" />
                    <div className="text-left">
                      <div className="text-sm font-black text-white">
                        {lang === 'en' ? 'Walk' : 'Đi bộ'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {result.directWalkMeters < 1000
                          ? `${result.directWalkMeters}m`
                          : `${(result.directWalkMeters / 1000).toFixed(1)} km`}
                      </div>
                    </div>
                  </div>
                  <span className="font-display text-base font-black text-slate-200 tabular-nums">
                    {result.directWalkMinutes} {lang === 'en' ? 'min' : 'phút'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => openGoogleMaps('bicycling')}
                  className="w-full px-4 py-3.5 rounded-2xl bg-[#131926] hover:bg-[#1a2234] flex items-center justify-between gap-3 active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Bike className="w-5 h-5 text-emerald-400" />
                    <div className="text-left">
                      <div className="text-sm font-black text-white">
                        {lang === 'en' ? 'Bike' : 'Xe đạp'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {result.directWalkMeters < 1000
                          ? `${result.directWalkMeters}m`
                          : `${(result.directWalkMeters / 1000).toFixed(1)} km`}
                      </div>
                    </div>
                  </div>
                  <span className="font-display text-base font-black text-emerald-400 tabular-nums">
                    {result.directBikeMinutes} {lang === 'en' ? 'min' : 'phút'}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
