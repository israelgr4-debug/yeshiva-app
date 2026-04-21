'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { useSupabase } from '@/hooks/useSupabase';
import { Student } from '@/lib/types';
import { SHIURIM_SECTIONS, KIBBUTZ_SECTIONS, shortStudentName, DormSection } from '@/lib/dorm-map';

type TabId = 'shiurim' | 'kibbutz';

export default function DormitoryPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('shiurim');
  const { fetchData } = useSupabase();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchData<Student>('students', { status: 'active' });
      setStudents(data.filter((s) => s.room_number));
      setLoading(false);
    }
    load();
  }, [fetchData]);

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

  const sections = activeTab === 'shiurim' ? SHIURIM_SECTIONS : KIBBUTZ_SECTIONS;

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

          <span className="text-sm text-gray-500 ms-auto">
            {loading ? 'טוען...' : `${students.length} תלמידים פעילים עם חדר`}
          </span>
        </div>

        {/* Print-only title */}
        <h1 className="hidden print:block text-center text-xl font-bold mb-4 underline">
          מפת חדרים - {activeTab === 'shiurim' ? 'שיעורים' : 'קיבוץ'}
        </h1>

        {/* Sections */}
        <div className="space-y-6 print:space-y-4">
          {sections.map((section) => (
            <SectionBox key={section.id} section={section} roomMap={roomMap} />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          aside, nav, button, .no-print {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            background: white !important;
          }
          .room-cell {
            border: 1px solid #000 !important;
          }
        }
      `}</style>
    </>
  );
}

function SectionBox({ section, roomMap }: { section: DormSection; roomMap: Record<number, Student[]> }) {
  return (
    <div className="bg-white border-2 border-gray-800 rounded-lg overflow-hidden">
      <div className="bg-gray-800 text-white px-4 py-2 font-bold text-center print:bg-white print:text-black print:border-b print:border-black">
        {section.title}
      </div>
      <div className="p-2 md:p-4">
        {section.rows.map((row, i) => (
          <div key={i} className="flex gap-1 md:gap-2 justify-center mb-1 md:mb-2">
            {row.map((cell, j) => (
              <RoomCell key={j} cell={cell} roomMap={roomMap} />
            ))}
          </div>
        ))}
        {section.extraRooms?.map((row, i) => (
          <div key={`extra-${i}`} className="flex gap-1 md:gap-2 justify-center mb-1 md:mb-2">
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
  // Empty placeholder (for alignment)
  if (cell === '' || cell === null || cell === undefined) {
    return <div className="w-20 md:w-28 h-24 md:h-28 invisible" />;
  }

  // Non-numeric cells are special names (דירת צוות, דירת רה"י)
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
      <div className="text-xs text-gray-500 text-center border-b border-gray-200 pb-0.5 mb-0.5">
        {cell}
      </div>
      <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
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
