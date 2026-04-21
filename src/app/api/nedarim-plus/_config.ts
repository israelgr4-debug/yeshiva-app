import { createClient } from '@supabase/supabase-js';

export interface NedarimConfig {
  enabled: boolean;
  apiUrl: string;
  mosadId: string;
  apiPassword: string;
}

export async function loadNedarimConfig(): Promise<NedarimConfig> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', [
      'nedarim_plus_enabled',
      'nedarim_plus_api_url',
      'nedarim_plus_mosad_id',
      'nedarim_plus_api_password',
    ]);

  if (error || !data) {
    return { enabled: false, apiUrl: '', mosadId: '', apiPassword: '' };
  }

  const byKey: Record<string, unknown> = {};
  for (const row of data) byKey[row.key] = row.value;

  return {
    enabled: Boolean(byKey['nedarim_plus_enabled'] ?? false),
    apiUrl: String(byKey['nedarim_plus_api_url'] ?? ''),
    mosadId: String(byKey['nedarim_plus_mosad_id'] ?? ''),
    apiPassword: String(byKey['nedarim_plus_api_password'] ?? ''),
  };
}
