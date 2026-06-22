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

// Model name has changed a few times. Try them in order until one works.
const CANDIDATE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp',
];
const urlFor = (m: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

const PROMPT = `
תפקיד: עורך תמונות לכרטיסי תלמיד ישיבה.

עבד את התמונה כך:
1. חתוך לפורטרט "ראש + כתפיים" - הפנים תופסות כ-40-50% מגובה התמונה, עם מרווח קל מעל הראש.
2. הסר את הרקע המקורי לחלוטין והחלף ברקע סטודיו אפור-בהיר אחיד צבע #E5E7EB.
3. נרמל את התאורה בפנים ובבגדים כך שתהיה אחידה משני הצדדים (אם צד אחד היה בצל - תאיר אותו, אם צד אחד נשטף - תרגיע).
4. שמור על צבעי הבגדים האמיתיים בדיוק (חליפה נייבי תישאר נייבי, חולצה לבנה תישאר לבנה).
5. שמור על מאפייני הפנים בדיוק - אותה זהות.
6. יחס מסך: 4:5 פורטרט (רוחב:גובה).

החזר רק את התמונה המעובדת, ללא טקסט.
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
      // Image-output models accept TEXT and IMAGE response modalities
      responseModalities: ['IMAGE'],
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
    return NextResponse.json(
      { error: 'Gemini לא החזיר תמונה. Response: ' + JSON.stringify(json).slice(0, 300) },
      { status: 502 }
    );
  }

  const outBuf = Buffer.from(outBase64, 'base64');
  return new NextResponse(outBuf, {
    status: 200,
    headers: { 'Content-Type': outMime },
  });
}
