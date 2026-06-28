'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useSupabase } from '@/hooks/useSupabase';
import { Student, Family, Machzor, EducationHistory } from '@/lib/types';
import {
  LIST_REPORTS,
  ListReportId,
} from '@/lib/list-reports';
import { SHIURIM } from '@/lib/shiurim';
import { GeneralListReport } from '@/components/lists/GeneralListReport';
import { TestsReport } from '@/components/lists/TestsReport';
import { MultiDetailsReport } from '@/components/lists/MultiDetailsReport';
import { DetailsReport } from '@/components/lists/DetailsReport';
import { RamReport } from '@/components/lists/RamReport';
import { PhotosReport } from '@/components/lists/PhotosReport';
import { EligibleReport } from '@/components/lists/EligibleReport';
import { CustomReportBuilder } from '@/components/lists/CustomReportBuilder';
import * as XLSX from 'xlsx';

export default function ListsPage() {
  const { fetchData } = useSupabase();

  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [machzorot, setMachzorot] = useState<Record<string, Machzor>>({});
  const [education, setEducation] = useState<Record<string, EducationHistory[]>>({});
  const [loading, setLoading] = useState(true);

  const [selectedReport, setSelectedReport] = useState<ListReportId>('general');
  // Multi-select shiurim. Empty set = no shiur selected (yields no students).
  // Default: שיעור א only.
  const [selectedShiurim, setSelectedShiurim] = useState<Set<string>>(
    () => new Set(['שיעור א'])
  );
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
      if (selectedShiurim.size > 0) {
        // Virtual 'כולל' entry: filter by institution_name instead of shiur
        const isKollel = (s.institution_name || '') === 'כולל';
        const shiurMatches = selectedShiurim.has(s.shiur || '');
        const kollelMatches = selectedShiurim.has('כולל') && isKollel;
        if (!shiurMatches && !kollelMatches) return false;
      }
      return true;
    });
  }, [students, statusFilter, selectedShiurim]);

  // When multiple shiurim selected, force "group by shiur with page breaks"
  // by passing an empty shiurFilter to children. When exactly one shiur is
  // selected, pass that name → renders as a single flat page.
  const effectiveShiurFilter = selectedShiurim.size === 1
    ? Array.from(selectedShiurim)[0]
    : '';

  const handlePrint = () => window.print();

  /** Generic Excel export - works for every built-in report (general/tests/
   *  multi_details/details/ram/photos/eligible). One row per filtered student,
   *  with the most useful set of columns. The 'custom' report has its own
   *  in-builder export and is skipped here.
   */
  const handleExportExcel = () => {
    if (filteredStudents.length === 0) {
      alert('אין תלמידים לייצוא');
      return;
    }
    const sorted = [...filteredStudents].sort((a, b) => {
      const s = (a.shiur || '').localeCompare(b.shiur || '', 'he');
      if (s !== 0) return s;
      return (a.last_name || '').localeCompare(b.last_name || '', 'he');
    });
    const headers = [
      '#', 'שיעור', 'שם משפחה', 'שם פרטי', 'ת״ז', 'תאריך לידה',
      'טלפון תלמיד', 'אימייל תלמיד', 'מוסד', 'מחזור',
      'שם אב', 'טלפון אב', 'שם אם', 'טלפון אם',
      'כתובת', 'עיר', 'טלפון בית', 'סטטוס',
    ];
    const STATUS_LABEL: Record<string, string> = {
      active: 'פעיל', chizuk: 'חיזוק', inactive: 'לא פעיל', graduated: 'סיים',
    };
    const rows: any[][] = [headers];
    sorted.forEach((s, i) => {
      const fam = s.family_id ? families[s.family_id] : null;
      const mach = s.machzor_id ? machzorot[s.machzor_id] : null;
      rows.push([
        i + 1,
        s.shiur || '',
        s.last_name || '',
        s.first_name || '',
        s.id_number || s.passport_number || '',
        s.date_of_birth || '',
        s.phone || '',
        s.email || '',
        s.institution_name || '',
        mach?.name || '',
        fam?.father_name || '',
        fam?.father_phone || '',
        fam?.mother_name || '',
        fam?.mother_phone || '',
        fam?.address || '',
        fam?.city || '',
        fam?.home_phone || '',
        STATUS_LABEL[s.status] || s.status,
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 4 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
      { wch: 13 }, { wch: 22 }, { wch: 10 }, { wch: 8 },
      { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 13 },
      { wch: 22 }, { wch: 14 }, { wch: 13 }, { wch: 10 },
    ];
    if (!ws['!sheetView']) (ws as any)['!sheetView'] = [{ rightToLeft: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'תלמידים');
    const fn = `students_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fn);
  };

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
        return <GeneralListReport students={filteredStudents} shiurFilter={effectiveShiurFilter} />;
      case 'tests':
        return <TestsReport students={filteredStudents} shiurFilter={effectiveShiurFilter} />;
      case 'multi_details':
        return (
          <MultiDetailsReport
            students={filteredStudents}
            families={families}
            shiurFilter={effectiveShiurFilter}
          />
        );
      case 'details':
        return (
          <DetailsReport
            students={filteredStudents}
            families={families}
            machzorot={machzorot}
            education={education}
            shiurFilter={effectiveShiurFilter}
          />
        );
      case 'ram':
        return <RamReport students={filteredStudents} shiurFilter={effectiveShiurFilter} />;
      case 'photos':
        return <PhotosReport students={filteredStudents} shiurFilter={effectiveShiurFilter} />;
      case 'eligible':
        return <EligibleReport students={filteredStudents} families={families} />;
    }
  };

  const toggleShiur = (name: string) => {
    setSelectedShiurim((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const selectAllShiurim = () => setSelectedShiurim(new Set([...SHIURIM.map((s) => s.name), 'כולל']));
  const clearShiurim = () => setSelectedShiurim(new Set());

  return (
    <PageGuard requires="generateReports" message="הפקת דוחות דורשת הרשאת admin / manager / secretary.">

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
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">
                        שיעורים ({selectedShiurim.size})
                      </label>
                      <div className="flex gap-1 text-[11px]">
                        <button
                          type="button"
                          onClick={selectAllShiurim}
                          className="text-blue-600 hover:underline"
                        >
                          הכל
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={clearShiurim}
                          className="text-red-600 hover:underline"
                        >
                          נקה
                        </button>
                      </div>
                    </div>
                    <div className="border border-gray-300 rounded-lg max-h-56 overflow-y-auto p-2 space-y-1 bg-white">
                      {SHIURIM.map((s) => (
                        <label
                          key={s.name}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1.5 py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={selectedShiurim.has(s.name)}
                            onChange={() => toggleShiur(s.name)}
                            className="accent-blue-600"
                          />
                          <span>{s.name}</span>
                        </label>
                      ))}
                      {/* Virtual 'כולל' entry - filters by institution_name */}
                      <label
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1.5 py-0.5 border-t border-slate-200 mt-1 pt-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={selectedShiurim.has('כולל')}
                          onChange={() => toggleShiur('כולל')}
                          className="accent-blue-600"
                        />
                        <span>📘 כולל</span>
                      </label>
                    </div>
                    {selectedShiurim.size > 1 && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        💡 בחרת {selectedShiurim.size} שיעורים - כל שיעור יודפס בעמוד נפרד, ממוין א-ת
                      </p>
                    )}
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
                {selectedReport !== 'custom' && (
                  <Button
                    variant="secondary"
                    onClick={handleExportExcel}
                    className="w-full mt-2"
                  >
                    📥 ייצא לאקסל
                  </Button>
                )}
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
    </PageGuard>
  );
}
