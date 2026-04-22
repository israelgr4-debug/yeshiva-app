'use client';

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
} from 'docx';
import { saveAs } from 'file-saver';
import { Student } from './types';
import {
  ReportType,
  SignerInfo,
  DEFAULT_SIGNER,
  getGregorianDate,
} from './certificates';
import { toHebrewDate } from './utils';

export async function exportCertificateToWord(
  student: Student,
  reportType: ReportType,
  year: string,
  extras: Record<string, string>,
  signer: SignerInfo = reportType.signer || DEFAULT_SIGNER
): Promise<void> {
  const hebrewDate = toHebrewDate(new Date());
  const gregorianDate = getGregorianDate();

  const children: Paragraph[] = [];

  // Top spacer for pre-printed letterhead
  children.push(
    new Paragraph({ children: [new TextRun('')], spacing: { after: 400 } })
  );
  children.push(
    new Paragraph({ children: [new TextRun('')], spacing: { after: 400 } })
  );

  // בס"ד
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [new TextRun({ text: 'בס"ד', size: 24 })],
    })
  );

  // Dates row (Hebrew + Gregorian)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: hebrewDate, size: 24 }),
        new TextRun({ text: '        ', size: 24 }),
        new TextRun({ text: gregorianDate, size: 24 }),
      ],
    })
  );

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { before: 300, after: 300 },
      children: [
        new TextRun({ text: 'אישור', bold: true, size: 44, underline: {} }),
      ],
    })
  );

  // Recipient
  if (reportType.recipient) {
    children.push(
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: reportType.recipient, bold: true, size: 28 }),
        ],
      })
    );
  }

  // Body (multiline → separate paragraphs)
  const body = reportType.buildBody(student, year, extras);
  for (const line of body.split('\n')) {
    if (!line.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun('')],
          spacing: { after: 200 },
        })
      );
    } else {
      children.push(
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 100 },
          children: [new TextRun({ text: line, size: 28 })],
        })
      );
    }
  }

  // Signature block (centered)
  children.push(
    new Paragraph({
      children: [new TextRun('')],
      spacing: { before: 600 },
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'בכבוד רב,', size: 28 })],
    })
  );
  if (signer.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        spacing: { after: 80 },
        children: [new TextRun({ text: signer.name, bold: true, size: 28 })],
      })
    );
  }
  if (signer.idNumber) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        spacing: { after: 80 },
        children: [new TextRun({ text: signer.idNumber, size: 28 })],
      })
    );
  }
  if (signer.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        children: [new TextRun({ text: signer.title, size: 28 })],
      })
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'David',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1700, // ~3cm - leaves room for pre-printed letterhead header
              bottom: 1700,
              left: 1400,
              right: 1400,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${reportType.name}_${student.last_name}_${student.first_name}.docx`;
  saveAs(blob, fileName);
}
