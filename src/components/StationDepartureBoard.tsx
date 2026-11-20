import { ArrowLeft, ArrowRight, Clock, Repeat, RotateCcw } from 'lucide-react';
import type { StationDeparturePayload } from '../types/transit';
import { dayTypeLabelVi, formatCountdownVi } from '../utils/transitHelpers';

interface StationDepartureBoardProps {
  data: StationDeparturePayload | null;
  loading: boolean;
  error: string | null;
  customTime: string;
  customDay: 'auto' | 'weekday' | 'sat' | 'sun';
  onCustomTimeChange: (time: string) => void;
  onCustomDayChange: (day: 'auto' | 'weekday' | 'sat' | 'sun') => void;
  onSelectStation: (stopId: string) => void;
  onBack: () => void;
  onRetry: () => void;
}

const PRESET_TIMES = [
  { label: 'Bây giờ', value: '' },
  { label: '08:00', value: '08:00' },
  { label: '12:00', value: '12:00' },
  { label: '18:00', value: '18:00' },
  { label: '22:00', value: '22:00' },
];

export function StationDepartureBoard({
  data,
  loading,
  error,
  customTime,
  customDay,
  onCustomTimeChange,
  onCustomDayChange,
  onSelectStation,
  onBack,
  onRetry,
}: StationDepartureBoardProps) {
  if (loading && !data) {
    return (
      <div className="p-5 space-y-5 animate-pulse">
        <div className="h-4 w-28 bg-slate-200 rounded" />
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-200 rounded" />
          <div className="h-4 w-40 bg-slate-100 rounded" />
        </div>
        <div className="h-28 bg-slate-100 rounded-xl" />
        <div className="h-28 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại danh sách ga</span>
        </button>
        <div className="p-4 border border-red-200 bg-red-50 rounded-xl space-y-3">
          <p className="text-sm font-medium text-red-900">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử tải lại</span>
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { station, directions, lineStations, queryTimeMyt, isLiveTime, dayType } = data;

  return (
    <div className="flex flex-col divide-y divide-slate-200">
      {/* Station Header */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Tất cả các ga</span>
          </button>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {isLiveTime ? `Trực tiếp · ${queryTimeMyt} MYT` : `Xem trước · ${queryTimeMyt} MYT`}
          </span>
        </div>

        <div className="flex items-start gap-3">
          <span
            className="shrink-0 mt-0.5 px-2.5 py-1 rounded-md font-mono text-xs font-bold tracking-tight text-white tabular-nums"
            style={{ backgroundColor: station.routeColor }}
          >
            {station.stopId}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-slate-950 leading-tight truncate">
              {station.displayName}
            </h2>
            <p className="mt-1 text-xs text-slate-500 flex items-center flex-wrap gap-1.5">
              <span className="font-medium text-slate-700">
                {station.category} {station.routeLongName}
              </span>
              <span aria-hidden="true">·</span>
              <span>{dayTypeLabelVi(dayType)}</span>
            </p>
          </div>
        </div>

        {/* Interchange platform quick switcher */}
        {station.interchanges.length > 0 && (
          <div className="pt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Repeat className="w-3.5 h-3.5 text-slate-400" />
              <span>Ga trung chuyển — đổi sang tuyến kết nối:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {station.interchanges.map((ic) => (
                <button
                  key={ic.stopId}
                  type="button"
                  onClick={() => onSelectStation(ic.stopId)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-800 transition-colors cursor-pointer"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: ic.routeColor }}
                  />
                  <span className="font-mono font-semibold">{ic.stopId}</span>
                  <span>{ic.routeShortName}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Time & Day Schedule Checker */}
      <div className="px-5 py-3.5 bg-slate-50/70 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Kiểm tra giờ tàu theo khung giờ KL (MYT)</span>
          </span>
          <select
            aria-label="Chọn lịch ngày"
            value={customDay}
            onChange={(e) =>
              onCustomDayChange(e.target.value as 'auto' | 'weekday' | 'sat' | 'sun')
            }
            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
          >
            <option value="auto">Hôm nay (Tự động)</option>
            <option value="weekday">Thứ 2 – Thứ 6</option>
            <option value="sat">Thứ 7</option>
            <option value="sun">Chủ nhật</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESET_TIMES.map((preset) => {
            const active = customTime === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onCustomTimeChange(preset.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <input
            type="time"
            aria-label="Chọn giờ tùy chỉnh tại Kuala Lumpur"
            value={customTime}
            onChange={(e) => onCustomTimeChange(e.target.value)}
            className="ml-auto px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Live Direction Arrival Boards */}
      <div className="p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-sm font-bold text-slate-900">
            Các chuyến tàu sắp tới · Next Trains
          </h3>
          {loading && <span className="text-xs text-slate-400">Đang cập nhật…</span>}
        </div>

        {directions.length === 0 ? (
          <div className="p-4 border border-slate-200 rounded-xl text-sm text-slate-600">
            Hiện chưa có dữ liệu chuyến khởi hành cho ga này.
          </div>
        ) : (
          <div className="space-y-3">
            {directions.map((dir) => {
              const first = dir.upcoming[0];
              const rest = dir.upcoming.slice(1, 5);
              const isArrivingNow = first && !first.isTomorrow && first.minutesAway <= 1;

              return (
                <div
                  key={dir.tripId}
                  className="border border-slate-200 rounded-xl bg-white p-4 space-y-3"
                >
                  {/* Direction Title + Primary Countdown */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs text-slate-500">Hướng đi · Towards</p>
                      <p className="font-display text-base font-bold text-slate-950 truncate">
                        {dir.destinationName}
                      </p>
                      {dir.nextStopName && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <span>Ga kế:</span>
                          <span className="font-medium text-slate-700">{dir.nextStopName}</span>
                          {dir.nextStopMinutes !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                ~{dir.nextStopMinutes} phút
                              </span>
                            </>
                          )}
                        </p>
                      )}
                    </div>

                    {first && (
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
                          {formatCountdownVi(first.minutesAway, first.isTomorrow)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500 tabular-nums">
                          {first.isTomorrow ? `Chuyến đầu ${first.arrivalTime}` : `Lúc ${first.arrivalTime}`}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* After-hours notice when KL is past last train */}
                  {first?.isTomorrow && (
                    <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                      Đã qua chuyến cuối ({dir.lastTrain} MYT). Chọn giờ <strong>08:00</strong> hoặc{' '}
                      <strong>18:00</strong> ở trên để xem lịch chạy ban ngày.
                    </div>
                  )}

                  {/* Following train timestamps */}
                  {rest.length > 0 && (
                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500 shrink-0">Chuyến kế:</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums text-slate-800 overflow-x-auto">
                        {rest.map((item, idx) => (
                          <span key={`${item.arrivalTime}-${idx}`} className="whitespace-nowrap">
                            {idx > 0 && (
                              <span className="text-slate-300 mr-2" aria-hidden="true">
                                ·
                              </span>
                            )}
                            <span className="font-semibold">{item.arrivalTime}</span>
                            {!item.isTomorrow && (
                              <span className="text-slate-400 ml-1">({item.minutesAway}p)</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Frequency + operating hours metadata (clean unboxed text) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500">
                    <span>
                      Tần suất mỗi{' '}
                      <strong className="font-mono text-slate-800 tabular-nums">
                        {dir.currentHeadwayMinutes} phút
                      </strong>
                      {dir.isPeakNow ? ' · Giờ cao điểm' : ''}
                    </span>
                    <span className="font-mono tabular-nums">
                      {dir.firstTrain} – {dir.lastTrain}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-400">{data.dataNotice}</p>
      </div>

      {/* Ordered Stations on Current Line */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-slate-900">
            Các ga trên tuyến {station.routeLongName}
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {lineStations.length} ga
          </span>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
          {lineStations.map((st) => (
            <button
              key={st.stopId}
              type="button"
              onClick={() => onSelectStation(st.stopId)}
              className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                st.isCurrent
                  ? 'bg-slate-900 text-white'
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
                    st.isCurrent ? 'text-slate-300 font-semibold' : 'text-slate-400'
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
