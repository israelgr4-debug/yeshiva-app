'use client';

import { Student, Family, Machzor, EducationHistory } from '@/lib/types';
import { sortStudentsByName, formatDateShort } from '@/lib/list-reports';

interface Props {
  students: Student[];
  families: Record<string, Family>;
  machzorot: Record<string, Machzor>;
  education: Record<string, EducationHistory[]>; // keyed by student_id
  shiurFilter: string;
}

// Layout: 2 columns × 6 rows = 12 cards per A4 portrait page.
// Each card is landscape-oriented (~95mm × 42mm) with a full-height photo on one side.
export function DetailsReport({
  students,
  families,
  machzorot,
  education,
  shiurFilter,
}: Props) {
  const sorted = sortStudentsByName(students);
  const title = shiurFilter
    ? `דוח פרטים - חתך \\ ${shiurFilter}`
    : 'דוח פרטים';

  return (
    <div className="report-page">
      <h1 className="report-title">{title}</h1>

      <div className="cards-grid">
        {sorted.map((s) => {
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
                  <span className="inline-sep" />
                  <b>ת.לידה:</b> {formatDateShort(s.date_of_birth) || '-'}
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
