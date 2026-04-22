'use client';

import { Student } from '@/lib/types';
import { sortStudentsByName, getShiurLetter, groupStudentsByShiur } from '@/lib/list-reports';

interface Props {
  students: Student[];
  shiurFilter: string;
}

export function GeneralListReport({ students, shiurFilter }: Props) {
  // If a specific shiur is selected → single flat list
  // If "all shiurim" → group by shiur with page breaks
  const groupByShiur = !shiurFilter;

  if (!groupByShiur) {
    const sorted = sortStudentsByName(students);
    const title = `דוח כללי - חתך \\ ${shiurFilter}`;
    return <SingleListPage title={title} students={sorted} />;
  }

  const groups = groupStudentsByShiur(students);

  return (
    <>
      {groups.map((g, idx) => (
        <SingleListPage
          key={g.shiur}
          title={`דוח כללי - ${g.shiur}`}
          students={g.students}
          isNotFirst={idx > 0}
        />
      ))}
    </>
  );
}

function SingleListPage({
  title,
  students,
  isNotFirst,
}: {
  title: string;
  students: Student[];
  isNotFirst?: boolean;
}) {
  return (
    <div className={`report-page ${isNotFirst ? 'page-break' : ''}`}>
      <h1 className="report-title">{title}</h1>

      <div className="general-grid">
        {students.map((s) => (
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
        .report-page.page-break {
          page-break-before: always;
          break-before: page;
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
