import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', url);
console.log('Anon key:', anonKey ? `${anonKey.slice(0, 20)}...` : 'MISSING');
console.log('Service key:', serviceKey ? 'present' : 'missing');
console.log('---');

async function check(label, client) {
  console.log(`\n[${label}]`);
  const tables = ['students', 'families', 'graduates', 'shiurim'];
  for (const t of tables) {
    const start = Date.now();
    const { count, error, status } = await client
      .from(t)
      .select('*', { count: 'exact', head: true });
    const ms = Date.now() - start;
    if (error) {
      console.log(`  ${t}: ERROR (status ${status}, ${ms}ms) - ${error.message}`);
    } else {
      console.log(`  ${t}: count=${count} (${ms}ms)`);
    }
  }

  const { data, error } = await client.from('students').select('id').limit(1);
  if (error) console.log(`  sample students rows: error - ${error.message}`);
  else console.log(`  sample students rows returned: ${data.length}`);
}

const anon = createClient(url, anonKey);

const ping = Date.now();
try {
  const r = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  console.log(`REST ping: HTTP ${r.status} (${Date.now() - ping}ms)`);
} catch (e) {
  console.log(`REST ping FAILED: ${e.message}`);
}

await check('anon', anon);

if (serviceKey) {
  await check('service_role', createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
} else {
  console.log('\n(skipping service_role check - no SUPABASE_SERVICE_ROLE_KEY env var)');
}
