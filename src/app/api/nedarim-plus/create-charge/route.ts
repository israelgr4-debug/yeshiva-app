import { NextRequest, NextResponse } from 'next/server';
import { loadNedarimConfig } from '../_config';

// POST /api/nedarim-plus/create-charge
// Body: NedarimChargeRequest
// Creates a recurring charge on Nedarim Plus and returns their external ID.
//
// NOTE: This is a STUB implementation. Replace the fetch() block with the real
// Nedarim Plus API call once the user provides API documentation.

export async function POST(req: NextRequest) {
  const config = await loadNedarimConfig();

  if (!config.enabled) {
    return NextResponse.json(
      {
        success: false,
        error: 'אינטגרציה עם נדרים פלוס לא מופעלת. הפעל בהגדרות.',
      },
      { status: 400 }
    );
  }

  if (!config.apiUrl || !config.mosadId || !config.apiPassword) {
    return NextResponse.json(
      {
        success: false,
        error: 'הגדרות נדרים פלוס חסרות (כתובת API / מזהה מוסד / סיסמה)',
      },
      { status: 400 }
    );
  }

  const body = await req.json();

  // ========= REAL INTEGRATION PLACEHOLDER =========
  // Expected structure for Nedarim Plus (varies by their API version):
  //
  // const response = await fetch(`${config.apiUrl}/CreateTransaction`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     Mosad: config.mosadId,
  //     ApiValid: config.apiPassword,
  //     PaymentType: 'HK', // הוראת קבע מתחדשת
  //     Amount: body.amount,
  //     PaymentsAmount: body.totalPayments ?? 0, // 0 = infinite
  //     PayerName: body.payerName,
  //     PayerPhone: body.payerPhone,
  //     PayerMail: body.payerEmail,
  //     ChargeOn: body.dayOfMonth,
  //     StartDate: body.startDate,
  //     Purpose: body.purposeDescription,
  //   }),
  // });
  // const data = await response.json();
  // if (data.Status === 'Success') {
  //   return NextResponse.json({ success: true, externalChargeId: data.TransactionId });
  // }
  // return NextResponse.json({ success: false, error: data.Message });

  // For now, return a stub response so the UI can be wired up and tested
  return NextResponse.json({
    success: false,
    error: 'API חיצוני עוד לא מחובר - נדרש תיעוד API של נדרים פלוס',
    rawResponse: { received: body, mosadId: config.mosadId },
  });
}
