'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Student } from '@/lib/types';
import { REPORT_TYPES, ReportTypeId, ReportType } from '@/lib/certificates';

interface ReportSelectorProps {
  students: Student[];
  loading: boolean;
  onGenerate: (student: Student, reportType: ReportType, year: string, extras: Record<string, string>) => void;
}

// Report IDs where we default to showing INACTIVE students (תלמידים שעזבו)
const LEFT_STUDENT_REPORT_IDS: ReportTypeId[] = ['left', 'left_with_masachtot'];

export function ReportSelector({ students, loading, onGenerate }: ReportSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<ReportTypeId | ''>('');
  const [year, setYear] = useState('תשפ"ו');
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-switch default status filter based on selected report type
  useEffect(() => {
    if (!selectedReportId) return;
    if (LEFT_STUDENT_REPORT_IDS.includes(selectedReportId)) {
      setStatusFilter('inactive');
    } else {
      setStatusFilter('active');
    }
  }, [selectedReportId]);

  const filteredStudents = useMemo(() => {
    let list = students;

    // Status filter
    if (statusFilter === 'active') {
      list = list.filter((s) => s.status === 'active' || s.status === 'chizuk');
    } else if (statusFilter === 'inactive') {
      list = list.filter((s) => s.status !== 'active' && s.status !== 'chizuk');
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (s) =>
        (s.first_name || '').toLowerCase().includes(term) ||
        (s.last_name || '').toLowerCase().includes(term) ||
        (s.id_number || '').includes(term)
    );
  }, [students, searchTerm, statusFilter]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const selectedReport = useMemo(
    () => REPORT_TYPES.find((r) => r.id === selectedReportId) || null,
    [selectedReportId]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Reset extras when report type changes
  useEffect(() => {
    setExtras({});
  }, [selectedReportId]);

  const handleSelectStudent = (student: Student) => {
    setSelectedStudentId(student.id);
    setSearchTerm(`${student.first_name} ${student.last_name} - ${student.id_number}`);
    setShowDropdown(false);
  };

  const handleGenerate = () => {
    if (!selectedStudent || !selectedReport) return;
    onGenerate(selectedStudent, selectedReport, year, extras);
  };

  const canGenerate = selectedStudent && selectedReport;

  return (
    <div className="space-y-6">
      {/* Status filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">סינון תלמידים</label>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              statusFilter === 'active' ? 'bg-white shadow text-blue-700' : 'text-gray-600'
            }`}
          >
            פעילים
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('inactive')}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              statusFilter === 'inactive' ? 'bg-white shadow text-blue-700' : 'text-gray-600'
            }`}
          >
            שעזבו
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              statusFilter === 'all' ? 'bg-white shadow text-blue-700' : 'text-gray-600'
            }`}
          >
            הכל
          </button>
        </div>
      </div>

      {/* Student search */}
      <div ref={dropdownRef} className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-2">בחר תלמיד</label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setSelectedStudentId('');
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="חפש לפי שם או ת.ז..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {showDropdown && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {loading ? (
              <div className="p-3 text-gray-500 text-center">טוען...</div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-3 text-gray-500 text-center">לא נמצאו תלמידים</div>
            ) : (
              filteredStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleSelectStudent(student)}
                  className="w-full text-start px-4 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                >
                  <span className="font-medium">
                    {student.first_name} {student.last_name}
                  </span>
                  <span className="text-gray-500 text-sm mr-2">ת.ז. {student.id_number}</span>
                  {student.shiur && (
                    <span className="text-gray-400 text-sm mr-2">| שיעור: {student.shiur}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Report type selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">סוג אישור</label>
        <select
          value={selectedReportId}
          onChange={(e) => setSelectedReportId(e.target.value as ReportTypeId | '')}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">בחר סוג אישור</option>
          {REPORT_TYPES.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Year input */}
      <Input
        label="שנת לימודים"
        value={year}
        onChange={(e) => setYear(e.target.value)}
        placeholder='תשפ"ו'
      />

      {/* Extra fields based on report type */}
      {selectedReport?.extraFields.map((field) => (
        field.type === 'textarea' ? (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
            <textarea
              value={extras[field.key] || ''}
              onChange={(e) => setExtras((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        ) : (
          <Input
            key={field.key}
            label={field.label}
            type={field.type}
            value={extras[field.key] || ''}
            onChange={(e) => setExtras((prev) => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder}
          />
        )
      ))}

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={!canGenerate} size="lg" className="w-full">
        הפק אישור
      </Button>
    </div>
  );
}
