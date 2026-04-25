'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useSupabase } from '@/hooks/useSupabase';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { Student } from '@/lib/types';
import { SHIURIM_SECTIONS, KIBBUTZ_SECTIONS, shortStudentName, DormSection } from '@/lib/dorm-map';

type TabId = 'shiurim' | 'kibbutz';

const SETTING_KEY = 'dormitory_layout';

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
  const { fetchData } = useSupabase();
  const { getSetting } = useSystemSettings();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [data, layout] = await Promise.all([
        fetchData<Student>('students', { status: 'active' }),
        getSetting<LayoutSection[] | null>(SETTING_KEY, null),
      ]);
      setStudents(data.filter((s) => s.room_number));
      if (layout && Array.isArray(layout) && layout.length > 0) setCustomLayout(layout);
      setLoading(false);
    }
    load();
  }, [fetchData, getSetting]);

  // Build room → students map
  const roomMap = useMemo(() => {
    const m: Record<number, Student[]> = {};
    for (const s of students) {
      if (!s.room_number) continue;
      if (!m[s.room_number]) m[s.room_number] = [];
      m[s.room_number].push(s);
    }
    return m;
  }, [students]);

  const handlePrint = () => window.print();

  // Use saved layout if exists, else fall back to defaults
  const sections = useMemo(() => {
    if (customLayout) {
      return customLayout.filter((s) => s.category === activeTab);
    }
    return activeTab === 'shiurim' ? SHIURIM_SECTIONS : KIBBUTZ_SECTIONS;
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

          <span className="text-sm text-gray-500 ms-auto">
            {loading ? 'טוען...' : `${students.length} תלמידים פעילים עם חדר`}
          </span>
        </div>

        {/* Print-only title */}
        <h1 className="hidden print:block text-center text-base font-bold mb-2 underline">
          מפת חדרים - {activeTab === 'shiurim' ? 'שיעורים' : 'קיבוץ'}
        </h1>

        {/* Sections - 2-column flow in print so all fit on one A4 landscape page */}
        <div className="space-y-6 dorm-sections">
          {sections.map((section) => (
            <SectionBox key={section.id} section={section} roomMap={roomMap} />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
          aside, nav, button, .no-print {
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

          /* Two-column flow: keep each section together, fill columns balanced */
          .dorm-sections {
            column-count: 2;
            column-gap: 5mm;
            column-fill: balance;
            margin: 0 !important;
          }
          .dorm-sections > .dorm-section {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 3mm;
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
            width: 17mm !important;
            height: 13mm !important;
            border: 1px solid #000 !important;
            border-radius: 2px !important;
            padding: 0.2mm !important;
          }
          .room-cell .room-num {
            font-size: 5.5pt !important;
            line-height: 1 !important;
            padding-bottom: 0 !important;
            margin-bottom: 0.2mm !important;
          }
          .room-cell .room-occupants {
            gap: 0 !important;
          }
          .room-cell .room-occupants a,
          .room-cell .room-occupants span {
            font-size: 5.5pt !important;
            line-height: 1 !important;
          }
          .room-cell.empty-placeholder {
            width: 17mm !important;
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

  return (
    <div
      className={`room-cell w-20 md:w-28 h-24 md:h-28 border border-gray-400 bg-white flex flex-col p-1 rounded ${
        isExtra ? 'bg-gray-50' : ''
      }`}
    >
      <div className="room-num text-xs text-gray-500 text-center border-b border-gray-200 pb-0.5 mb-0.5">
        {cell}
      </div>
      <div className="room-occupants flex-1 flex flex-col gap-0.5 overflow-hidden">
        {occupants.slice(0, 4).map((s) => (
          <Link
            key={s.id}
            href={`/students/${s.id}`}
            className="text-[10px] md:text-xs leading-tight text-gray-800 hover:text-blue-600 truncate block"
            title={`${s.first_name} ${s.last_name} (${s.shiur || ''})`}
          >
            {shortStudentName(s.last_name, s.first_name)}
          </Link>
        ))}
        {occupants.length > 4 && (
          <span className="text-[9px] text-gray-400">+{occupants.length - 4}</span>
        )}
      </div>
    </div>
  );
}
