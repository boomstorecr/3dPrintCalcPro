import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === 'function') {
    return value.toDate();
  }

  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = toDate(value);

  if (!date) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function sanitizeFileName(value) {
  return String(value || 'client')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'client';
}

function resolveCurrency(billData, companyData) {
  return (
    billData?.currency ||
    companyData?.global_config?.currency ||
    companyData?.currency ||
    'USD'
  );
}

async function fetchImageAsBase64(url) {
  if (!url) {
    throw new Error('Missing image URL');
  }

  if (url.startsWith('data:')) {
    return url;
  }

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`);
  }

  const blob = await res.blob();

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.width || 1, height: image.height || 1 });
    };

    image.onerror = () => {
      resolve({ width: 1, height: 1 });
    };

    image.src = dataUrl;
  });
}

function triggerDownload(blob, fileName) {
  const fileUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = fileUrl;
  link.download = fileName;
  link.click();

  setTimeout(() => {
    URL.revokeObjectURL(fileUrl);
  }, 0);
}

export async function generateBillPdf(billData, companyData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const currency = resolveCurrency(billData, companyData);

  const materials = Array.isArray(billData?.materials) ? billData.materials : [];
  const clientName = String(billData?.client_name || 'N/A');
  const designUrl = String(billData?.design_url || '').trim();
  const status = String(billData?.status || 'unpaid').toLowerCase() === 'paid' ? 'PAID' : 'UNPAID';
  const notes = String(billData?.notes || '').trim();
  const piecesCount = toNumber(billData?.pieces_count);

  let cursorY = 40;
  let logoActualHeight = 0;

  if (companyData?.logo_url) {
    try {
      const logoBase64 = await fetchImageAsBase64(companyData.logo_url);
      const logoSize = await getImageSize(logoBase64);
      const maxLogoWidth = 100;
      const maxLogoHeight = 60;
      let logoWidth = Math.min(maxLogoWidth, logoSize.width);
      let logoHeight = (logoSize.height / logoSize.width) * logoWidth;

      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = (logoSize.width / logoSize.height) * logoHeight;
      }

      doc.addImage(logoBase64, marginX, cursorY, logoWidth, logoHeight);
      logoActualHeight = logoHeight;
    } catch (error) {
      console.warn('[generateBillPdf] Logo could not be loaded', error);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(companyData?.name || 'Company', pageWidth - marginX, cursorY + 18, { align: 'right' });

  cursorY += Math.max(logoActualHeight + 16, 70);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.text('BILL', pageWidth / 2, cursorY, { align: 'center' });

  cursorY += 20;

  doc.setDrawColor(220);
  const infoBoxHeight = designUrl ? 122 : 104;
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, infoBoxHeight, 6, 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Billing Date: ${formatDate(billData?.billing_date || billData?.created_at)}`, marginX + 12, cursorY + 22);
  doc.text(`Client: ${clientName}`, marginX + 12, cursorY + 40);
  doc.text(`Pieces: ${piecesCount}`, marginX + 12, cursorY + 58);
  doc.text(`Order Date: ${formatDate(billData?.order_created_at)}`, marginX + 12, cursorY + 76);
  doc.text(`Status: ${status}`, marginX + 12, cursorY + 94);

  if (designUrl) {
    doc.setTextColor(37, 99, 235);
    doc.textWithLink('Design Link', marginX + 12, cursorY + 112, { url: designUrl });
    doc.setTextColor(0, 0, 0);
  }

  cursorY += infoBoxHeight + 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Materials', marginX, cursorY);

  const materialsBody = materials.length > 0
    ? materials.map((item, index) => {
      const grams = toNumber(item?.grams ?? item?.weight_g ?? item?.weight);
      return [
        item?.name || item?.materialName || `Material ${index + 1}`,
        grams.toFixed(2),
      ];
    })
    : [['No materials', '-']];

  autoTable(doc, {
    startY: cursorY + 8,
    head: [['Material', 'Quantity (grams)']],
    body: materialsBody,
    styles: {
      fontSize: 10,
      cellPadding: 6,
    },
    headStyles: {
      fillColor: [31, 41, 55],
      textColor: 255,
    },
    margin: { left: marginX, right: marginX },
  });

  cursorY = (doc.lastAutoTable?.finalY || cursorY + 40) + 16;

  if (cursorY > pageHeight - 120) {
    doc.addPage();
    cursorY = 40;
  }

  const total = toNumber(billData?.total);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`Total: ${formatCurrency(total, currency)}`, marginX, cursorY);

  cursorY += 24;

  if (notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Notes', marginX, cursorY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const noteLines = doc.splitTextToSize(notes, pageWidth - marginX * 2);
    doc.text(noteLines, marginX, cursorY + 16);
  }

  const generatedAt = new Date();

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${generatedAt.toLocaleString()}`, marginX, pageHeight - 46);

  const blob = doc.output('blob');
  const fileName = `bill-${sanitizeFileName(clientName)}.pdf`;

  triggerDownload(blob, fileName);

  return blob;
}
