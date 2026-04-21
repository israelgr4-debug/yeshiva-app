import { NextRequest, NextResponse } from 'next/server';
import { loadNedarimConfig } from '../_config';

// POST /api/nedarim-plus/cancel-charge
// Body: { externalChargeId, reason? }
// Cancels a recurring charge at Nedarim Plus.
//
// STUB - replace with real API call.

export async function POST(req: NextRequest) {
  const config = await loadNedarimConfig();

  if (!config.enabled) {
    return NextResponse.json(
      { success: false, error: 'אינטגרציה עם נדרים פלוס לא מופעלת' },
      { status: 400 }
    );
  }

  const body = await req.json();

  if (!body.externalChargeId) {
    return NextResponse.json(
      { success: false, error: 'חסר externalChargeId' },
      { status: 400 }
    );
  }

  // ========= REAL INTEGRATION PLACEHOLDER =========
  // const response = await fetch(`${config.apiUrl}/CancelTransaction`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     Mosad: config.mosadId,
  //     ApiValid: config.apiPassword,
  //     TransactionId: body.externalChargeId,
  //     Reason: body.reason,
  //   }),
  // });
  // const data = await response.json();
  // return NextResponse.json({ success: data.Status === 'Success', error: data.Message });

  return NextResponse.json({
    success: false,
    error: 'API חיצוני עוד לא מחובר - נדרש תיעוד API של נדרים פלוס',
  });
}
