'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import { getStatusLabel } from '@/lib/utils';
import Link from 'next/link';
import { useMemo } from 'react';
import { SHIURIM } from '@/lib/shiurim';

export type SortKey =
  | 'last_name'
  | 'first_name'
  | 'id_number'
  | 'institution'
  | 'shiur'
  | 'machzor'
  | 'address'
  | 'status';

export type SortDir = 'asc' | 'desc';

interface StudentTableProps {
  students: Student[];
  machzorot?: Record<string, Machzor>;
  families?: Record<string, Family>;
  siblingCounts?: Record<string, number>;
  isLoading?: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
}

const SHIUR_ORDER = new Map(SHIURIM.map((s, i) => [s.name, i]));

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === 'active'
          ? 'success'
          : status === 'chizuk'
          ? 'primary'
          : status === 'inactive'
          ? 'warning'
          : 'gray'
      }
    >
      {getStatusLabel(status)}
    </Badge>
  );
}

function InstitutionChip({ name }: { name?: string | null }) {
  if (!name) return <span className="text-slate-300 text-xs">—</span>;
  const isYeshiva = name === 'ישיבה';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
        isYeshiva
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
      }`}
    >
      {name}
    </span>
  );
}

export function StudentTable({
  students,
  machzorot = {},
  families = {},
  siblingCounts = {},
  isLoading,
  sortKey,
  sortDir,
  onSortChange,
}: StudentTableProps) {
  const sortedStudents = useMemo(() => {
    const list = [...students];
    const mul = sortDir === 'asc' ? 1 : -1;
    const getVal = (s: Student): string | number => {
      switch (sortKey) {
        case 'last_name': return s.last_name || '';
        case 'first_name': return s.first_name || '';
        case 'id_number': return s.id_number || '';
        case 'institution': return s.institution_name || '';
        case 'shiur': return SHIUR_ORDER.get(s.shiur || '') ?? 9999;
        case 'machzor': return (s.machzor_id && machzorot[s.machzor_id]?.number) || 0;
        case 'address': {
          const f = s.family_id ? families[s.family_id] : undefined;
          return (f?.city || '') + (f?.address || '');
        }
        case 'status': return s.status;
      }
    };
    list.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb), 'he') * mul;
    });
    return list;
  }, [students, sortKey, sortDir, machzorot, families]);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <p className="text-5xl mb-3 opacity-40">🔍</p>
        <p className="text-slate-500 text-base font-medium">לא נמצאו תלמידים</p>
        <p className="text-slate-400 text-sm mt-1">נסה לשנות את הסינון</p>
      </div>
    );
  }

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => {
    const active = sortKey === field;
    return (
      <TableCell isHeader className="p-0">
        <button
          type="button"
          onClick={() => onSortChange(field)}
          className={`w-full text-start px-3 md:px-4 py-2.5 flex items-center gap-1.5 transition-colors ${
            active ? 'text-slate-900 bg-slate-100/50' : 'hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span>{label}</span>
          <span
            className={`text-[10px] transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}
            aria-hidden
          >
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </button>
      </TableCell>
    );
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="שם משפחה" field="last_name" />
              <SortHeader label="שם פרטי" field="first_name" />
              <SortHeader label="ת״ז" field="id_number" />
              <SortHeader label="מוסד" field="institution" />
              <SortHeader label="שיעור" field="shiur" />
              <SortHeader label="מחזור" field="machzor" />
              <SortHeader label="כתובת" field="address" />
              <SortHeader label="סטטוס" field="status" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student) => {
              const family = student.family_id ? families[student.family_id] : undefined;
              const siblings = student.family_id ? siblingCounts[student.family_id] || 0 : 0;
              const addressText = family
                ? [family.address, family.city].filter(Boolean).join(', ')
                : '';
              const mach =
                student.machzor_id && machzorot[student.machzor_id]
                  ? machzorot[student.machzor_id]
                  : null;

              return (
                <TableRow key={student.id} isClickable>
                  <TableCell>
                    <Link
                      href={`/students/${student.id}`}
                      className="text-blue-700 hover:text-blue-800 hover:underline font-semibold"
                    >
                      {student.last_name}
                    </Link>
                    {siblings > 1 && (
                      <span
                        className="ms-1.5 inline-flex items-center bg-amber-50 text-amber-800 px-1.5 py-0 rounded-md text-[10px] font-bold ring-1 ring-amber-200"
                        title={`${siblings} אחים פעילים במשפחה`}
                      >
                        👥 {siblings}
                      </span>
                    )}
                    {student.is_chinuch && (
                      <span
                        className="ms-1 inline-flex items-center bg-purple-600 text-white px-1.5 py-0 rounded-md text-[10px] font-bold"
                        title="מסומן חינוך"
                      >
                        📘
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/students/${student.id}`}
                      className="text-blue-700 hover:text-blue-800 hover:underline"
                    >
                      {student.first_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500 font-mono tabular-nums">
                    {student.id_number}
                  </TableCell>
                  <TableCell>
                    <InstitutionChip name={student.institution_name} />
                  </TableCell>
                  <TableCell className="text-slate-700">{student.shiur || '—'}</TableCell>
                  <TableCell>
                    {mach ? (
                      <span className="inline-flex items-center bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ring-violet-100">
                        {mach.name}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-xs text-slate-500 max-w-[200px] truncate"
                    title={addressText}
                  >
                    {addressText || <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={student.status} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {sortedStudents.map((student) => {
          const family = student.family_id ? families[student.family_id] : undefined;
          const siblings = student.family_id ? siblingCounts[student.family_id] || 0 : 0;
          const addressText = family
            ? [family.address, family.city].filter(Boolean).join(', ')
            : '';
          const machzor = student.machzor_id ? machzorot[student.machzor_id] : null;

          return (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="block bg-white border border-slate-200 rounded-xl p-3 active:bg-slate-50 elevation-1 hover:elevation-2 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm">
                    {student.last_name} {student.first_name}
                    {siblings > 1 && (
                      <span className="ms-1.5 inline-flex items-center bg-amber-50 text-amber-800 px-1.5 rounded-md text-[10px] font-bold">
                        👥 {siblings}
                      </span>
                    )}
                    {student.is_chinuch && (
                      <span className="ms-1 inline-flex items-center bg-purple-600 text-white px-1.5 rounded-md text-[10px] font-bold">
                        📘
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">ת"ז: {student.id_number}</p>
                </div>
                <StatusBadge status={student.status} />
              </div>

              <div className="flex flex-wrap gap-1.5 mb-1.5">
                <InstitutionChip name={student.institution_name} />
                {student.shiur && (
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md text-xs">
                    {student.shiur}
                  </span>
                )}
                {machzor && (
                  <span className="bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md text-xs ring-1 ring-violet-100">
                    {machzor.name}
                  </span>
                )}
              </div>

              {addressText && (
                <p className="text-[11px] text-slate-500 truncate">📍 {addressText}</p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
