import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import i18n from '../i18n';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function resolveCurrency(companyData) {
  return (
    companyData?.global_config?.currency ||
    companyData?.currency ||
    'USD'
  );
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
      color: item?.color || item?.colorHex || item?.hexColor || '',
      weight,
      costPerKg,
      subtotal,
    };
  });
}

function normalizeFileDataArray(quote) {
  const fileDataArray = Array.isArray(quote.file_data)
    ? quote.file_data
    : quote.file_data
      ? [quote.file_data]
      : [];

  return fileDataArray;
}

function stripKnownModelExtension(fileName) {
  const raw = String(fileName || '').trim();
  if (!raw) return '';
  return raw.replace(/\.(3mf|stl)$/i, '');
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
  const priceBeforeDiscount = toNumber(
    breakdown.priceBeforeDiscount ??
      quoteData?.priceBeforeDiscount ??
      subtotal + profitAmount
  );
  const discountAmount = toNumber(breakdown.discountAmount);
  const taxRate = toNumber(breakdown.taxRate ?? quoteData?.tax_rate ?? 0);
  const taxAmount = toNumber(breakdown.taxAmount);
  const totalPrice = toNumber(breakdown.totalPrice ?? quoteData?.total_price ?? quoteData?.totalPrice ?? subtotal + profitAmount);

  return {
    materialCost,
    electricityCost,
    amortizationCost,
    extraCosts,
    subtotal,
    profitAmount,
    priceBeforeDiscount,
    discountAmount,
    taxRate,
    taxAmount,
    totalPrice,
  };
}

