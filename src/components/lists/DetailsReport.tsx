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
              {/* Photo spot */}
              <div className="photo-spot">
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.photo_url} alt={`${s.first_name} ${s.last_name}`} />
                ) : (
                  <div className="photo-placeholder">אין תמונה</div>
                )}
              </div>

              {/* Details */}
              <div className="card-body">
                <div className="row">
                  <span className="label">שם:</span>
                  <span className="value name-value">
                    {s.last_name} {s.first_name}
                  </span>
                </div>
                <div className="row two-col">
                  <div>
                    <span className="label">שיעור:</span>
                    <span className="value">{s.shiur?.replace('שיעור ', '') || ''}</span>
                  </div>
                  <div>
                    <span className="label">מחזור:</span>
                    <span className="value">
                      {machzor ? machzor.name.replace('מחזור ', '') : ''}
                    </span>
                  </div>
                </div>
                <div className="row">
                  <span className="label">ת.ז.:</span>
                  <span className="value">{s.id_number}</span>
                </div>
                <div className="row">
                  <span className="label">שם אב:</span>
                  <span className="value">{family?.father_name || ''}</span>
                </div>
                <div className="row two-col">
                  <div>
                    <span className="label">טלפון:</span>
                    <span className="value">{family?.home_phone || ''}</span>
                  </div>
                  <div>
                    <span className="label">נייד:</span>
                    <span className="value">{family?.father_phone || ''}</span>
                  </div>
                </div>
                <div className="row">
                  <span className="label">ת.לידה:</span>
                  <span className="value">{formatDateShort(s.date_of_birth)}</span>
                </div>
                <div className="row">
                  <span className="label">כתובת:</span>
                  <span className="value">
                    {family?.address || ''} {family?.city || ''}
                  </span>
                </div>
                <div className="row">
                  <span className="label">ישיבה קטנה:</span>
                  <span className="value">{yeshivaKetana?.institution_name || ''}</span>
                </div>
                <div className="row">
                  <span className="label">שם אם:</span>
                  <span className="value">{family?.mother_name || ''}</span>
                </div>
                <div className="row">
                  <span className="label">נייד:</span>
                  <span className="value">{family?.mother_phone || ''}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .details-card {
          display: flex;
          gap: 6px;
          border: 1px solid #333;
          padding: 6px;
          break-inside: avoid;
          page-break-inside: avoid;
          font-size: 8.5pt;
          background: white;
        }
        .photo-spot {
          flex: 0 0 60px;
          height: 80px;
          border: 1px solid #999;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
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
        }
        .card-body {
          flex: 1;
          min-width: 0;
        }
        .row {
          display: flex;
          gap: 4px;
          padding: 1px 0;
          border-bottom: 1px dotted #ddd;
        }
        .row:last-child {
          border-bottom: none;
        }
        .two-col {
          gap: 10px;
          border-bottom: 1px dotted #ddd;
        }
        .two-col > div {
          flex: 1;
          display: flex;
          gap: 4px;
        }
        .label {
          font-weight: bold;
          white-space: nowrap;
          color: #333;
        }
        .value {
          flex: 1;
          word-break: break-word;
        }
        .name-value {
          font-weight: bold;
          font-size: 10pt;
        }
        @media print {
          .report-page {
            padding: 8mm;
          }
        }
      `}</style>
    </div>
  );
}
