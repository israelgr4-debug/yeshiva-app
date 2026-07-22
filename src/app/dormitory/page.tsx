'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useSupabase } from '@/hooks/useSupabase';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Student } from '@/lib/types';
import { SHIURIM_SECTIONS, KIBBUTZ_SECTIONS, shortStudentName, DormSection } from '@/lib/dorm-map';
import { getShiurFilterOptions } from '@/lib/list-reports';
import { isYeshivaStudent, exportUnassignedXlsx } from '@/lib/dorm-roster';

type TabId = 'shiurim' | 'kibbutz';

const SETTING_KEY = 'dormitory_layout';

// Max students per room. More than this is a data error the manager must fix.
const ROOM_CAPACITY = 5;

interface LayoutSection {
  id: string;
  title: string;
  category: 'shiurim' | 'kibbutz';
  rows: (number | string)[][];
}

export default function DormitoryPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('shiurim');
  const [customLayout, setCustomLayout] = useState<LayoutSection[] | null>(null);
  const [blankPrint, setBlankPrint] = useState(false);
  const [selectedShiurim, setSelectedShiurim] = useState<Set<string>>(new Set());
  const [showOverloaded, setShowOverloaded] = useState(false);
  const { fetchData } = useSupabase();
  const { getSetting } = useSystemSettings();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [data, layout] = await Promise.all([
        fetchData<Student>('students', { status: 'active' }),
        getSetting<LayoutSection[] | null>(SETTING_KEY, null),
      ]);
      setStudents(data); // keep ALL active (assigned + unassigned) for the counters
      if (layout && Array.isArray(layout) && layout.length > 0) setCustomLayout(layout);
      setLoading(false);
    }
    load();
  }, [fetchData, getSetting]);

  // Optional multi-shiur filter (e.g. print only שיעור ג + ד). Empty = all.
  const filteredStudents = useMemo(
    () => (selectedShiurim.size ? students.filter((s) => s.shiur && selectedShiurim.has(s.shiur)) : students),
    [students, selectedShiurim]
  );

  const shiurOptions = useMemo(() => getShiurFilterOptions().filter((o) => o.value), []);
  const orderedSelectedLabels = shiurOptions.filter((o) => selectedShiurim.has(o.value)).map((o) => o.label);

  const toggleShiur = (v: string) =>
    setSelectedShiurim((prev) => {
      const n = new Set(prev);
      if (n.has(v)) n.delete(v); else n.add(v);
      return n;
    });

  // Rooms holding more than ROOM_CAPACITY students - a data error to fix.
  // Scans ALL active students (ignores the shiur filter) so nothing is missed.
  const overloadedRooms = useMemo(() => {
    const m: Record<number, Student[]> = {};
    for (const s of students) {
      if (!s.room_number) continue;
      if (!m[s.room_number]) m[s.room_number] = [];
      m[s.room_number].push(s);
    }
    return Object.entries(m)
      .map(([room, list]) => ({ room: Number(room), students: list }))
      .filter((r) => r.students.length > ROOM_CAPACITY)
      .sort((a, b) => b.students.length - a.students.length || a.room - b.room);
  }, [students]);

  // Assigned / unassigned counters. Yeshiva only (exclude כולל), respecting the
  // active shiur filter.
  // Yeshiva-only students in the current shiur selection (כולל excluded).
  const scopedYeshiva = useMemo(() => {
    const base = students.filter(isYeshivaStudent);
    return selectedShiurim.size
      ? base.filter((s) => s.shiur && selectedShiurim.has(s.shiur))
      : base;
  }, [students, selectedShiurim]);

  const dormCounts = useMemo(() => {
    let assigned = 0;
    let unassigned = 0;
    for (const s of scopedYeshiva) {
      if (s.room_number) assigned++; else unassigned++;
    }
    return { assigned, unassigned };
  }, [scopedYeshiva]);

  const handleExportUnassigned = () => {
    const list = scopedYeshiva.filter((s) => !s.room_number);
    if (list.length === 0) { alert('אין תלמידים פעילים לא משובצים בסינון הנוכחי'); return; }
    exportUnassignedXlsx(list, `פעילים_לא_משובצים_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Build room → students map
  const roomMap = useMemo(() => {
    const m: Record<number, Student[]> = {};
    for (const s of filteredStudents) {
      if (!s.room_number) continue;
      if (!m[s.room_number]) m[s.room_number] = [];
      m[s.room_number].push(s);
    }
    return m;
  }, [filteredStudents]);

  const handlePrint = () => window.print();

  // Print an EMPTY map (room numbers only, no assignments): flip to blank mode,
  // let React commit the empty-roomMap render, then print, then restore.
  useEffect(() => {
    if (!blankPrint) return;
    const restore = () => setBlankPrint(false);
    window.addEventListener('afterprint', restore, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', restore);
  }, [blankPrint]);

  const handlePrintBlank = () => setBlankPrint(true);

  // When printing a blank map, hide all occupants by using an empty map.
  const effectiveRoomMap = blankPrint ? {} : roomMap;

  // Use saved layout if exists, else fall back to defaults
  const sections = useMemo(() => {
    const base = customLayout
      ? customLayout.filter((s) => s.category === activeTab)
      : activeTab === 'shiurim'
      ? SHIURIM_SECTIONS
      : KIBBUTZ_SECTIONS;

    // For 'shiurim': move the מזרח section right after קומה 2 - דרום so it
    // fills the leftover space under floor 2 in the right print column instead
    // of overflowing at the bottom of the left column.
    if (activeTab === 'shiurim') {
      const reordered = [...base];
      const eastIdx = reordered.findIndex(
        (s) => s.id === 'east-floor-1' || /מזרח/.test(s.title)
      );
      // User wants east BEFORE floor-3 (north). Find first floor-3 section
      // by id or by Hebrew title.
      const floor3Idx = reordered.findIndex(
        (s) => /^floor-3/.test(s.id) || /\b3\b/.test(s.title) || /קומה\s*3/.test(s.title)
      );
      if (eastIdx > -1 && floor3Idx > -1 && eastIdx !== floor3Idx) {
        const [east] = reordered.splice(eastIdx, 1);
        // Recompute target after splice
        const newFloor3Idx = reordered.findIndex(
          (s) => /^floor-3/.test(s.id) || /\b3\b/.test(s.title) || /קומה\s*3/.test(s.title)
        );
        reordered.splice(newFloor3Idx, 0, east);
      }
      return reordered;
    }
    return base;
  }, [customLayout, activeTab]);

  return (
    <>
      <Header
        title="פנימייה"
        subtitle="מפת חדרים ושיבוץ תלמידים"
      />

      <div className="p-4 md:p-8">
        {/* Controls */}
        <div className="no-print flex flex-wrap items-center gap-3 mb-6">
          <div className="flex bg-white border border-gray-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab('shiurim')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'shiurim' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              שיעורים
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kibbutz')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'kibbutz' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              קיבוץ
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900"
          >
            🖨️ הדפס / שמור PDF
          </button>

          <button
            type="button"
            onClick={handlePrintBlank}
            className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            🗒️ הדפס מפה ריקה
          </button>

          <Link
            href="/dormitory/edit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            ✏️ ערוך מפה
          </Link>

          <Link
            href="/dormitory/manage"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            🛠️ ניהול שיבוצים
          </Link>

          <button
            type="button"
            onClick={() => setShowOverloaded((v) => !v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border ${
              overloadedRooms.length > 0
                ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            ⚠️ חדרים חורגים ({overloadedRooms.length})
          </button>

          <button
            type="button"
            onClick={handleExportUnassigned}
            className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            title="מייצא לאקסל את הפעילים ללא חדר, לפי הסינון הנוכחי (ישיבה בלבד)"
          >
            📊 ייצא לא משובצים ({dormCounts.unassigned})
          </button>

          <span className="text-sm ms-auto flex items-center gap-3" title="תלמידי ישיבה בלבד (ללא כולל)">
            {loading ? (
              <span className="text-gray-500">טוען...</span>
            ) : (
              <>
                <span className="text-emerald-700 font-medium">{dormCounts.assigned} פעילים משובצים</span>
                <span className="text-gray-300">·</span>
                <span className="text-amber-700 font-medium">{dormCounts.unassigned} פעילים לא משובצים</span>
              </>
            )}
          </span>
        </div>

        {/* Overloaded rooms panel */}
        {showOverloaded && (
          <div className="no-print bg-white border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-red-800">
                ⚠️ חדרים עם יותר מ-{ROOM_CAPACITY} תלמידים
              </h3>
              <button
                type="button"
                onClick={() => setShowOverloaded(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            {overloadedRooms.length === 0 ? (
              <p className="text-sm text-emerald-700">
                ✓ אין חדרים חורגים — כל החדרים עם {ROOM_CAPACITY} תלמידים או פחות.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  סורק את כל התלמידים הפעילים (ללא תלות בסינון). לחץ על שם כדי לפתוח את כרטיס התלמיד ולשנות חדר.
                </p>
                <div className="space-y-3">
                  {overloadedRooms.map(({ room, students: list }) => (
                    <div key={room} className="border border-red-100 bg-red-50/50 rounded-lg p-3">
                      <div className="font-semibold text-red-900 mb-1">
                        חדר {room} — {list.length} תלמידים
                        <span className="text-xs font-normal text-red-700 ms-2">
                          (עודף {list.length - ROOM_CAPACITY})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {list.map((s) => (
                          <Link
                            key={s.id}
                            href={`/students/${s.id}`}
                            className="text-blue-700 hover:underline"
                            title={s.shiur || ''}
                          >
                            {s.last_name} {s.first_name}
                            {s.shiur && <span className="text-gray-500 text-xs"> ({s.shiur})</span>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Multi-shiur filter chips */}
        <div className="no-print flex flex-wrap items-center gap-2 mb-6 -mt-2">
          <span className="text-sm text-gray-600 font-medium">סינון שיעורים:</span>
          {shiurOptions.map((o) => {
            const on = selectedShiurim.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggleShiur(o.value)}
                className={`px-2.5 py-1 rounded-lg text-sm font-medium border transition-colors ${
                  on
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            );
          })}
          {selectedShiurim.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedShiurim(new Set())}
              className="text-sm text-gray-500 hover:underline ms-1"
            >
              נקה בחירה
            </button>
          )}
        </div>

        {/* Print-only single concise title */}
        <h1 className="hidden print:block dorm-print-title text-center font-bold mb-1">
          {activeTab === 'shiurim' ? 'פנימיות שיעורים' : 'פנימיות קיבוץ'}
          {orderedSelectedLabels.length ? ` — ${orderedSelectedLabels.join(', ')}` : ''}
          {blankPrint ? ' — מפה ריקה' : ''}
        </h1>

        {/* Sections - 2-column flow in print so all fit on one A4 landscape page */}
        <div className="space-y-6 dorm-sections">
          {sections.map((section) => (
            <SectionBox key={section.id} section={section} roomMap={effectiveRoomMap} />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
          aside, nav, button, .no-print,
          /* Hide the page Header (title 'פנימייה' + subtitle) in print */
          .sticky.top-0 {
            display: none !important;
          }
          html, body {
            background: white !important;
            font-size: 8pt;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            overflow: visible !important;
          }

          .dorm-print-title {
            font-size: 11pt !important;
            margin: 0 0 1mm 0 !important;
          }
          /* Two-column flow, balanced */
          .dorm-sections {
            column-count: 2;
            column-gap: 4mm;
            column-fill: balance;
            margin: 0 !important;
          }
          .dorm-sections > .dorm-section {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 2mm;
            border: 1.2px solid #000 !important;
            border-radius: 4px !important;
            box-shadow: none !important;
            display: block;
          }
          .dorm-section .section-title {
            background: #f3f4f6 !important;
            color: #000 !important;
            padding: 2px 4px !important;
            font-size: 9pt !important;
            font-weight: 700 !important;
            border-bottom: 1px solid #000 !important;
          }
          .dorm-section .section-body {
            padding: 1.5mm !important;
          }
          .dorm-section .room-row {
            margin-bottom: 1mm !important;
            gap: 1mm !important;
          }
          .room-cell {
            width: 14mm !important;
            height: 13mm !important;
            border: 1px solid #000 !important;
            border-radius: 2px !important;
            padding: 0.2mm !important;
          }
          .room-cell .room-num {
            font-size: 6pt !important;
            line-height: 1 !important;
            padding-bottom: 0 !important;
            margin-bottom: 0.2mm !important;
          }
          .room-cell .room-occupants {
            gap: 0 !important;
          }
          /* 5.6pt so a full 5-occupant room still fits inside the 13mm cell */
          .room-cell .room-occupants a,
          .room-cell .room-occupants span {
            font-size: 5.6pt !important;
            line-height: 1 !important;
          }
          .room-cell.empty-placeholder {
            width: 14mm !important;
            height: 13mm !important;
          }
          .dorm-section .room-row {
            margin-bottom: 0.5mm !important;
          }

          /* Avoid rounded clipping that hides borders on print */
          .dorm-section .section-body,
          .dorm-section { overflow: visible !important; }
        }
      `}</style>
    </>
  );
}

function SectionBox({ section, roomMap }: { section: DormSection; roomMap: Record<number, Student[]> }) {
  return (
    <div className="dorm-section bg-white border-2 border-gray-800 rounded-lg overflow-hidden">
      <div className="section-title bg-gray-800 text-white px-4 py-2 font-bold text-center print:bg-white print:text-black print:border-b print:border-black">
        {section.title}
      </div>
      <div className="section-body p-2 md:p-4">
        {section.rows.map((row, i) => (
          <div key={i} className="room-row flex gap-1 md:gap-2 justify-center mb-1 md:mb-2">
            {row.map((cell, j) => (
              <RoomCell key={j} cell={cell} roomMap={roomMap} />
            ))}
          </div>
        ))}
        {section.extraRooms?.map((row, i) => (
          <div key={`extra-${i}`} className="room-row flex gap-1 md:gap-2 justify-center mb-1 md:mb-2">
            {row.map((cell, j) => (
              <RoomCell key={j} cell={cell} roomMap={roomMap} isExtra />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomCell({
  cell,
  roomMap,
  isExtra,
}: {
  cell: number | string;
  roomMap: Record<number, Student[]>;
  isExtra?: boolean;
}) {
  if (cell === '' || cell === null || cell === undefined) {
    return <div className="room-cell empty-placeholder w-20 md:w-28 h-24 md:h-28 invisible" />;
  }

  if (typeof cell === 'string') {
    return (
      <div className="room-cell w-20 md:w-28 h-24 md:h-28 border border-gray-400 bg-gray-100 flex items-center justify-center p-1 rounded">
        <span className="text-xs md:text-sm font-medium text-center">{cell}</span>
      </div>
    );
  }

  const occupants = roomMap[cell] || [];
  const overloaded = occupants.length > ROOM_CAPACITY;

  return (
    <div
      className={`room-cell w-20 md:w-28 h-24 md:h-28 border bg-white flex flex-col p-1 rounded ${
        overloaded ? 'border-red-500 ring-1 ring-red-400' : 'border-gray-400'
      } ${isExtra ? 'bg-gray-50' : ''}`}
    >
      <div className="room-num text-xs text-gray-500 text-center border-b border-gray-200 pb-0.5 mb-0.5">
        {cell}
      </div>
      <div className="room-occupants flex-1 flex flex-col gap-0.5 overflow-hidden">
        {occupants.slice(0, ROOM_CAPACITY).map((s) => (
          <Link
            key={s.id}
            href={`/students/${s.id}`}
            className="text-[10px] md:text-xs leading-tight text-gray-800 hover:text-blue-600 truncate block"
            title={`${s.first_name} ${s.last_name} (${s.shiur || ''})`}
          >
            {shortStudentName(s.last_name, s.first_name)}
          </Link>
        ))}
        {occupants.length > ROOM_CAPACITY && (
          <span className="text-[9px] text-red-500 font-bold">+{occupants.length - ROOM_CAPACITY}</span>
        )}
      </div>
    </div>
  );
}
