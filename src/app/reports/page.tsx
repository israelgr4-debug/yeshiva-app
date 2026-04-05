'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ReportSelector } from '@/components/reports/ReportSelector';
import { CertificatePreview } from '@/components/reports/CertificatePreview';
import { useStudents } from '@/hooks/useStudents';
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
  const [students, setStudents] = useState<Student[]>([]);
  const [certificate, setCertificate] = useState<GeneratedCertificate | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStudents().then(setStudents);
  }, [getStudents]);

  const handleGenerate = useCallback(
    (student: Student, reportType: ReportType, year: string, extras: Record<string, string>) => {
      setCertificate({ student, reportType, year, extras });
    },
    []
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
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
              <ReportSelector
                students={students}
                loading={loading}
                onGenerate={handleGenerate}
              />
            </CardContent>
          </Card>
        </div>

        {/* Preview panel */}
        <div className="lg:col-span-2">
          {certificate ? (
            <div>
              <div className="flex items-center justify-between mb-4 no-print">
                <h2 className="text-lg font-semibold text-gray-800">תצוגה מקדימה</h2>
                <Button onClick={handlePrint} variant="secondary">
                  הדפס
                </Button>
              </div>
              <div ref={printRef} className="print-area">
                <CertificatePreview
                  student={certificate.student}
                  reportType={certificate.reportType}
                  year={certificate.year}
                  extras={certificate.extras}
                />
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
    </div>
  );
}
