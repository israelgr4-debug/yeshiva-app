'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReportSelector } from '@/components/reports/ReportSelector';
import { CertificatePreview } from '@/components/reports/CertificatePreview';
import { SendEmailDialog } from '@/components/email/SendEmailDialog';
import { useStudents } from '@/hooks/useStudents';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Student } from '@/lib/types';
import { ReportType } from '@/lib/certificates';

interface GeneratedCertificate {
  student: Student;
  reportType: ReportType;
  year: string;
  extras: Record<string, string>;
}

export default function ReportsPage() {
  const { getStudents, loading } = useStudents();
  const { getSetting } = useSystemSettings();
  const [students, setStudents] = useState<Student[]>([]);
  const [certificate, setCertificate] = useState<GeneratedCertificate | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string>('');
  const [emailOpen, setEmailOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStudents().then(setStudents);
  }, [getStudents]);

  useEffect(() => {
    getSetting<string>('signature_url', '').then(setSignatureUrl);
  }, [getSetting]);

  const handleGenerate = useCallback(
    (student: Student, reportType: ReportType, year: string, extras: Record<string, string>) => {
      setCertificate({ student, reportType, year, extras });
    },
    []
  );

  const handlePrint = () => window.print();

  // Build the email HTML - render the certificate WITH signature visible
  const buildCertificateEmailHtml = async (): Promise<string> => {
    if (!previewRef.current) return '';
    // Clone the current preview DOM
    const clone = previewRef.current.cloneNode(true) as HTMLElement;

    // If there's a signature URL, ensure it's rendered even if the visible
    // preview didn't show it (we always include it in emails)
    // The preview for email rendering has signatureUrl set below.

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="he">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 20px; background: white; font-family: 'David', 'Miriam', Arial, sans-serif; direction: rtl; }
          @page { size: A4; margin: 0; }
        </style>
      </head>
      <body>
        ${clone.innerHTML}
      </body>
      </html>
    `;
  };

  return (
    <div className="space-y-6 animate-fadeIn p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">אישורים</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selector panel */}
        <div className="lg:col-span-1 no-print">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-800">הפקת אישור</h2>
            </CardHeader>
            <CardContent>
              <ReportSelector students={students} loading={loading} onGenerate={handleGenerate} />
            </CardContent>
          </Card>
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-2">
          {certificate ? (
            <div>
              <div className="flex items-center justify-between mb-4 no-print gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-800">תצוגה מקדימה</h2>
                <div className="flex gap-2">
                  <Button onClick={handlePrint} variant="secondary">
                    🖨️ הדפס (בלי חתימה)
                  </Button>
                  <Button onClick={() => setEmailOpen(true)}>
                    📧 שלח במייל (עם חתימה)
                  </Button>
                </div>
              </div>

              {/* Visible preview - NO signature (this is what gets printed) */}
              <div ref={printRef} className="print-area">
                <CertificatePreview
                  student={certificate.student}
                  reportType={certificate.reportType}
                  year={certificate.year}
                  extras={certificate.extras}
                />
              </div>

              {/* Hidden signed version - used only to build the email HTML */}
              <div ref={previewRef} style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
                <CertificatePreview
                  student={certificate.student}
                  reportType={certificate.reportType}
                  year={certificate.year}
                  extras={certificate.extras}
                  signatureUrl={signatureUrl || null}
                />
              </div>

              {signatureUrl ? (
                <p className="text-xs text-gray-500 mt-2 text-center no-print">
                  ℹ️ החתימה תוצג רק במייל, לא בהדפסה
                </p>
              ) : (
                <p className="text-xs text-amber-600 mt-2 text-center no-print">
                  ⚠️ אין חתימה מוגדרת. לשליחת אישורים חתומים במייל - העלה חתימה בהגדרות.
                </p>
              )}
            </div>
          ) : (
            <Card>
              <CardContent>
                <div className="text-center py-20 text-gray-400">
                  <p className="text-5xl mb-4">&#128196;</p>
                  <p className="text-lg">בחר תלמיד וסוג אישור כדי להפיק מסמך</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {certificate && (
        <SendEmailDialog
          isOpen={emailOpen}
          onClose={() => setEmailOpen(false)}
          defaultSubject={`${certificate.reportType.name} - ${certificate.student.first_name} ${certificate.student.last_name}`}
          defaultRecipient=""
          buildHtml={buildCertificateEmailHtml}
        />
      )}
    </div>
  );
}
