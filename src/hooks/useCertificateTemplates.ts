'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';
import {
  ExtraField,
  REPORT_TYPES,
  ReportType,
  DEFAULT_SIGNER,
  SignerInfo,
  getGregorianDate,
} from '@/lib/certificates';
import { toHebrewDate } from '@/lib/utils';

export interface CertificateTemplate {
  id: string;
  name: string;
  recipient: string | null;
  /** Editable header HTML (בס"ד + dates + title). Null = use builtin. */
  header_html: string | null;
  /** Body with placeholders */
  body: string;
  /** Editable signer block HTML. Null = use builtin. Hidden for chinuch students. */
  signer_html: string | null;
  extra_fields: ExtraField[];
  signer_name: string | null;
  signer_title: string | null;
  signer_id_number: string | null;
  is_receipt: boolean;
  is_active: boolean;
  display_order: number;
}

/** Resolve {{placeholders}} in a template body / header / signer */
export function renderTemplateBody(
  body: string,
  student: Student | null,
  year: string,
  extras: Record<string, string>,
  signer?: SignerInfo
): string {
  if (!body) return '';
  const sg = signer || DEFAULT_SIGNER;
  const replacements: Record<string, string> = {
    first_name: student?.first_name || '',
    last_name: student?.last_name || '',
    full_name: student ? `${student.last_name} ${student.first_name}`.trim() : '',
    full_name_with_id: student
      ? `${student.last_name} ${student.first_name} ת.ז. ${student.id_number || ''}`.trim()
      : '',
    id_number: student?.id_number || '',
    passport_number: student?.passport_number || '',
    shiur: student?.shiur || '',
    year: year || '',
    admission_date: student?.admission_date || '___',
    date_of_birth: student?.date_of_birth || '',
    hebrew_date: toHebrewDate(new Date()),
    gregorian_date: getGregorianDate(),
    signer_name: sg.name || '',
    signer_title: sg.title || '',
    signer_id_number: sg.idNumber || '',
    ...extras,
  };
  return body.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (_m, key) => {
    const v = replacements[key];
    if (v === undefined || v === '') return '';
    return String(v);
  });
}

/** Convert a DB template into the legacy ReportType shape used by the page */
export function templateToReportType(t: CertificateTemplate): ReportType {
  const signer: SignerInfo | undefined =
    t.signer_name || t.signer_title
      ? {
          name: t.signer_name || '',
          title: t.signer_title || '',
          idNumber: t.signer_id_number || '',
        }
      : undefined;
  return {
    id: t.id as any,
    name: t.name,
    recipient: t.recipient || '',
    extraFields: t.extra_fields || [],
    isReceipt: t.is_receipt,
    signer,
    buildBody: (student, year, extras) =>
      renderTemplateBody(t.body, student, year, extras, signer),
    headerHtml: t.header_html || null,
    signerHtml: t.signer_html || null,
  };
}

/** Hook that loads templates from DB and returns ReportType[] (with fallback) */
export function useCertificateTemplates() {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [reportTypes, setReportTypes] = useState<ReportType[]>(REPORT_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('certificate_templates')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      const list = (data || []) as CertificateTemplate[];
      if (list.length > 0) {
        setTemplates(list);
        // Only show active ones in the report dropdown
        setReportTypes(list.filter((t) => t.is_active).map(templateToReportType));
      } else {
        // fall back to hardcoded
        setReportTypes(REPORT_TYPES);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
      setReportTypes(REPORT_TYPES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const upsert = useCallback(async (t: Partial<CertificateTemplate> & { id: string }) => {
    const { error } = await supabase.from('certificate_templates').upsert(t).eq('id', t.id);
    if (error) throw error;
    await reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('certificate_templates').delete().eq('id', id);
    if (error) throw error;
    await reload();
  }, [reload]);

  return {
    templates,
    reportTypes,
    loading,
    error,
    reload,
    upsert,
    remove,
    DEFAULT_SIGNER,
  };
}

/** Available placeholder catalog (for the editor's "insert" buttons) */
export const PLACEHOLDER_CATALOG: { key: string; label: string; group: string }[] = [
  { key: 'first_name', label: 'שם פרטי', group: 'תלמיד' },
  { key: 'last_name', label: 'שם משפחה', group: 'תלמיד' },
  { key: 'full_name', label: 'שם מלא', group: 'תלמיד' },
  { key: 'full_name_with_id', label: 'שם מלא + ת"ז', group: 'תלמיד' },
  { key: 'id_number', label: 'תעודת זהות', group: 'תלמיד' },
  { key: 'passport_number', label: 'דרכון', group: 'תלמיד' },
  { key: 'shiur', label: 'שיעור', group: 'תלמיד' },
  { key: 'admission_date', label: 'תאריך כניסה', group: 'תלמיד' },
  { key: 'date_of_birth', label: 'תאריך לידה', group: 'תלמיד' },
  { key: 'year', label: 'שנת הלימודים', group: 'מערכת' },
  { key: 'hebrew_date', label: 'תאריך עברי (היום)', group: 'מערכת' },
  { key: 'gregorian_date', label: 'תאריך לועזי (היום)', group: 'מערכת' },
  { key: 'signer_name', label: 'שם החותם', group: 'חתימה' },
  { key: 'signer_id_number', label: 'ת"ז החותם', group: 'חתימה' },
  { key: 'signer_title', label: 'תפקיד החותם', group: 'חתימה' },
];
