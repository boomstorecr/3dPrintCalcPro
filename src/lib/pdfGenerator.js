import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveCurrency(companyData) {
  return (
    companyData?.global_config?.currency ||
    companyData?.currency ||
    'USD'
  );
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function getQuoteDate(quoteData) {
  const raw = quoteData?.date;
  if (!raw) return new Date();

  if (typeof raw?.toDate === 'function') return raw.toDate();
  if (typeof raw === 'object' && Number.isFinite(raw.seconds)) return new Date(raw.seconds * 1000);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getExpirationDate(quoteData) {
  const raw = quoteData?.expiration_date || quoteData?.expirationDate;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return addDays(getQuoteDate(quoteData), 30);
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

async function fetchImageAsBase64(url) {
  // Already a data URL (base64) — return as-is
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

function resolveClientName(quoteData) {
  return (
    quoteData?.client?.name ||
    quoteData?.client_name ||
    quoteData?.clientName ||
    'N/A'
  );
}

function resolveNotes(quoteData) {
  return String(quoteData?.notes || '').trim();
}

function resolveMaterials(quoteData) {
  const materials = Array.isArray(quoteData?.materials) ? quoteData.materials : [];

  return materials.map((item, index) => {
    const weight = toNumber(item?.grams ?? item?.weight_g ?? item?.weight);
    const costPerKg = toNumber(item?.costPerKg ?? item?.cost_per_kg ?? item?.pricePerKg);
    const subtotal =
      toNumber(item?.subtotal) > 0
        ? toNumber(item.subtotal)
        : (weight / 1000) * costPerKg;

    return {
      name: item?.name || item?.materialName || `Material ${index + 1}`,
      type: item?.type || item?.materialType || 'N/A',
      weight,
      costPerKg,
      subtotal,
    };
  });
}

function resolveBreakdown(quoteData) {
  const breakdown = quoteData?.cost_breakdown || quoteData?.costBreakdown || quoteData?.breakdown || {};
  const extraCosts = Array.isArray(breakdown.extraCosts)
    ? breakdown.extraCosts
    : Array.isArray(quoteData?.extra_costs)
      ? quoteData.extra_costs
      : Array.isArray(quoteData?.extraCosts)
        ? quoteData.extraCosts
        : [];

  const materialCost = toNumber(breakdown.materialCost ?? quoteData?.materialCost);
  const electricityCost = toNumber(breakdown.electricityCost ?? quoteData?.electricityCost);
  const amortizationCost = toNumber(breakdown.amortizationCost ?? quoteData?.amortizationCost);
  const subtotal = toNumber(
    breakdown.subtotal ??
      quoteData?.subtotal ??
      materialCost + electricityCost + amortizationCost + extraCosts.reduce((sum, item) => sum + toNumber(item?.amount), 0)
  );
  const profitAmount = toNumber(breakdown.profitAmount ?? quoteData?.profitAmount);
  const totalPrice = toNumber(breakdown.totalPrice ?? quoteData?.total_price ?? quoteData?.totalPrice ?? subtotal + profitAmount);

  return {
    materialCost,
    electricityCost,
    amortizationCost,
    extraCosts,
    subtotal,
    profitAmount,
    totalPrice,
  };
}

function resolvePrintInfo(quoteData) {
  const printHours = toNumber(quoteData?.print_hours ?? quoteData?.printHours ?? quoteData?.totalPrintHours);
  const partCount = toNumber(
    quoteData?.file_data?.partCount ?? quoteData?.importedModel?.partCount ?? quoteData?.partCount ?? quoteData?.partsCount
  );

  return {
    printHours,
    partCount,
  };
}

export async function generateQuotePDF(quoteData, companyData) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const currency = resolveCurrency(companyData);

  const quoteDate = getQuoteDate(quoteData);
  const expirationDate = getExpirationDate(quoteData);
  const clientName = resolveClientName(quoteData);

  const materials = resolveMaterials(quoteData);
  const breakdown = resolveBreakdown(quoteData);
  const printInfo = resolvePrintInfo(quoteData);

  const logoUrl = companyData?.logo_url;
  const photoUrl = quoteData?.photo_url || quoteData?.photoUrl;
  const designUrl = quoteData?.client?.designUrl || quoteData?.design_url || quoteData?.designUrl;

  let cursorY = 40;
  let logoActualHeight = 0;

  if (logoUrl) {
    try {
      const logoBase64 = await fetchImageAsBase64(logoUrl);
      const logoSize = await getImageSize(logoBase64);
      const maxLogoWidth = 100;
      const maxLogoHeight = 60;
      let logoWidth = Math.min(maxLogoWidth, logoSize.width);
      let logoHeight = (logoSize.height / logoSize.width) * logoWidth;
      // If still too tall, constrain by height
      if (logoHeight > maxLogoHeight) {
        logoHeight = maxLogoHeight;
        logoWidth = (logoSize.width / logoSize.height) * logoHeight;
      }
      doc.addImage(logoBase64, marginX, cursorY, logoWidth, logoHeight);
      logoActualHeight = logoHeight;
    } catch (error) {
      console.warn('[generateQuotePDF] Logo could not be loaded', error);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(companyData?.name || 'Company', pageWidth - marginX, cursorY + 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('3D Printing Quote', pageWidth - marginX, cursorY + 36, { align: 'right' });

  // Move cursor below whichever is taller: logo or text header
  cursorY += Math.max(logoActualHeight + 16, 70);

  doc.setDrawColor(220);
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, 72, 6, 6);

  doc.setFontSize(11);
  doc.text(`Quote Date: ${formatDate(quoteDate)}`, marginX + 12, cursorY + 22);
  doc.text(`Expiration Date: ${formatDate(expirationDate)}`, marginX + 12, cursorY + 40);
  doc.text(`Client: ${clientName}`, marginX + 12, cursorY + 58);

  cursorY += 90;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Materials', marginX, cursorY);

  autoTable(doc, {
    startY: cursorY + 8,
    head: [['Material', 'Weight (g)']],
    body: materials.map((material) => [
      material.name,
      material.weight.toFixed(2),
    ]),
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

  cursorY = (doc.lastAutoTable?.finalY || cursorY + 20) + 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`Total: ${formatCurrency(breakdown.totalPrice, currency)}`, marginX, cursorY);

  cursorY += 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Print Info', marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Total print time (hours): ${printInfo.printHours.toFixed(2)}`, marginX, cursorY + 18);
  doc.text(`Number of parts: ${printInfo.partCount || 0}`, marginX, cursorY + 34);

  cursorY += 56;

  if (designUrl) {
    doc.setTextColor(37, 99, 235);
    doc.setFont('helvetica', 'normal');
    doc.textWithLink('Click to see design', marginX, cursorY, { url: String(designUrl) });
    doc.setTextColor(0, 0, 0);
    cursorY += 22;
  }

  const notes = resolveNotes(quoteData);
  if (notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Notes', marginX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const noteLines = doc.splitTextToSize(notes, pageWidth - marginX * 2);
    doc.text(noteLines, marginX, cursorY + 16);
    cursorY += 16 + noteLines.length * 14 + 10;
  }

  if (photoUrl) {
    try {
      const photoBase64 = await fetchImageAsBase64(photoUrl);
      const photoSize = await getImageSize(photoBase64);
      const maxPhotoWidth = 150;
      const photoWidth = Math.min(maxPhotoWidth, photoSize.width);
      const photoHeight = (photoSize.height / photoSize.width) * photoWidth;

      if (cursorY + photoHeight > pageHeight - 110) {
        doc.addPage();
        cursorY = 40;
      }

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Product Photo', marginX, cursorY);
      cursorY += 10;
      doc.addImage(photoBase64, marginX, cursorY, photoWidth, photoHeight);
      cursorY += photoHeight + 20;
    } catch (error) {
      console.warn('[generateQuotePDF] Product photo could not be loaded', error);
    }
  }

  if (cursorY > pageHeight - 110) {
    doc.addPage();
    cursorY = 40;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Payment Terms', marginX, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.text('A 50% upfront deposit is required to start the order.', marginX, cursorY + 18);

  const generatedAt = new Date();
  const footerY = pageHeight - 46;

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${generatedAt.toLocaleString()}`, marginX, footerY);
  doc.text(
    'This quote is valid for 30 days from the date of issue.',
    pageWidth - marginX,
    footerY,
    { align: 'right' }
  );

  return doc.output('blob');
}
