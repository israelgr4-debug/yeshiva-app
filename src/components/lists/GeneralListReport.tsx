'use client';

import { Student } from '@/lib/types';
import { sortStudentsByName, getShiurLetter } from '@/lib/list-reports';

interface Props {
  students: Student[];
  shiurFilter: string;
}

export function GeneralListReport({ students, shiurFilter }: Props) {
  const sorted = sortStudentsByName(students);
  const title = shiurFilter ? `דוח כללי - חתך \\ ${shiurFilter}` : 'דוח כללי';

  return (
    <div className="report-page">
      <h1 className="report-title">{title}</h1>

      <div className="general-grid">
        {sorted.map((s) => (
          <div key={s.id} className="general-row">
            <span className="name">
              {s.last_name}, {s.first_name}
            </span>
            <span className="shiur-letter">{getShiurLetter(s.shiur)}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .report-page {
          background: white;
          padding: 20mm 15mm;
          direction: rtl;
          font-family: 'David', 'Miriam', Arial, sans-serif;
          color: #000;
        }
        .report-title {
          text-align: center;
          font-size: 18pt;
          font-weight: bold;
          margin-bottom: 20px;
          text-decoration: underline;
        }
        .general-grid {
          column-count: 3;
          column-gap: 10mm;
          column-rule: 1px solid #e5e5e5;
          font-size: 10pt;
        }
        .general-row {
          display: flex;
          justify-content: space-between;
          padding: 3px 6px;
          border-bottom: 1px solid #eee;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .name {
          flex: 1;
        }
        .shiur-letter {
          margin-inline-start: 10px;
          color: #333;
        }
        @media print {
          .report-page {
            padding: 10mm;
          }
        }
      `}</style>
    </div>
  );
}
