'use client';

import React from 'react';
import { Student } from '@/lib/types';
import {
  getHebrewDate,
  getGregorianDate,
  SignerInfo,
  DEFAULT_SIGNER,
  ReportType,
} from '@/lib/certificates';

interface CertificatePreviewProps {
  student: Student;
  reportType: ReportType;
  year: string;
  extras: Record<string, string>;
  signer?: SignerInfo;
}

export function CertificatePreview({
  student,
  reportType,
  year,
  extras,
  signer = DEFAULT_SIGNER,
}: CertificatePreviewProps) {
  const hebrewDate = getHebrewDate();
  const gregorianDate = getGregorianDate();
  const body = reportType.buildBody(student, year, extras);

  return (
    <div id="certificate-preview" className="certificate-container">
      <div className="certificate-page">
        {/* Header */}
        <div className="certificate-header">
          <div className="bsd">בס&quot;ד</div>
          <div className="date-line">
            <span>{hebrewDate}</span>
            <span>{gregorianDate}</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="certificate-title">אישור</h1>

        {/* Recipient */}
        <p className="certificate-recipient">{reportType.recipient}</p>

        {/* Body */}
        <div className="certificate-body">
          {body.split('\n').map((line, i) => (
            <p key={i} className={line.trim() === '' ? 'certificate-spacer' : ''}>
              {line}
            </p>
          ))}
        </div>

        {/* Signature */}
        <div className="certificate-signature">
          <p>בכבוד רב,</p>
          <p className="signer-name">{signer.name}</p>
          <p>ת.ז. {signer.idNumber}</p>
          <p>{signer.title}</p>
        </div>
      </div>

      <style jsx>{`
        .certificate-container {
          display: flex;
          justify-content: center;
          padding: 20px;
        }
        .certificate-page {
          width: 210mm;
          min-height: 297mm;
          background: white;
          padding: 40mm 25mm 30mm 25mm;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          direction: rtl;
          font-family: 'David', 'Miriam', Arial, sans-serif;
          font-size: 16px;
          line-height: 2;
          color: #000;
          position: relative;
        }
        .certificate-header {
          text-align: center;
          margin-bottom: 30px;
        }
        .bsd {
          font-size: 14px;
          margin-bottom: 10px;
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
          margin: 30px 0;
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
        }
        .signer-name {
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
