import { NextRequest, NextResponse } from 'next/server';
import { loadNedarimConfig } from '../_config';

// GET /api/nedarim-plus/collected?from=YYYY-MM-DD
// Pulls a list of successful payments from Nedarim Plus since a given date.
//
// STUB - replace with real API call.

export async function GET(req: NextRequest) {
  const config = await loadNedarimConfig();

  if (!config.enabled) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');

  if (!from) {
    return NextResponse.json({ error: 'Missing from parameter' }, { status: 400 });
  }

  // ========= REAL INTEGRATION PLACEHOLDER =========
  // const response = await fetch(`${config.apiUrl}/GetTransactions?from=${from}`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ Mosad: config.mosadId, ApiValid: config.apiPassword }),
  // });
  // const data = await response.json();
  // return NextResponse.json(data.Transactions.map(mapToNotification));

  return NextResponse.json([]);
}
