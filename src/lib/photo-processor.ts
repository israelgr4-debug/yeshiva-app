/**
 * Browser-side photo processor for student/candidate portraits.
 *
 * Pipeline (when "עבד תמונה" is clicked):
 *   Single Gemini 2.5 Flash Image ("Nano Banana") call that does crop +
 *   background removal + lighting normalization + studio look in one shot.
 *
 * Server route: /api/photo/gemini-process
 * Env: GEMINI_API_KEY (Google AI Studio).
 */

export interface ProcessResult {
  blob: Blob;
  faceDetected: boolean;     // legacy field, always true now (Gemini handles framing)
  width: number;
  height: number;
  steps: string[];
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Re-encode the source image as a JPEG no larger than `maxDim` on its longest
 * side. Vercel serverless functions cap request bodies at ~4.5 MB; raw iPhone
 * shots are often 8-12 MB. Down-sampling to 2000 px keeps every photo
 * comfortably under 2 MB while still leaving more than enough detail for
 * Gemini to do the face/crop work.
 */
async function downscale(file: File | Blob, maxDim = 2000, quality = 0.85): Promise<Blob> {
  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (longest <= maxDim && file.size <= 3_500_000) {
    // Already small enough, no need to re-encode
    return file;
  }
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality)
  );
}

/**
 * Process a raw photo into a clean portrait. Calls the server route which
 * proxies to Gemini.
 */
export async function processStudentPhoto(
  file: File | Blob,
  onProgress?: (step: string) => void
): Promise<ProcessResult> {
  const steps: string[] = [];
  const log = (s: string) => { steps.push(s); onProgress?.(s); };

  log('מקטין תמונה...');
  const compact = await downscale(file);

  log('שולח ל-Gemini...');
  const fd = new FormData();
  fd.append('image_file', compact, 'photo.jpg');
  const res = await fetch('/api/photo/gemini-process', { method: 'POST', body: fd });

  if (!res.ok) {
    let err = '';
    try {
      const j = await res.json();
      err = j.error || JSON.stringify(j);
    } catch {
      err = await res.text().catch(() => '');
    }
    throw new Error(`Gemini נכשל: ${err.slice(0, 250) || res.status}`);
  }

  log('מקבל תמונה מעובדת...');
  const blob = await res.blob();

  // Read width/height for the result
  const img = await loadImage(blob);
  const out = {
    blob,
    faceDetected: true,
    width: img.naturalWidth,
    height: img.naturalHeight,
    steps,
  };
  log('הושלם');
  return out;
}
