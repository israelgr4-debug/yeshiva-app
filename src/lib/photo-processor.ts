/**
 * Browser-side photo processor for student/candidate portraits.
 *
 * Pipeline (when "עבד תמונה" is clicked):
 *   1. Face detection (face-api.js, TinyFaceDetector) → bounding box
 *   2. Smart crop around face + neck at 3:4 portrait ratio
 *   3. Background removal (@imgly/background-removal) → transparent PNG
 *   4. Auto color enhancement (brightness + contrast histogram stretch)
 *
 * All client-side, all free. Models load lazily from CDN on first use,
 * cached by the browser thereafter (~10-20 MB for face-api, ~50 MB for
 * background removal model).
 */

import * as faceapi from '@vladmandic/face-api';
import { removeBackground } from '@imgly/background-removal';

const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

let faceModelsLoaded = false;
async function ensureFaceModels() {
  if (faceModelsLoaded) return;
  await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
  faceModelsLoaded = true;
}

interface BBox { x: number; y: number; w: number; h: number; }

async function detectFaceBox(image: HTMLImageElement): Promise<BBox | null> {
  await ensureFaceModels();
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 512,
    scoreThreshold: 0.3,
  });
  const detection = await faceapi.detectSingleFace(image, options);
  if (!detection) return null;
  const b = detection.box;
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

/**
 * Given a face bbox in an image of (iw, ih), return a 3:4 portrait crop that:
 *  - keeps the face in the upper third
 *  - extends downward to include the neck/shoulders
 *  - extends upward to leave a small headroom
 */
function computeCrop(face: BBox, iw: number, ih: number): { x: number; y: number; w: number; h: number } {
  // The face box covers roughly chin-to-forehead. We want:
  //   - top padding  = 0.5 * face_height (forehead + a bit of headroom)
  //   - bottom padding = 1.2 * face_height (neck + collar)
  //   - left/right    = (target_width - face_width) / 2, centered on face
  // Target ratio is 3:4 (width:height).
  const RATIO_W = 3, RATIO_H = 4;
  const topPad    = face.h * 0.55;
  const bottomPad = face.h * 1.20;
  const cropH = face.h + topPad + bottomPad;
  const cropW = cropH * (RATIO_W / RATIO_H);

  const faceCenterX = face.x + face.w / 2;
  let x = faceCenterX - cropW / 2;
  let y = face.y - topPad;

  // Clamp to image bounds while preserving the ratio.
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + cropW > iw) x = iw - cropW;
  if (y + cropH > ih) y = ih - cropH;

  // If the image is smaller than the desired crop, shrink the crop to fit.
  let w = cropW, h = cropH;
  if (w > iw) { w = iw; h = w * (RATIO_H / RATIO_W); }
  if (h > ih) { h = ih; w = h * (RATIO_W / RATIO_H); }
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > iw) x = iw - w;
  if (y + h > ih) y = ih - h;

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Fallback: crop center-top 3:4 when no face is detected. */
function fallbackCrop(iw: number, ih: number) {
  const ratioW = 3, ratioH = 4;
  let w = iw, h = iw * (ratioH / ratioW);
  if (h > ih) { h = ih; w = h * (ratioW / ratioH); }
  const x = (iw - w) / 2;
  const y = Math.min(ih - h, ih * 0.05); // slight headroom from top
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Auto color enhancement: simple histogram stretch + slight saturation boost. */
function autoEnhance(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;

  // Find 1st and 99th percentiles of luminance for stretch
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip transparent pixels
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    hist[lum]++;
  }
  const totalOpaque = hist.reduce((a, b) => a + b, 0);
  if (totalOpaque === 0) return;
  const loCut = totalOpaque * 0.01;
  const hiCut = totalOpaque * 0.99;
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= loCut) { lo = i; break; } }
  acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= hiCut) { hi = i; break; } }
  if (hi <= lo) { lo = 0; hi = 255; }
  const scale = 255 / (hi - lo);

  // Apply stretch + light saturation boost (×1.10)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = (data[i] - lo) * scale;
    let g = (data[i + 1] - lo) * scale;
    let b = (data[i + 2] - lo) * scale;
    // Saturation boost: blend toward grayscale less
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    const sat = 1.10;
    r = gray + (r - gray) * sat;
    g = gray + (g - gray) * sat;
    b = gray + (b - gray) * sat;
    data[i]     = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
  ctx.putImageData(img, 0, 0);
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

export interface ProcessResult {
  blob: Blob;
  faceDetected: boolean;
  width: number;
  height: number;
  steps: string[];
}

/**
 * Run the full pipeline on a File/Blob. Returns a processed PNG Blob.
 * onProgress is called with strings like 'מזהה פנים...', 'מסיר רקע...'.
 */
export async function processStudentPhoto(
  file: File | Blob,
  onProgress?: (step: string) => void
): Promise<ProcessResult> {
  const steps: string[] = [];
  const log = (s: string) => { steps.push(s); onProgress?.(s); };

  // 1. Detect face
  log('מזהה פנים...');
  const img = await loadImage(file);
  const face = await detectFaceBox(img).catch(() => null);

  // 2. Smart crop
  log(face ? 'חותך לפי פנים...' : 'חותך מרכזי (לא זוהו פנים)...');
  const crop = face ? computeCrop(face, img.naturalWidth, img.naturalHeight)
                    : fallbackCrop(img.naturalWidth, img.naturalHeight);

  // Output canvas at max 1200px wide (3:4)
  const TARGET_W = Math.min(1200, crop.w);
  const TARGET_H = Math.round(TARGET_W * 4 / 3);
  const c = document.createElement('canvas');
  c.width = TARGET_W;
  c.height = TARGET_H;
  const cx = c.getContext('2d');
  if (!cx) throw new Error('Canvas context unavailable');
  cx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, TARGET_W, TARGET_H);

  // Get cropped blob to feed into background removal
  const croppedBlob: Blob = await new Promise((resolve) =>
    c.toBlob((b) => resolve(b!), 'image/png')
  );

  // 3. Remove background
  log('מסיר רקע (עשוי לקחת כמה שניות)...');
  const noBg = await removeBackground(croppedBlob, {
    output: { format: 'image/png', quality: 0.95 },
  });

  // 4. Reload as image + run color enhancement
  log('משפר צבעים...');
  const finalImg = await loadImage(noBg);
  const out = document.createElement('canvas');
  out.width = finalImg.naturalWidth;
  out.height = finalImg.naturalHeight;
  const ox = out.getContext('2d');
  if (!ox) throw new Error('Canvas context unavailable');
  // Light gray background for the transparent areas (better for prints)
  ox.fillStyle = '#f5f5f5';
  ox.fillRect(0, 0, out.width, out.height);
  ox.drawImage(finalImg, 0, 0);
  autoEnhance(out);

  const finalBlob: Blob = await new Promise((resolve) =>
    out.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
  );

  log('הושלם');
  return {
    blob: finalBlob,
    faceDetected: !!face,
    width: out.width,
    height: out.height,
    steps,
  };
}
