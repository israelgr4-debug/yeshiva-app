import { NextRequest, NextResponse } from 'next/server';

/**
 * Server proxy for Google Gemini 2.5 Flash Image ("Nano Banana") - portrait
 * processing in a single multimodal call. Cropping + bg removal + lighting
 * normalization + studio look, all in one prompt.
 *
 * Body: multipart form with `image_file` (Blob from the browser).
 * Returns: PNG bytes of the processed portrait.
 *
 * Free tier (Google AI Studio) covers our yeshiva volume (~150/year). Past
 * that, ~$0.04/image. Sign up at https://aistudio.google.com/apikey.
 *
 * Env: GEMINI_API_KEY
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

// Only image-EDIT capable models. Other Gemini flash models accept image
// input but can't return image output. Order matters - first available wins.
const CANDIDATE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
];
const urlFor = (m: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

// English prompt - image-edit models follow English instructions much more
// reliably than Hebrew (the model is multilingual but its image-editing
// fine-tuning is heavily English-biased).
const PROMPT = `
Edit this portrait photo of a person into a clean ID-card style headshot:

1. CROP to a 4:5 portrait of head and shoulders. The face should fill roughly
   40-50% of the frame height, with comfortable headroom above the head.
2. REPLACE the original background with a clean, uniform light-gray studio
   backdrop (hex color #E5E7EB). Make sure no traces of the original
   background remain - especially along hair, collar, and shoulders.
3. NORMALIZE the lighting on the face and clothing so it appears evenly lit
   from both sides. If one side is in shadow, brighten it. If one side is
   blown-out, tone it down. The goal is a balanced studio look.
4. PRESERVE the true clothing colors exactly. A navy suit must remain navy.
   A black suit must remain black. A white shirt must remain white. Do not
   shift any colors to gray.
5. PRESERVE the subject's facial identity, features, hair, glasses, and
   expression EXACTLY. Do not alter the face.

Return only the edited image. No text.
`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY not configured on the server' },
      { status: 500 }
    );
  }

  const incoming = await req.formData();
  const file = incoming.get('image_file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'image_file missing' }, { status: 400 });
  }

  // Convert the uploaded image to base64 (Gemini wants inline data)
  const buf = await file.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  const mimeType = file.type || 'image/png';

  const geminiReq = {
    contents: [
      {
        parts: [
          { text: PROMPT.trim() },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      // Both TEXT and IMAGE - the image-edit models require BOTH modalities,
      // not just IMAGE. With IMAGE-only the API returns no image at all.
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.4, // low randomness - we want a faithful edit, not a creative riff
    },
  };

  // Try each candidate model until one works (model IDs change occasionally).
  let res: Response | null = null;
  let lastError = '';
  let modelUsed = '';
  for (const model of CANDIDATE_MODELS) {
    try {
      const attempt = await fetch(`${urlFor(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiReq),
      });
      if (attempt.ok) {
        res = attempt;
        modelUsed = model;
        break;
      }
      // 404 = wrong model name - try the next one. Any other error = stop.
      if (attempt.status === 404) {
        lastError = `${model}: 404 not found`;
        continue;
      }
      const text = await attempt.text().catch(() => '');
      return NextResponse.json(
        { error: `Gemini ${attempt.status} (${model}): ${text.slice(0, 400)}` },
        { status: attempt.status }
      );
    } catch (e: any) {
      lastError = `${model}: ${e?.message || e}`;
    }
  }
  if (!res) {
    return NextResponse.json(
      { error: 'אף מודל של Gemini לא זמין בחשבון שלך. נסיתי: ' + CANDIDATE_MODELS.join(', ') + '. שגיאה אחרונה: ' + lastError },
      { status: 502 }
    );
  }
  void modelUsed; // could be returned in headers for debugging

  const json = await res.json().catch(() => null);
  // Locate the first inline_data part with an image mime type
  const parts = json?.candidates?.[0]?.content?.parts || [];
  let outBase64: string | null = null;
  let outMime = 'image/png';
  for (const p of parts) {
    const inline = p.inline_data || p.inlineData;
    if (inline?.data && (inline.mime_type || inline.mimeType || '').startsWith('image/')) {
      outBase64 = inline.data;
      outMime = inline.mime_type || inline.mimeType || 'image/png';
      break;
    }
  }
  if (!outBase64) {
    // Surface what Gemini DID return (often a refusal explanation)
    const textPart = parts.find((p: any) => typeof p.text === 'string')?.text;
    const finishReason = json?.candidates?.[0]?.finishReason;
    const safety = json?.candidates?.[0]?.safetyRatings;
    return NextResponse.json(
      {
        error:
          'Gemini לא החזיר תמונה. ' +
          (textPart ? `הודעת המודל: ${String(textPart).slice(0, 300)}` :
            `סיבת סיום: ${finishReason || 'לא ידוע'}`),
        details: { finishReason, safety, model: modelUsed },
      },
      { status: 502 }
    );
  }

  const outBuf = Buffer.from(outBase64, 'base64');
  return new NextResponse(outBuf, {
    status: 200,
    headers: { 'Content-Type': outMime, 'X-Gemini-Model': modelUsed },
  });
}
