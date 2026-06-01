'use client';

import { Student, Family, Machzor, EducationHistory } from '@/lib/types';
import { sortStudentsByName, groupStudentsByShiur } from '@/lib/list-reports';
import { toHebrewDate } from '@/lib/utils';

interface Props {
  students: Student[];
  families: Record<string, Family>;
  machzorot: Record<string, Machzor>;
  education: Record<string, EducationHistory[]>; // keyed by student_id
  shiurFilter: string;
}

// Layout: 2 columns × 6 rows = 12 cards per A4 portrait page.
// When shiurFilter is empty (multi-select / all), groups by shiur with a
// page break before each shiur. Within each shiur, sorted א-ת by last name.
export function DetailsReport({
  students,
  families,
  machzorot,
  education,
  shiurFilter,
}: Props) {
  if (shiurFilter) {
    return (
      <DetailsPage
        title={`דוח פרטים - חתך \\ ${shiurFilter}`}
        students={sortStudentsByName(students)}
        families={families}
        machzorot={machzorot}
        education={education}
      />
    );
  }
  const groups = groupStudentsByShiur(students);
  return (
    <>
      {groups.map((g, idx) => (
        <DetailsPage
          key={g.shiur}
          title={`דוח פרטים - ${g.shiur}`}
          students={g.students}
          families={families}
          machzorot={machzorot}
          education={education}
          isNotFirst={idx > 0}
        />
      ))}
    </>
  );
}

function DetailsPage({
  title,
  students,
  families,
  machzorot,
  education,
  isNotFirst,
}: {
  title: string;
  students: Student[];
  families: Record<string, Family>;
  machzorot: Record<string, Machzor>;
  education: Record<string, EducationHistory[]>;
  isNotFirst?: boolean;
}) {
  return (
    <div className={`report-page ${isNotFirst ? 'page-break' : ''}`}>
      <h1 className="report-title">{title}</h1>

      <div className="cards-grid">
        {students.map((s) => {
          const family = s.family_id ? families[s.family_id] : undefined;
          const machzor = s.machzor_id ? machzorot[s.machzor_id] : undefined;
          const edu = education[s.id] || [];
          const yeshivaKetana = edu.find((e) => e.institution_type === 'yeshiva_ketana');

          return (
            <div key={s.id} className="details-card">
              {/* Text area */}
              <div className="card-body">
                <div className="name-row">
                  {s.last_name} {s.first_name}
                </div>
                <div className="pair-row">
                  <span>
                    <b>שיעור:</b> {s.shiur?.replace('שיעור ', '') || '-'}
                  </span>
                  <span>
                    <b>מחזור:</b> {machzor ? machzor.name.replace('מחזור ', '') : '-'}
                  </span>
                </div>
                <div className="field-row">
                  <b>ת.ז.:</b> {s.id_number || '-'}
                </div>
                <div className="field-row">
                  <b>ת.לידה:</b> {toHebrewDate(s.date_of_birth) || '-'}
                </div>
                <div className="field-row">
                  <b>אב:</b> {family?.father_name || '-'}
                  <span className="inline-sep" />
                  <b>נייד:</b> {family?.father_phone || '-'}
                </div>
                <div className="field-row">
                  <b>אם:</b> {family?.mother_name || '-'}
                  <span className="inline-sep" />
                  <b>נייד:</b> {family?.mother_phone || '-'}
                </div>
                <div className="field-row">
                  <b>טלפון:</b> {family?.home_phone || '-'}
                </div>
                <div className="field-row">
                  <b>כתובת:</b> {family?.address || ''} {family?.city || ''}
                </div>
                <div className="field-row">
                  <b>י.קטנה:</b> {yeshivaKetana?.institution_name || '-'}
                </div>
              </div>

              {/* Photo on the left side, filling full height */}
              <div className="photo-spot">
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt={`${s.first_name} ${s.last_name}`} />
                ) : (
                  <div className="photo-placeholder">אין תמונה</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .report-page {
          background: white;
          padding: 10mm 8mm;
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
          font-size: 14pt;
          font-weight: bold;
          margin-bottom: 8px;
          text-decoration: underline;
        }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          grid-auto-rows: 44mm;
          gap: 3mm;
        }
        .details-card {
          display: grid;
          grid-template-columns: 1fr 30mm;
          border: 1px solid #333;
          background: white;
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
          font-size: 8pt;
          height: 44mm;
        }
        .card-body {
          padding: 2mm 3mm;
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }
        .name-row {
          font-weight: bold;
          font-size: 10pt;
          margin-bottom: 2px;
          border-bottom: 1px solid #333;
          padding-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pair-row,
        .field-row {
          display: flex;
          gap: 8px;
          font-size: 7.5pt;
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pair-row span {
          flex: 1;
        }
        .inline-sep {
          flex: 0 0 6px;
        }
        b {
          font-weight: bold;
          color: #333;
        }
        .photo-spot {
          border-right: 1px solid #333;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          height: 100%;
        }
        .photo-spot img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .photo-placeholder {
          color: #999;
          font-size: 7pt;
          text-align: center;
          padding: 4px;
        }
        @media print {
          .report-page {
            padding: 6mm;
          }
          .cards-grid {
            grid-auto-rows: 44mm;
          }
        }
      `}</style>
    </div>
  );
}
