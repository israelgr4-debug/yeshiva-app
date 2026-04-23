'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { supabase } from '@/lib/supabase';
import { SHIURIM, getMachzorForNewStudent, DEFAULT_BASE_MACHZOR } from '@/lib/shiurim';
import { ISRAELI_BANKS } from '@/lib/israeli-banks';
import { isValidIsraeliId, isValidBranch, validateBankAccountFull } from '@/lib/israeli-validators';

interface StudentFormProps {
  student?: Student;
  initialFamily?: Family | null;
  onSubmit: (data: { student: any; family: any }) => Promise<void>;
  isLoading?: boolean;
}

const statusOptions = [
  { value: 'active', label: 'פעיל' },
  { value: 'chizuk', label: 'חיזוק' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'graduated', label: 'סיים' },
];

const shiurOptions = SHIURIM.map((s) => ({ value: s.name, label: s.name }));

export function StudentForm({ student, initialFamily, onSubmit, isLoading }: StudentFormProps) {
  const [machzorot, setMachzorot] = useState<Machzor[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const { fetchData } = useSupabase();

  // Student fields
  const [studentData, setStudentData] = useState({
    first_name: student?.first_name || '',
    last_name: student?.last_name || '',
    id_number: student?.id_number || '',
    date_of_birth: student?.date_of_birth || '',
    shiur: student?.shiur || '',
    equivalent_year: student?.equivalent_year || '',
    phone: student?.phone || '',
    email: student?.email || '',
    status: student?.status || 'active',
    notes: student?.notes || '',
    machzor_id: student?.machzor_id || '',
    family_id: student?.family_id || '',
    photo_url: student?.photo_url || '',
    id_type: student?.id_type || '0',  // '0' = ID, '1' = passport
  });

  // Photo upload state
  const [photoUploading, setPhotoUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!studentData.id_number) {
      alert('קודם הזן תעודת זהות, אז אפשר להעלות תמונה');
      return;
    }

    setPhotoUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${studentData.id_number}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('student-photos')
        .upload(storagePath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('student-photos').getPublicUrl(storagePath);
      // Cache-bust with timestamp so the browser reloads the new image
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      setStudentData((prev) => ({ ...prev, photo_url: url }));
    } catch (err: any) {
      alert('שגיאה בהעלאת התמונה: ' + (err?.message || err));
    } finally {
      setPhotoUploading(false);
    }
  };

  // Family / parent fields
  const initialFamilyData = {
    father_name: initialFamily?.father_name || '',
    father_id_number: initialFamily?.father_id_number || '',
    father_phone: initialFamily?.father_phone || '',
    father_occupation: initialFamily?.father_occupation || '',
    mother_name: initialFamily?.mother_name || '',
    mother_id_number: initialFamily?.mother_id_number || '',
    mother_phone: initialFamily?.mother_phone || '',
    mother_occupation: initialFamily?.mother_occupation || '',
    address: initialFamily?.address || '',
    city: initialFamily?.city || '',
    home_phone: initialFamily?.home_phone || '',
    bank_name: initialFamily?.bank_name || '',
    bank_branch: initialFamily?.bank_branch || '',
    bank_account: initialFamily?.bank_account || '',
    billing_notes: initialFamily?.billing_notes || '',
  };
  const [familyData, setFamilyData] = useState(initialFamilyData);
  // Track whether the user actually edited any family field (guards against
  // accidentally wiping existing data when form was not touched).
  const [familyTouched, setFamilyTouched] = useState(false);
  // Silence unused init
  void initialFamilyData;

  // Family matching state
  const [matchedFamily, setMatchedFamily] = useState<Family | null>(null);
  const [matchedSiblingCount, setMatchedSiblingCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [linkedFamilyId, setLinkedFamilyId] = useState<string>(student?.family_id || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Base machzor for the current year (loaded from system_settings)
  const [baseMachzor, setBaseMachzor] = useState<number>(DEFAULT_BASE_MACHZOR);
  const { getSetting } = useSystemSettings();

  useEffect(() => {
    async function loadOptions() {
      const machzorotData = await fetchData<Machzor>('machzorot');
      const familiesData = await fetchData<Family>('families');
      setMachzorot(machzorotData);
      setFamilies(familiesData);

      // Load base machzor setting
      const base = await getSetting<number>('base_machzor_for_shiur_alef', DEFAULT_BASE_MACHZOR);
      setBaseMachzor(base);
    }
    loadOptions();
  }, [fetchData, getSetting]);

  // Track whether the user changed shiur manually in this session
  // (so we know whether to auto-update the machzor or preserve the DB value)
  const userChangedShiurRef = useRef(false);

  // Derive the machzor for display
  const derivedMachzorInfo = (() => {
    // For existing students who haven't manually changed shiur, show their current DB machzor
    if (student?.id && !userChangedShiurRef.current) {
      const m = machzorot.find((mm) => mm.id === studentData.machzor_id);
      return { name: m?.name || '—', isAuto: false };
    }
    // Kibutz: keep existing machzor (they bring it from their original shiur)
    if (studentData.shiur === 'קיבוץ') {
      const m = machzorot.find((mm) => mm.id === studentData.machzor_id);
      return { name: m?.name || '—', isAuto: false };
    }
    // New student OR existing student who changed shiur: derive from shiur
    const machzorNum = getMachzorForNewStudent(studentData.shiur, baseMachzor);
    if (machzorNum === null) return { name: '—', isAuto: true };
    const m = machzorot.find((mm) => mm.number === machzorNum);
    return { name: m?.name || `מחזור (${machzorNum})`, isAuto: true, id: m?.id };
  })();

  // Auto-set machzor_id when shiur changes MANUALLY (or for new students)
  useEffect(() => {
    if (!studentData.shiur) return;
    if (studentData.shiur === 'קיבוץ') return;
    // For existing students, only auto-update if the user changed shiur in this session
    if (student?.id && !userChangedShiurRef.current) return;

    const machzorNum = getMachzorForNewStudent(studentData.shiur, baseMachzor);
    if (machzorNum === null) return;

    const m = machzorot.find((mm) => mm.number === machzorNum);
    if (m && m.id !== studentData.machzor_id) {
      setStudentData((prev) => ({ ...prev, machzor_id: m.id }));
    }
  }, [studentData.shiur, baseMachzor, machzorot, studentData.machzor_id, student?.id]);

  const familyOptions = families.map((f) => ({
    value: f.id,
    label: `${f.family_name} - ${f.father_name || ''}`,
  }));

  // Search for existing family by father_id_number
  const searchFamilyByFatherId = useCallback(async (fatherIdNumber: string) => {
    if (!fatherIdNumber || fatherIdNumber.length < 5) {
      setMatchedFamily(null);
      setMatchedSiblingCount(0);
      return;
    }
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('families')
        .select('*')
        .eq('father_id_number', fatherIdNumber);

      if (error) throw error;

      if (data && data.length > 0) {
        const found = data[0] as Family;
        // Don't suggest if it's the same family already linked
        if (found.id === linkedFamilyId) {
          setMatchedFamily(null);
          setMatchedSiblingCount(0);
        } else {
          setMatchedFamily(found);
          // Count siblings
          const { data: siblings } = await supabase
            .from('students')
            .select('id')
            .eq('family_id', found.id);
          setMatchedSiblingCount(siblings?.length || 0);
        }
      } else {
        setMatchedFamily(null);
        setMatchedSiblingCount(0);
      }
    } catch {
      setMatchedFamily(null);
      setMatchedSiblingCount(0);
    } finally {
      setIsSearching(false);
    }
  }, [linkedFamilyId]);

  const handleStudentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // Track manual shiur changes so the auto-derive logic knows to update machzor
    if (name === 'shiur') {
      userChangedShiurRef.current = true;
    }
    setStudentData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFamilyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFamilyData((prev) => ({ ...prev, [name]: value }));
    setFamilyTouched(true);

    // Debounce search on father_id_number
    if (name === 'father_id_number') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        searchFamilyByFatherId(value);
      }, 500);
    }
  };

  // Link to matched family
  const handleLinkFamily = () => {
    if (!matchedFamily) return;
    setLinkedFamilyId(matchedFamily.id);
    setStudentData((prev) => ({ ...prev, family_id: matchedFamily.id }));
    // Fill parent fields from matched family
    setFamilyData({
      father_name: matchedFamily.father_name || '',
      father_id_number: matchedFamily.father_id_number || '',
      father_phone: matchedFamily.father_phone || '',
      father_occupation: matchedFamily.father_occupation || '',
      mother_name: matchedFamily.mother_name || '',
      mother_id_number: matchedFamily.mother_id_number || '',
      mother_phone: matchedFamily.mother_phone || '',
      mother_occupation: matchedFamily.mother_occupation || '',
      address: matchedFamily.address || '',
      city: matchedFamily.city || '',
      home_phone: matchedFamily.home_phone || '',
      bank_name: matchedFamily.bank_name || '',
      bank_branch: matchedFamily.bank_branch || '',
      bank_account: matchedFamily.bank_account || '',
      billing_notes: matchedFamily.billing_notes || '',
    });
    setMatchedFamily(null);
    setMatchedSiblingCount(0);
  };

  // Unlink family
  const handleUnlinkFamily = () => {
    setLinkedFamilyId('');
    setStudentData((prev) => ({ ...prev, family_id: '' }));
  };

  // Manual family dropdown change
  const handleManualFamilyLink = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const familyId = e.target.value;
    if (familyId) {
      const selected = families.find((f) => f.id === familyId);
      if (selected) {
        setLinkedFamilyId(selected.id);
        setStudentData((prev) => ({ ...prev, family_id: selected.id }));
        setFamilyData({
          father_name: selected.father_name || '',
          father_id_number: selected.father_id_number || '',
          father_phone: selected.father_phone || '',
          father_occupation: selected.father_occupation || '',
          mother_name: selected.mother_name || '',
          mother_id_number: selected.mother_id_number || '',
          mother_phone: selected.mother_phone || '',
          mother_occupation: selected.mother_occupation || '',
          address: selected.address || '',
          city: selected.city || '',
          home_phone: selected.home_phone || '',
          bank_name: selected.bank_name || '',
          bank_branch: selected.bank_branch || '',
          bank_account: selected.bank_account || '',
          billing_notes: selected.billing_notes || '',
        });
      }
    } else {
      handleUnlinkFamily();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitStudentData = {
      ...studentData,
      machzor_id: studentData.machzor_id || null,
      family_id: linkedFamilyId || null,
    };
    // Only pass family data if user actually edited the family form - otherwise
    // pass empty object so family fields are NOT touched on save
    await onSubmit({
      student: submitStudentData,
      family: familyTouched ? familyData : {},
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" dir="rtl">
      {/* === סקציה 1: פרטי התלמיד === */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-100 pb-2">
          פרטי התלמיד
        </h3>

        {/* Photo upload */}
        <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-100">
          <div className="flex-shrink-0">
            {studentData.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={studentData.photo_url}
                alt="תמונת תלמיד"
                className="w-36 h-48 md:w-44 md:h-56 object-cover rounded-lg border-2 border-gray-200 shadow-sm"
              />
            ) : (
              <div className="w-36 h-48 md:w-44 md:h-56 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm">אין תמונה</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">תמונת תלמיד</label>
            <label className="inline-block cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium border border-blue-200 transition-colors">
              {photoUploading ? 'מעלה...' : studentData.photo_url ? 'החלף תמונה' : 'העלה תמונה'}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={photoUploading}
                className="hidden"
              />
            </label>
            {studentData.photo_url && (
              <button
                type="button"
                onClick={() => setStudentData((p) => ({ ...p, photo_url: '' }))}
                className="ms-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                הסר
              </button>
            )}
            <p className="text-xs text-gray-500 mt-2">
              הזן קודם תעודת זהות, אז העלה תמונה. הקובץ יישמר לפי מספר התעודה.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם משפחה"
            name="last_name"
            value={studentData.last_name}
            onChange={handleStudentChange}
            required
          />
          <Input
            label="שם פרטי"
            name="first_name"
            value={studentData.first_name}
            onChange={handleStudentChange}
            required
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תעודת זהות / דרכון
              {studentData.id_number && !studentData.id_type && (
                isValidIsraeliId(studentData.id_number)
                  ? <span className="text-green-600 ms-1">✓</span>
                  : <span className="text-amber-600 ms-1" title="ת.ז לא תקינה - אם זה דרכון סמן את הבוקס">⚠</span>
              )}
            </label>
            <input
              name="id_number"
              value={studentData.id_number}
              onChange={handleStudentChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="flex items-center gap-2 mt-1 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={Number(studentData.id_type) === 1}
                onChange={(e) =>
                  handleStudentChange({
                    target: { name: 'id_type', value: e.target.checked ? '1' : '0' },
                  } as any)
                }
              />
              זה דרכון (לא ת.ז)
            </label>
          </div>
          <Input
            label="טלפון"
            name="phone"
            type="tel"
            value={studentData.phone}
            onChange={handleStudentChange}
          />
          <Input
            label="דוא״ל"
            name="email"
            type="email"
            value={studentData.email}
            onChange={handleStudentChange}
          />
          <Input
            label="תאריך לידה"
            name="date_of_birth"
            type="date"
            value={studentData.date_of_birth}
            onChange={handleStudentChange}
          />
        </div>

        {/* שיעור ומחזור */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
          <Select
            label="שיעור"
            name="shiur"
            options={shiurOptions}
            value={studentData.shiur}
            onChange={handleStudentChange}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              מחזור {derivedMachzorInfo.isAuto && (
                <span className="text-xs text-gray-500">(אוטומטי לפי שיעור)</span>
              )}
            </label>
            <div className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-800">
              {derivedMachzorInfo.name}
            </div>
          </div>
          <Input
            label="כתה מקבילה"
            name="equivalent_year"
            value={studentData.equivalent_year}
            onChange={handleStudentChange}
          />
        </div>

        {/* סטטוס */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          <Select
            label="סטטוס"
            name="status"
            options={statusOptions}
            value={studentData.status}
            onChange={handleStudentChange}
          />
          <Input
            label="תאריך קבלה"
            name="admission_date"
            type="date"
            value={student?.admission_date || ''}
            disabled
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">הערות</label>
          <textarea
            name="notes"
            value={studentData.notes}
            onChange={handleStudentChange}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* === סקציה 2: פרטי הורים === */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
          <h3 className="text-lg font-semibold text-gray-900">פרטי הורים</h3>
          {linkedFamilyId && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full">
                משויך למשפחה
              </span>
              <button
                type="button"
                onClick={handleUnlinkFamily}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                בטל שיוך
              </button>
            </div>
          )}
        </div>

        {/* Family match banner */}
        {matchedFamily && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-blue-800 font-medium">
                נמצאה משפחה קיימת: משפחת {matchedFamily.family_name}
                {matchedSiblingCount > 0 && (
                  <span className="text-blue-600"> - {matchedSiblingCount} אחים בישיבה</span>
                )}
              </p>
            </div>
            <Button type="button" onClick={handleLinkFamily} className="whitespace-nowrap">
              שייך למשפחה
            </Button>
          </div>
        )}

        {isSearching && (
          <div className="text-sm text-gray-500 mb-3">מחפש משפחה...</div>
        )}

        {/* פרטי אב */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-2">פרטי האב</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם האב"
            name="father_name"
            value={familyData.father_name}
            onChange={handleFamilyChange}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תז אב
              {familyData.father_id_number && (
                isValidIsraeliId(familyData.father_id_number)
                  ? <span className="text-green-600 ms-1">✓</span>
                  : <span className="text-amber-600 ms-1" title="ת.ז לא תקינה - יכול להיות דרכון">⚠</span>
              )}
            </label>
            <input
              name="father_id_number"
              value={familyData.father_id_number}
              onChange={handleFamilyChange}
              placeholder="הקלד תז אב לחיפוש אחים"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Input
            label="טלפון אב"
            name="father_phone"
            type="tel"
            value={familyData.father_phone}
            onChange={handleFamilyChange}
          />
          <Input
            label="עיסוק אב"
            name="father_occupation"
            value={familyData.father_occupation}
            onChange={handleFamilyChange}
          />
        </div>

        {/* פרטי אם */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-6">פרטי האם</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם האם"
            name="mother_name"
            value={familyData.mother_name}
            onChange={handleFamilyChange}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תז אם
              {familyData.mother_id_number && (
                isValidIsraeliId(familyData.mother_id_number)
                  ? <span className="text-green-600 ms-1">✓</span>
                  : <span className="text-amber-600 ms-1">⚠</span>
              )}
            </label>
            <input
              name="mother_id_number"
              value={familyData.mother_id_number}
              onChange={handleFamilyChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Input
            label="טלפון אם"
            name="mother_phone"
            type="tel"
            value={familyData.mother_phone}
            onChange={handleFamilyChange}
          />
          <Input
            label="עיסוק אם"
            name="mother_occupation"
            value={familyData.mother_occupation}
            onChange={handleFamilyChange}
          />
        </div>

        {/* כתובת */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-6">כתובת ופרטי קשר</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="כתובת"
            name="address"
            value={familyData.address}
            onChange={handleFamilyChange}
          />
          <Input
            label="עיר"
            name="city"
            value={familyData.city}
            onChange={handleFamilyChange}
          />
          <Input
            label="טלפון בבית"
            name="home_phone"
            type="tel"
            value={familyData.home_phone}
            onChange={handleFamilyChange}
          />
        </div>

        {/* בנק */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-6">פרטי בנק</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם בנק</label>
            <select
              name="bank_name"
              value={familyData.bank_name}
              onChange={handleFamilyChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- בחר --</option>
              {ISRAELI_BANKS.map((b) => (
                <option key={b.code} value={b.shortName}>
                  {b.code} - {b.shortName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סניף
              {familyData.bank_branch && (
                isValidBranch(familyData.bank_branch)
                  ? <span className="text-green-600 ms-1">✓</span>
                  : <span className="text-amber-600 ms-1">⚠</span>
              )}
            </label>
            <input
              name="bank_branch"
              value={familyData.bank_branch}
              onChange={handleFamilyChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              מספר חשבון
              {familyData.bank_account && (() => {
                const bankCode = ISRAELI_BANKS.find((b) => b.shortName === familyData.bank_name)?.code;
                const result = validateBankAccountFull(bankCode, familyData.bank_branch, familyData.bank_account);
                // Structural errors only show amber warning.
                // Check-digit mismatches are NOT flagged as errors because the
                // algorithms vary per bank and not all are publicly documented.
                if (result === 'invalid') return <span className="text-amber-600 ms-1" title="מבנה לא תקין - רק ספרות, 4-9 תווים">⚠</span>;
                if (result === 'valid') return <span className="text-green-600 ms-1" title="תקין - עבר ספרת ביקורת">✓</span>;
                // 'structural' or 'bad-check' → show blue circle (didn't validate but didn't fail structurally)
                return <span className="text-blue-600 ms-1" title="מבנה תקין (ספרת ביקורת לא נבדקה במלואה)">○</span>;
              })()}
            </label>
            <input
              name="bank_account"
              value={familyData.bank_account}
              onChange={handleFamilyChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* הערות גביה */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">הערות לגביה</label>
          <textarea
            name="billing_notes"
            value={familyData.billing_notes}
            onChange={handleFamilyChange}
            rows={2}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* שיוך ידני למשפחה */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <Select
            label="שיוך ידני למשפחה"
            name="manual_family_id"
            options={familyOptions}
            value={linkedFamilyId}
            onChange={handleManualFamilyLink}
          />
          <p className="text-xs text-gray-500 mt-1">
            אם יש אחים בישיבה, ניתן לשייך ידנית לאותה משפחה
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'שומר...' : student ? 'עדכן' : 'צור תלמיד'}
        </Button>
      </div>
    </form>
  );
}
