'use client';

import { Student } from '@/lib/types';
import { sortStudentsByName, getShiurLetter, groupStudentsByShiur } from '@/lib/list-reports';

interface Props {
  students: Student[];
  shiurFilter: string;
}

export function TestsReport({ students, shiurFilter }: Props) {
  if (shiurFilter) {
    return <SinglePage title={`דוח מבחנים - חתך \\ ${shiurFilter}`} students={sortStudentsByName(students)} />;
  }
  const groups = groupStudentsByShiur(students);
  return (
    <>
      {groups.map((g, idx) => (
        <SinglePage
          key={g.shiur}
          title={`דוח מבחנים - ${g.shiur}`}
          students={g.students}
          isNotFirst={idx > 0}
        />
      ))}
    </>
  );
}

function SinglePage({ title, students, isNotFirst }: { title: string; students: Student[]; isNotFirst?: boolean }) {
  return (
    <div className={`report-page ${isNotFirst ? 'page-break' : ''}`}>
      <h1 className="report-title">{title}</h1>

      <div className="tests-header">
        <div className="col-header">
          <span>שם התלמיד</span>
          <span>שיעור</span>
        </div>
        <div className="col-header">
          <span>שם התלמיד</span>
          <span>שיעור</span>
        </div>
      </div>

      <div className="tests-grid">
        {students.map((s) => (
          <div key={s.id} className="test-row">
            <div className="test-squares">
              <div className="test-sq" />
              <div className="test-sq" />
              <div className="test-sq" />
              <div className="test-sq" />
            </div>
            <div className="test-name">
              {s.last_name}, {s.first_name}
            </div>
            <div className="test-letter">{getShiurLetter(s.shiur)}</div>
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
        .tests-header {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10mm;
          margin-bottom: 10px;
          font-weight: bold;
          font-size: 10pt;
        }
        .col-header {
          display: flex;
          justify-content: space-between;
          border-bottom: 2px solid #333;
          padding-bottom: 4px;
        }
        .tests-grid {
          column-count: 2;
          column-gap: 10mm;
          font-size: 10pt;
        }
        .test-row {
          display: grid;
          grid-template-columns: auto 1fr 28px;
          gap: 6px;
          align-items: center;
          padding: 6px 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .test-squares {
          display: flex;
          gap: 3px;
        }
        .test-sq {
          width: 18px;
          height: 18px;
          border: 1px solid #666;
          background: white;
        }
        .test-name {
          font-weight: 500;
        }
        .test-letter {
          text-align: center;
          color: #555;
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
