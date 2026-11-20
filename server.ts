import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { gtfsService } from './server/gtfsService.ts';
import type { BusCategory } from './src/types/transit.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // Warm up official Malaysia GTFS Static caches in the background
  gtfsService.warmup();

  // API: Complete Rapid KL rail network (lines, shapes, stations, interchanges)
  app.get('/api/transit/rail', async (_req, res) => {
    try {
      const payload = await gtfsService.getRailNetwork();
      res.json(payload);
    } catch (err) {
      console.error('[API /rail] Error:', err);
      res.status(502).json({
        error: 'Không thể tải dữ liệu đường sắt từ api.data.gov.my. Vui lòng thử lại.',
      });
    }
  });

  // API: Live station arrival countdowns (MYT UTC+8) + optional custom time preview
  app.get('/api/transit/station/:stopId/departures', async (req, res) => {
    try {
      const { stopId } = req.params;
      const time = typeof req.query.time === 'string' ? req.query.time : undefined;
      const day = typeof req.query.day === 'string' ? req.query.day : undefined;

      const payload = await gtfsService.getStationDepartures(stopId, { time, day });
      if (!payload) {
        res.status(404).json({ error: `Không tìm thấy ga với mã "${stopId}".` });
        return;
      }
      res.json(payload);
    } catch (err) {
      console.error('[API /station/departures] Error:', err);
      res.status(502).json({
        error: 'Không thể tính giờ tàu cho ga này. Vui lòng thử lại.',
      });
    }
  });

  // API: Live GPS bus positions decoded from GTFS-Realtime Protobuf
  app.get('/api/transit/buses/live', async (req, res) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const route = typeof req.query.route === 'string' ? req.query.route : undefined;
      const force = req.query.force === '1' || req.query.force === 'true';

      const payload = await gtfsService.getLiveBuses({ category, route, force });
      res.json(payload);
    } catch (err) {
      console.error('[API /buses/live] Error:', err);
      res.status(502).json({
        error: 'Không thể kết nối luồng GPS xe bus trực tiếp từ api.data.gov.my.',
      });
    }
  });

  // API: Detailed bus route polyline + stops + live vehicles on that route
  app.get('/api/transit/buses/route/:category/:routeId', async (req, res) => {
    try {
      const category = req.params.category as BusCategory;
      if (category !== 'rapid-bus-kl' && category !== 'rapid-bus-mrtfeeder') {
        res.status(400).json({ error: 'Danh mục xe bus không hợp lệ.' });
        return;
      }
      const routeId = req.params.routeId;
      const tripId = typeof req.query.tripId === 'string' ? req.query.tripId : undefined;
      const payload = await gtfsService.getBusRouteDetail(category, routeId, tripId);
      if (!payload) {
        res.status(404).json({ error: `Không tìm thấy lộ trình cho tuyến "${routeId}".` });
        return;
      }
      res.json(payload);
    } catch (err) {
      console.error('[API /buses/route] Error:', err);
      res.status(502).json({
        error: 'Không thể tải lộ trình tuyến xe bus. Vui lòng thử lại.',
      });
    }
  });

  // API: Nearest MRT/LRT/Monorail stations and Rapid KL bus stops from user GPS coordinates
  app.get('/api/transit/nearby', async (req, res) => {
    try {
      const lat = Number.parseFloat(String(req.query.lat ?? ''));
      const lon = Number.parseFloat(String(req.query.lon ?? ''));
      const limit = Number.parseInt(String(req.query.limit ?? '6'), 10) || 6;

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        res.status(400).json({ error: 'Tọa độ GPS không hợp lệ.' });
        return;
      }

      const payload = await gtfsService.getNearbyTransit(lat, lon, limit);
      res.json(payload);
    } catch (err) {
      console.error('[API /nearby] Error:', err);
      res.status(502).json({
        error: 'Không thể tìm bến tàu/xe bus gần vị trí của bạn.',
      });
    }
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: false,
        hmr: false,
      },
      appType: 'spa',
    });

    // Preserve all @vite/client exports and HMR send/connect lifecycle (needed by vite-plugin-pwa)
    // while replacing the underlying WebSocket transport with a clean no-op in reverse-proxy mode.
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const transformed = await vite.transformRequest('/@vite/client');
        if (!transformed?.code) {
          next();
          return;
        }
        const safeCode = transformed.code.replace(
          /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
          'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });'
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(safeCode);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`KL Transit Live server listening on http://localhost:${PORT}`);
  });
}

startServer();
