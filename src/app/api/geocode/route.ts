import { NextResponse } from 'next/server';
import { formatPhotonLabel, photonReverse, photonSearch } from '@/lib/freeMaps';

// Free address search + reverse geocoding for New Zealand (no API key).
// Powered by Photon (OpenStreetMap data): https://photon.komoot.io
//
//   GET /api/geocode?q=auckland airport       -> suggestions
//   GET /api/geocode?lat=-36.84&lon=174.76     -> address for a point
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));

  try {
    if (url.searchParams.has('lat') && url.searchParams.has('lon')) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ results: [] });
      const feature = await photonReverse(lat, lon);
      const results = feature ? [{ label: formatPhotonLabel(feature), lat, lon }] : [];
      return NextResponse.json({ results });
    }

    if (q.length < 3) return NextResponse.json({ results: [] });

    const features = await photonSearch(q, 6);
    const seen = new Set<string>();
    const results = features
      .map((f) => ({ label: formatPhotonLabel(f), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      .filter((r) => {
        const key = r.label.toLowerCase();
        if (!r.label || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return NextResponse.json(
      { results },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch {
    return NextResponse.json({ results: [] });
  }
}
