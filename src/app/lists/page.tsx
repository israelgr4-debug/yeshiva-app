'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useSupabase } from '@/hooks/useSupabase';
import { Student, Family, Machzor, EducationHistory } from '@/lib/types';
import {
  LIST_REPORTS,
  ListReportId,
  getShiurFilterOptions,
} from '@/lib/list-reports';
import { GeneralListReport } from '@/components/lists/GeneralListReport';
import { TestsReport } from '@/components/lists/TestsReport';
import { MultiDetailsReport } from '@/components/lists/MultiDetailsReport';
import { DetailsReport } from '@/components/lists/DetailsReport';
import { RamReport } from '@/components/lists/RamReport';
import { PhotosReport } from '@/components/lists/PhotosReport';
import { CustomReportBuilder } from '@/components/lists/CustomReportBuilder';

export default function ListsPage() {
  const { fetchData } = useSupabase();

  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [machzorot, setMachzorot] = useState<Record<string, Machzor>>({});
  const [education, setEducation] = useState<Record<string, EducationHistory[]>>({});
  const [loading, setLoading] = useState(true);

  const [selectedReport, setSelectedReport] = useState<ListReportId>('general');
  const [shiurFilter, setShiurFilter] = useState<string>('שיעור א');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  // Load data only when user picks a report (lazy). For now, preload on mount.
  const loadData = useCallback(async () => {
    setLoading(true);
    const [s, f, m, e] = await Promise.all([
      fetchData<Student>('students'),
      fetchData<Family>('families'),
      fetchData<Machzor>('machzorot'),
      fetchData<EducationHistory>('education_history'),
    ]);

    setStudents(s);

    const fam: Record<string, Family> = {};
    for (const ff of f) fam[ff.id] = ff;
    setFamilies(fam);

    const mach: Record<string, Machzor> = {};
    for (const mm of m) mach[mm.id] = mm;
    setMachzorot(mach);

    const edu: Record<string, EducationHistory[]> = {};
    for (const ee of e) {
      if (!edu[ee.student_id]) edu[ee.student_id] = [];
      edu[ee.student_id].push(ee);
    }
    setEducation(edu);

    setLoading(false);
  }, [fetchData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (shiurFilter && s.shiur !== shiurFilter) return false;
      return true;
    });
  }, [students, statusFilter, shiurFilter]);

  const handlePrint = () => window.print();

  const renderReport = () => {
    if (loading) {
      return <div className="text-center py-12 text-gray-500">טוען...</div>;
    }

    // Custom builder has its own filters - bypass the shared ones
    if (selectedReport === 'custom') {
      return (
        <CustomReportBuilder
          students={students}
          families={families}
          machzorot={machzorot}
          education={education}
        />
      );
    }

    if (filteredStudents.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          אין תלמידים לפי המסננים שנבחרו
        </div>
      );
    }

    switch (selectedReport) {
      case 'general':
        return <GeneralListReport students={filteredStudents} shiurFilter={shiurFilter} />;
      case 'tests':
        return <TestsReport students={filteredStudents} shiurFilter={shiurFilter} />;
      case 'multi_details':
        return (
          <MultiDetailsReport
            students={filteredStudents}
            families={families}
            shiurFilter={shiurFilter}
          />
        );
      case 'details':
        return (
          <DetailsReport
            students={filteredStudents}
            families={families}
            machzorot={machzorot}
            education={education}
            shiurFilter={shiurFilter}
          />
        );
      case 'ram':
        return <RamReport students={filteredStudents} shiurFilter={shiurFilter} />;
      case 'photos':
        return <PhotosReport students={filteredStudents} shiurFilter={shiurFilter} />;
    }
  };

  const shiurOptions = getShiurFilterOptions();

  return (
    <>
      <Header title="דוחות" subtitle="הפקת דוחות ורשימות" />

      <div className="p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls sidebar */}
          <div className="lg:col-span-1 no-print">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-gray-800">בחר דוח</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {LIST_REPORTS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReport(r.id)}
                      className={`w-full text-right p-3 rounded-lg border transition-colors ${
                        selectedReport === r.id
                          ? 'bg-blue-50 border-blue-400 text-blue-900'
                          : 'bg-white border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{r.icon}</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{r.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {r.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <h2 className="text-lg font-semibold text-gray-800">סינון</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      שיעור
                    </label>
                    <select
                      value={shiurFilter}
                      onChange={(e) => setShiurFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {shiurOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      סטטוס
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">כל הסטטוסים</option>
                      <option value="active">פעיל</option>
                      <option value="chizuk">חיזוק</option>
                      <option value="inactive">לא פעיל</option>
                      <option value="graduated">סיים</option>
                    </select>
                  </div>

                  <div className="pt-2 text-sm text-gray-600 border-t border-gray-100">
                    {filteredStudents.length} תלמידים
                  </div>
                </div>

                <Button onClick={handlePrint} className="w-full mt-4">
                  הדפס / שמור PDF
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <div className="lg:col-span-3">
            <div className="bg-gray-100 p-4 rounded-lg">
              <div className="print-area bg-white shadow-md" style={{ minHeight: '297mm' }}>
                {renderReport()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
