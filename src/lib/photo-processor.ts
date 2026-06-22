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
 *  - keeps the face centered around the upper third (with a real headroom)
 *  - extends downward to include the neck/shoulders
 */
function computeCrop(face: BBox, iw: number, ih: number): { x: number; y: number; w: number; h: number } {
  // The face box covers roughly chin-to-forehead. Keep the same total
  // crop size (~2.45 × face_height → face ≈ 40% of the frame) but shift
  // the face DOWN in the frame so there's clear headroom above:
  //   - top padding    = 0.95 * face_height (extra headroom above the head)
  //   - bottom padding = 0.50 * face_height (a hint of collar)
  //   - left/right     = (target_width - face_width) / 2, centered on face
  // 4:5 portrait (standard ID/passport ratio) - slightly wider than 3:4 so
  // adult shoulders fit inside the frame without being clipped.
  const RATIO_W = 4, RATIO_H = 5;
  const topPad    = face.h * 0.95;
  const bottomPad = face.h * 0.50;
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
  const ratioW = 4, ratioH = 5; // match the main crop aspect (4:5 portrait)
  let w = iw, h = iw * (ratioH / ratioW);
  if (h > ih) { h = ih; w = h * (ratioW / ratioH); }
  const x = (iw - w) / 2;
  const y = Math.min(ih - h, ih * 0.05); // slight headroom from top
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
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
  const TARGET_H = Math.round(TARGET_W * 5 / 4); // 4:5 portrait
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

  // 3. Remove background via remove.bg server proxy.
  //    Person-optimized model + commercial-grade edges. ~3-5s per image.
  //    50 free credits/month at remove.bg - well within yeshiva volume.
  log('מסיר רקע (remove.bg)...');
  const bgFd = new FormData();
  bgFd.append('image_file', croppedBlob, 'photo.png');
  const bgRes = await fetch('/api/photo/remove-bg', { method: 'POST', body: bgFd });
  if (!bgRes.ok) {
    const err = await bgRes.text().catch(() => '');
    throw new Error(`remove.bg נכשל: ${err.slice(0, 200) || bgRes.status}`);
  }
  const noBg = await bgRes.blob();

  // 4. Reload as image + color-enhance the FOREGROUND only, THEN composite
  // over a neutral background. This order matters: analyzing after the
  // background fill would skew the histogram toward the bg color.
  log('משפר צבעים...');
  const finalImg = await loadImage(noBg);
  const fg = document.createElement('canvas');
  fg.width = finalImg.naturalWidth;
  fg.height = finalImg.naturalHeight;
  const fgCtx = fg.getContext('2d');
  if (!fgCtx) throw new Error('Canvas context unavailable');
  fgCtx.drawImage(finalImg, 0, 0);
  // No matte manipulation and no color tweaks - the histogram stretch
  // crushed dark navy fabric down to ~black/gray (lost the blue tint of
  // suits). The model's original output is colorimetrically correct.

  // Output PNG with transparency - no background composite. Lets the
  // viewer (card / certificate / wherever) decide the background.
  // Also dodges any compression artifacts that could be misread as
  // color shifts.
  const out = fg;
  const finalBlob: Blob = await new Promise((resolve) =>
    out.toBlob((b) => resolve(b!), 'image/png')
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
