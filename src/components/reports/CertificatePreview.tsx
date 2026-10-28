'use client';

import React from 'react';
import { Student } from '@/lib/types';
import {
  getGregorianDate,
  SignerInfo,
  DEFAULT_SIGNER,
  ReportType,
} from '@/lib/certificates';
import { toHebrewDate } from '@/lib/utils';
import { renderTemplateBody } from '@/hooks/useCertificateTemplates';
import { headerConfigOf, certDates, SignLayout, DEFAULT_SIGN_LAYOUT } from '@/lib/cert-layout';
import { SignerBlock } from './SignerBlock';

interface CertificatePreviewProps {
  student: Student;
  reportType: ReportType;
  year: string;
  extras: Record<string, string>;
  signer?: SignerInfo;
  signatureUrl?: string | null; // email only - the signature image
  stampUrl?: string | null;     // print + email - the stamp image (separate from the signature)
  signLayout?: SignLayout;      // where stamp / signature sit (settings → editor drag)
  letterheadUrl?: string | null; // email only - show letterhead image at top
  reserveLetterheadSpace?: boolean; // print - leave blank top area for pre-printed letterhead
  isChinuch?: boolean; // chinuch sub-institution: hide signer name/id, center signature
}

export function CertificatePreview({
  student,
  reportType,
  year,
  extras,
  signer,
  signatureUrl,
  stampUrl,
  signLayout,
  letterheadUrl,
  reserveLetterheadSpace,
  isChinuch,
}: CertificatePreviewProps) {
  const hebrewDate = toHebrewDate(new Date());
  const gregorianDate = getGregorianDate();
  const activeSigner = reportType.signer || signer || DEFAULT_SIGNER;

  // Section 46 Receipt - special layout
  if (reportType.isReceipt) {
    return (
      <div id="certificate-preview" className="certificate-container">
        <div className="certificate-scale-wrapper">
        <div className="certificate-page receipt-page">
          {/* Thank you letter section */}
          <div className="receipt-header">
            <p>לכבוד</p>
            <p className="font-bold">{extras.donorName || '___'} {extras.donorId ? `ע"ר ${extras.donorId}` : ''}</p>
            <p>{extras.donorAddress || ''} {extras.donorCity || ''}</p>
          </div>

          <p className="mt-4 font-bold">שלומים מרובים</p>

          <div className="receipt-body mt-4">
            <p>
              בשם הנהלת ישיבת מיר מודיעין עילית, ראשיה, ותלמידיה, הננו להביע מעומק הלב רגשי תודה וההערכה למע&quot;כ, על תרומתכם הנדיבה.
            </p>
            <p className="mt-2">
              בתרומה זו הנכם שותפים נאמנים בהחזקתו של מבצר התורה הגדול.
            </p>
            <p className="mt-2">
              יהי רצון שזכות לימוד התורה של תלמידי הישיבה, תעמוד לכם ולמשפחתכם, שלא תמוש התורה מפיכם ומפי זרעכם עד עולם. ותזכו לשפע של ברכה והצלחה, ברוחניות ובגשמיות.
            </p>
          </div>

          <p className="mt-6">בברכת התורה</p>
          <p className="font-bold">ישיבת מיר מודיעין עילית</p>

          {/* Receipt section */}
          <div className="receipt-divider mt-8 mb-4" />

          <div className="receipt-section">
            <div className="flex justify-between items-start">
              <p className="font-bold">קבלה מספר {extras.receiptNumber || '___'}</p>
              <div className="text-left text-sm">
                <p>מקור – תרומה</p>
                <p>{gregorianDate}</p>
                <p>{hebrewDate}</p>
              </div>
            </div>

            <p className="mt-4">
              נתקבל בברכה מאת {extras.donorName || '___'} {extras.donorId ? `ע"ר ${extras.donorId}` : ''}{extras.donorAddress ? `, ${extras.donorAddress}` : ''} {extras.donorCity || ''}
            </p>
            <p className="mt-2 font-bold text-lg">
              סך {extras.amount || '___'} ({extras.amountWords || '___'}) שח
            </p>
            <p className="mt-2">
              שולם ב{extras.paymentMethod || '___'}
            </p>
            <p className="mt-4 text-sm">
              למוסד אישור מס הכנסה לענין תרומות פי סעיף 46 לפקודה.
            </p>
          </div>
        </div>
        </div>

        <style jsx>{`
          .certificate-container {
            display: flex;
            justify-content: center;
            padding: 20px;
          }
          .certificate-scale-wrapper {
            flex-shrink: 0;
          }
          .certificate-page {
            width: 210mm;
            min-height: 297mm;
            background: white;
            padding: 30mm 25mm 30mm 25mm;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            direction: rtl;
            font-family: 'David', 'Miriam', Arial, sans-serif;
            font-size: 15px;
            line-height: 1.8;
            color: #000;
          }
          .receipt-divider {
            border-top: 2px dashed #999;
          }
          .receipt-header p {
            margin: 0;
          }
          .receipt-body p {
            text-align: justify;
          }
          .receipt-section {
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
          }
          @media print {
            .certificate-page {
              box-shadow: none;
              padding: 20mm;
            }
          }
          @media (max-width: 900px) {
            .certificate-container {
              padding: 8px;
              overflow: hidden;
              display: block;
              width: 100%;
            }
            .certificate-scale-wrapper {
              width: 100%;
              padding-bottom: 141.4%; /* A4 aspect ratio 297/210 */
              height: 0;
              position: relative;
              overflow: hidden;
            }
            .certificate-scale-wrapper > .certificate-page {
              position: absolute;
              top: 0;
              right: 0;
              transform: scale(calc((100vw - 32px) / 794px));
              transform-origin: top right;
            }
          }
          @media (max-width: 500px) {
            .certificate-scale-wrapper > .certificate-page {
              transform: scale(calc((100vw - 20px) / 794px));
            }
          }
        `}</style>
      </div>
    );
  }

  // Standard certificate layout — same structure as the Word export (lib/cert-docx)
  const body = reportType.buildBody(student, year, extras);
  const hcfg = reportType.headerConfig || headerConfigOf(null, reportType.headerHtml);
  const dates = certDates(hcfg);
  const alignCss = (a: string) => ({ textAlign: a as 'right' | 'center' | 'left' });

  // signer: template HTML, else the default lines; chinuch students → only "בכבוד רב,"
  const sg = activeSigner;
  const signerHtml = isChinuch
    ? '<p>בכבוד רב,</p>'
    : reportType.signerHtml
      ? renderTemplateBody(reportType.signerHtml, student, year, extras, sg)
      : ['בכבוד רב,', sg.name ? `<strong>${sg.name}</strong>` : '', sg.idNumber, sg.title].filter(Boolean).map((l) => `<p>${l}</p>`).join('');
  const recipientHtml = renderTemplateBody(reportType.recipient || '', student, year, extras, sg);

  return (
    <div id="certificate-preview" className="certificate-container">
      <div className="certificate-scale-wrapper">
      <div className={`certificate-page ${letterheadUrl ? 'with-letterhead-bg' : ''}`}>
        {/* Letterhead image overlay - positioned absolutely with 2cm offset from top (email only) */}
        {letterheadUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={letterheadUrl}
            alt="בלאנק"
            className="letterhead-bg-img"
            aria-hidden="true"
          />
        )}

        {/* Top spacer - for pre-printed letterhead (print) OR when using full-page background (email) */}
        {(reserveLetterheadSpace || letterheadUrl) && <div className="letterhead-top-space" aria-hidden="true" />}

        {/* Header — from the template's header settings */}
        <div className="certificate-header-cfg">
          {hcfg.showBsd && <div className="bsd" style={alignCss(hcfg.bsdAlign)}>בס&quot;ד</div>}
          {(dates.hebrew || dates.gregorian) && (
            hcfg.datesLayout === 'inline' ? (
              <div className="date-line-cfg" style={alignCss(hcfg.datesAlign)}>
                {[dates.hebrew, dates.gregorian].filter(Boolean).join('\u00A0\u00A0\u00A0\u00A0')}
              </div>
            ) : (
              <div className="date-line-cfg" style={alignCss(hcfg.datesAlign)}>
                {dates.hebrew && <div>{dates.hebrew}</div>}
                {dates.gregorian && <div>{dates.gregorian}</div>}
              </div>
            )
          )}
        </div>
        <h1 className="certificate-title">{hcfg.title || 'אישור'}</h1>

        {/* Recipient (plain text or editor HTML) */}
        {recipientHtml && (
          /<[a-z]/i.test(recipientHtml)
            ? <div className="certificate-recipient" dangerouslySetInnerHTML={{ __html: recipientHtml }} />
            : <p className="certificate-recipient">{recipientHtml}</p>
        )}

        {/* Body - render HTML when present, else split into lines */}
        <div className="certificate-body">
          {/<[a-z]/i.test(body) ? (
            <div dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            body.split('\n').map((line, i) => (
              <p key={i} className={line.trim() === '' ? 'certificate-spacer' : ''}>
                {line}
              </p>
            ))
          )}
        </div>

        {/* Signer block + stamp / signature images at the saved positions */}
        <SignerBlock html={signerHtml} stampUrl={stampUrl} signatureUrl={signatureUrl} layout={signLayout || DEFAULT_SIGN_LAYOUT} />

        {/* Bottom spacer - for pre-printed letterhead footer */}
        {(reserveLetterheadSpace || letterheadUrl) && <div className="letterhead-bottom-space" aria-hidden="true" />}
      </div>
      </div>

      <style jsx>{`
        .certificate-container {
          display: flex;
          justify-content: center;
          padding: 20px;
        }
        .certificate-scale-wrapper {
          flex-shrink: 0;
        }
        .certificate-page {
          width: 210mm;
          min-height: 297mm;
          background: white;
          padding: 30mm 25mm 30mm 25mm;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          direction: rtl;
          font-family: 'David', 'Miriam', Arial, sans-serif;
          font-size: 16px;
          line-height: 2;
          color: #000;
          position: relative;
        }
        /* Letterhead on email: make the page relative, overlay the image absolutely */
        .certificate-page.with-letterhead-bg {
          position: relative;
        }
        .letterhead-bg-img {
          position: absolute;
          top: 20mm; /* push down 2cm from page top */
          left: 0;
          width: 100%;
          height: calc(100% - 20mm); /* fit the rest of the page */
          object-fit: fill; /* stretch to fill */
          z-index: 0;
          pointer-events: none;
        }
        .certificate-page.with-letterhead-bg > *:not(.letterhead-bg-img) {
          position: relative;
          z-index: 1; /* make text appear above the image */
        }
        .letterhead-top-space {
          height: 30mm; /* space for header (pre-printed letterhead top) */
          width: 100%;
        }
        .letterhead-bottom-space {
          height: 30mm; /* space for footer / pre-printed letterhead bottom */
          width: 100%;
        }
        .certificate-header {
          text-align: center;
          margin-bottom: 20px;
        }
        .bsd {
          font-size: 14px;
          margin-bottom: 5px;
        }
        .yeshiva-name {
          font-size: 13px;
          color: #555;
          margin-bottom: 10px;
        }
        .certificate-header-cfg {
          font-size: 15px;
          line-height: 1.7;
        }
        .date-line-cfg {
          margin-top: 2px;
        }
        .date-line {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          direction: rtl;
        }
        .certificate-title {
          text-align: center;
          font-size: 28px;
          font-weight: bold;
          margin: 25px 0;
          text-decoration: underline;
        }
        .certificate-recipient {
          font-weight: bold;
          margin-bottom: 20px;
          font-size: 16px;
        }
        .certificate-body p {
          margin: 0;
          text-align: justify;
        }
        .certificate-spacer {
          height: 16px;
        }
        .certificate-signature {
          margin-top: 60px;
          line-height: 1.8;
          text-align: center;
        }
        .signer-name {
          font-weight: bold;
        }
        @media print {
          .certificate-page {
            box-shadow: none;
            padding: 20mm;
          }
        }
        /* Mobile: scale A4 page inside a wrapper that compensates layout height */
        @media (max-width: 900px) {
          .certificate-container {
            padding: 8px;
            overflow: hidden;
            display: block;
            width: 100%;
          }
          .certificate-scale-wrapper {
            width: 100%;
            aspect-ratio: 210 / 297;
            position: relative;
            overflow: hidden;
          }
          .certificate-scale-wrapper > .certificate-page {
            position: absolute;
            top: 0;
            right: 0;
            transform: scale(calc((100vw - 32px) / 794px));
            transform-origin: top right;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          }
        }
        @media (max-width: 500px) {
          .certificate-scale-wrapper > .certificate-page {
            transform: scale(calc((100vw - 20px) / 794px));
          }
        }
      `}</style>
    </div>
  );
}
