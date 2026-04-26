'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Student, Family, Graduate, Registration, EducationHistory, Machzor,
} from '@/lib/types';

/* ---------- Normalizers ---------- */
const normalizeId = (s: string | null | undefined): string => {
  if (!s) return '';
  return String(s).replace(/\D/g, '').replace(/^0+/, '');
};
const normalizePhone = (s: string | null | undefined): string => {
  if (!s) return '';
  let v = String(s).replace(/\D/g, '');
  if (v.startsWith('972')) v = '0' + v.slice(3);
  return v;
};
const normalizeName = (s: string | null | undefined): string =>
  (s || '').trim().replace(/\s+/g, ' ');

/* ---------- Public types ---------- */
export type RoleType =
  | 'student-active' | 'student-chizuk' | 'student-inactive' | 'student-graduated'
  | 'graduate' | 'father' | 'mother' | 'father-in-law' | 'mother-in-law'
  | 'candidate';

export interface PersonRole {
  type: RoleType;
  /** Free-text label for badge (e.g. 'תלמיד פעיל · שיעור ז') */
  label: string;
  /** Tone class */
  tone: string;
  /** Where to navigate when this role is clicked */
  href?: string;
  /** Sub-detail to show */
  detail?: string;
}

export interface Person {
  id: string;                    // dedup key (id_number or hash)
  firstName: string;
  lastName: string;
  fullName: string;
  idNumber: string | null;
  phones: { label: string; value: string }[];
  email: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  photoUrl: string | null;
  roles: PersonRole[];
  /** Raw refs for the profile drawer */
  studentRefs: { id: string; status: string; shiur: string | null; photoUrl: string | null }[];
  graduateRefs: { id: string; marital: string | null; city: string | null; spouseName: string | null }[];
  familyRefs: { id: string; relation: 'father' | 'mother'; childrenNames: string[] }[];
  inLawRefs: { graduateId: string; relation: 'father-in-law' | 'mother-in-law'; graduateName: string }[];
  registrationRefs: { id: string; status: string }[];
  educationHistory: EducationHistory[];
  /** Auto-detected duplicate signals (informational) */
  warnings: string[];
}

/* ---------- Internal raw entry ---------- */
interface RawEntry {
  // identity
  firstName: string;
  lastName: string;
  idNumber: string | null;
  phones: { label: string; value: string }[];
  email?: string | null;
  // location
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  photoUrl?: string | null;
  // role
  role: PersonRole;
  // references
  studentRef?: { id: string; status: string; shiur: string | null; photoUrl: string | null };
  graduateRef?: { id: string; marital: string | null; city: string | null; spouseName: string | null };
  familyRef?: { id: string; relation: 'father' | 'mother'; childrenName: string };
  inLawRef?: { graduateId: string; relation: 'father-in-law' | 'mother-in-law'; graduateName: string };
  registrationRef?: { id: string; status: string };
}

/* ---------- Cache (session-scoped) ---------- */
let _cache: Person[] | null = null;
let _cachePromise: Promise<Person[]> | null = null;

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 30; p++) {
    const { data } = await supabase
      .from(table)
      .select(select)
      .range(p * 1000, p * 1000 + 999);
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

const STUDENT_STATUS_LABEL: Record<string, string> = {
  active: 'פעיל', chizuk: 'חיזוק', inactive: 'לא פעיל', graduated: 'סיים',
};

const STUDENT_TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  chizuk: 'bg-amber-50 text-amber-900 ring-amber-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
  graduated: 'bg-violet-50 text-violet-800 ring-violet-200',
};