function resolvePartsInfo(quoteData) {
  const fileDataArray = normalizeFileDataArray(quoteData);
  const normalizedFiles = fileDataArray.map((file, index) => ({
    name: stripKnownModelExtension(file?.fileName || file?.name || file?.filename || `Part ${index + 1}`),
    partCount: toNumber(file?.partCount),
  }));
  const partsFromFiles = normalizedFiles.reduce((sum, file) => sum + file.partCount, 0);
  const partCount = toNumber(
    (partsFromFiles > 0 ? partsFromFiles : undefined) ??
      quoteData?.file_data?.partCount ??
      quoteData?.importedModel?.partCount ??
      quoteData?.partCount ??
      quoteData?.partsCount
  );

  return {
    partCount,
    files: normalizedFiles,
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
  const partsInfo = resolvePartsInfo(quoteData);

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
  doc.text(i18n.t('document.title'), pageWidth - marginX, cursorY + 36, { align: 'right' });

  // Move cursor below whichever is taller: logo or text header
  cursorY += Math.max(logoActualHeight + 16, 70);

  doc.setDrawColor(220);
  const estimatedDeliveryDays = toNumber(quoteData?.estimated_delivery_days);
  const hasEstimatedDelivery = estimatedDeliveryDays > 0;
  const infoBoxHeight = hasEstimatedDelivery ? 90 : 72;
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, infoBoxHeight, 6, 6);

  doc.setFontSize(11);
  doc.text(`${i18n.t('document.quoteDate')}: ${formatDate(quoteDate)}`, marginX + 12, cursorY + 22);
  doc.text(`${i18n.t('document.expirationDate')}: ${formatDate(expirationDate)}`, marginX + 12, cursorY + 40);
  doc.text(`${i18n.t('document.client')}: ${clientName}`, marginX + 12, cursorY + 58);
  if (hasEstimatedDelivery) {
    doc.text(`${i18n.t('document.estimatedDelivery')}: ${estimatedDeliveryDays} ${i18n.t('document.days')}`, marginX + 12, cursorY + 76);
  }

  cursorY += infoBoxHeight + 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(i18n.t('document.materials'), marginX, cursorY);

  const hasMaterialColor = materials.some((material) => String(material.color || '').trim());

  autoTable(doc, {
    startY: cursorY + 8,
    head: [
      hasMaterialColor
        ? [i18n.t('document.material'), i18n.t('document.color'), i18n.t('document.grams')]
        : [i18n.t('document.material'), i18n.t('document.grams')],
    ],
    body: materials.map((material) => {
      if (hasMaterialColor) {
        return [
          material.name,
          String(material.color || '').trim() || 'N/A',
          material.weight.toFixed(2),
        ];
      }

      return [
        material.name,
        material.weight.toFixed(2),
      ];
    }),
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

  cursorY = (doc.lastAutoTable?.finalY || cursorY + 20) + 16;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const purgeNote = i18n.t('document.purgeNote');
  const purgeNoteLines = doc.splitTextToSize(purgeNote, pageWidth - marginX * 2);
  doc.text(purgeNoteLines, marginX, cursorY);
  doc.setTextColor(0, 0, 0);
  cursorY += purgeNoteLines.length * 10 + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(i18n.t('document.parts'), marginX, cursorY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const totalPartCount = partsInfo.partCount || partsInfo.files.length;
  doc.text(`${i18n.t('document.partCount')}: ${totalPartCount}`, marginX, cursorY + 18);

  const partRows = partsInfo.files.length > 0
    ? partsInfo.files.map((file, index) => [file.name || `Part ${index + 1}`])
    : [[i18n.t('document.noParts')]];

  autoTable(doc, {
    startY: cursorY + 26,
    head: [[i18n.t('document.parts')]],
    body: partRows,
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

  const discount = quoteData.discount || (quoteData.discount_percent ? {
    type: 'percentage',
    value: quoteData.discount_percent,
    note: quoteData.discount_note,
  } : null);
  const discountAmount = toNumber(quoteData.cost_breakdown?.discountAmount ?? breakdown.discountAmount ?? 0);
  const discountType = String(discount?.type || '').toLowerCase();
  const discountValue = toNumber(discount?.value);
  const discountLabel = discountType === 'percentage'
    ? i18n.t('document.discountPercentage', { value: discountValue })
    : i18n.t('document.discountFixed');
  const discountNote = String(discount?.note || '').trim();
  const taxRate = toNumber(breakdown.taxRate ?? quoteData?.tax_rate ?? 0);
  const taxAmount = toNumber(breakdown.taxAmount);
  const baseSubtotal = toNumber(breakdown.priceBeforeDiscount) || toNumber(breakdown.subtotal + breakdown.profitAmount);
  const finalTotal = toNumber(quoteData.total_price_override) || toNumber(quoteData.total_price) || toNumber(breakdown.totalPrice);
  const hasDiscount = Boolean(discount) && discountAmount > 0;
  const hasTax = taxAmount > 0 || taxRate > 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(i18n.t('document.pricing'), marginX, cursorY);
  cursorY += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  if (!hasDiscount && !hasTax) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${i18n.t('document.total')}: ${formatCurrency(finalTotal, currency)}`, marginX, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 20;
  } else {
    doc.text(`${i18n.t('document.subtotal')}: ${formatCurrency(baseSubtotal, currency)}`, marginX, cursorY);
    cursorY += 16;

    if (hasDiscount) {
      doc.text(
        `${discountLabel}: -${formatCurrency(discountAmount, currency)}`,
        marginX,
        cursorY
      );
      cursorY += 16;
    }

    if (discountNote) {
      doc.text(`${i18n.t('document.discountNote')}: "${discountNote}"`, marginX, cursorY);
      cursorY += 16;
    }

    if (hasTax) {
      doc.text(`${i18n.t('document.taxIva', { value: taxRate })}: ${formatCurrency(taxAmount, currency)}`, marginX, cursorY);
      cursorY += 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`${i18n.t('document.total')}: ${formatCurrency(finalTotal, currency)}`, marginX, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 20;
  }

  if (designUrl) {
    doc.setTextColor(37, 99, 235);
    doc.setFont('helvetica', 'normal');
    doc.textWithLink(i18n.t('document.designLink'), marginX, cursorY, { url: String(designUrl) });
    doc.setTextColor(0, 0, 0);
    cursorY += 22;
  }

  const notes = resolveNotes(quoteData);
  if (notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(i18n.t('document.notes'), marginX, cursorY);
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
      doc.text(i18n.t('document.productPhoto'), marginX, cursorY);
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
  doc.text(i18n.t('document.paymentTerms'), marginX, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.text(i18n.t('document.paymentTermsText'), marginX, cursorY + 18);

  const generatedAt = new Date();
  const footerY = pageHeight - 46;

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`${i18n.t('document.generated')}: ${generatedAt.toLocaleString()}`, marginX, footerY);
  doc.text(
    i18n.t('document.validityNote'),
    pageWidth - marginX,
    footerY,
    { align: 'right' }
  );

  return doc.output('blob');
}
