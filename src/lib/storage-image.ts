// Supabase Storage image helper: turn a public object URL into a lightweight
// transformed thumbnail so photo-heavy reports load fast (and print fully).
// Falls back to the original URL if image transformations aren't enabled
// (callers should keep an onError → original fallback).

export function storageThumbUrl(
  url: string | null | undefined,
  width: number,
  height: number,
  quality = 70
): string {
  const u = String(url || '');
  const marker = '/storage/v1/object/public/';
  if (!u.includes(marker)) return u; // not a Supabase public object URL
  const base = u.split('?')[0].replace(marker, '/storage/v1/render/image/public/');
  return `${base}?width=${width}&height=${height}&resize=cover&quality=${quality}`;
}
