import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Table } from '../../components/ui/Table';
import { Select } from '../../components/ui/Select';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getBillsByCompany } from '../../lib/bills';
import { formatCurrency } from '../../lib/currency';

const STATUS_BADGE_VARIANT = {
  unpaid: 'warning',
  paid: 'success',
};

function getStatusFilterOptions(t) {
  return [
    { label: t('status.all'), value: '' },
    { label: t('bills.unpaid'), value: 'unpaid' },
    { label: t('bills.paid'), value: 'paid' },
  ];
}

function getClientName(bill) {
  return bill.client_name || bill.clientName || 'Unnamed Client';
}

function getBillingDate(bill) {
  return bill.billing_date || bill.billingDate || bill.created_at || bill.createdAt;
}

function formatDate(value) {
  if (!value) return 'N/A';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString();
  if (typeof value === 'object' && value.seconds) return new Date(value.seconds * 1000).toLocaleDateString();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
}

function getPiecesCount(bill) {
  if (Number.isFinite(Number(bill.pieces_count))) return Number(bill.pieces_count);
  if (Number.isFinite(Number(bill.piecesCount))) return Number(bill.piecesCount);
  if (Number.isFinite(Number(bill.partsCount))) return Number(bill.partsCount);
  if (Array.isArray(bill.pieces)) return bill.pieces.length;
  return 0;
}

function getTotal(bill) {
  const numericTotal = Number(bill.total);
  return Number.isFinite(numericTotal) ? numericTotal : 0;
}

function getStatus(bill) {
  return String(bill.status || 'unpaid').toLowerCase();
}

function getStatusLabel(status, t) {
  if (status === 'paid') return t('bills.paid');
  return t('bills.unpaid');
}

function hasOrderSource(bill) {
  return Boolean(bill.order_id || bill.orderId);
}

export default function BillsListPage() {
  const navigate = useNavigate();
  const { userProfile, companyCurrency } = useAuth();
  const { error } = useToast();
  const { t } = useTranslation();

  const companyId = userProfile?.company_id;

  const [bills, setBills] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadBills = async ({ append = false, cursor = null } = {}) => {
    if (!companyId) {
      setBills([]);
      setLastDoc(null);
      setLoading(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const options = {
        pageSize: 20,
      };

      if (statusFilter) {
        options.statusFilter = statusFilter;
      }

      if (cursor) {
        options.lastDoc = cursor;
      }

      const result = await getBillsByCompany(companyId, options);
      const nextBills = result?.bills || [];

      setBills((prev) => (append ? [...prev, ...nextBills] : nextBills));
      setLastDoc(result?.lastDoc || null);
    } catch (loadError) {
      console.error('[BillsListPage] Failed to load bills', loadError);
      error(t('toast.loadFailed'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setBills([]);
    setLastDoc(null);
    loadBills();
  }, [companyId, statusFilter]);

  const columns = [
    {
      key: 'clientName',
      label: t('bills.clientName'),
      render: (bill) => (
        <div className="space-y-2">
          <p className="font-semibold text-gray-900">{getClientName(bill)}</p>
          <Badge variant="neutral">
            {hasOrderSource(bill) ? t('bills.fromOrder') : t('bills.standalone')}
          </Badge>
        </div>
      ),
    },
    {
      key: 'billingDate',
      label: t('bills.billingDate'),
      render: (bill) => formatDate(getBillingDate(bill)),
    },
    {
      key: 'piecesCount',
      label: t('bills.piecesCount'),
      render: (bill) => getPiecesCount(bill),
    },
    {
      key: 'total',
      label: t('common.total'),
      render: (bill) => formatCurrency(getTotal(bill), companyCurrency || bill.currency || 'USD'),
    },
    {
      key: 'status',
      label: t('common.status'),
      render: (bill) => {
        const status = getStatus(bill);

        return (
          <Badge variant={STATUS_BADGE_VARIANT[status] || 'warning'}>
            {getStatusLabel(status, t)}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (bill) => (
        <Button variant="secondary" size="sm" onClick={() => navigate(`/bills/${bill.id}`)}>
          {t('common.view')}
        </Button>
      ),
    },
  ];

  const hasBills = bills.length > 0;
  const canLoadMore = Boolean(lastDoc) && !loading && !loadingMore;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold text-gray-900">{t('bills.title')}</h1>
            <Button onClick={() => navigate('/bills/new')}>{t('bills.newBill')}</Button>
          </div>

          <div className="max-w-xs">
            <Select
              id="bill-status-filter"
              label={t('common.status')}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              options={getStatusFilterOptions(t)}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : hasBills ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {bills.map((bill) => {
                  const status = getStatus(bill);

                  return (
                    <article
                      key={bill.id}
                      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <p className="truncate text-base font-semibold text-gray-900">{getClientName(bill)}</p>
                          <Badge variant="neutral">
                            {hasOrderSource(bill) ? t('bills.fromOrder') : t('bills.standalone')}
                          </Badge>
                        </div>

                        <Badge variant={STATUS_BADGE_VARIANT[status] || 'warning'}>
                          {getStatusLabel(status, t)}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">{t('bills.billingDate')}</p>
                          <p className="text-sm font-medium text-gray-700">{formatDate(getBillingDate(bill))}</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-wide text-gray-500">{t('bills.piecesCount')}</p>
                          <p className="text-sm font-medium text-gray-700">{getPiecesCount(bill)}</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-wide text-gray-500">{t('common.total')}</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatCurrency(getTotal(bill), companyCurrency || bill.currency || 'USD')}
                          </p>
                        </div>

                        <div className="pt-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => navigate(`/bills/${bill.id}`)}
                          >
                            {t('common.view')}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden md:block">
                <Table columns={columns} data={bills} />
              </div>

              {canLoadMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    loading={loadingMore}
                    onClick={() => loadBills({ append: true, cursor: lastDoc })}
                  >
                    {t('common.loadMore')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-700">{t('bills.noBills')}</p>
              <div className="mt-4">
                <Button onClick={() => navigate('/bills/new')}>{t('bills.newBill')}</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
