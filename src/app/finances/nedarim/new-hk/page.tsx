'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { supabase } from '@/lib/supabase';

const MOSAD = process.env.NEXT_PUBLIC_NEDARIM_MOSAD_ID || '';
const API_VALID = process.env.NEXT_PUBLIC_NEDARIM_API_VALID || '';
const DAYS = ['1', '5', '10', '15', '20', '25', '28'];

interface StudentLite { first_name: string; last_name: string; family_id: string | null; }
interface FamilyLite { family_name: string; father_name: string | null; father_phone: string | null; father_id_number: string | null; }

function NewHkInner() {
  const params = useSearchParams();
  const studentId = params.get('student') || '';
  // tuition split: the HK is for an ADDITIONAL payer of the student (his own card and details)
  const payerId = params.get('payer') || '';
  const [payer, setPayer] = useState<{ payer_name: string; payer_relation: string | null; payer_id_number: string | null; payer_phone: string | null } | null>(null);
  const [student, setStudent] = useState<StudentLite | null>(null);
  const [family, setFamily] = useState<FamilyLite | null>(null);
  const [amount, setAmount] = useState(params.get('amount') || '');
  const [day, setDay] = useState('20');
  const [zeout, setZeout] = useState('');
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stateRef = useRef({ studentId, payerId, payer, amount, zeout, familyId, family: null as FamilyLite | null, student: null as StudentLite | null });
  stateRef.current = { studentId, payerId, payer, amount, zeout, familyId, family, student };

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const { data: st } = await supabase.from('students').select('first_name, last_name, family_id').eq('id', studentId).maybeSingle();
      setStudent(st as StudentLite);
      if (st?.family_id) {
        setFamilyId(st.family_id);
        const { data: fam } = await supabase.from('families').select('family_name, father_name, father_phone, father_id_number').eq('id', st.family_id).maybeSingle();
        setFamily(fam as FamilyLite);
        if (!payerId) setZeout((fam?.father_id_number || '').toString());
      }
      if (payerId) {
        const { data: p } = await supabase.from('tuition_extra_payers')
          .select('payer_name, payer_relation, payer_id_number, payer_phone').eq('id', payerId).maybeSingle();
        if (p) { setPayer(p as any); setZeout((p.payer_id_number || '').toString()); }
      }
    })();
  }, [studentId, payerId]);

  const post = (d: any) => frameRef.current?.contentWindow?.postMessage(d, '*');

  // Register the iframe message listener + load the iframe — exactly once.
  useEffect(() => {
    const onMsg = async (event: MessageEvent) => {
      const data: any = event.data;
      if (!data || !data.Name) return;
      if (data.Name === 'Height') {
        if (frameRef.current) frameRef.current.style.height = (parseInt(data.Value) + 15) + 'px';
      } else if (data.Name === 'TransactionResponse') {
        const val = data.Value || {};
        if (val.Status === 'Error') {
          setStatus('שגיאה: ' + (val.Message || 'לא ידוע'));
          setBusy(false);
          return;
        }
        // Success — link the newly-created HK to the student.
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch('/api/nedarim/link-new-hk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
            body: JSON.stringify({ student_id: stateRef.current.studentId, payer_id: stateRef.current.payerId || undefined, keva_id: val.ID, amount: Number(stateRef.current.amount) || undefined, father_id: (stateRef.current.zeout || '').replace(/\D/g, '') || undefined }),
          });
          const j = await res.json();
          if (j.ok) { setDone(true); setStatus(stateRef.current.payerId ? '✓ ההו״ק הוקמה וקושרה למשלם הנוסף' : '✓ ההו״ק הוקמה וקושרה לתלמיד בהצלחה'); }
          else setStatus(`ההו״ק הוקמה (KevaId ${val.ID}) אך הקישור נכשל: ${j.error || ''}`);
        } catch (e: any) {
          setStatus(`ההו״ק הוקמה — שגיאת קישור: ${e?.message || e}`);
        }
        setBusy(false);
      }
    };
    window.addEventListener('message', onMsg);
    const f = frameRef.current;
    if (f) { f.onload = () => post({ Name: 'GetHeight' }); f.src = 'https://www.matara.pro/nedarimplus/iframe/'; }
    return () => window.removeEventListener('message', onMsg);
  }, []); // eslint-disable-line

  const submit = () => {
    if (!MOSAD || !API_VALID) { setStatus('חסרים מפתחות נדרים בהגדרות (NEXT_PUBLIC_NEDARIM_MOSAD_ID / API_VALID)'); return; }
    if (!amount || Number(amount) <= 0) { setStatus('הזן סכום חודשי'); return; }
    const f = stateRef.current.family, s = stateRef.current.student, pr = stateRef.current.payer;
    if (stateRef.current.payerId && !pr) { setStatus('פרטי המשלם הנוסף לא נטענו — רענן את הדף'); return; }
    setBusy(true); setStatus('מבצע הקמה…');
    post({ Name: 'FinishTransaction2', Value: {
      Mosad: MOSAD, ApiValid: API_VALID, PaymentType: 'HK', Currency: '1',
      // an additional payer: the donor card in Nedarim is HIS (name, ת"ז, phone), not the father's
      Zeout: (stateRef.current.zeout || (pr ? pr.payer_id_number : f?.father_id_number) || '').replace(/\D/g, ''),
      FirstName: pr ? '' : (f?.father_name || ''), LastName: pr ? pr.payer_name : (f?.family_name || s?.last_name || ''),
      Street: '', City: '', Phone: ((pr ? pr.payer_phone : f?.father_phone) || '').replace(/\D/g, ''), Mail: '',
      Amount: String(Number(amount)), Tashlumim: '', Day: String(day),
      Groupe: 'שכר לימוד', Comment: '', Param1: '', Param2: '',
      ForceUpdateMatching: '', ThirdPartyReceipt: '', CallBack: '', CallBackMailError: '', Tokef: '',
    }});
  };

  return (
    <>
      <Header title="הקמת הו״ק אשראי" subtitle="נדרים — הזנת כרטיס בתוך התוכנה" />
      <div className="p-4 md:p-8 max-w-xl space-y-4">
        <Link href={studentId ? `/students/${studentId}` : '/finances'}><Button variant="ghost">← חזרה</Button></Link>

        <Card><CardContent className="space-y-4">
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm">
            <div className="font-semibold">{student ? `${student.last_name} ${student.first_name}` : 'טוען…'}</div>
            <div className="text-slate-500 text-xs">
              {family ? `${family.family_name} ${family.father_name || ''} · ${family.father_phone || 'ללא טלפון'} · ת"ז ${family.father_id_number || '—'}` : ''}
            </div>
          </div>
          {payerId && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-sm text-indigo-900">
              👥 הו״ק של <b>משלם נוסף</b>: {payer ? `${payer.payer_relation ? payer.payer_relation + ' · ' : ''}${payer.payer_name}${payer.payer_phone ? ' · ' + payer.payer_phone : ''}` : 'טוען…'}
              <div className="text-xs text-indigo-700">ההו״ק תיפתח בנדרים על שמו ותקושר אליו. אופן התשלום של המשפחה לא משתנה.</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="סכום חודשי" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            <Select label="יום חיוב" value={day} onChange={(e) => setDay(e.target.value)} options={DAYS.map((d) => ({ value: d, label: d }))} />
          </div>
          <div>
            <Input label={payerId ? 'ת"ז המשלם (לכרטיס התורם בנדרים)' : 'ת"ז האב (לכרטיס התורם בנדרים)'} value={zeout} onChange={(e) => setZeout(e.target.value)} placeholder="9 ספרות" />
            {!zeout && <div className="text-xs text-amber-600 mt-1">מומלץ למלא — כרטיס התורם בנדרים ייפתח עם הת"ז, וזו תישמר גם אצלנו.</div>}
          </div>

          {done ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-3">
              <div className="text-emerald-800 font-semibold">{payerId ? '✓ ההו״ק הוקמה וקושרה למשלם הנוסף' : '✓ ההו״ק הוקמה וקושרה לתלמיד'}</div>
              <Link href={`/students/${studentId}`}><Button variant="primary">לכרטיס התלמיד</Button></Link>
            </div>
          ) : (
            <>
              <div>
                <div className="text-sm font-semibold text-slate-700 mb-1">פרטי כרטיס אשראי</div>
                <iframe ref={frameRef} scrolling="no" style={{ width: '100%', border: 'none', height: 0 }} title="Nedarim" />
              </div>
              {status && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{status}</div>}
              <Button variant="primary" className="w-full" disabled={busy} onClick={submit}>{busy ? 'מבצע…' : '🔒 הקם הו״ק'}</Button>
              <div className="text-xs text-slate-400">החיוב הראשון יתבצע ביום החיוב הקרוב. אפשר להזין כרטיס במשרד מול ההורה, או שההורה יזין בעצמו.</div>
            </>
          )}
        </CardContent></Card>
      </div>
    </>
  );
}

export default function NewHkPage() {
  return (
    <PageGuard requires="write">
      <Suspense fallback={<div className="p-8 text-slate-400">טוען…</div>}>
        <NewHkInner />
      </Suspense>
    </PageGuard>
  );
}
