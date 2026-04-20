import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { saveAs } from 'file-saver';
import CostBreakdown from '../../components/CostBreakdown';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { generateQuoteDocx } from '../../lib/docxGenerator';
import { formatCurrency } from '../../lib/currency';
import { db } from '../../lib/firebase';
import { getOrderByQuoteId, createOrderFromQuote } from '../../lib/orders';
import { generateQuotePDF } from '../../lib/pdfGenerator';
import { deleteQuote, getQuote, updateQuote } from '../../lib/quotes';

const STATUS_VALUES = ['draft', 'sent', 'accepted', 'rejected'];

const STATUS_BADGE_VARIANT = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
};

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

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) {
    return 'N/A';
  }

  return date.toLocaleDateString();
}

function normalizeStatusKey(status) {
  return String(status || 'draft')
    .toLowerCase()
    .replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function getClientName(quote) {
  return quote?.client_name || quote?.clientName || quote?.client?.name || 'Unnamed Client';
}

function getDesignUrl(quote) {
  return quote?.design_url || quote?.designUrl || quote?.client?.designUrl || '';
}

function getCurrency(quote, company) {
  return company?.global_config?.currency || company?.currency || quote?.currency || 'USD';
}

function getQuoteDate(quote) {
  return toDate(quote?.date || quote?.created_at || quote?.createdAt) || new Date();
}

function getExpirationDate(quote) {
  return addDays(getQuoteDate(quote), 30);
}

function getPrintHours(quote) {
  return toNumber(quote?.print_hours ?? quote?.printHours ?? quote?.totalPrintHours);
}

function getPartCount(quote) {
  const fileDataArray = Array.isArray(quote?.file_data)
    ? quote.file_data
    : quote?.file_data
      ? [quote.file_data]
      : [];

  const filePartsCount = fileDataArray.reduce(
    (sum, file) => sum + toNumber(file?.partCount ?? file?.partsCount),
    0
  );

  if (filePartsCount > 0) {
    return filePartsCount;
  }

  return toNumber(quote?.file_data?.partCount ?? quote?.importedModel?.partCount ?? quote?.partCount ?? quote?.partsCount);
}

function getMaterials(quote) {
  const rows = Array.isArray(quote?.materials) ? quote.materials : [];

  return rows.map((material, index) => {
    const weight = toNumber(material?.grams ?? material?.weight_g ?? material?.weight);
    const costPerKg = toNumber(material?.costPerKg ?? material?.cost_per_kg ?? material?.pricePerKg);
    const subtotal =
      toNumber(material?.subtotal) > 0 ? toNumber(material.subtotal) : (weight / 1000) * costPerKg;

    return {
      name: material?.materialName || material?.name || `Material ${index + 1}`,
      type: material?.type || material?.materialType || 'N/A',
      color: material?.color || '',
      weight,
      costPerKg,
      subtotal,
    };
  });
}

function getBreakdown(quote) {
  const raw = quote?.cost_breakdown || quote?.costBreakdown || quote?.breakdown || {};
  const totalPriceOverride = toNumber(raw.totalPriceOverride ?? quote?.total_price_override) || null;
  const extraCosts = Array.isArray(raw.extraCosts)
    ? raw.extraCosts
    : Array.isArray(quote?.extra_costs)
      ? quote.extra_costs
      : Array.isArray(quote?.extraCosts)
        ? quote.extraCosts
        : [];

  const materialCost = toNumber(raw.materialCost ?? quote?.material_cost ?? quote?.materialCost);
  const electricityCost = toNumber(raw.electricityCost ?? quote?.electricity_cost ?? quote?.electricityCost);
  const amortizationCost = toNumber(raw.amortizationCost ?? quote?.amortization_cost ?? quote?.amortizationCost);
  const extraCostsTotal = toNumber(
    raw.extraCostsTotal ?? extraCosts.reduce((sum, item) => sum + toNumber(item?.amount), 0)
  );
  const subtotal = toNumber(
    raw.subtotal ?? quote?.subtotal ?? materialCost + electricityCost + amortizationCost + extraCostsTotal
  );
  const profitAmount = toNumber(raw.profitAmount ?? quote?.profit_amount ?? quote?.profitAmount);
  const priceBeforeDiscount = toNumber(raw.priceBeforeDiscount ?? subtotal + profitAmount);
  const discount =
    raw.discount ||
    quote?.discount ||
    (quote?.discount_percent
      ? {
          type: 'percentage',
          value: toNumber(quote.discount_percent),
        }
      : undefined);
  const discountAmount = toNumber(raw.discountAmount ?? quote?.discount_amount);
  const priceAfterDiscount = toNumber(raw.priceAfterDiscount ?? priceBeforeDiscount - discountAmount);
  const taxRate = toNumber(raw.taxRate ?? quote?.tax_rate);
  const taxAmount = toNumber(raw.taxAmount ?? quote?.tax_amount);
  const totalPrice = toNumber(raw.totalPrice ?? quote?.total_price ?? quote?.totalPrice ?? subtotal + profitAmount);

  return {
    materialCost,
    electricityCost,
    amortizationCost,
    extraCosts,
    extraCostsTotal,
    subtotal,
    profitMarginPercent: toNumber(raw.profitMarginPercent),
    profitAmount,
    priceBeforeDiscount,
    discount,
    discountAmount,
    priceAfterDiscount,
    taxRate,
    taxAmount,
    totalPrice,
    totalPriceOverride,
  };
}

function sanitizeFileName(value) {
  return String(value || 'client')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_. ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || 'client';
}

export default function QuotePreviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { error, success, info } = useToast();
  const { t } = useTranslation();

  const [quote, setQuote] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const quoteData = await getQuote(id);

        if (!quoteData) {
          info(t('quotes.history.noQuotes'));
          if (!cancelled) {
            setQuote(null);
            setCompany(null);
          }
          return;
        }

        if (userProfile?.company_id && quoteData.company_id !== userProfile.company_id) {
          error('You do not have access to this quote.');
          navigate('/quotes');
          return;
        }

        let companyData = null;

        if (quoteData.company_id) {
          const companyRef = doc(db, 'companies', quoteData.company_id);
          const companySnap = await getDoc(companyRef);

          if (companySnap.exists()) {
            companyData = { id: companySnap.id, ...companySnap.data() };
          }
        }

        if (!cancelled) {
          setQuote({ id, ...quoteData });
          setCompany(companyData);
        }
      } catch (loadError) {
        console.error('[QuotePreviewPage] Failed to load quote preview data', loadError);
        if (!cancelled) {
          error(t('toast.loadFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [id, userProfile?.company_id, navigate, error, info, t]);

  const currency = useMemo(() => getCurrency(quote, company), [quote, company]);
  const clientName = useMemo(() => getClientName(quote), [quote]);
  const designUrl = useMemo(() => getDesignUrl(quote), [quote]);
  const quoteDate = useMemo(() => getQuoteDate(quote), [quote]);
  const expirationDate = useMemo(() => getExpirationDate(quote), [quote]);
  const materials = useMemo(() => getMaterials(quote), [quote]);
  const breakdown = useMemo(() => getBreakdown(quote), [quote]);
  const statusOptions = useMemo(
    () =>
      STATUS_VALUES.map((value) => ({
        value,
        label: t(`status.${normalizeStatusKey(value)}`),
      })),
    [t]
  );
  const printHours = useMemo(() => getPrintHours(quote), [quote]);
  const partCount = useMemo(() => getPartCount(quote), [quote]);
  const fileDataArray = useMemo(
    () =>
      Array.isArray(quote?.file_data)
        ? quote.file_data
        : quote?.file_data
          ? [quote.file_data]
          : [],
    [quote]
  );

  const normalizedFileData = useMemo(
    () =>
      fileDataArray.map((file, index) => {
        const volumeCm3 = toNumber(file?.volumeCm3 ?? file?.volume_cm3);
        const estimatedGrams =
          toNumber(file?.estimatedGrams ?? file?.estimated_grams) || (volumeCm3 > 0 ? volumeCm3 * 1.24 : 0);

        return {
          name: file?.name || file?.fileName || file?.filename || `File ${index + 1}`,
          type: file?.type || file?.fileType || file?.extension || 'N/A',
          estimatedGrams,
          estimatedHours: toNumber(
            file?.estimatedHours ?? file?.estimated_hours ?? file?.printHours ?? file?.print_hours
          ),
        };
      }),
    [fileDataArray]
  );

  const handleStatusChange = async (event) => {
    const nextStatus = event.target.value;

    if (!quote || nextStatus === quote.status) {
      return;
    }

    setUpdatingStatus(true);

    try {
      await updateQuote(quote.id, { status: nextStatus });
      setQuote((prev) => ({ ...prev, status: nextStatus }));
      success(t('toast.statusUpdated'));
    } catch (updateError) {
      console.error('[QuotePreviewPage] Failed to update status', updateError);
      error(t('toast.saveFailed'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!quote) {
      return;
    }

    setGeneratingPdf(true);

    try {
      const blob = await generateQuotePDF(quote, company || {});
      saveAs(blob, `quote-${sanitizeFileName(clientName)}.pdf`);
      success(t('toast.saveSuccess'));
    } catch (downloadError) {
      console.error('[QuotePreviewPage] Failed to generate PDF', downloadError);
      error(t('toast.saveFailed'));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!quote || !userProfile?.company_id) return;

    setCreatingOrder(true);
    try {
      // Fast path: check if quote already has an order_id stamped on it
      if (quote.order_id) {
        info(t('toast.orderCreated'));
        navigate('/orders/' + quote.order_id);
        return;
      }

      // Fallback: query orders collection (for orders created before the order_id stamp)
      const existingOrder = await getOrderByQuoteId(quote.id, userProfile.company_id);
      if (existingOrder) {
        info(t('toast.orderCreated'));
        navigate('/orders/' + existingOrder.id);
        return;
      }

      // Create new order
      const orderId = await createOrderFromQuote(quote, userProfile.company_id, company || {});
      success(t('toast.orderCreated'));
      navigate('/orders/' + orderId);
    } catch (createError) {
      console.error('[QuotePreviewPage] Failed to create order', createError);
      error(t('toast.saveFailed'));
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!quote) {
      return;
    }

    setGeneratingDocx(true);

    try {
      const blob = await generateQuoteDocx(quote, company || {});
      saveAs(blob, `quote-${sanitizeFileName(clientName)}.docx`);
      success(t('toast.saveSuccess'));
    } catch (downloadError) {
      console.error('[QuotePreviewPage] Failed to generate DOCX', downloadError);
      error(t('toast.saveFailed'));
    } finally {
      setGeneratingDocx(false);
    }
  };

  const handleDeleteQuote = async () => {
    if (!quote) {
      return;
    }

    setDeleting(true);

    try {
      await deleteQuote(quote.id);
      success(t('toast.quoteDeleted'));
      navigate('/quotes');
    } catch (deleteError) {
      console.error('[QuotePreviewPage] Failed to delete quote', deleteError);
      error(t('toast.deleteFailed'));
    } finally {
      setDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!quote) {
    return (
      <Card title={t('quotes.preview.title')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('quotes.history.noQuotes')}</p>
          <Link to="/quotes">
            <Button variant="secondary">{t('quotes.history.title')}</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/quotes">
              <Button variant="secondary">{t('common.back')}</Button>
            </Link>

            <Badge variant={STATUS_BADGE_VARIANT[String(quote.status || 'draft').toLowerCase()] || 'neutral'}>
              {t(`status.${normalizeStatusKey(quote.status)}`)}
            </Badge>

            <Select
              id="quote-status"
              value={quote.status || 'draft'}
              onChange={handleStatusChange}
              options={statusOptions}
              className="min-w-[180px]"
              disabled={updatingStatus}
            />

            {String(quote.status || '').toLowerCase() === 'accepted' && (
              <Button
                onClick={handleCreateOrder}
                loading={creatingOrder}
                disabled={generatingPdf || generatingDocx || deleting}
              >
                {t('quotes.preview.createOrder')}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => navigate(`/quotes/new?edit=${quote.id}`)}>
              {t('quotes.preview.edit')}
            </Button>

            <Button variant="secondary" onClick={() => navigate(`/quotes/new?duplicate=${quote.id}`)}>
              {t('quotes.preview.duplicate')}
            </Button>

            <Button onClick={handleDownloadPdf} loading={generatingPdf} disabled={generatingDocx || deleting}>
              {generatingPdf ? t('quotes.preview.generatingPDF') : t('quotes.preview.exportPDF')}
            </Button>

            <Button
              variant="secondary"
              onClick={handleDownloadDocx}
              loading={generatingDocx}
              disabled={generatingPdf || deleting}
            >
              {generatingDocx ? t('quotes.preview.generatingDOCX') : t('quotes.preview.exportDOCX')}
            </Button>

            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} disabled={deleting}>
              {t('quotes.preview.delete')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-8">
          <div className="flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt="Company logo"
                  className="h-14 w-14 rounded-md border border-gray-200 object-contain"
                />
              ) : null}

              <div>
                <h2 className="text-2xl font-semibold text-gray-900">{company?.name || 'Company'}</h2>
                <p className="text-sm text-gray-500">3D Printing Quote</p>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                <span className="font-medium text-gray-900">{t('quotes.preview.date')}:</span> {formatDate(quoteDate)}
              </p>
              <p>
                <span className="font-medium text-gray-900">{t('quotes.preview.expiration')}:</span> {formatDate(expirationDate)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-md border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">{t('quotes.preview.client')}:</span> {clientName}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">{t('common.status')}:</span>{' '}
              {t(`status.${normalizeStatusKey(quote.status)}`)}
            </p>
            <p className="text-sm text-gray-700 md:col-span-2">
              <span className="font-medium text-gray-900">{t('quotes.preview.designLink')}:</span>{' '}
              {designUrl ? (
                <a
                  href={designUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-indigo-600 underline decoration-indigo-300 underline-offset-2"
                >
                  {designUrl}
                </a>
              ) : (
                t('common.noData')
              )}
            </p>
            {toNumber(quote?.estimated_delivery_days) > 0 ? (
              <p className="text-sm text-gray-700 md:col-span-2">
                <span className="font-medium text-gray-900">{t('quotes.preview.estimatedDelivery')}:</span>{' '}
                {quote.estimated_delivery_days} {t('quotes.preview.days')}
              </p>
            ) : null}
          </div>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">{t('quotes.preview.materials')}</h3>
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Material
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Weight (g)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Cost/kg
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-sm text-gray-700">
                  {materials.length > 0 ? (
                    materials.map((material, index) => (
                      <tr key={`${material.name}-${index}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {material.color ? (
                              <span
                                className="h-4 w-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: material.color }}
                                aria-label={`${material.name} color`}
                                title={material.color}
                              />
                            ) : null}
                            <span>{material.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{material.type}</td>
                        <td className="px-4 py-3">{material.weight.toFixed(2)}</td>
                        <td className="px-4 py-3">{formatCurrency(material.costPerKg, currency)}</td>
                        <td className="px-4 py-3">{formatCurrency(material.subtotal, currency)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-4 text-center text-gray-500" colSpan={5}>
                        No materials available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CostBreakdown breakdown={breakdown} currency={currency} />
            </div>

            <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-base font-semibold text-gray-900">Print Details</h3>
              {quote?.printer_snapshot?.name ? (
                <p className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">Printer:</span> {quote.printer_snapshot.name}
                </p>
              ) : null}
              {normalizedFileData.length === 1 ? (
                <div className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{t('quotes.preview.files')}:</span>{' '}
                  <span>{normalizedFileData[0].name}</span>{' '}
                  <Badge variant="neutral" className="align-middle">
                    {normalizedFileData[0].type}
                  </Badge>{' '}
                  <span>{normalizedFileData[0].estimatedGrams.toFixed(2)} g</span>
                  {normalizedFileData[0].estimatedHours > 0 ? (
                    <span>{` • ${normalizedFileData[0].estimatedHours.toFixed(2)} h`}</span>
                  ) : null}
                </div>
              ) : normalizedFileData.length > 1 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-900">{t('quotes.preview.files')}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {normalizedFileData.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="space-y-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700"
                      >
                        <p className="truncate font-medium text-gray-900" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="neutral">{file.type}</Badge>
                          <span>{file.estimatedGrams.toFixed(2)} g</span>
                          {file.estimatedHours > 0 ? <span>{file.estimatedHours.toFixed(2)} h</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{t('quotes.preview.printHours')}:</span>{' '}
                {printHours > 0 ? `${printHours.toFixed(2)} h` : 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{t('quotes.preview.partCount')}:</span>{' '}
                {partCount > 0 ? partCount : 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">{t('common.total')}:</span>{' '}
                {formatCurrency(breakdown.totalPriceOverride ?? breakdown.totalPrice, currency)}
              </p>
            </div>
          </div>

          {quote.photo_url ? (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">{t('quotes.preview.referencePhoto')}</h3>
              <img
                src={quote.photo_url}
                alt="Product preview"
                className="max-h-80 w-full rounded-lg border border-gray-200 object-contain bg-white"
              />
            </section>
          ) : null}

          <section className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-4">
            <h3 className="text-base font-semibold text-blue-900">Payment Terms</h3>
            <p className="text-sm text-blue-800">A 50% upfront deposit is required to start the order.</p>
            <p className="text-sm text-blue-700">
              This quote is currently <strong>{t(`status.${normalizeStatusKey(quote.status)}`).toLowerCase()}</strong> and valid until{' '}
              <strong>{formatDate(expirationDate)}</strong>.
            </p>
          </section>
        </div>
      </Card>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title={t('quotes.preview.delete')}>
        <div className="space-y-5">
          <p className="text-sm text-gray-700">
            {t('quotes.preview.deleteConfirm')}
          </p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeleteQuote} loading={deleting}>
              {t('quotes.preview.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