async function buildDirectory(): Promise<Person[]> {
  const [students, families, graduates, registrations, edu, machzorot] = await Promise.all([
    fetchAll<Student>('students', '*'),
    fetchAll<Family>('families', '*'),
    fetchAll<Graduate>('graduates', '*'),
    fetchAll<Registration>('registrations', '*'),
    fetchAll<EducationHistory>('education_history', '*'),
    fetchAll<Machzor>('machzorot', 'id,name'),
  ]);

  const machzorById = new Map<string, Machzor>(machzorot.map((m) => [m.id, m]));
  const familyById = new Map<string, Family>(families.map((f) => [f.id, f]));
  const studentById = new Map<string, Student>(students.map((s) => [s.id, s]));
  const eduByStudent = new Map<string, EducationHistory[]>();
  for (const e of edu) {
    if (!eduByStudent.has(e.student_id)) eduByStudent.set(e.student_id, []);
    eduByStudent.get(e.student_id)!.push(e);
  }

  // Children per family - used for parent role labels
  const childrenNamesByFamily = new Map<string, { active: string[]; all: string[] }>();
  for (const s of students) {
    if (!s.family_id) continue;
    if (!childrenNamesByFamily.has(s.family_id))
      childrenNamesByFamily.set(s.family_id, { active: [], all: [] });
    const bucket = childrenNamesByFamily.get(s.family_id)!;
    bucket.all.push(s.first_name || '');
    if (s.status === 'active' || s.status === 'chizuk') bucket.active.push(s.first_name || '');
  }

  const raw: RawEntry[] = [];

  /* === Students === */
  for (const s of students) {
    const fam = s.family_id ? familyById.get(s.family_id) : undefined;
    const phones: { label: string; value: string }[] = [];
    if (s.phone) phones.push({ label: 'נייד תלמיד', value: s.phone });
    raw.push({
      firstName: s.first_name || '',
      lastName: s.last_name || '',
      idNumber: s.id_number || s.passport_number || null,
      phones,
      email: s.email || null,
      address: fam?.address || null,
      city: fam?.city || null,
      photoUrl: s.photo_url || null,
      role: {
        type: `student-${s.status}` as RoleType,
        label: `תלמיד ${STUDENT_STATUS_LABEL[s.status] || s.status}${s.shiur ? ` · ${s.shiur}` : ''}`,
        tone: STUDENT_TONE[s.status] || 'bg-slate-100 text-slate-700 ring-slate-200',
        href: `/students/${s.id}`,
        detail: s.shiur || undefined,
      },
      studentRef: { id: s.id, status: s.status, shiur: s.shiur || null, photoUrl: s.photo_url || null },
    });
  }

  /* === Family parents === */
  for (const f of families) {
    const childrenBucket = childrenNamesByFamily.get(f.id) || { active: [], all: [] };
    const childrenForLabel = childrenBucket.active.length > 0 ? childrenBucket.active : childrenBucket.all;
    if (f.father_name) {
      const phones: { label: string; value: string }[] = [];
      if (f.father_phone) phones.push({ label: 'נייד אב', value: f.father_phone });
      if (f.home_phone) phones.push({ label: 'בית', value: f.home_phone });
      raw.push({
        firstName: f.father_name.split(' ')[0] || f.father_name,
        lastName: f.family_name || f.father_name.split(' ').slice(-1)[0] || '',
        idNumber: f.father_id_number || null,
        phones,
        address: f.address,
        city: f.city,
        role: {
          type: 'father',
          label: childrenForLabel.length > 0 ? `אב של ${childrenForLabel.slice(0, 3).join(', ')}${childrenForLabel.length > 3 ? '…' : ''}` : 'אב',
          tone: 'bg-blue-50 text-blue-800 ring-blue-200',
          href: `/families/${f.id}`,
        },
        familyRef: { id: f.id, relation: 'father', childrenName: childrenForLabel.join(', ') },
      });
    }
    if (f.mother_name) {
      const phones: { label: string; value: string }[] = [];
      if (f.mother_phone) phones.push({ label: 'נייד אם', value: f.mother_phone });
      if (f.home_phone) phones.push({ label: 'בית', value: f.home_phone });
      raw.push({
        firstName: f.mother_name.split(' ')[0] || f.mother_name,
        lastName: f.family_name || f.mother_name.split(' ').slice(-1)[0] || '',
        idNumber: f.mother_id_number || null,
        phones,
        address: f.address,
        city: f.city,
        role: {
          type: 'mother',
          label: childrenForLabel.length > 0 ? `אם של ${childrenForLabel.slice(0, 3).join(', ')}${childrenForLabel.length > 3 ? '…' : ''}` : 'אם',
          tone: 'bg-pink-50 text-pink-800 ring-pink-200',
          href: `/families/${f.id}`,
        },
        familyRef: { id: f.id, relation: 'mother', childrenName: childrenForLabel.join(', ') },
      });
    }
  }

  /* === Graduates === */
  for (const g of graduates) {
    const phones: { label: string; value: string }[] = [];
    if (g.mobile) phones.push({ label: 'נייד', value: g.mobile });
    if (g.phone) phones.push({ label: 'בית', value: g.phone });
    const machzor = g.machzor_id ? machzorById.get(g.machzor_id) : null;
    const machzorLabel = machzor?.name || (g.machzor_name ? `מחזור ${g.machzor_name}` : '');
    // If linked to a student, inherit their id_number so dedup merges them
    const linkedStudent = g.student_id ? studentById.get(g.student_id) : undefined;
    const inheritedIdNumber = linkedStudent?.id_number || linkedStudent?.passport_number || null;
    raw.push({
      firstName: g.first_name || '',
      lastName: g.last_name || '',
      idNumber: inheritedIdNumber,
      phones,
      email: g.email || null,
      address: [g.street, g.building_number].filter(Boolean).join(' '),
      city: g.city || null,
      neighborhood: g.neighborhood || null,
      photoUrl: linkedStudent?.photo_url || null,
      role: {
        type: 'graduate',
        label: `בוגר${g.marital_status ? ` · ${g.marital_status}` : ''}${machzorLabel ? ` · ${machzorLabel}` : ''}`,
        tone: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
        href: `/graduates?id=${g.id}`,
        detail: g.marital_status || undefined,
      },
      graduateRef: { id: g.id, marital: g.marital_status || null, city: g.city, spouseName: g.spouse_name },
    });

    /* Spouse-side parents */
    const gradFullName = `${g.last_name} ${g.first_name}`.trim();
    if (g.spouse_father_name) {
      const phones: { label: string; value: string }[] = [];
      if (g.spouse_father_phone) phones.push({ label: 'נייד', value: g.spouse_father_phone });
      raw.push({
        firstName: g.spouse_father_name.split(' ')[0] || g.spouse_father_name,
        lastName: g.spouse_father_name.split(' ').slice(1).join(' ') || '',
        idNumber: null,
        phones,
        city: g.spouse_father_city || null,
        role: {
          type: 'father-in-law',
          label: `חמיו של ${gradFullName}`,
          tone: 'bg-amber-50 text-amber-900 ring-amber-200',
        },
        inLawRef: { graduateId: g.id, relation: 'father-in-law', graduateName: gradFullName },
      });
    }
    if (g.spouse_mother_name) {
      const phones: { label: string; value: string }[] = [];
      if (g.spouse_mother_phone) phones.push({ label: 'נייד', value: g.spouse_mother_phone });
      raw.push({
        firstName: g.spouse_mother_name.split(' ')[0] || g.spouse_mother_name,
        lastName: g.spouse_mother_name.split(' ').slice(1).join(' ') || '',
        idNumber: null,
        phones,
        city: g.spouse_father_city || null,
        role: {
          type: 'mother-in-law',
          label: `חמותו של ${gradFullName}`,
          tone: 'bg-rose-50 text-rose-800 ring-rose-200',
        },
        inLawRef: { graduateId: g.id, relation: 'mother-in-law', graduateName: gradFullName },
      });
    }
  }

  /* === Registrations === */
  for (const r of registrations) {
    if (r.status === 'converted') continue;
    const phones: { label: string; value: string }[] = [];
    if (r.phone) phones.push({ label: 'נייד', value: r.phone });
    raw.push({
      firstName: r.first_name,
      lastName: r.last_name,
      idNumber: r.id_number || r.passport_number || null,
      phones,
      email: r.email || null,
      city: r.city || null,
      role: {
        type: 'candidate',
        label: `מועמד${r.prev_yeshiva_name ? ` · ${r.prev_yeshiva_name}` : ''}`,
        tone: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
        href: `/registration`,
      },
      registrationRef: { id: r.id, status: r.status },
    });

    if (r.father_name) {
      const fphones: { label: string; value: string }[] = [];
      if (r.father_phone) fphones.push({ label: 'נייד אב', value: r.father_phone });
      raw.push({
        firstName: r.father_name.split(' ')[0] || r.father_name,
        lastName: r.last_name,
        idNumber: r.father_id_number || null,
        phones: fphones,
        email: r.father_email || null,
        city: r.city || null,
        role: {
          type: 'father',
          label: `אב של ${r.first_name} (מועמד)`,
          tone: 'bg-blue-50 text-blue-800 ring-blue-200',
        },
      });
    }
  }

  /* === Merge into Persons === */
  const dedupGroups = new Map<string, RawEntry[]>();

  for (const r of raw) {
    const id = normalizeId(r.idNumber);
    let key: string;
    if (id) {
      key = `id:${id}`;
    } else {
      const name = normalizeName(`${r.firstName} ${r.lastName}`);
      const phone = r.phones.length > 0 ? normalizePhone(r.phones[0].value) : '';
      if (!name) continue;
      // Without phone, only group by name + city to avoid over-merging
      key = phone ? `np:${name}|${phone}` : `nc:${name}|${normalizeName(r.city || '')}`;
    }
    if (!dedupGroups.has(key)) dedupGroups.set(key, []);
    dedupGroups.get(key)!.push(r);
  }

  const persons: Person[] = [];
  for (const [key, group] of dedupGroups) {
    const first = group[0];
    const phonesMap = new Map<string, { label: string; value: string }>();
    for (const e of group) {
      for (const p of e.phones) {
        const k = normalizePhone(p.value);
        if (!k || phonesMap.has(k)) continue;
        phonesMap.set(k, p);
      }
    }
    const phones = Array.from(phonesMap.values());

    // Best name - prefer one with most words
    let firstName = first.firstName;
    let lastName = first.lastName;
    for (const e of group) {
      if ((e.firstName + ' ' + e.lastName).length > (firstName + ' ' + lastName).length) {
        firstName = e.firstName;
        lastName = e.lastName;
      }
    }

    // Aggregated photo url
    const photoUrl = group.find((e) => e.photoUrl)?.photoUrl || null;

    // Aggregated address fields
    const address = group.find((e) => e.address)?.address || null;
    const city = group.find((e) => e.city)?.city || null;
    const neighborhood = group.find((e) => e.neighborhood)?.neighborhood || null;
    const email = group.find((e) => e.email)?.email || null;

    // Roles - dedupe by type+label
    const roleMap = new Map<string, PersonRole>();
    for (const e of group) roleMap.set(`${e.role.type}|${e.role.label}`, e.role);
    const roles = Array.from(roleMap.values());

    // Refs
    const studentRefs: Person['studentRefs'] = [];
    const graduateRefs: Person['graduateRefs'] = [];
    const familyRefs: Person['familyRefs'] = [];
    const inLawRefs: Person['inLawRefs'] = [];
    const registrationRefs: Person['registrationRefs'] = [];
    const eduSet = new Map<string, EducationHistory>();
    for (const e of group) {
      if (e.studentRef) {
        studentRefs.push(e.studentRef);
        const eduList = eduByStudent.get(e.studentRef.id) || [];
        for (const x of eduList) eduSet.set(x.id, x);
      }
      if (e.graduateRef) graduateRefs.push(e.graduateRef);
      if (e.familyRef) {
        const existing = familyRefs.find(
          (x) => x.id === e.familyRef!.id && x.relation === e.familyRef!.relation
        );
        if (existing) {
          if (e.familyRef.childrenName && !existing.childrenNames.includes(e.familyRef.childrenName))
            existing.childrenNames.push(e.familyRef.childrenName);
        } else {
          familyRefs.push({
            id: e.familyRef.id,
            relation: e.familyRef.relation,
            childrenNames: e.familyRef.childrenName ? [e.familyRef.childrenName] : [],
          });
        }
      }
      if (e.inLawRef) inLawRefs.push(e.inLawRef);
      if (e.registrationRef) registrationRefs.push(e.registrationRef);
    }

    // Warnings
    const warnings: string[] = [];
    if (graduateRefs.length > 1) {
      warnings.push(`${graduateRefs.length} רשומות בוגר נפרדות - מומלץ למזג ידנית`);
    }
    // Future: detect if a student exists in graduates without linkage

    const fullName = normalizeName(`${lastName} ${firstName}`);
    persons.push({
      id: key,
      firstName,
      lastName,
      fullName,
      idNumber: first.idNumber || null,
      phones,
      email,
      city,
      neighborhood,
      address,
      photoUrl,
      roles,
      studentRefs,
      graduateRefs,
      familyRefs,
      inLawRefs,
      registrationRefs,
      educationHistory: Array.from(eduSet.values()),
      warnings,
    });
  }

  return persons;
}

