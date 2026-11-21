# KL Transit Live — Hướng dẫn chia sẻ bản Web Mobile (Android & iOS)

Thư mục dự án đã tích hợp sẵn **bản Web Mobile PWA hoàn chỉnh** (chạy mượt trên **iOS Safari**, **Android Chrome** và máy tính) kèm proxy GTFS tự động (`api/gtfs-proxy.js` cho Vercel, `functions/api/gtfs-proxy.js` cho Cloudflare Pages, và `/api/gtfs-proxy` trên Node `server.ts`) để không bị lỗi CORS trên iPhone/Android.

---

## Cách 1: Deploy miễn phí lên Vercel (Khuyên dùng — 1 phút có link HTTPS)
1. Push thư mục dự án lên GitHub (hoặc chạy `npx vercel --prod` ngay tại `J:\KL Project`).
2. Vercel tự đọc `vercel.json`, build `dist/` và bật hàm serverless `/api/gtfs-proxy`.
3. Gửi link `https://<ten-du-an>.vercel.app` cho bạn bè:
   - **Trên iPhone (iOS Safari)**: Mở link → nhấn **Chia sẻ (Share)** → **Thêm vào Màn hình chính (Add to Home Screen)** → mở toàn màn hình như app native, hỗ trợ sẵn chỉ đường **Google Maps / Apple Maps / Waze**.
   - **Trên Android (Chrome)**: Mở link → nhấn **Cài ứng dụng (Install app)** ngay trong app hoặc từ menu Chrome.

## Cách 2: Deploy miễn phí lên Cloudflare Pages
1. Kết nối repo trên **Cloudflare Dashboard → Workers & Pages → Create → Pages**.
2. Cấu hình:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Cloudflare Pages tự động nhận hàm `functions/api/gtfs-proxy.js`.

## Cách 3: Chạy trực tiếp qua server Node (LAN / Render / Railway)
```bash
npm run build
NODE_ENV=production npm start
```
Server lắng nghe tại cổng `3000` (`http://<IP-may-tinh>:3000` trên cùng Wi-Fi hoặc domain HTTPS khi deploy lên Render/Railway).

## Mẹo chia sẻ link trực tiếp tới 1 ga cụ thể
App hỗ trợ sẵn deep-link URL:
- `https://<domain>/?station=KJ10&lang=vi` (mở thẳng bảng giờ tàu ga KLCC bằng Tiếng Việt)
- `https://<domain>/?station=KG18A&lang=en` (mở thẳng ga Bukit Bintang bằng English)
