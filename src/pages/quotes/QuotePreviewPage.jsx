import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
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
import { db } from '../../lib/firebase';
import { generateQuotePDF } from '../../lib/pdfGenerator';
import { deleteQuote, getQuote, updateQuote } from '../../lib/quotes';

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Rejected', value: 'rejected' },
];

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

function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function statusLabel(status) {
  const normalized = String(status || 'draft').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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
      weight,
      costPerKg,
      subtotal,
    };
  });
}

function getBreakdown(quote) {
  const raw = quote?.cost_breakdown || quote?.costBreakdown || quote?.breakdown || {};
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
    totalPrice,
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

  const [quote, setQuote] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
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
          info('Quote not found.');
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
          error('Failed to load quote preview.');
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
  }, [id, userProfile?.company_id, navigate, error, info]);

  const currency = useMemo(() => getCurrency(quote, company), [quote, company]);
  const clientName = useMemo(() => getClientName(quote), [quote]);
  const designUrl = useMemo(() => getDesignUrl(quote), [quote]);
  const quoteDate = useMemo(() => getQuoteDate(quote), [quote]);
  const expirationDate = useMemo(() => getExpirationDate(quote), [quote]);
  const materials = useMemo(() => getMaterials(quote), [quote]);
  const breakdown = useMemo(() => getBreakdown(quote), [quote]);
  const printHours = useMemo(() => getPrintHours(quote), [quote]);
  const partCount = useMemo(() => getPartCount(quote), [quote]);

  const handleStatusChange = async (event) => {
    const nextStatus = event.target.value;

    if (!quote || nextStatus === quote.status) {
      return;
    }

    setUpdatingStatus(true);

    try {
      await updateQuote(quote.id, { status: nextStatus });
      setQuote((prev) => ({ ...prev, status: nextStatus }));
      success('Quote status updated.');
    } catch (updateError) {
      console.error('[QuotePreviewPage] Failed to update status', updateError);
      error('Failed to update quote status.');
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
      success('PDF downloaded successfully.');
    } catch (downloadError) {
      console.error('[QuotePreviewPage] Failed to generate PDF', downloadError);
      error('Failed to generate PDF.');
    } finally {
      setGeneratingPdf(false);
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
      success('DOCX downloaded successfully.');
    } catch (downloadError) {
      console.error('[QuotePreviewPage] Failed to generate DOCX', downloadError);
      error('Failed to generate DOCX.');
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
      success('Quote deleted successfully.');
      navigate('/quotes');
    } catch (deleteError) {
      console.error('[QuotePreviewPage] Failed to delete quote', deleteError);
      error('Failed to delete quote.');
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
      <Card title="Quote Preview">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">The requested quote was not found.</p>
          <Link to="/quotes">
            <Button variant="secondary">Back to Quote History</Button>
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
              <Button variant="secondary">Back</Button>
            </Link>

            <Badge variant={STATUS_BADGE_VARIANT[String(quote.status || 'draft').toLowerCase()] || 'neutral'}>
              {statusLabel(quote.status)}
            </Badge>

            <Select
              id="quote-status"
              value={quote.status || 'draft'}
              onChange={handleStatusChange}
              options={STATUS_OPTIONS}
              className="min-w-[180px]"
              disabled={updatingStatus}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => navigate(`/quotes/new?edit=${quote.id}`)}>
              Edit
            </Button>

            <Button variant="secondary" onClick={() => navigate(`/quotes/new?duplicate=${quote.id}`)}>
              Duplicate
            </Button>

            <Button onClick={handleDownloadPdf} loading={generatingPdf} disabled={generatingDocx || deleting}>
              Download PDF
            </Button>

            <Button
              variant="secondary"
              onClick={handleDownloadDocx}
              loading={generatingDocx}
              disabled={generatingPdf || deleting}
            >
              Download DOCX
            </Button>

            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} disabled={deleting}>
              Delete
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
                <span className="font-medium text-gray-900">Quote Date:</span> {formatDate(quoteDate)}
              </p>
              <p>
                <span className="font-medium text-gray-900">Expiration:</span> {formatDate(expirationDate)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-md border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">Client:</span> {clientName}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">Status:</span> {statusLabel(quote.status)}
            </p>
            <p className="text-sm text-gray-700 md:col-span-2">
              <span className="font-medium text-gray-900">Design URL:</span>{' '}
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
                'Not provided'
              )}
            </p>
          </div>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">Materials</h3>
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
                        <td className="px-4 py-3">{material.name}</td>
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
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Estimated Print Time:</span>{' '}
                {printHours > 0 ? `${printHours.toFixed(2)} h` : 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Parts Count:</span> {partCount > 0 ? partCount : 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">Total Quote:</span>{' '}
                {formatCurrency(breakdown.totalPrice, currency)}
              </p>
            </div>
          </div>

          {quote.photo_url ? (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900">Product Photo</h3>
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
              This quote is currently <strong>{statusLabel(quote.status).toLowerCase()}</strong> and valid until{' '}
              <strong>{formatDate(expirationDate)}</strong>.
            </p>
          </section>
        </div>
      </Card>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Quote">
        <div className="space-y-5">
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this quote for <span className="font-semibold">{clientName}</span>? This
            action cannot be undone.
          </p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteQuote} loading={deleting}>
              Delete Quote
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
