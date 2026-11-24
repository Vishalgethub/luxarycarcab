import { NextResponse } from 'next/server';
import { drivingRoute, formatDistance, formatDuration, photonSearch } from '@/lib/freeMaps';

// Free driving distance/duration between two NZ addresses (no API key).
//   GET /api/route?from=<address>&to=<address>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();
  if (!from || !to) return NextResponse.json({ error: 'from and to are required' }, { status: 400 });

  try {
    const [a, b] = await Promise.all([photonSearch(from, 1), photonSearch(to, 1)]);
    if (!a[0] || !b[0]) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    const route = await drivingRoute(a[0].geometry.coordinates, b[0].geometry.coordinates);
    return NextResponse.json(
      {
        distanceText: formatDistance(route.distanceMeters),
        durationText: formatDuration(route.durationSeconds),
        approximate: route.approximate,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch {
    return NextResponse.json({ error: 'Distance unavailable' }, { status: 502 });
  }
}
