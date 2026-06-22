import { NextRequest, NextResponse } from 'next/server';

/**
 * Server proxy for remove.bg API. Free tier: 50 images/month.
 * Body: multipart form with `image_file` (Blob from the browser-side crop).
 * Returns: PNG bytes with transparent background.
 *
 * Keeps the API key on the server so client-side users can't spend our credits.
 *
 * Env: REMOVE_BG_API_KEY  (sign up at https://www.remove.bg/api)
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'REMOVE_BG_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  const incoming = await req.formData();
  const file = incoming.get('image_file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'image_file missing' }, { status: 400 });
  }
  // Optional background color (hex without #). Default = transparent.
  const bgColor = (incoming.get('bg_color') as string) || '';

  const fd = new FormData();
  fd.append('image_file', file, 'photo.png');
  fd.append('size', 'auto');
  fd.append('type', 'person'); // optimized for portraits → much cleaner edges
  fd.append('format', 'png');
  if (bgColor) fd.append('bg_color', bgColor);

  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `remove.bg ${res.status}: ${text.slice(0, 300)}` },
      { status: res.status }
    );
  }

  const buf = await res.arrayBuffer();
  // Pass through the rate-limit info so the UI can warn when credits get low
  const headers: Record<string, string> = { 'Content-Type': 'image/png' };
  const credits = res.headers.get('X-Credits-Charged');
  if (credits) headers['X-Credits-Charged'] = credits;
  return new NextResponse(buf, { status: 200, headers });
}
