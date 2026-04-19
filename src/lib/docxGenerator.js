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
      name: item?.name || item?.materialName || `Material ${index + 1}`,
      type: item?.type || item?.materialType || 'N/A',
      color: item?.color || item?.materialColor || null,
      weight,
      costPerKg,
      subtotal,
    };
  });
}

function resolveEstimatedGrams(fileData) {
  const estimatedGrams = toNumber(fileData?.estimatedGrams ?? fileData?.estimated_grams);
  if (estimatedGrams > 0) return estimatedGrams;

  const volumeCm3 = toNumber(fileData?.volumeCm3 ?? fileData?.volume_cm3 ?? fileData?.volume);
  if (volumeCm3 > 0) {
    return volumeCm3 * 1.24;
  }

  return 0;
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

function resolvePrintInfo(quoteData, fileDataArray = []) {
  const printHours = toNumber(quoteData?.print_hours ?? quoteData?.printHours ?? quoteData?.totalPrintHours);
  const legacyFileData = Array.isArray(quoteData?.file_data) ? null : quoteData?.file_data;
  const partCount = toNumber(
    legacyFileData?.partCount ??
      quoteData?.importedModel?.partCount ??
      quoteData?.partCount ??
      quoteData?.partsCount ??
      fileDataArray.length
  );

  return {
    printHours,
    partCount,
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
  const printInfo = resolvePrintInfo(quoteData, fileDataArray);

  const clientName = resolveClientName(quoteData);
  const designUrl = quoteData?.client?.designUrl || quoteData?.design_url || quoteData?.designUrl;
  const logoUrl = companyData?.logo_url;
  const photoUrl = quoteData?.photo_url || quoteData?.photoUrl;

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
        makeCell('Material', true),
        makeCell('Weight (g)', true),
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
            children: [new TextRun('3D Printing Quote')],
          }),
          new Paragraph({ children: [new TextRun(`Quote Date: ${formatDate(quoteDate)}`)] }),
          new Paragraph({ children: [new TextRun(`Expiration Date: ${formatDate(expirationDate)}`)] }),
          new Paragraph({ children: [new TextRun(`Client: ${clientName}`)] }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun('Materials')],
          }),
          materialTable,
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: `Total: ${formatCurrency(breakdown.totalPrice, currency)}`, bold: true, size: 28 }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun('Print Info')],
          }),
          new Paragraph({
            children: [new TextRun(`Total print time (hours): ${printInfo.printHours.toFixed(2)}`)],
          }),
          new Paragraph({
            children: [new TextRun(`Number of parts: ${printInfo.partCount || 0}`)],
          }),
          ...(() => {
            const printerSnapshot = quoteData?.printer_snapshot;
            if (!printerSnapshot) {
              return [];
            }

            const printerText = `${printerSnapshot.name}${printerSnapshot.brand ? ` (${printerSnapshot.brand})` : ''} - ${printerSnapshot.type || 'N/A'}, ${printerSnapshot.wattage || 0}W`;

            return [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Printer: ', bold: true }),
                  new TextRun(printerText),
                ],
              }),
            ];
          })(),
          ...(() => {
            if (fileDataArray.length === 0) return [];

            if (fileDataArray.length === 1) {
              const file = fileDataArray[0] || {};
              const fileName = file?.name || file?.fileName || file?.filename || 'N/A';
              const fileType = file?.type || file?.fileType || file?.format || 'N/A';
              const estimatedGrams = resolveEstimatedGrams(file);

              return [
                new Paragraph({
                  children: [
                    new TextRun(
                      `File: ${fileName} | Type: ${fileType} | Filament: ${estimatedGrams.toFixed(2)} g`
                    ),
                  ],
                }),
              ];
            }

            return [
              new Paragraph({ text: '' }),
              new Paragraph({
                children: [new TextRun({ text: 'Files', bold: true })],
              }),
              ...fileDataArray.map((file, index) => {
                const fileName = file?.name || file?.fileName || file?.filename || `File ${index + 1}`;
                const fileType = file?.type || file?.fileType || file?.format || 'N/A';
                const estimatedGrams = resolveEstimatedGrams(file);

                return new Paragraph({
                  children: [
                    new TextRun(
                      `${index + 1}. ${fileName} | Type: ${fileType} | Filament: ${estimatedGrams.toFixed(2)} g`
                    ),
                  ],
                });
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
                          text: 'Click to see design',
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
                children: [new TextRun({ text: 'Notes', bold: true })],
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
                  children: [new TextRun({ text: 'Product Photo', bold: true })],
                }),
                new Paragraph({
                  children: [photoRun],
                }),
              ]
            : []),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Payment Terms: ', bold: true }),
              new TextRun('A 50% upfront deposit is required to start the order.'),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Generated: ${new Date().toLocaleString()} | This quote is valid for 30 days from the date of issue.`,
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
