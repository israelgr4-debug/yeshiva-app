'use client';

import { useEffect, useMemo, useState } from 'react';
import { Student, Family } from '@/lib/types';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { sortStudentsByName, groupStudentsByShiur } from '@/lib/list-reports';

interface Props {
  /** Students already filtered by shiur + status by the parent page. */
  students: Student[];
  /** Families lookup so we can fall back to home_phone if student has no phone. */
  families?: Record<string, Family>;
}

interface DatRow {
  idNumber: string;
  firstName?: string;
  lastName?: string;
  entitlement?: string;
}

interface StoredData {
  rows: DatRow[];
  uploadedAt: string;
  fileName: string;
}

/** Normalize Israeli ID for matching: strip non-digits, strip leading zeros. */
function normalizeId(id: string | null | undefined): string {
  if (!id) return '';
  return String(id).replace(/\D/g, '').replace(/^0+/, '');
}

export function EligibleReport({ students, families }: Props) {
  const { getSetting } = useSystemSettings();
  const [datData, setDatData] = useState<StoredData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const d = await getSetting<StoredData | null>('ministry_dat_data', null);
      setDatData(d);
      setLoading(false);
    })();
  }, [getSetting]);

  // Build the set of eligible (זכאי) IDs from the ministry DAT data
  const eligibleIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of datData?.rows || []) {
      if ((r.entitlement || '').trim() === 'זכאי') {
        const k = normalizeId(r.idNumber);
        if (k) set.add(k);
      }
    }
    return set;
  }, [datData]);

  // Filter incoming students to those whose id_number is in the eligible set
  const filtered = useMemo(() => {
    if (eligibleIds.size === 0) return [];
    return students.filter((s) => {
      const k = normalizeId(s.id_number);
      return k && eligibleIds.has(k);
    });
  }, [students, eligibleIds]);

  const groups = useMemo(() => groupStudentsByShiur(filtered), [filtered]);

  const phoneFor = (s: Student): string => {
    if (s.phone) return s.phone;
    const fam = s.family_id ? families?.[s.family_id] : null;
    return fam?.father_phone || fam?.home_phone || fam?.mother_phone || '';
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען...</div>;
  }

  if (!datData) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-sm text-amber-900">
        ⚠️ אין דוח של משרד הדתות במערכת.
        העלה תחילה קובץ CSV של משרד הדתות בעמוד <strong>פעולות → השוואת משרדים</strong>.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-sm text-slate-700">
        אין תלמידים זכאים בסינון הנוכחי.
        <div className="text-xs text-slate-500 mt-2">
          בדוח משרד הדתות יש {eligibleIds.size.toLocaleString('he-IL')} תלמידים מסומנים כ&quot;זכאי&quot;,
          אבל אף אחד מהם לא תואם לתלמידים בסינון שלך (שיעור/סטטוס).
        </div>
      </div>
    );
  }

  return (
    <>
      {groups.map((g, idx) => (
        <EligibleTable
          key={g.shiur}
          shiur={g.shiur}
          students={sortStudentsByName(g.students)}
          phoneFor={phoneFor}
          isNotFirst={idx > 0}
        />
      ))}

      <div className="no-print text-xs text-slate-500 text-center mt-4">
        מקור: {datData.fileName} · הועלה {new Date(datData.uploadedAt).toLocaleDateString('he-IL')}
        {' · '}
        מציג {filtered.length} תלמידים זכאים מתוך {eligibleIds.size.toLocaleString('he-IL')} בדוח הדתות
      </div>

      <style jsx>{`
        :global(.eligible-page) {
          background: white;
          padding: 15mm 12mm;
          direction: rtl;
          font-family: 'David', 'Heebo', Arial, sans-serif;
          color: #000;
        }
        :global(.eligible-page.page-break) {
          page-break-before: always;
          break-before: page;
        }
        :global(.eligible-title) {
          text-align: center;
          font-size: 16pt;
          font-weight: bold;
          margin-bottom: 14px;
          text-decoration: underline;
        }
        :global(.eligible-table) {
          width: 100%;
          border-collapse: collapse;
          font-size: 12pt;
        }
        :global(.eligible-table th) {
          background: #f1f5f9;
          border: 1px solid #475569;
          padding: 6px 8px;
          font-weight: 700;
          text-align: right;
        }
        :global(.eligible-table td) {
          border: 1px solid #cbd5e1;
          padding: 5px 8px;
        }
        :global(.eligible-table tbody tr:nth-child(even) td) {
          background: #f8fafc;
        }
      `}</style>
    </>
  );
}

function EligibleTable({
  shiur,
  students,
  phoneFor,
  isNotFirst,
}: {
  shiur: string;
  students: Student[];
  phoneFor: (s: Student) => string;
  isNotFirst?: boolean;
}) {
  return (
    <div className={`eligible-page ${isNotFirst ? 'page-break' : ''}`}>
      <h1 className="eligible-title">דוח זכאים - {shiur} ({students.length})</h1>
      <table className="eligible-table">
        <thead>
          <tr>
            <th style={{ width: '5%' }}>#</th>
            <th style={{ width: '20%' }}>שיעור</th>
            <th style={{ width: '22%' }}>שם משפחה</th>
            <th style={{ width: '20%' }}>שם פרטי</th>
            <th>טלפון</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id}>
              <td className="tabular-nums">{i + 1}</td>
              <td>{s.shiur || ''}</td>
              <td style={{ fontWeight: 600 }}>{s.last_name}</td>
              <td>{s.first_name}</td>
              <td className="tabular-nums" dir="ltr">{phoneFor(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
