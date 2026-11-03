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
import { certificateBlocks, receiptBlocks, docxParts, DocBlock, DocMedia, CertificateModel } from './cert-docx';
import { headerConfigOf, certDates, SignLayout, DEFAULT_SIGN_LAYOUT } from './cert-layout';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function zipBlocks(blocks: DocBlock[], media: DocMedia[] = []): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, data] of Object.entries(docxParts(blocks, media))) zip.file(path, data);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

/** Pictures printed on the page — chinuch students get them in Word exactly as in print. */
export interface CertWordImages {
  letterheadUrl?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  layout?: SignLayout;
}

/** Fetch an image as PNG/JPEG bytes + its aspect ratio (other formats are re-encoded as PNG). */
async function loadImage(url: string): Promise<{ media: DocMedia; ratio: number }> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const ratio = bmp.width / bmp.height || 1;
  let data = new Uint8Array(await blob.arrayBuffer());
  let ext: DocMedia['ext'] | null = data[0] === 0x89 && data[1] === 0x50 ? 'png' : data[0] === 0xff && data[1] === 0xd8 ? 'jpeg' : null;
  if (!ext) {
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/png'));
    data = new Uint8Array(await png.arrayBuffer());
    ext = 'png';
  }
  bmp.close();
  return { media: { data, ext }, ratio };
}

async function loadCertImages(img: CertWordImages | undefined): Promise<{ media: DocMedia[]; images: CertificateModel['images'] }> {
  const media: DocMedia[] = [];
  const images: NonNullable<CertificateModel['images']> = {};
  if (!img) return { media, images };
  const layout = img.layout || DEFAULT_SIGN_LAYOUT;
  const add = async (url: string) => { const r = await loadImage(url); media.push(r.media); return { i: media.length - 1, ratio: r.ratio }; };
  if (img.letterheadUrl) images.letterhead = { media: (await add(img.letterheadUrl)).i };
  // stamp first, signature on top of it (as in the print preview)
  for (const [url, pos] of [[img.stampUrl, layout.stamp], [img.signatureUrl, layout.signature]] as const) {
    if (!url) continue;
    const r = await add(url);
    (images.signer ||= []).push({ media: r.i, x: pos.x, y: pos.y, h: pos.h, w: pos.h * r.ratio });
  }
  return { media, images };
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
  pictures?: CertWordImages,
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
  const { media, images } = await loadCertImages(pictures);
  const blocks = certificateBlocks({
    images,
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
  return zipBlocks(blocks, media);
}

export async function exportCertificateToWord(
  student: Student,
  reportType: ReportType,
  year: string,
  extras: Record<string, string>,
  signer: SignerInfo = reportType.signer || DEFAULT_SIGNER,
  isChinuch = false,
  pictures?: CertWordImages,
): Promise<void> {
  const blob = await buildCertificateDocx(student, reportType, year, extras, signer, isChinuch, pictures);
  const who = reportType.isReceipt ? (extras.donorName || 'תורם') : `${student.last_name || ''}_${student.first_name || ''}`;
  saveAs(blob, `${reportType.name}_${who}.docx`.replace(/[\\/:*?"<>|]/g, ''));
}
