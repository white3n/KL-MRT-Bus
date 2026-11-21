import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Language = 'vi' | 'en';

const STORAGE_KEY = 'kl_transit_lang_v1';

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'vi',
  setLang: () => {},
  toggleLang: () => {},
});

function detectInitialLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    // ignore storage errors
  }
  return 'vi';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'vi' ? 'en' : 'vi');
  }, [lang, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export const translations = {
  vi: {
    // TopBar
    navAriaLabel: 'Chế độ xem giao thông',
    modeRail: 'Tàu điện',
    modeBus: 'Xe Bus GPS',
    modeAll: 'Tất cả',
    clockTitle: 'Giờ địa phương Kuala Lumpur, Malaysia (UTC+8)',
    refreshAria: 'Làm mới dữ liệu ngay',
    refreshTitle: (sec: number) => `Làm mới ngay (tự động sau ${sec}s)`,
    langSwitchAria: 'Chuyển ngôn ngữ Tiếng Việt / English',

    // Search & Main Workspace
    searchBusPlaceholder: 'Tìm tuyến bus (400, T565)…',
    searchRailPlaceholder: 'Tìm ga MRT/LRT (KLCC, TRX, KG16)…',
    clearSearchAria: 'Xóa từ khóa tìm kiếm',
    nearMe: 'Gần tôi',
    locatingShort: 'Định vị…',
    nearMeTitle: 'Xin quyền GPS tìm ga MRT/LRT và trạm xe Bus gần nhất',
    allLines: 'Tất cả tuyến',
    showingAllSummary: (count: number) => `Đang hiện tàu & ${count} xe bus GPS trên bản đồ`,
    viewBusList: 'Xem DS Bus',
    popularHubs: 'Ga trung tâm phổ biến',
    tapForSchedule: 'Chạm để xem giờ tàu',
    allRailStations: 'Danh sách ga đường sắt',
    stationsCount: (n: number) => `${n} ga`,
    noStationsMatch: 'Không tìm thấy ga nào khớp từ khóa.',
    clearFilters: 'Xóa bộ lọc',
    reloadData: 'Tải lại dữ liệu',
    railLoadError: 'Không thể tải dữ liệu đường sắt Kuala Lumpur.',
    departuresLoadError: 'Lỗi kết nối lịch tàu.',
    busLoadError: 'Lỗi kết nối luồng GPS xe bus.',
    nearbyLoadError: 'Lỗi tra cứu bến gần vị trí GPS.',
    gpsUnsupported: 'Trình duyệt của bạn không hỗ trợ định vị GPS.',
    gpsDeniedAndroid:
      'Bạn chưa cấp quyền Vị trí (Location) cho ứng dụng. Hãy bật quyền Vị trí trong Cài đặt Android rồi thử lại.',
    gpsDeniedBrowser:
      'Bạn đã từ chối quyền truy cập GPS. Hãy bật quyền Vị trí (Location) cho trang web hoặc bấm "Thử tại trung tâm KL".',
    gpsUnavailable: 'Không thể xác định vị trí GPS hiện tại. Hãy thử lại hoặc dùng vị trí mẫu tại KL.',
    gpsTimeout: 'Hết thời gian chờ tín hiệu GPS. Vui lòng thử lại.',
    gpsGenericError: 'Không thể lấy tọa độ GPS. Hãy bật Định vị (GPS) trên điện thoại rồi thử lại.',

    // Mobile FAB
    fabViewMap: 'Xem bản đồ KL',
    fabBusList: 'Danh sách xe Bus',
    fabTrainBoard: 'Bảng giờ tàu',

    // Station Departure Board
    backToStations: 'Quay lại danh sách ga',
    allStationsBack: 'Tất cả các ga',
    retryLoad: 'Thử tải lại',
    liveBadge: (t: string) => `Trực tiếp · ${t} MYT`,
    staticScheduleBadge: (t: string) => `${t} MYT · Lịch tĩnh`,
    previewBadge: (t: string) => `Xem trước · ${t} MYT`,
    interchangePrompt: 'Ga trung chuyển — đổi sang tuyến kết nối:',
    checkTimeLabel: 'Kiểm tra giờ tàu (giờ KL · MYT)',
    selectDayAria: 'Chọn lịch ngày',
    dayAuto: 'Hôm nay (Tự động)',
    dayWeekday: 'Thứ 2 – Thứ 6',
    daySat: 'Thứ 7',
    daySun: 'Chủ nhật',
    presetNow: 'Bây giờ',
    customTimePickLabel: 'Chọn giờ',
    customTimeAria: 'Chọn giờ tùy chỉnh tại Kuala Lumpur',
    nextTrains: 'Các chuyến tàu sắp tới',
    railFrequencyHeader: 'Tần suất & Giờ hoạt động',
    everyXMin: (m: number) => `Mỗi ${m} phút`,
    everyXMinCompact: (m: number) => `Mỗi ${m}p`,
    freqUnitLabel: 'phút/chuyến',
    checkOnGoogleMaps: 'Xem giờ Google Maps',
    whereToPlaceholder: 'Bạn muốn đi đâu? (ga, tuyến bus…)',
    homeTab: 'Trang chủ',
    settingsTitle: 'Cài đặt nhanh',
    liveNearbyFeed: 'Gần bạn & Trạm của tôi',
    expandMapLabel: 'Mở rộng bản đồ',
    collapseMapLabel: 'Thu gọn bản đồ',
    currentFrequencyLabel: 'Tần suất hiện tại',
    serviceEnded: 'Hết giờ chạy',
    firstTrainShort: 'Chuyến đầu',
    lastTrainShort: 'Chuyến cuối',
    estStaticTimesLabel: 'Ước tính GTFS:',
    liveTrackFreqLine: (mins: number, dest: string, last: string) =>
      `Mỗi ${mins} phút · Hướng ${dest} (chuyến cuối ${last})`,
    scheduleModeTimetable: 'Lịch từng chuyến · GTFS',
    scheduleModeFrequency: 'Tần suất · GTFS tĩnh',
    gtfsSyncedLabel: (t: string) => `Đồng bộ GTFS: ${t} (lưu ngoại tuyến)`,
    updating: 'Đang cập nhật…',
    noDeparturesData: 'Hiện chưa có dữ liệu chuyến khởi hành cho ga này.',
    towards: 'Hướng đi',
    nextStop: 'Ga kế:',
    minsShort: (m: number) => `~${m} phút`,
    firstTrainAt: (t: string) => `Chuyến đầu ${t}`,
    atTime: (t: string) => `Lúc ${t}`,
    afterHoursNotice: (lastTrain: string) =>
      `Đã qua chuyến cuối (${lastTrain} MYT). Chọn giờ 08:00 hoặc 18:00 ở trên để xem lịch chạy ban ngày.`,
    followingTrains: 'Chuyến kế:',
    minUnitShort: 'p',
    headwayEvery: 'Tần suất mỗi',
    minutesWord: 'phút',
    peakHours: 'Giờ cao điểm',
    stationsOnLine: (name: string) => `Các ga trên tuyến ${name}`,
    dataNoticeText:
      'Lịch tàu tính từ dữ liệu GTFS chính thức của Prasarana / Rapid KL (api.data.gov.my) theo giờ Malaysia (MYT, UTC+8).',
    dataNoticeTimetable:
      'Đọc trực tiếp lịch từng chuyến (stop_times.txt + calendar.txt) từ gói GTFS Static mới nhất của Prasarana (api.data.gov.my · giờ MYT).',
    dataNoticeFrequency:
      'Dữ liệu mở api.data.gov.my của Prasarana hiện chỉ cung cấp lịch tĩnh theo tần suất (stop_times.txt + calendar.txt + frequencies.txt) và chưa có luồng tín hiệu tàu thời gian thực, nên giờ trên bảng LED thực tế tại ga có thể chênh vài phút.',

    // Bus Live Panel
    backToBusList: 'Danh sách xe bus đang chạy',
    gpsAgo: (sec: number) => `GPS ${sec}s trước`,
    agoShort: (sec: number) => `${sec}s trước`,
    licensePlate: (plate: string) => `Biển số ${plate}`,
    speed: 'Tốc độ',
    heading: 'Hướng chạy',
    gpsCoords: 'Tọa độ GPS',
    upcomingStops: 'Các trạm dừng gần & sắp tới',
    loadingStops: 'Đang tải trạm…',
    busRouteSyncing:
      'Xe đang phát tín hiệu GPS trực tiếp trên bản đồ. Lộ trình chi tiết các trạm dừng của chuyến này đang được đồng bộ từ dữ liệu tĩnh Prasarana.',
    distanceAway: (d: string) => `Cách ${d}`,
    nearStop: 'Gần trạm',
    busRealtimeFootnote:
      'Vị trí GPS thật từ luồng GTFS Realtime Protobuf của api.data.gov.my (tự làm mới mỗi 5 giây). Thời gian đến trạm được ước tính theo khoảng cách và tốc độ thực tế.',
    busTabAll: (n: number) => `Tất cả (${n})`,
    busTabRapid: (n: number) => `Rapid KL (${n})`,
    busTabFeeder: (n: number) => `Feeder (${n})`,
    busSourceLabel: 'GTFS Realtime · api.data.gov.my',
    autoRefresh5s: 'Tự động 5s',
    retryConnect: 'Thử kết nối lại',
    noBusesTitle: 'Không tìm thấy xe bus đang hoạt động phù hợp',
    noBusesQueryHint: (q: string) =>
      `Thử xóa bộ lọc "${q}" hoặc kiểm tra mã tuyến khác (ví dụ: 400, 300, T850, T565).`,
    noBusesOffPeakHint:
      'Ngoài giờ cao điểm hoặc khuya ở Kuala Lumpur, số lượng xe phát GPS sẽ ít hơn.',
    liveBusesHeader: 'Xe đang phát tín hiệu GPS trực tiếp',
    busesCount: (n: number) => `${n} xe`,
    showingFirst80: (total: number) =>
      `Đang hiện 80/${total} xe — hãy gõ mã tuyến (vd: 400, T565) để lọc nhanh.`,

    // Nearby Panel
    backToList: 'Quay lại danh sách',
    relocateGps: 'Định vị lại GPS',
    locatingEllipsis: 'Đang định vị…',
    nearbyTitle: 'Bến tàu & xe Bus gần bạn',
    simulatedKlLabel: 'Vị trí mẫu tại Bukit Bintang KL · ',
    currentGpsLabel: 'GPS hiện tại · ',
    retryGpsPerm: 'Thử xin quyền GPS lại',
    tryKlCenter: 'Thử tại trung tâm KL',
    farFromKlText: (km: string) =>
      `Vị trí GPS hiện tại của bạn cách trung tâm Kuala Lumpur khoảng ${km} km. Bạn vẫn xem được khoảng cách thật bên dưới, hoặc thử đặt vị trí mẫu tại trung tâm KL để kiểm tra khoảng cách đi bộ thực tế.`,
    tryBukitBintang: 'Thử vị trí tại Bukit Bintang, KL',
    nearestRailTitle: 'Ga MRT / LRT / Monorail gần nhất',
    nearestBusTitle: 'Trạm xe Bus Rapid KL gần nhất',
    stopsCount: (n: number) => `${n} trạm`,
    syncingBusStops:
      'Đang đồng bộ danh mục trạm xe bus từ Prasarana… Vui lòng bấm Định vị lại sau vài giây.',
    straightLine: 'Đường chim bay',
    walk1Min: '~1 phút đi bộ',
    walkMins: (m: number) => `~${m} phút đi bộ`,
    walkHoursMins: (h: number, m: number) => `~${h}g ${m}p đi bộ`,

    // Map
    yourGpsLocation: 'Vị trí GPS của bạn',
    busStopTooltipDist: (d: string) => `Trạm xe Bus · Cách ${d}`,
    mapGpsTitle: 'Tìm ga MRT/LRT và trạm xe Bus gần vị trí GPS của bạn',
    mapGpsLabel: 'Gần tôi',
    mapRecenterTitle: 'Về trung tâm Kuala Lumpur',
    mapRecenterLabel: 'Trung tâm KL',
    mapLayerTitle: 'Chuyển nhanh lớp hiển thị tàu / xe bus',
    mapLayerShowBus: 'Thêm Bus',
    mapLayerShowRail: 'Thêm Tàu',
    mapLayerAll: 'Tất cả lớp',
    mapDataAttribution: 'Dữ liệu: api.data.gov.my',

    // Offline & PWA
    offlineBanner: 'Đang ngoại tuyến · Dùng dữ liệu ga đã lưu',
    pwaInstallCta: 'Cài ứng dụng lên điện thoại',
    pwaGuideCta: 'Cài lên điện thoại · Xuất APK',
    pwaInstallNow: 'Cài ngay',
    pwaGuideBtn: 'Hướng dẫn',
    pwaModalTitle: 'Cài KL Transit Live lên điện thoại',
    pwaCloseAria: 'Đóng hướng dẫn',
    pwaUnderstood: 'Đã hiểu',
    pwaIosHeading: 'Trên iPhone / iPad (Safari):',
    pwaIosSteps: [
      'Nhấn nút Chia sẻ (Share) ở thanh dưới cùng của Safari.',
      'Cuộn xuống và chọn Thêm vào Màn hình chính (Add to Home Screen).',
      'Nhấn Thêm — ứng dụng sẽ mở toàn màn hình như app thật.',
    ],
    pwaAndroid1Heading: 'Cách 1: Cài trực tiếp bằng Chrome (Nhanh nhất)',
    pwaAndroid1Steps: [
      'Mở link ứng dụng bằng trình duyệt Chrome trên Android.',
      'Nhấn nút Cài ứng dụng hoặc mở menu 3 chấm → Cài đặt ứng dụng (Install app).',
    ],
    pwaAndroid2Heading: 'Cách 2: Cài trực tiếp file .APK Android',
    pwaAndroid2Steps: [
      'Chép file KL-Transit-Live.apk sang điện thoại Android và mở để cài đặt.',
      'Ứng dụng hoạt động độc lập, tự kết nối trực tiếp dữ liệu mở Malaysia (api.data.gov.my).',
    ],

    // Bottom Navigation & New UX Features
    navMap: 'Bản đồ',
    navNearby: 'Gần tôi',
    tripPlanner: 'Tìm lộ trình',
    savedStations: 'Ga đã lưu',
    saveStation: 'Lưu ga',
    savedStation: 'Đã lưu',
    directionsBtn: 'Chỉ đường',
    shareBtn: 'Chia sẻ',
    linkCopied: 'Đã sao chép link!',

    // Lock Screen & Real-Time Live Tracking
    liveTrackStart: 'Ghim thông báo',
    liveTrackActive: 'Đang theo dõi',
    liveTrackStop: 'Dừng',
    liveTrackBannerSub: 'Cập nhật mỗi 5s · Màn hình khóa',
    liveTrackBannerSubWeb: 'Đang theo dõi trực tiếp · Cập nhật 5s',
    liveTrackPermissionHint: 'Hãy cấp quyền Thông báo để hiển thị lịch tàu trực tiếp ngoài màn hình khóa.',
    liveTrackTowards: (dest: string) => `Hướng ${dest}`,
    liveTrackNextTrain: (countdown: string, time: string, dest: string) =>
      `Chuyến kế: ${countdown} (${time}) · Hướng ${dest}`,
    liveTrackBusSummary: (speed: number, plate: string, headsign: string) =>
      `${speed} km/h · ${plate} · ${headsign}`,
    liveTrackBusNextStop: (stopName: string, mins: number) =>
      `Trạm sắp tới: ${stopName} (~${mins} phút)`,

    // Directions Bottom Sheet (Google Maps / Waze / Apple Maps)
    dirSheetTitle: 'Chỉ đường tới điểm đến',
    dirFromLabel: 'Điểm đi (From)',
    dirToLabel: 'Điểm đến (To)',
    dirCurrentGps: 'Vị trí GPS hiện tại của bạn',
    dirAutoGps: 'Vị trí hiện tại (Google Maps tự định vị)',
    dirGetGpsNow: 'Lấy GPS chính xác',
    dirTravelModeLabel: 'Chọn phương tiện di chuyển',
    modeWalk: 'Đi bộ',
    modeTransit: 'Công cộng',
    modeDrive: 'Ô tô / Grab',
    modeBike: 'Xe máy / Đạp',
    openGoogleMaps: 'Mở dẫn đường Google Maps',
    openAppleMaps: 'Mở Apple Maps',
    openWaze: 'Mở Waze',
    dirEstAway: (dist: string, mins: number) => `Cách ${dist} · Ước tính ~${mins} phút`,
    dirReadyNote: 'Tự động điền sẵn điểm đi (From) & điểm đến (To) trong ứng dụng bản đồ.',
    nearestQuickDirTitle: 'Dẫn đường nhanh tới bến gần nhất',
    nearestRailDir: 'Tới ga MRT/LRT gần nhất',
    nearestBusDir: 'Tới trạm Bus gần nhất',

    // Trip Planner
    tripTitle: 'Tìm lộ trình tàu KL',
    tripSubtitle: 'Tự động tính tuyến đi & ga trung chuyển tối ưu (MRT · LRT · Monorail)',
    tripFrom: 'Ga xuất phát',
    tripTo: 'Ga đích đến',
    tripSelectStation: 'Chọn ga…',
    tripUseNearest: 'Dùng ga gần nhất',
    tripSwap: 'Đổi chiều',
    tripDirect: 'Đi thẳng · Không đổi tuyến',
    tripTransfers: (n: number) => `${n} lần đổi tuyến`,
    tripStopsCount: (n: number) => `${n} trạm`,
    tripEstMins: (m: number) => `~${m} phút`,
    tripBoardAt: 'Lên tàu tại',
    tripTransferAt: 'Đổi tuyến tại',
    tripAlightAt: 'Xuống tàu tại',
    tripDirToStart: 'Chỉ đường ra ga xuất phát',
    tripNoRoute: 'Chọn 2 ga khác nhau để xem lộ trình gợi ý.',
    tripViewStartBoard: 'Xem giờ tàu ga đi',

    // Map Preview Bottom Card
    mapPreviewDetails: 'Chi tiết',
    mapPreviewSchedule: 'Giờ tàu',

    // Approaching Buses, My Bus Station & Live Map Filter
    realtimeBadge: 'LIVE · Real-time',
    approachingBusesTitle: 'Xe Bus đang tiến gần bạn nhất',
    approachingBadge: 'Đang tiến tới',
    nearbyBusBadge: 'Gần bạn',
    approachingEmpty: 'Chưa có xe bus nào đang tiến gần trong bán kính 15 km.',
    approachingEnableGps: 'Bật GPS để xem xe bus nào đang tiến gần nhất',
    viewOnMap: 'Xem trên bản đồ',
    viewNBusesOnMap: (n: number) => `Xem ${n} xe trên bản đồ`,
    mapBusFilterChip: (label: string, n: number) => `Đang xem Bus: ${label} (${n} xe)`,
    myBusStationLabel: 'Trạm Bus của tôi',
    setMyStation: 'Đặt làm trạm của tôi',
    myStationBadge: 'TRẠM CỦA BẠN',
    myStationEtaCard: (mins: number, stopsAway: number) =>
      stopsAway <= 0
        ? `Xe đang ngay tại trạm của bạn (~${mins} phút)`
        : `Còn ~${mins} phút (${stopsAway} trạm nữa)`,
    myStationArrivingSoon: 'Sắp tới trạm của bạn!',
    myStationPassed: 'Xe đã đi qua trạm của bạn trên chiều này',
    myStationClear: 'Bỏ ghim trạm',
    myStationSetToast: (name: string) => `Đã đặt "${name}" làm Trạm Bus của bạn`,

    // Unified Trip Planner (Rail + Bus) & Fare Estimator
    tripModalTitle: 'Tìm lộ trình & Giá vé KL',
    tripModalSub: 'So sánh nhiều lựa chọn tuyến Tàu điện / Xe Bus + Giá vé Rapid KL',
    tripTabRail: 'Tàu điện (MRT/LRT)',
    tripTabBus: 'Xe Bus (Rapid/Feeder)',
    fareEstLabel: 'Giá vé ước tính',
    fareCashless: "Touch 'n Go",
    fareToken: 'Tiền mặt / Token',
    fareConcession: 'Ưu đãi 50%',
    fareMy50: 'Thẻ My50: Miễn phí',
    fareBusCashlessNote: "Xe Bus Rapid KL chỉ nhận Touch 'n Go / Thẻ không tiền mặt · MRT Feeder đồng giá RM 1.00",
    fareRailNote: 'Tính theo biểu giá khoảng cách chính thức Rapid KL (có thể chênh lệch ±RM 0.10–0.20).',
    busTripPlannerCta: 'Tìm lộ trình Xe Bus',
    busTripFromLabel: 'Trạm Bus xuất phát',
    busTripToLabel: 'Trạm Bus đích đến',
    busTripSearchPlaceholder: 'Gõ tên trạm, mã trạm (KL123) hoặc tuyến (400, T565)…',
    busTripUseMyStation: 'Dùng Trạm của tôi',
    busTripUseNearestStop: 'Dùng trạm gần nhất',
    busTripLoadingIndex: 'Đang đồng bộ danh mục trạm & tuyến xe bus từ Prasarana…',
    busTripPickBoth: 'Chọn trạm xuất phát và trạm đích để xem các lựa chọn xe bus, thời gian đợi & giá vé.',
    busTripOptionsFound: (n: number) => `Tìm thấy ${n} lựa chọn lộ trình Bus`,
    busTripNoOptions: 'Không tìm thấy tuyến bus thẳng hoặc 1 lần đổi giữa 2 trạm này. Bạn có thể mở Google Maps Công cộng để xem phương án kết hợp Tàu + Bus.',
    busTripOpenGmapsTransit: 'Mở Google Maps (Tàu + Bus)',
    busTripLiveWait: (mins: number) => `Đợi ~${mins} phút (GPS trực tiếp)`,
    busTripSchedWait: (mins: number) => `Đợi dự kiến ~${mins} phút`,
    busTripRideMins: (mins: number) => `Đi xe ~${mins} phút`,
    busTripTotalMins: (mins: number) => `Tổng ~${mins} phút`,
    busTripApproachingBus: (plate: string, stops: number, speed: number) =>
      `Xe ${plate} · còn ${stops} trạm · ${speed} km/h`,
    busTripNextBusTag: 'Xe gần nhất',
    busTripTrackThisBus: 'Xem xe này',
    busTripFlatFeeder: 'Đồng giá Feeder',
    busTripBoardWalk: (m: number) => `Đi bộ ${m}m ra trạm lên xe`,

    // Dedicated My Rail Station & My Bus Station Setup + Live Cards
    myRailStationLabel: 'Ga Tàu của tôi',
    setupMyRailTitle: 'Thiết lập Ga Tàu của tôi',
    setupMyRailSub: 'Xem ngay giờ tàu sắp đến ga của bạn mỗi khi mở app',
    setupMyBusTitle: 'Thiết lập Trạm Bus của tôi',
    setupMyBusSub: 'Xem ngay 3 tuyến bus đúng chiều sắp tới trạm đón của bạn',
    setupBtn: 'Thiết lập',
    changeStationBtn: 'Đổi trạm',
    myBusArrivalsTitle: 'Xe Bus đúng chiều sắp tới trạm của bạn',
    myBusArrivalsEmpty: 'Hiện chưa có xe bus GPS nào cùng chiều đang hướng về trạm của bạn.',
    myBusArrivalsLoading: 'Đang kiểm tra các tuyến bus sắp tới trạm của bạn…',
    stopsRemaining: (n: number) => (n <= 0 ? 'Đang vào trạm' : `Còn ${n} trạm`),
    busWrongDirectionNotice: 'Xe này đang chạy theo hướng ngược lại so với chiều tuyến này.',
    busSwitchToClosest: (plate: string, mins: number) =>
      `Có xe ${plate} cùng tuyến gần trạm hơn (~${mins} phút) — Xem ngay`,

    // Pull to Refresh
    ptrPull: 'Kéo xuống để làm mới GPS',
    ptrRelease: 'Thả tay để cập nhật GPS mới nhất',
    ptrRefreshing: 'Đang cập nhật tín hiệu GPS…',

    // Google Fonts Picker
    fontPickerAria: 'Đổi font chữ hệ thống',
    fontModalTitle: 'Đổi Font chữ (Google Fonts)',
    fontCurrentLabel: (f: string) => `Đang dùng: ${f}`,
    fontCustomLabel: 'Tải bất kỳ font nào từ Google Fonts',
    fontCustomPlaceholder: 'Gõ tên font (vd: Montserrat, Merriweather, Lora)…',
    fontLoadApply: 'Tải & Dùng',
  },
  en: {
    // TopBar
    navAriaLabel: 'Transit view mode',
    modeRail: 'Rail',
    modeBus: 'Bus GPS',
    modeAll: 'All',
    clockTitle: 'Local time in Kuala Lumpur, Malaysia (UTC+8)',
    refreshAria: 'Refresh transit data now',
    refreshTitle: (sec: number) => `Refresh now (auto in ${sec}s)`,
    langSwitchAria: 'Switch language Vietnamese / English',

    // Search & Main Workspace
    searchBusPlaceholder: 'Search bus route (400, T565)…',
    searchRailPlaceholder: 'Search MRT/LRT station (KLCC, TRX, KG16)…',
    clearSearchAria: 'Clear search query',
    nearMe: 'Near me',
    locatingShort: 'Locating…',
    nearMeTitle: 'Find nearest MRT/LRT stations and Rapid KL bus stops using GPS',
    allLines: 'All lines',
    showingAllSummary: (count: number) => `Showing rail & ${count} live GPS buses on map`,
    viewBusList: 'Bus List',
    popularHubs: 'Popular KL Hubs',
    tapForSchedule: 'Tap for live schedule',
    allRailStations: 'All Rail Stations',
    stationsCount: (n: number) => `${n} stations`,
    noStationsMatch: 'No stations match your search.',
    clearFilters: 'Clear filters',
    reloadData: 'Reload data',
    railLoadError: 'Unable to load Kuala Lumpur rail network data.',
    departuresLoadError: 'Could not load train departure schedule.',
    busLoadError: 'Could not connect to live bus GPS feed.',
    nearbyLoadError: 'Failed to find nearby transit stops.',
    gpsUnsupported: 'Your browser does not support GPS geolocation.',
    gpsDeniedAndroid:
      'Location permission was denied. Please enable Location permission in Android Settings and try again.',
    gpsDeniedBrowser:
      'Location access denied. Please allow Location permission or tap "Try KL Center".',
    gpsUnavailable: 'Unable to determine your GPS location. Please retry or try the KL sample location.',
    gpsTimeout: 'GPS request timed out. Please try again.',
    gpsGenericError: 'Could not get GPS coordinates. Please turn on Location (GPS) and retry.',

    // Mobile FAB
    fabViewMap: 'View KL Map',
    fabBusList: 'Bus List',
    fabTrainBoard: 'Train Schedule',

    // Station Departure Board
    backToStations: 'Back to stations',
    allStationsBack: 'All stations',
    retryLoad: 'Retry',
    liveBadge: (t: string) => `Live · ${t} MYT`,
    staticScheduleBadge: (t: string) => `${t} MYT · Static`,
    previewBadge: (t: string) => `Preview · ${t} MYT`,
    interchangePrompt: 'Interchange station — switch to connecting line:',
    checkTimeLabel: 'Check departures by KL time (MYT)',
    selectDayAria: 'Select schedule day',
    dayAuto: 'Today (Auto)',
    dayWeekday: 'Mon – Fri',
    daySat: 'Saturday',
    daySun: 'Sunday',
    presetNow: 'Now',
    customTimePickLabel: 'Pick time',
    customTimeAria: 'Pick custom Kuala Lumpur time',
    nextTrains: 'Upcoming Trains',
    railFrequencyHeader: 'Frequency & Operating Hours',
    everyXMin: (m: number) => `Every ${m} min`,
    everyXMinCompact: (m: number) => `Every ${m}m`,
    freqUnitLabel: 'min/train',
    checkOnGoogleMaps: 'Live on Google Maps',
    whereToPlaceholder: 'Where to? (station, bus…)',
    homeTab: 'Home',
    settingsTitle: 'Quick Settings',
    liveNearbyFeed: 'Nearby & My Stations',
    expandMapLabel: 'Full map',
    collapseMapLabel: 'Split view',
    currentFrequencyLabel: 'Current frequency',
    serviceEnded: 'Service ended',
    firstTrainShort: 'First train',
    lastTrainShort: 'Last train',
    estStaticTimesLabel: 'Est. GTFS:',
    liveTrackFreqLine: (mins: number, dest: string, last: string) =>
      `Every ${mins} min · Towards ${dest} (last ${last})`,
    scheduleModeTimetable: 'GTFS Timetable',
    scheduleModeFrequency: 'GTFS Static Frequency',
    gtfsSyncedLabel: (t: string) => `GTFS synced: ${t} (cached offline)`,
    updating: 'Updating…',
    noDeparturesData: 'No departure schedule is available for this station right now.',
    towards: 'Towards',
    nextStop: 'Next stop:',
    minsShort: (m: number) => `~${m} min`,
    firstTrainAt: (t: string) => `First train ${t}`,
    atTime: (t: string) => `At ${t}`,
    afterHoursNotice: (lastTrain: string) =>
      `Past last train (${lastTrain} MYT). Pick 08:00 or 18:00 above to preview daytime schedules.`,
    followingTrains: 'Next:',
    minUnitShort: 'm',
    headwayEvery: 'Frequency every',
    minutesWord: 'min',
    peakHours: 'Peak hours',
    stationsOnLine: (name: string) => `Stations on ${name}`,
    dataNoticeText:
      'Schedule computed from official Prasarana / Rapid KL GTFS open data (api.data.gov.my) in Malaysia Time (MYT, UTC+8).',
    dataNoticeTimetable:
      'Read directly from individual trip stop_times.txt + calendar.txt in the latest Prasarana GTFS Static package (api.data.gov.my · MYT).',
    dataNoticeFrequency:
      'Prasarana open data on api.data.gov.my currently publishes static frequency templates (stop_times.txt + calendar.txt + frequencies.txt) without live train telemetry, so actual station platform LED times may vary by a few minutes.',

    // Bus Live Panel
    backToBusList: 'Active buses list',
    gpsAgo: (sec: number) => `GPS ${sec}s ago`,
    agoShort: (sec: number) => `${sec}s ago`,
    licensePlate: (plate: string) => `Plate ${plate}`,
    speed: 'Speed',
    heading: 'Heading',
    gpsCoords: 'GPS Coords',
    upcomingStops: 'Nearby & Upcoming Stops',
    loadingStops: 'Loading stops…',
    busRouteSyncing:
      'Live GPS position is active on the map. Detailed stop sequence for this trip is syncing from Prasarana static data.',
    distanceAway: (d: string) => `${d} away`,
    nearStop: 'At stop',
    busRealtimeFootnote:
      'Real-time GPS positions from api.data.gov.my GTFS-Realtime Protobuf feed (auto-refreshes every 5s). ETAs are estimated from distance and current speed.',
    busTabAll: (n: number) => `All (${n})`,
    busTabRapid: (n: number) => `Rapid KL (${n})`,
    busTabFeeder: (n: number) => `Feeder (${n})`,
    busSourceLabel: 'GTFS Realtime · api.data.gov.my',
    autoRefresh5s: 'Auto 5s',
    retryConnect: 'Reconnect',
    noBusesTitle: 'No matching active buses found',
    noBusesQueryHint: (q: string) =>
      `Try clearing "${q}" or searching another route code (e.g. 400, 300, T850, T565).`,
    noBusesOffPeakHint:
      'Fewer buses broadcast GPS during off-peak or late-night hours in Kuala Lumpur.',
    liveBusesHeader: 'Live GPS Active Buses',
    busesCount: (n: number) => `${n} buses`,
    showingFirst80: (total: number) =>
      `Showing 80 of ${total} buses — type a route code (e.g. 400, T565) to filter.`,

    // Nearby Panel
    backToList: 'Back to list',
    relocateGps: 'Re-locate GPS',
    locatingEllipsis: 'Locating…',
    nearbyTitle: 'Nearby Stations & Bus Stops',
    simulatedKlLabel: 'Sample location at Bukit Bintang KL · ',
    currentGpsLabel: 'Current GPS · ',
    retryGpsPerm: 'Request GPS again',
    tryKlCenter: 'Try KL Center',
    farFromKlText: (km: string) =>
      `Your current GPS location is about ${km} km from Kuala Lumpur city center. You can still view actual distances below, or preview from central KL.`,
    tryBukitBintang: 'Try Bukit Bintang, KL',
    nearestRailTitle: 'Nearest MRT / LRT / Monorail',
    nearestBusTitle: 'Nearest Rapid KL Bus Stops',
    stopsCount: (n: number) => `${n} stops`,
    syncingBusStops:
      'Syncing Prasarana bus stop directory… Tap Re-locate GPS in a few seconds.',
    straightLine: 'Straight line',
    walk1Min: '~1 min walk',
    walkMins: (m: number) => `~${m} min walk`,
    walkHoursMins: (h: number, m: number) => `~${h}h ${m}m walk`,

    // Map
    yourGpsLocation: 'Your GPS location',
    busStopTooltipDist: (d: string) => `Bus Stop · ${d} away`,
    mapGpsTitle: 'Find nearest MRT/LRT stations and bus stops using GPS',
    mapGpsLabel: 'Near me',
    mapRecenterTitle: 'Recenter on Kuala Lumpur',
    mapRecenterLabel: 'KL Center',
    mapLayerTitle: 'Toggle rail / bus map layers',
    mapLayerShowBus: 'Add Buses',
    mapLayerShowRail: 'Add Rail',
    mapLayerAll: 'All Layers',
    mapDataAttribution: 'Data: api.data.gov.my',

    // Offline & PWA
    offlineBanner: 'Offline · Using cached station data',
    pwaInstallCta: 'Install app on phone',
    pwaGuideCta: 'Install on phone · Get APK',
    pwaInstallNow: 'Install',
    pwaGuideBtn: 'Guide',
    pwaModalTitle: 'Install KL Transit Live on Phone',
    pwaCloseAria: 'Close guide',
    pwaUnderstood: 'Got it',
    pwaIosHeading: 'On iPhone / iPad (Safari):',
    pwaIosSteps: [
      'Tap the Share button at the bottom of Safari.',
      'Scroll down and select Add to Home Screen.',
      'Tap Add — the app opens full-screen like a native app.',
    ],
    pwaAndroid1Heading: 'Option 1: Install via Chrome (Fastest)',
    pwaAndroid1Steps: [
      'Open the app URL in Chrome on Android.',
      'Tap Install or open the 3-dot menu → Install app.',
    ],
    pwaAndroid2Heading: 'Option 2: Install Android .APK directly',
    pwaAndroid2Steps: [
      'Copy KL-Transit-Live.apk to your Android phone and open it to install.',
      'Works standalone and connects directly to Malaysia open transit data (api.data.gov.my).',
    ],

    // Bottom Navigation & New UX Features
    navMap: 'Map',
    navNearby: 'Nearby',
    tripPlanner: 'Trip Planner',
    savedStations: 'Saved Stations',
    saveStation: 'Save',
    savedStation: 'Saved',
    directionsBtn: 'Directions',
    shareBtn: 'Share',
    linkCopied: 'Link copied!',

    // Lock Screen & Real-Time Live Tracking
    liveTrackStart: 'Live Track',
    liveTrackActive: 'Tracking Live',
    liveTrackStop: 'Stop',
    liveTrackBannerSub: 'Updates every 5s · Lock Screen',
    liveTrackBannerSubWeb: 'Live tracking active · 5s updates',
    liveTrackPermissionHint: 'Enable Notification permission to display live countdowns on your lock screen.',
    liveTrackTowards: (dest: string) => `Towards ${dest}`,
    liveTrackNextTrain: (countdown: string, time: string, dest: string) =>
      `Next train: ${countdown} (${time}) · Towards ${dest}`,
    liveTrackBusSummary: (speed: number, plate: string, headsign: string) =>
      `${speed} km/h · ${plate} · ${headsign}`,
    liveTrackBusNextStop: (stopName: string, mins: number) =>
      `Next stop: ${stopName} (~${mins} min)`,

    // Directions Bottom Sheet (Google Maps / Waze / Apple Maps)
    dirSheetTitle: 'Directions to Destination',
    dirFromLabel: 'From (Origin)',
    dirToLabel: 'To (Destination)',
    dirCurrentGps: 'Your Current GPS Location',
    dirAutoGps: 'Current Location (Auto in Google Maps)',
    dirGetGpsNow: 'Use Exact GPS',
    dirTravelModeLabel: 'Choose Travel Mode',
    modeWalk: 'Walk',
    modeTransit: 'Transit',
    modeDrive: 'Drive / Grab',
    modeBike: 'Bike',
    openGoogleMaps: 'Open in Google Maps',
    openAppleMaps: 'Apple Maps',
    openWaze: 'Waze',
    dirEstAway: (dist: string, mins: number) => `${dist} away · Est. ~${mins} min`,
    dirReadyNote: 'Pre-fills both From & To coordinates directly in your navigation app.',
    nearestQuickDirTitle: 'Quick Navigate to Nearest Stop',
    nearestRailDir: 'To Nearest MRT/LRT',
    nearestBusDir: 'To Nearest Bus Stop',

    // Trip Planner
    tripTitle: 'KL Rail Trip Planner',
    tripSubtitle: 'Finds optimal routes & interchanges across MRT, LRT & Monorail',
    tripFrom: 'Origin Station',
    tripTo: 'Destination Station',
    tripSelectStation: 'Choose station…',
    tripUseNearest: 'Use Nearest Station',
    tripSwap: 'Swap',
    tripDirect: 'Direct · No transfer',
    tripTransfers: (n: number) => `${n} transfer${n > 1 ? 's' : ''}`,
    tripStopsCount: (n: number) => `${n} stops`,
    tripEstMins: (m: number) => `~${m} min`,
    tripBoardAt: 'Board at',
    tripTransferAt: 'Transfer at',
    tripAlightAt: 'Alight at',
    tripDirToStart: 'Directions to Origin Station',
    tripNoRoute: 'Pick two different stations to calculate the best rail route.',
    tripViewStartBoard: 'Live Departures',

    // Map Preview Bottom Card
    mapPreviewDetails: 'Details',
    mapPreviewSchedule: 'Schedule',

    // Approaching Buses, My Bus Station & Live Map Filter
    realtimeBadge: 'LIVE · Real-time',
    approachingBusesTitle: 'Closest Approaching Buses',
    approachingBadge: 'Approaching',
    nearbyBusBadge: 'Nearby',
    approachingEmpty: 'No active buses approaching within 15 km right now.',
    approachingEnableGps: 'Turn on GPS to see which bus is approaching you fastest',
    viewOnMap: 'Show on Map',
    viewNBusesOnMap: (n: number) => `Show ${n} buses on Map`,
    mapBusFilterChip: (label: string, n: number) => `Tracking Bus: ${label} (${n})`,
    myBusStationLabel: 'My Bus Station',
    setMyStation: 'Set as My Station',
    myStationBadge: 'MY STATION',
    myStationEtaCard: (mins: number, stopsAway: number) =>
      stopsAway <= 0
        ? `Bus is right at your station (~${mins} min)`
        : `~${mins} min away (${stopsAway} stop${stopsAway > 1 ? 's' : ''})`,
    myStationArrivingSoon: 'Arriving at your station soon!',
    myStationPassed: 'This bus has already passed your station',
    myStationClear: 'Clear station',
    myStationSetToast: (name: string) => `Set "${name}" as My Bus Station`,

    // Unified Trip Planner (Rail + Bus) & Fare Estimator
    tripModalTitle: 'KL Trip Planner & Fare',
    tripModalSub: 'Compare Rail & Bus options with live bus wait times and Rapid KL fares',
    tripTabRail: 'Rail (MRT/LRT)',
    tripTabBus: 'Bus (Rapid/Feeder)',
    fareEstLabel: 'Estimated Fare',
    fareCashless: "Touch 'n Go",
    fareToken: 'Cash / Token',
    fareConcession: '50% Concession',
    fareMy50: 'My50 Pass: Free',
    fareBusCashlessNote: "Rapid KL buses are cashless only (Touch 'n Go / Pass) · MRT Feeder flat RM 1.00",
    fareRailNote: 'Calculated via Rapid KL official distance-based tiers (approx. ±RM 0.10–0.20).',
    busTripPlannerCta: 'Bus Trip Planner',
    busTripFromLabel: 'Origin Bus Stop',
    busTripToLabel: 'Destination Bus Stop',
    busTripSearchPlaceholder: 'Search stop name, code (KL123), or route (400, T565)…',
    busTripUseMyStation: 'Use My Station',
    busTripUseNearestStop: 'Use Nearest Stop',
    busTripLoadingIndex: 'Syncing Prasarana bus stop & route directory…',
    busTripPickBoth: 'Select origin and destination bus stops to compare bus options, live wait time & fares.',
    busTripOptionsFound: (n: number) => `Found ${n} bus route option${n > 1 ? 's' : ''}`,
    busTripNoOptions: 'No direct or 1-transfer bus found between these two stops. Open Google Maps Transit for combined Rail + Bus directions.',
    busTripOpenGmapsTransit: 'Open Google Maps (Rail + Bus)',
    busTripLiveWait: (mins: number) => `Wait ~${mins} min (Live GPS)`,
    busTripSchedWait: (mins: number) => `Est. wait ~${mins} min`,
    busTripRideMins: (mins: number) => `Ride ~${mins} min`,
    busTripTotalMins: (mins: number) => `Total ~${mins} min`,
    busTripApproachingBus: (plate: string, stops: number, speed: number) =>
      `Bus ${plate} · ${stops} stop${stops !== 1 ? 's' : ''} away · ${speed} km/h`,
    busTripNextBusTag: 'Next Live Bus',
    busTripTrackThisBus: 'Track Bus',
    busTripFlatFeeder: 'Feeder Flat Rate',
    busTripBoardWalk: (m: number) => `Walk ${m}m to boarding stop`,

    // Dedicated My Rail Station & My Bus Station Setup + Live Cards
    myRailStationLabel: 'My Rail Station',
    setupMyRailTitle: 'Set up My Rail Station',
    setupMyRailSub: 'See live next-train countdowns as soon as you open the app',
    setupMyBusTitle: 'Set up My Bus Station',
    setupMyBusSub: 'See top 3 same-direction buses approaching your exact boarding stop',
    setupBtn: 'Set up',
    changeStationBtn: 'Change',
    myBusArrivalsTitle: 'Same-direction buses arriving at your stop',
    myBusArrivalsEmpty: 'No live GPS buses are currently approaching your stop in the right direction.',
    myBusArrivalsLoading: 'Checking approaching buses for your stop…',
    stopsRemaining: (n: number) => (n <= 0 ? 'Arriving now' : `${n} stop${n > 1 ? 's' : ''} away`),
    busWrongDirectionNotice: 'This bus is currently moving in the opposite direction of this trip.',
    busSwitchToClosest: (plate: string, mins: number) =>
      `Closer bus ${plate} on this route (~${mins} min) — Switch`,

    // Pull to Refresh
    ptrPull: 'Pull down to refresh live GPS',
    ptrRelease: 'Release to fetch latest GPS',
    ptrRefreshing: 'Refreshing live GPS…',

    // Google Fonts Picker
    fontPickerAria: 'Change app font',
    fontModalTitle: 'App Font (Google Fonts)',
    fontCurrentLabel: (f: string) => `Active: ${f}`,
    fontCustomLabel: 'Load any font from Google Fonts',
    fontCustomPlaceholder: 'Type font name (e.g. Montserrat, Merriweather, Lora)…',
    fontLoadApply: 'Load & Apply',
  },
} as const;
