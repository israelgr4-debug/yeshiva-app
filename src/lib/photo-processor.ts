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
 * Process a raw photo into a clean portrait. Calls the server route which
 * proxies to Gemini.
 */
export async function processStudentPhoto(
  file: File | Blob,
  onProgress?: (step: string) => void
): Promise<ProcessResult> {
  const steps: string[] = [];
  const log = (s: string) => { steps.push(s); onProgress?.(s); };

  log('שולח ל-Gemini...');

  const fd = new FormData();
  fd.append('image_file', file, 'photo.png');
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
