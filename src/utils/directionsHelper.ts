import type { UserLocation } from '../types/transit';
import { haversineKm } from './transitHelpers';

export type TravelMode = 'walking' | 'transit' | 'driving' | 'bicycling';

export interface DirectionsTarget {
  name: string;
  subtitle?: string;
  badge?: string;
  color?: string;
  lat: number;
  lon: number;
  kind: 'rail' | 'bus-stop' | 'bus-live';
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Builds an official Google Maps Directions deep link pre-filled with
 * From (user GPS coordinates when available) -> To (target station/bus stop coordinates)
 * and selected travel mode (walking, transit, driving, bicycling).
 */
export function buildGoogleMapsDirectionsUrl(
  origin: UserLocation | null,
  target: DirectionsTarget,
  travelMode: TravelMode
): string {
  const params = new URLSearchParams();
  params.set('api', '1');
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    params.set('origin', `${origin.lat.toFixed(6)},${origin.lon.toFixed(6)}`);
  }
  params.set('destination', `${target.lat.toFixed(6)},${target.lon.toFixed(6)}`);
  params.set('travelmode', travelMode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Builds an Apple Maps Directions URL (ideal for iOS Safari / PWA users).
 */
export function buildAppleMapsDirectionsUrl(
  origin: UserLocation | null,
  target: DirectionsTarget,
  travelMode: TravelMode
): string {
  const dirflg = travelMode === 'walking' ? 'w' : travelMode === 'transit' ? 'r' : 'd';
  const params = new URLSearchParams();
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lon)) {
    params.set('saddr', `${origin.lat.toFixed(6)},${origin.lon.toFixed(6)}`);
  }
  params.set('daddr', `${target.lat.toFixed(6)},${target.lon.toFixed(6)}`);
  params.set('dirflg', dirflg);
  return `https://maps.apple.com/?${params.toString()}`;
}

/**
 * Builds a Waze navigation deep link (widely used in Kuala Lumpur / Malaysia).
 */
export function buildWazeUrl(target: DirectionsTarget): string {
  return `https://waze.com/ul?ll=${target.lat.toFixed(6)},${target.lon.toFixed(6)}&navigate=yes`;
}

export function estimateTravelMinutes(
  origin: UserLocation | null,
  target: DirectionsTarget,
  mode: TravelMode
): { distanceKm: number; minutes: number } | null {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) return null;
  const straightKm = haversineKm(origin.lat, origin.lon, target.lat, target.lon);
  // Road factor ~1.28x straight line in urban KL
  const roadKm = straightKm * 1.28;
  const speedKmh =
    mode === 'walking' ? 4.6 : mode === 'bicycling' ? 14 : mode === 'transit' ? 24 : 28;
  const minutes = Math.max(1, Math.round((roadKm / speedKmh) * 60));
  return { distanceKm: straightKm, minutes };
}

export function openExternalMapUrl(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
