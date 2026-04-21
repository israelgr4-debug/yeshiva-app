'use client';

import { Student } from '@/lib/types';
import { sortStudentsByName } from '@/lib/list-reports';

interface Props {
  students: Student[];
  shiurFilter: string;
}

export function RamReport({ students, shiurFilter }: Props) {
  const sorted = sortStudentsByName(students);
  const title = shiurFilter
    ? `דוח ר"מ - ${shiurFilter}`
    : 'דוח ר"מ';

  return (
    <div className="report-page">
      <h1 className="report-title">{title}</h1>

      <div className="ram-grid">
        {sorted.map((s, idx) => (
          <div key={s.id} className="ram-row">
            <span className="num">{idx + 1}</span>
            <span className="name">
              {s.last_name}, {s.first_name}
            </span>
            <div className="notes-lines">
              <div className="line" />
              <div className="line" />
              <div className="line" />
            </div>
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
        .ram-grid {
          column-count: 2;
          column-gap: 10mm;
          font-size: 10pt;
        }
        .ram-row {
          display: grid;
          grid-template-columns: 28px 130px 1fr;
          gap: 6px;
          align-items: start;
          padding: 6px 0;
          border-bottom: 1px solid #e5e5e5;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .num {
          text-align: end;
          color: #555;
        }
        .name {
          font-weight: 500;
        }
        .notes-lines {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 6px;
        }
        .line {
          border-bottom: 1px solid #bbb;
          height: 10px;
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
