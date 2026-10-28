'use client';

// "📝 הורד Word" for certificates. Builds a native RTL .docx that matches the yeshiva's
// original Word certificates (see lib/cert-docx.ts) from the SAME template the in-app
// editor edits (body / recipient / signer HTML), so print and Word say the same thing.

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Student } from './types';
import { ReportType, SignerInfo, DEFAULT_SIGNER } from './certificates';
import { toHebrewDate } from './utils';
import { renderTemplateBody, formatCertDate } from '@/hooks/useCertificateTemplates';
import { certificateBlocks, receiptBlocks, docxParts, DocBlock } from './cert-docx';
import { headerConfigOf, certDates } from './cert-layout';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function zipBlocks(blocks: DocBlock[]): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, xml] of Object.entries(docxParts(blocks))) zip.file(path, xml);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

/** Title from the template header (<h1>…</h1>), default "אישור". */
function titleFromHeader(headerHtml: string | null | undefined): string {
  const m = headerHtml?.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const t = m ? m[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim() : '';
  return t && !/\{\{/.test(t) ? t : 'אישור';
}

/** Values shown in bold, as in the original certificates (student name, ID, year, dates). */
function emphasisFor(student: Student, year: string, extras: Record<string, string>): string[] {
  const vals = [
    `${student.last_name || ''} ${student.first_name || ''}`.trim(),
    student.id_number || '',
    student.passport_number || '',
    year,
    formatCertDate(student.admission_date || ''),
  ];
  for (const [k, v] of Object.entries(extras || {})) {
    if (/date/i.test(k) && v) vals.push(formatCertDate(v));
  }
  return vals.filter((v) => v && v.length > 1 && v !== '___');
}

export async function buildCertificateDocx(
  student: Student,
  reportType: ReportType,
  year: string,
  extras: Record<string, string>,
  signer: SignerInfo = reportType.signer || DEFAULT_SIGNER,
  isChinuch = false,
): Promise<Blob> {
  const now = new Date();

  if (reportType.isReceipt) {
    return zipBlocks(receiptBlocks({
      donorName: extras.donorName || '', donorId: extras.donorId || '',
      donorAddress: extras.donorAddress || '', donorCity: extras.donorCity || '',
      amount: extras.amount || '', amountWords: extras.amountWords || '',
      paymentMethod: extras.paymentMethod || '', receiptNumber: extras.receiptNumber || '',
      gregorianDate: `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
      hebrewDateShort: toHebrewDate(now),
    }));
  }

  const sg = signer || DEFAULT_SIGNER;
  // chinuch students: the chinuch letterhead/signature carries the signer → only "בכבוד רב,"
  let signerHtml: string | null = null;
  let signerLines: string[] | undefined;
  if (isChinuch) signerLines = ['בכבוד רב,'];
  else if (reportType.signerHtml) signerHtml = renderTemplateBody(reportType.signerHtml, student, year, extras, sg);
  else signerLines = ['בכבוד רב,', sg.name, sg.idNumber, sg.title].filter(Boolean) as string[];

  const hcfg = reportType.headerConfig || headerConfigOf(null, reportType.headerHtml);
  const dates = certDates(hcfg, now);
  const blocks = certificateBlocks({
    hebrewDate: dates.hebrew,
    gregorianDate: dates.gregorian,
    title: hcfg.title || titleFromHeader(reportType.headerHtml),
    header: {
      showBsd: hcfg.showBsd, bsdAlign: hcfg.bsdAlign, datesAlign: hcfg.datesAlign, datesLayout: hcfg.datesLayout,
      titleSize: hcfg.titleSize, titleBold: hcfg.titleBold, titleUnderline: hcfg.titleUnderline,
    },
    recipient: renderTemplateBody(reportType.recipient || '', student, year, extras, sg),
    bodyHtml: reportType.buildBody(student, year, extras),
    signerHtml,
    signerLines,
    emphasize: emphasisFor(student, year, extras),
  });
  return zipBlocks(blocks);
}

export async function exportCertificateToWord(
  student: Student,
  reportType: ReportType,
  year: string,
  extras: Record<string, string>,
  signer: SignerInfo = reportType.signer || DEFAULT_SIGNER,
  isChinuch = false,
): Promise<void> {
  const blob = await buildCertificateDocx(student, reportType, year, extras, signer, isChinuch);
  const who = reportType.isReceipt ? (extras.donorName || 'תורם') : `${student.last_name || ''}_${student.first_name || ''}`;
  saveAs(blob, `${reportType.name}_${who}.docx`.replace(/[\\/:*?"<>|]/g, ''));
}
