import { Download, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Automatically suppress once running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <div className="p-3 border-t border-slate-200 bg-white shrink-0">
      <button
        type="button"
        onClick={handleClick}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 transition-colors cursor-pointer"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {isInstallable ? (
            <Download className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 text-slate-600 shrink-0" />
          )}
          <span className="truncate">
            {isInstallable
              ? 'Cài ứng dụng lên điện thoại'
              : 'Cài lên điện thoại · Xuất APK'}
          </span>
        </span>
        <span className="text-[11px] font-semibold text-sky-700 whitespace-nowrap shrink-0">
          {isInstallable ? 'Cài ngay' : 'Hướng dẫn'}
        </span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <h3
                id="pwa-guide-title"
                className="font-display text-base font-bold text-slate-950"
              >
                Cài KL Transit Live lên điện thoại
              </h3>
              <button
                type="button"
                aria-label="Đóng hướng dẫn"
                onClick={() => setShowGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700">
              {isIOS ? (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">Trên iPhone / iPad (Safari):</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed text-slate-600">
                    <li>
                      Nhấn nút <strong>Chia sẻ (Share)</strong> ở thanh dưới cùng của Safari.
                    </li>
                    <li>
                      Cuộn xuống và chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.
                    </li>
                    <li>
                      Nhấn <strong>Thêm</strong> — ứng dụng sẽ mở toàn màn hình như app thật.
                    </li>
                  </ol>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      Cách 1: Cài trực tiếp bằng Chrome (Nhanh nhất)
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-slate-600">
                      <li>Mở link ứng dụng đã Deploy bằng trình duyệt Chrome trên Android.</li>
                      <li>
                        Nhấn nút <strong>Cài ứng dụng</strong> ngay trong app hoặc mở menu 3 chấm →{' '}
                        <strong>Cài đặt ứng dụng (Install app)</strong>.
                      </li>
                    </ol>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      Cách 2: Đóng gói thành file .APK bằng PWABuilder
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-slate-600">
                      <li>Deploy app này lên Cloud để có đường dẫn HTTPS chạy 24/7.</li>
                      <li>
                        Truy cập <strong>pwabuilder.com</strong>, dán link HTTPS của app vào ô kiểm
                        tra.
                      </li>
                      <li>
                        Chọn <strong>Package for Stores → Android → Generate</strong> để tải file{' '}
                        <code className="font-mono text-slate-800">app-release-signed.apk</code> đã
                        ký sẵn và cài trực tiếp lên Android.
                      </li>
                    </ol>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
