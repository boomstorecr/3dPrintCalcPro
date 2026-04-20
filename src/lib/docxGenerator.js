import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import i18n from '../i18n';
import { formatCurrency } from './currency';

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

async function fetchImageBuffer(url) {
  // Handle base64 data URLs
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`);
  }

  return res.arrayBuffer();
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
      name: item?.name || item?.materialName || `${i18n.t('document.material')} ${index + 1}`,
      type: item?.type || item?.materialType || 'N/A',
      color: item?.color || item?.materialColor || null,
      weight,
      costPerKg,
      subtotal,
    };
  });
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

function resolvePartsInfo(quoteData, fileDataArray = []) {
  const normalizedFiles = fileDataArray.map((file, index) => ({
    name: stripKnownModelExtension(file?.name || file?.fileName || file?.filename || `${i18n.t('document.parts')} ${index + 1}`),
    partCount: toNumber(file?.partCount),
  }));
  const partsFromFiles = normalizedFiles.reduce((sum, file) => sum + file.partCount, 0);
  const partCount = toNumber(
    (partsFromFiles > 0 ? partsFromFiles : undefined) ??
      quoteData?.file_data?.partCount ??
      quoteData?.importedModel?.partCount ??
      quoteData?.partCount ??
      quoteData?.partsCount ??
      fileDataArray.length
  );

  return {
    partCount,
    files: normalizedFiles,
  };
}

function makeCell(value, isBold = false) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(value), bold: isBold })],
      }),
    ],
  });
}

function makeSimpleTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
    },
  });
}

export async function generateQuoteDocx(quoteData, companyData) {
  const currency = resolveCurrency(companyData);
  const quoteDate = getQuoteDate(quoteData);
  const expirationDate = getExpirationDate(quoteData);
  const fileDataArray = Array.isArray(quoteData.file_data)
    ? quoteData.file_data
    : quoteData.file_data
      ? [quoteData.file_data]
      : [];

  const materials = resolveMaterials(quoteData);
  const breakdown = resolveBreakdown(quoteData);
  const partsInfo = resolvePartsInfo(quoteData, fileDataArray);

  const clientName = resolveClientName(quoteData);
  const designUrl = quoteData?.client?.designUrl || quoteData?.design_url || quoteData?.designUrl;
  const logoUrl = companyData?.logo_url;
  const photoUrl = quoteData?.photo_url || quoteData?.photoUrl;
  const estimatedDeliveryDays = toNumber(quoteData?.estimated_delivery_days);
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
  const hasDiscount = Boolean(discount) && discountAmount > 0;
  const taxRate = toNumber(breakdown.taxRate ?? quoteData.cost_breakdown?.taxRate ?? 0);
  const taxAmount = toNumber(breakdown.taxAmount ?? quoteData.cost_breakdown?.taxAmount ?? 0);
  const hasTax = taxRate > 0 && taxAmount > 0;
  const baseSubtotal = toNumber(breakdown.priceBeforeDiscount) || toNumber(breakdown.subtotal + breakdown.profitAmount);

  let logoRun = null;
  let photoRun = null;

  if (logoUrl) {
    try {
      const logoBuffer = await fetchImageBuffer(logoUrl);
      logoRun = new ImageRun({
        data: logoBuffer,
        transformation: {
          width: 150,
          height: 50,
        },
      });
    } catch (error) {
      console.warn('[generateQuoteDocx] Logo could not be loaded', error);
    }
  }

  if (photoUrl) {
    try {
      const photoBuffer = await fetchImageBuffer(photoUrl);
      photoRun = new ImageRun({
        data: photoBuffer,
        transformation: {
          width: 150,
          height: 150,
        },
      });
    } catch (error) {
      console.warn('[generateQuoteDocx] Product photo could not be loaded', error);
    }
  }

  const materialTable = makeSimpleTable([
    new TableRow({
      children: [
        makeCell(i18n.t('document.material'), true),
        makeCell(i18n.t('document.grams'), true),
      ],
    }),
    ...materials.map((material) =>
      new TableRow({
        children: [
          makeCell(material.color ? `${material.name} (${material.color})` : material.name),
          makeCell(material.weight.toFixed(2)),
        ],
      })
    ),
  ]);

  const pricingRows = [
    new TableRow({
      children: [
        makeCell(i18n.t('document.subtotal'), true),
        makeCell(formatCurrency(baseSubtotal, currency)),
      ],
    }),
    ...(hasDiscount
      ? [
          new TableRow({
            children: [
              makeCell(discountLabel, true),
              makeCell(`-${formatCurrency(discountAmount, currency)}`),
            ],
          }),
        ]
      : []),
    ...(hasTax
      ? [
          new TableRow({
            children: [
              makeCell(i18n.t('document.taxIva', { value: taxRate }), true),
              makeCell(formatCurrency(taxAmount, currency)),
            ],
          }),
        ]
      : []),
    new TableRow({
      children: [
        makeCell(i18n.t('document.total'), true),
        makeCell(formatCurrency(breakdown.totalPrice, currency), true),
      ],
    }),
  ];

  const pricingTable = makeSimpleTable(pricingRows);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: companyData?.name || 'Company', bold: true })],
          }),
          ...(logoRun
            ? [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [logoRun],
                }),
              ]
            : []),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun(i18n.t('document.title'))],
          }),
          new Paragraph({ children: [new TextRun(`${i18n.t('document.quoteDate')}: ${formatDate(quoteDate)}`)] }),
          new Paragraph({ children: [new TextRun(`${i18n.t('document.expirationDate')}: ${formatDate(expirationDate)}`)] }),
          new Paragraph({ children: [new TextRun(`${i18n.t('document.client')}: ${clientName}`)] }),
          ...(estimatedDeliveryDays > 0
            ? [new Paragraph({ children: [new TextRun(`${i18n.t('document.estimatedDelivery')}: ${estimatedDeliveryDays} ${i18n.t('document.days')}`)] })]
            : []),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun(i18n.t('document.materials'))],
          }),
          materialTable,
          new Paragraph({
            children: [
              new TextRun({
                text: i18n.t('document.purgeNote'),
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun(i18n.t('document.pricing'))],
          }),
          pricingTable,
          ...(discount?.note
            ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: `${i18n.t('document.discountNote')}: "${String(discount.note).trim()}"`, italics: true }),
                  ],
                }),
              ]
            : []),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun(i18n.t('document.parts'))],
          }),
          new Paragraph({
            children: [new TextRun(`${i18n.t('document.partCount')}: ${partsInfo.partCount || partsInfo.files.length || 0}`)],
          }),
          ...(() => {
            if (partsInfo.files.length === 0) {
              return [new Paragraph({ children: [new TextRun(i18n.t('document.noParts'))] })];
            }

            const names = partsInfo.files.map((file, index) => file.name || `${i18n.t('document.parts')} ${index + 1}`);
            return [
              new Paragraph({
                children: [new TextRun(`${i18n.t('document.parts')}: ${names.join(', ')}`)],
              }),
            ];
          })(),
          ...(designUrl
            ? [
                new Paragraph({ text: '' }),
                new Paragraph({
                  children: [
                    new ExternalHyperlink({
                      children: [
                        new TextRun({
                          text: i18n.t('document.designLink'),
                          style: 'Hyperlink',
                        }),
                      ],
                      link: String(designUrl),
                    }),
                  ],
                }),
              ]
            : []),
          ...(() => {
            const notes = resolveNotes(quoteData);
            if (!notes) return [];
            return [
              new Paragraph({ text: '' }),
              new Paragraph({
                children: [new TextRun({ text: i18n.t('document.notes'), bold: true })],
              }),
              new Paragraph({
                children: [new TextRun(notes)],
              }),
            ];
          })(),
          ...(photoRun
            ? [
                new Paragraph({ text: '' }),
                new Paragraph({
                  children: [new TextRun({ text: i18n.t('document.productPhoto'), bold: true })],
                }),
                new Paragraph({
                  children: [photoRun],
                }),
              ]
            : []),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: `${i18n.t('document.paymentTerms')}: `, bold: true }),
              new TextRun(i18n.t('document.paymentTermsText')),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${i18n.t('document.generated')}: ${new Date().toLocaleString()} | ${i18n.t('document.validityNote')}`,
                italics: true,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