export function useDirectory() {
  const [persons, setPersons] = useState<Person[]>(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (force = false) => {
    if (force) {
      _cache = null;
      _cachePromise = null;
    }
    setLoading(true);
    try {
      if (!_cache && !_cachePromise) {
        _cachePromise = buildDirectory().then((p) => {
          _cache = p;
          return p;
        });
      }
      const data = _cachePromise ? await _cachePromise : _cache!;
      setPersons(data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
      _cachePromise = null;
    }
  }, []);

  useEffect(() => {
    if (!_cache) reload();
  }, [reload]);

  return { persons, loading, error, reload };
}

/* ---------- Smart search ---------- */
export function searchPersons(persons: Person[], query: string): Person[] {
  const q = (query || '').trim();
  if (!q) return persons.slice(0, 200);

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const isAllDigits = /^\d/.test(tokens[0]);

  const scored: Array<{ p: Person; score: number }> = [];
  for (const p of persons) {
    const text = [
      p.firstName, p.lastName, p.idNumber, p.email, p.city, p.neighborhood, p.address,
      ...p.phones.map((x) => x.value),
      ...p.roles.map((r) => r.label),
    ].filter(Boolean).map((v) => String(v).toLowerCase()).join(' ');
    const digitText = p.phones.map((x) => normalizePhone(x.value)).concat(normalizeId(p.idNumber)).join(' ');

    let allMatch = true;
    let exactName = false;
    for (const t of tokens) {
      const tDigits = t.replace(/\D/g, '');
      const matched = isAllDigits
        ? (digitText.includes(tDigits) || text.includes(t))
        : text.includes(t);
      if (!matched) {
        allMatch = false;
        break;
      }
    }
    if (!allMatch) continue;

    // Score: exact full name match scores highest
    const fn = p.firstName.toLowerCase();
    const ln = p.lastName.toLowerCase();
    if (tokens.includes(fn) && tokens.includes(ln)) exactName = true;
    let score = exactName ? 100 : 0;
    if (p.studentRefs.length > 0) score += 5; // Active people first
    if (p.graduateRefs.length > 0) score += 3;
    score += p.roles.length;

    scored.push({ p, score });
  }

  scored.sort((a, b) => b.score - a.score || a.p.lastName.localeCompare(b.p.lastName, 'he'));
  return scored.slice(0, 100).map((s) => s.p);
}
