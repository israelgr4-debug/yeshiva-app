'use client';

import { Student, Family } from '@/lib/types';
import {
  sortStudentsByName,
  getShiurLetter,
  formatDateShort,
} from '@/lib/list-reports';

interface Props {
  students: Student[];
  families: Record<string, Family>;
  shiurFilter: string;
}

export function MultiDetailsReport({ students, families, shiurFilter }: Props) {
  const sorted = sortStudentsByName(students);
  const title = shiurFilter
    ? `דוח פרטים מרובים בקטן - ${shiurFilter}`
    : 'דוח פרטים מרובים בקטן';

  return (
    <div className="report-page">
      <h1 className="report-title">{title}</h1>

      <table className="details-table">
        <thead>
          <tr>
            <th>שיעור</th>
            <th>משפחה</th>
            <th>פרטי</th>
            <th>שם האב</th>
            <th>כתובת</th>
            <th>עיר</th>
            <th>טלפון</th>
            <th>ת.ז.</th>
            <th>ת.ל.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const family = s.family_id ? families[s.family_id] : undefined;
            return (
              <tr key={s.id}>
                <td>{getShiurLetter(s.shiur)}</td>
                <td>{s.last_name}</td>
                <td>{s.first_name}</td>
                <td>{family?.father_name || ''}</td>
                <td>{family?.address || ''}</td>
                <td>{family?.city || ''}</td>
                <td>{family?.home_phone || family?.father_phone || ''}</td>
                <td>{s.id_number}</td>
                <td>{formatDateShort(s.date_of_birth)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <style jsx>{`
        .report-page {
          background: white;
          padding: 15mm 10mm;
          direction: rtl;
          font-family: 'David', 'Miriam', Arial, sans-serif;
          color: #000;
        }
        .report-title {
          text-align: center;
          font-size: 16pt;
          font-weight: bold;
          margin-bottom: 15px;
          text-decoration: underline;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9pt;
        }
        .details-table th {
          background: #f5f5f5;
          font-weight: bold;
          padding: 6px 4px;
          border-bottom: 2px solid #333;
          text-align: start;
        }
        .details-table td {
          padding: 4px;
          border-bottom: 1px solid #e5e5e5;
        }
        .details-table tr:nth-child(even) td {
          background: #fafafa;
        }
        @media print {
          .report-page {
            padding: 8mm;
          }
          .details-table {
            font-size: 8pt;
          }
        }
      `}</style>
    </div>
  );
}
