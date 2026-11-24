// Free, key-less map helpers (server-side only).
// - Geocoding: Photon (OpenStreetMap)  https://photon.komoot.io
// - Routing:   OSRM public servers      https://project-osrm.org
// Public servers are fair-use; results are cached by the API routes.

const NZ_BBOX = '166,-47.5,179.5,-34'; // minLon,minLat,maxLon,maxLat
const USER_AGENT = 'TaxiBookingSite/1.0';

export type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    countrycode?: string;
  };
};

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return (await res.json()) as T;
}

export async function photonSearch(q: string, limit = 6): Promise<PhotonFeature[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit + 4));
  url.searchParams.set('lang', 'en');
  url.searchParams.set('bbox', NZ_BBOX);
  // Bias results towards Auckland.
  url.searchParams.set('lat', '-36.85');
  url.searchParams.set('lon', '174.76');
  const data = await fetchJson<{ features?: PhotonFeature[] }>(url.toString());
  return (data.features || []).filter((f) => f.properties.countrycode === 'NZ').slice(0, limit);
}

export async function photonReverse(lat: number, lon: number): Promise<PhotonFeature | null> {
  const url = new URL('https://photon.komoot.io/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('lang', 'en');
  const data = await fetchJson<{ features?: PhotonFeature[] }>(url.toString());
  return data.features?.[0] || null;
}

export function formatPhotonLabel(f: PhotonFeature): string {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [p.name, street, p.locality || p.district, p.city, p.state].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((u) => u.toLowerCase() === part.toLowerCase())) unique.push(part);
  }
  return unique.join(', ');
}

const OSRM_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
];

export type RouteResult = { distanceMeters: number; durationSeconds: number; approximate: boolean };

export async function drivingRoute(from: [number, number], to: [number, number]): Promise<RouteResult> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`; // lon,lat;lon,lat
  for (const base of OSRM_SERVERS) {
    try {
      const data = await fetchJson<{ code?: string; routes?: { distance: number; duration: number }[] }>(
        `${base}/${coords}?overview=false`,
        8000,
      );
      const route = data.routes?.[0];
      if (data.code === 'Ok' && route) {
        return { distanceMeters: route.distance, durationSeconds: route.duration, approximate: false };
      }
    } catch {
      // try next server
    }
  }

  // Last resort: straight-line distance × road factor, ~50 km/h average.
  const straight = haversineMeters(from, to);
  const distanceMeters = straight * 1.3;
  return { distanceMeters, durationSeconds: (distanceMeters / 1000 / 50) * 3600, approximate: true };
}

function haversineMeters([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number) {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (!h) return `${m} mins`;
  return m ? `${h} hours ${m} mins` : `${h} hours`;
}
