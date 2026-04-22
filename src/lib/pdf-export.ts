// Render a DOM element to an A4 PDF using html2canvas + jsPDF.
// Returns a base64 string (without data URL prefix) ready for email attachment.

export async function elementToPdfBase64(element: HTMLElement): Promise<string> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // Render to canvas at high DPI for crisp print
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  // A4 portrait (210 x 297 mm)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const pageHeight = 297;

  // Fit the image to the full page (our preview is already sized to A4)
  pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

  // Get base64 (strip data URL prefix)
  const base64 = pdf.output('datauristring').split(',')[1];
  return base64;
}

// Save the PDF locally (for download / testing)
export async function elementToPdfDownload(element: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  pdf.save(filename);
}
