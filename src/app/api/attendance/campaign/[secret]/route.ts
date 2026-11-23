import { NextRequest } from 'next/server';
import { handleCampaignWebhook } from '@/lib/attendance-campaign';

// ימות POSTs here after every call of the robot's campaign (form-data; see
// lib/attendance-campaign.ts). The link is written into the template's ini by the settings tab.

export const maxDuration = 30;

async function bodyParams(req: NextRequest): Promise<URLSearchParams> {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('multipart/form-data')) {
      (await req.formData()).forEach((v, k) => { if (typeof v === 'string') params.append(k, v); });
    } else if (type.includes('application/json')) {
      const j = await req.json();
      if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) params.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    } else {
      new URLSearchParams(await req.text()).forEach((v, k) => params.append(k, v));
    }
  } catch { /* an unreadable body is logged as empty */ }
  return params;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  return handleCampaignWebhook(secret, await bodyParams(req));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  return handleCampaignWebhook(secret, new URLSearchParams(req.nextUrl.searchParams));
}
