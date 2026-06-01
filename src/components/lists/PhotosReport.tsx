'use client';

import { Student } from '@/lib/types';
import { sortStudentsByName, groupStudentsByShiur } from '@/lib/list-reports';

interface Props {
  students: Student[];
  shiurFilter: string;
}

export function PhotosReport({ students, shiurFilter }: Props) {
  if (shiurFilter) {
    return (
      <PhotosPage
        title={`דוח תמונות - ${shiurFilter}`}
        students={sortStudentsByName(students)}
      />
    );
  }
  const groups = groupStudentsByShiur(students);
  return (
    <>
      {groups.map((g, idx) => (
        <PhotosPage
          key={g.shiur}
          title={`דוח תמונות - ${g.shiur}`}
          students={g.students}
          isNotFirst={idx > 0}
        />
      ))}
    </>
  );
}

function PhotosPage({
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

      <div className="photos-grid">
        {students.map((s) => (
          <div key={s.id} className="photo-card">
            <div className="photo-frame">
              {s.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photo_url} alt={`${s.first_name} ${s.last_name}`} />
              ) : (
                <div className="photo-placeholder">אין תמונה</div>
              )}
            </div>
            <div className="photo-name">
              <div className="last">{s.last_name}</div>
              <div className="first">{s.first_name}</div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .report-page {
          background: white;
          padding: 15mm 10mm;
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
        .photos-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }
        .photo-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          border: 1px solid #ccc;
          padding: 6px;
          break-inside: avoid;
          page-break-inside: avoid;
          background: white;
        }
        .photo-frame {
          width: 100%;
          aspect-ratio: 3/4;
          background: #f5f5f5;
          border: 1px solid #999;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          margin-bottom: 6px;
        }
        .photo-frame img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .photo-placeholder {
          color: #999;
          font-size: 9pt;
        }
        .photo-name {
          text-align: center;
          font-size: 9pt;
          line-height: 1.2;
        }
        .last {
          font-weight: bold;
        }
        .first {
          color: #333;
        }
        @media print {
          .report-page {
            padding: 8mm;
          }
          .photos-grid {
            grid-template-columns: repeat(5, 1fr);
          }
        }
      `}</style>
    </div>
  );
}
