import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle, Download, ExternalLink, Trash2 } from 'lucide-react';
import { getBill, updateBill, deleteBill } from '../../lib/bills';
import { generateBillPdf } from '../../lib/billPdfGenerator';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { formatCurrency } from '../../lib/currency';
import { db } from '../../lib/firebase';

const STATUS_BADGE_VARIANT = {
  unpaid: 'warning',
  paid: 'success',
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

function formatDate(value) {
  const date = toDate(value);

  if (!date) {
    return 'N/A';
  }

  return date.toLocaleDateString();
}

function getBillStatus(bill) {
  return String(bill?.status || 'unpaid').toLowerCase() === 'paid' ? 'paid' : 'unpaid';
}

function getClientName(bill) {
  return bill?.client_name || bill?.clientName || 'Unnamed Client';
}

function getOrderId(bill) {
  return bill?.order_id || bill?.orderId || '';
}

function getQuoteId(bill) {
  return bill?.quote_id || bill?.quoteId || '';
}

function getDesignUrl(bill) {
  return String(bill?.design_url || bill?.designUrl || '').trim();
}

function getPiecesCount(bill) {
  if (Number.isFinite(Number(bill?.pieces_count))) return Number(bill.pieces_count);
  if (Number.isFinite(Number(bill?.piecesCount))) return Number(bill.piecesCount);
  if (Number.isFinite(Number(bill?.partsCount))) return Number(bill.partsCount);
  if (Array.isArray(bill?.pieces)) return bill.pieces.length;
  return 0;
}

function getMaterialsRows(bill) {
  const materials = Array.isArray(bill?.materials) ? bill.materials : [];

  return materials.map((material, index) => {
    const grams = toNumber(material?.grams ?? material?.weight_g ?? material?.weight);
    const costPerKg = toNumber(material?.costPerKg ?? material?.cost_per_kg ?? material?.pricePerKg);
    const subtotal = (grams / 1000) * costPerKg;

    return {
      id: material?.id || `${index}`,
      name: material?.materialName || material?.name || `Material ${index + 1}`,
      grams,
      costPerKg,
      color: material?.color || '',
      subtotal,
    };
  });
}

function getExtraCostsRows(bill) {
  const extras = Array.isArray(bill?.extra_costs)
    ? bill.extra_costs
    : Array.isArray(bill?.extraCosts)
      ? bill.extraCosts
      : [];

  return extras.map((extra, index) => ({
    id: extra?.id || `${index}`,
    name: extra?.name || `Extra ${index + 1}`,
    amount: toNumber(extra?.amount),
  }));
}

export default function BillDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile, companyCurrency } = useAuth();
  const { success, error, info } = useToast();
  const { t } = useTranslation();

  const [bill, setBill] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
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
        const billData = await getBill(id);

        if (!billData) {
          info(t('toast.loadFailed'));
          if (!cancelled) {
            setBill(null);
            setCompany(null);
          }
          return;
        }

        if (userProfile?.company_id && billData.company_id !== userProfile.company_id) {
          error('You do not have access to this bill.');
          navigate('/bills');
          return;
        }

        let companyData = null;

        if (billData.company_id) {
          const companyRef = doc(db, 'companies', billData.company_id);
          const companySnap = await getDoc(companyRef);

          if (companySnap.exists()) {
            companyData = { id: companySnap.id, ...companySnap.data() };
          }
        }

        if (!cancelled) {
          setBill({ id: billData.id || id, ...billData });
          setCompany(companyData);
        }
      } catch (loadError) {
        console.error('[BillDetailPage] Failed to load bill', loadError);
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

  const status = useMemo(() => getBillStatus(bill), [bill]);
  const currency = useMemo(
    () => bill?.currency || company?.global_config?.currency || company?.currency || companyCurrency || 'USD',
    [bill?.currency, company, companyCurrency]
  );
  const materials = useMemo(() => getMaterialsRows(bill), [bill]);
  const extraCosts = useMemo(() => getExtraCostsRows(bill), [bill]);
  const materialsTotal = useMemo(
    () => materials.reduce((sum, row) => sum + row.subtotal, 0),
    [materials]
  );
  const extraCostsTotal = useMemo(
    () => extraCosts.reduce((sum, row) => sum + row.amount, 0),
    [extraCosts]
  );
  const designUrl = useMemo(() => getDesignUrl(bill), [bill]);
  const orderId = useMemo(() => getOrderId(bill), [bill]);
  const quoteId = useMemo(() => getQuoteId(bill), [bill]);
  const notes = useMemo(() => String(bill?.notes || '').trim(), [bill?.notes]);

  const handleStatusToggle = async () => {
    if (!bill) {
      return;
    }

    const nextStatus = status === 'paid' ? 'unpaid' : 'paid';
    const previousBill = bill;

    setUpdatingStatus(true);
    setBill((prev) => (prev ? { ...prev, status: nextStatus } : prev));

    try {
      await updateBill(bill.id, { status: nextStatus });
      success(t('toast.statusUpdated'));
    } catch (updateError) {
      console.error('[BillDetailPage] Failed to update bill status', updateError);
      setBill(previousBill);
      error(t('toast.saveFailed'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!bill) {
      return;
    }

    setGeneratingPdf(true);

    try {
      await generateBillPdf(bill, company || {});
      success(t('toast.saveSuccess'));
    } catch (downloadError) {
      console.error('[BillDetailPage] Failed to generate bill PDF', downloadError);
      error(t('toast.saveFailed'));
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDelete = async () => {
    if (!bill) {
      return;
    }

    setDeleting(true);

    try {
      await deleteBill(bill.id);
      success(t('bills.billDeleted'));
      navigate('/bills');
    } catch (deleteError) {
      console.error('[BillDetailPage] Failed to delete bill', deleteError);
      error(t('toast.saveFailed'));
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

  if (!bill) {
    return (
      <Card title={t('bills.billDetail')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Bill not found.</p>
          <Link to="/bills">
            <Button variant="secondary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('common.back')}
            </Button>
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
            <Button variant="secondary" onClick={() => navigate('/bills')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('common.back')}
            </Button>

            <h1 className="text-xl font-semibold text-gray-900">{getClientName(bill) || t('bills.billDetail')}</h1>

            <Badge variant={STATUS_BADGE_VARIANT[status] || 'warning'}>
              {status === 'paid' ? t('bills.paid') : t('bills.unpaid')}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleStatusToggle} loading={updatingStatus}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {status === 'paid' ? t('bills.markUnpaid') : t('bills.markPaid')}
            </Button>

            <Button variant="secondary" onClick={handleDownloadPdf} loading={generatingPdf}>
              <Download className="mr-2 h-4 w-4" />
              {t('bills.downloadPdf')}
            </Button>

            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={t('bills.billDetail')}>
        <div className="space-y-6">
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
                <p className="text-sm text-gray-500">{t('bills.billDetail')}</p>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                <span className="font-medium text-gray-900">{t('bills.clientName')}:</span>{' '}
                {getClientName(bill)}
              </p>
              <p>
                <span className="font-medium text-gray-900">{t('bills.billingDate')}:</span>{' '}
                {formatDate(bill.billing_date || bill.billingDate || bill.created_at || bill.createdAt)}
              </p>
              {bill.order_created_at ? (
                <p>
                  <span className="font-medium text-gray-900">{t('bills.orderDate')}:</span>{' '}
                  {formatDate(bill.order_created_at)}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-gray-900">{t('bills.piecesCount')}:</span>{' '}
                {getPiecesCount(bill)}
              </p>
              <p>
                <span className="font-medium text-gray-900">{t('bills.status')}:</span>{' '}
                {status === 'paid' ? t('bills.paid') : t('bills.unpaid')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('bills.designUrl')}</p>
              {designUrl ? (
                <a
                  href={designUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {designUrl}
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <p className="mt-2 text-sm text-gray-500">N/A</p>
              )}
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('bills.status')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-700">
                {orderId ? (
                  <>
                    <span>{t('bills.fromOrder')}</span>
                    <Link
                      to={`/orders/${orderId}`}
                      className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {t('bills.viewOrder')}
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </>
                ) : (
                  <span>{t('bills.standalone')}</span>
                )}
              </div>

              {quoteId ? (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <Link
                    to={`/quotes/${quoteId}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {t('bills.viewQuote')}
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card title={t('bills.materials')}>
        {materials.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.materialName')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.grams')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.costPerKg')}</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.color')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.subtotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {materials.map((material) => (
                  <tr key={material.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{material.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">{material.grams.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">{formatCurrency(material.costPerKg, currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: material.color || '#e5e7eb' }}
                        title={material.color || 'N/A'}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(material.subtotal, currency)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{t('common.total')}</td>
                  <td className="px-4 py-3" colSpan={3}></td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(materialsTotal, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-600">{t('common.noData')}</p>
        )}
      </Card>

      {extraCosts.length > 0 ? (
        <Card title={t('bills.extraCosts')}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.costName')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">{t('bills.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {extraCosts.map((extra) => (
                  <tr key={extra.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{extra.name}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{formatCurrency(extra.amount, currency)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{t('common.total')}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(extraCostsTotal, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="rounded-md border border-indigo-200 bg-indigo-50 px-5 py-6 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-700">{t('bills.total')}</p>
          <p className="mt-2 text-4xl font-bold text-indigo-900">{formatCurrency(toNumber(bill.total), currency)}</p>
        </div>
      </Card>

      {notes ? (
        <Card title={t('bills.notes')}>
          <p className="whitespace-pre-wrap text-sm text-gray-600">{notes}</p>
        </Card>
      ) : null}

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={t('common.delete')}
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-700">{t('bills.deleteConfirm')}</p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
