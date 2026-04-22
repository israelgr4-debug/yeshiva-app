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
  const [letterheadUrl, setLetterheadUrl] = useState<string>('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStudents().then(setStudents);
  }, [getStudents]);

  useEffect(() => {
    getSetting<string>('signature_url', '').then(setSignatureUrl);
    getSetting<string>('letterhead_url', '').then(setLetterheadUrl);
  }, [getSetting]);

  const handleGenerate = useCallback(
    (student: Student, reportType: ReportType, year: string, extras: Record<string, string>) => {
      setCertificate({ student, reportType, year, extras });
    },
    []
  );

  const handlePrint = () => window.print();

  // Get the email-version preview element (with signature + letterhead)
  const getEmailPdfElement = (): HTMLElement | null => {
    return previewRef.current?.querySelector('.certificate-page') as HTMLElement | null;
  };

  return (
    <div className="space-y-6 animate-fadeIn p-4 md:p-8 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">אישורים</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-full">
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
        <div className="lg:col-span-2 min-w-0">
          {certificate ? (
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-4 no-print gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-800">תצוגה מקדימה</h2>
                <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                  <Button onClick={handlePrint} variant="secondary" className="flex-1 sm:flex-initial">
                    🖨️ הדפס
                  </Button>
                  <Button onClick={() => setEmailOpen(true)} className="flex-1 sm:flex-initial">
                    📧 שלח במייל
                  </Button>
                </div>
              </div>

              {/* Mobile: show toggle button; Desktop: always show preview */}
              <div className="lg:hidden mb-3 no-print">
                <Button
                  variant="secondary"
                  onClick={() => setShowMobilePreview((v) => !v)}
                  className="w-full"
                >
                  {showMobilePreview ? '▲ הסתר תצוגה מקדימה' : '▼ הצג תצוגה מקדימה'}
                </Button>
              </div>

              {/* Visible preview - print version: NO signature, BLANK letterhead space */}
              <div
                ref={printRef}
                className={`print-area preview-frame ${showMobilePreview ? 'preview-open' : ''}`}
              >
                <CertificatePreview
                  student={certificate.student}
                  reportType={certificate.reportType}
                  year={certificate.year}
                  extras={certificate.extras}
                  reserveLetterheadSpace={true}
                />
              </div>

              {/* Hidden email version - WITH signature AND letterhead image */}
              <div ref={previewRef} style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
                <CertificatePreview
                  student={certificate.student}
                  reportType={certificate.reportType}
                  year={certificate.year}
                  extras={certificate.extras}
                  signatureUrl={signatureUrl || null}
                  letterheadUrl={letterheadUrl || null}
                />
              </div>

              <div className="text-xs mt-2 text-center no-print space-y-1">
                {signatureUrl ? (
                  <p className="text-gray-500">ℹ️ החתימה תוצג רק במייל</p>
                ) : (
                  <p className="text-amber-600">⚠️ אין חתימה - העלה בהגדרות</p>
                )}
                {letterheadUrl ? (
                  <p className="text-gray-500">ℹ️ בלאנק: במייל מוצג כרקע עמוד מלא. בהדפסה מושאר שטח ריק למעלה ולמטה לבלאנק הפיזי.</p>
                ) : (
                  <p className="text-amber-600">⚠️ אין בלאנק - העלה בהגדרות (עמוד שלם עם לוגו עליון ותחתון)</p>
                )}
              </div>
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
          pdfElement={getEmailPdfElement}
          pdfFilename={`${certificate.reportType.name}_${certificate.student.last_name}_${certificate.student.first_name}.pdf`}
          bodyText={`שלום,\n\nמצורף ${certificate.reportType.name} עבור ${certificate.student.first_name} ${certificate.student.last_name}.\n\nבברכה,\nישיבת מיר מודיעין עילית`}
        />
      )}
    </div>
  );
}
