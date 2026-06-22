import { NextResponse } from 'next/server';

/**
 * Diagnostic: list every Gemini model your API key can access.
 * Visit /api/photo/gemini-models in the browser to see the list.
 * Used for debugging "model not found" / "no image returned" errors.
 */
export const runtime = 'nodejs';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json({ error: text.slice(0, 500) }, { status: res.status });
  }
  const data = await res.json();
  // Compact: name, supportedGenerationMethods, displayName
  const compact = (data.models || []).map((m: any) => ({
    name: m.name,
    displayName: m.displayName,
    methods: m.supportedGenerationMethods,
    inputMods: m.inputModalities,
    outputMods: m.outputModalities,
  }));
  // Filter to image-capable models
  const imageModels = compact.filter((m: any) =>
    (m.outputMods || []).some((x: string) => /image/i.test(x)) ||
    /image/i.test(m.name || '') ||
    /image/i.test(m.displayName || '')
  );
  return NextResponse.json({
    total: compact.length,
    imageCapable: imageModels,
    all: compact,
  });
}
