import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import OrderProgressBar from '../../components/OrderProgressBar';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getOrdersByCompany } from '../../lib/orders';
import { useTranslation } from 'react-i18next';

function getStatusFilterOptions(t) {
  return [
    { label: t('status.allStatuses'), value: '' },
    { label: t('status.pending'), value: 'pending' },
    { label: t('status.inProgress'), value: 'in_progress' },
    { label: t('status.completed'), value: 'completed' },
  ];
}

const STATUS_BADGE_VARIANT = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
};

function formatDate(value) {
  if (!value) return 'N/A';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString();
  if (typeof value === 'object' && value.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
  const d = new Date(value);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
}

function getPieceCounts(pieces) {
  const arr = Array.isArray(pieces) ? pieces : [];
  return {
    total: arr.length,
    completed: arr.filter((p) => p.status === 'completed').length,
    inProgress: arr.filter((p) => p.status === 'in_progress').length,
    pending: arr.filter((p) => p.status === 'pending').length,
  };
}

function getStatusLabel(status, t) {
  if (status === 'in_progress') return t('status.inProgress');
  if (status === 'completed') return t('status.completed');
  return t('status.pending');
}

function getClientName(order) {
  return order.client_name || order.clientName || 'Unnamed Client';
}

export default function OrdersListPage() {
  const { userProfile } = useAuth();
  const { error } = useToast();
  const { t } = useTranslation();

  const companyId = userProfile?.company_id;

  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadOrders = async ({ append = false, cursor = null } = {}) => {
    if (!companyId) {
      setOrders([]);
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

      const result = await getOrdersByCompany(companyId, options);
      const nextOrders = result?.orders || [];

      setOrders((prev) => (append ? [...prev, ...nextOrders] : nextOrders));
      setLastDoc(result?.lastDoc || null);
    } catch (loadError) {
      console.error('[OrdersListPage] Failed to load orders', loadError);
      error(t('toast.loadFailed'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setOrders([]);
    setLastDoc(null);
    loadOrders();
  }, [companyId, statusFilter]);

  const hasOrders = orders.length > 0;
  const canLoadMore = Boolean(lastDoc) && !loading && !loadingMore;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">{t('orders.list.title')}</h1>
            <p className="text-sm text-gray-600">
              {t('orders.list.noOrdersSubtitle')}
            </p>
          </div>

          <div className="max-w-xs">
            <Select
              id="order-status-filter"
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
          ) : hasOrders ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {orders.map((order) => {
                  const pieceCounts = getPieceCounts(order.pieces);
                  const status = String(order.status || 'pending').toLowerCase();
                  const completionPercent = Number(order.completion_percent || 0);
                  const createdDate = formatDate(order.created_at || order.createdAt);

                  return (
                    <article
                      key={order.id}
                      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <Link
                            to={`/orders/${order.id}`}
                            className="block truncate text-base font-semibold text-gray-900 hover:text-indigo-700"
                          >
                            {getClientName(order)}
                          </Link>
                          <p className="text-sm text-gray-600">{pieceCounts.total} pieces</p>
                        </div>
                        <Badge variant={STATUS_BADGE_VARIANT[status] || 'neutral'}>
                          {getStatusLabel(status, t)}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        <OrderProgressBar
                          completionPercent={completionPercent}
                          status={status}
                          pieceCounts={pieceCounts}
                        />

                        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">{t('common.date')}</p>
                          <p className="text-sm font-medium text-gray-700">{createdDate}</p>
                        </div>

                        <div className="pt-1">
                          <Link to={`/orders/${order.id}`}>
                            <Button variant="secondary" size="sm" className="w-full">
                              {t('common.view')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-gray-200 md:block">
                <div className="grid grid-cols-12 gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <p className="col-span-3">{t('common.client')}</p>
                  <p className="col-span-2">Pieces</p>
                  <p className="col-span-2">{t('common.status')}</p>
                  <p className="col-span-3">Progress</p>
                  <p className="col-span-1">{t('common.date')}</p>
                  <p className="col-span-1 text-right">{t('common.actions')}</p>
                </div>

                <div className="divide-y divide-gray-200 bg-white">
                  {orders.map((order) => {
                    const pieceCounts = getPieceCounts(order.pieces);
                    const status = String(order.status || 'pending').toLowerCase();
                    const completionPercent = Number(order.completion_percent || 0);
                    const createdDate = formatDate(order.created_at || order.createdAt);

                    return (
                      <div key={order.id} className="grid grid-cols-12 items-center gap-3 px-4 py-4">
                        <div className="col-span-3 min-w-0">
                          <Link
                            to={`/orders/${order.id}`}
                            className="block truncate text-sm font-semibold text-gray-900 hover:text-indigo-700"
                          >
                            {getClientName(order)}
                          </Link>
                        </div>

                        <p className="col-span-2 text-sm text-gray-700">{pieceCounts.total} pieces</p>

                        <div className="col-span-2">
                          <Badge variant={STATUS_BADGE_VARIANT[status] || 'neutral'}>
                            {getStatusLabel(status, t)}
                          </Badge>
                        </div>

                        <div className="col-span-3">
                          <OrderProgressBar
                            completionPercent={completionPercent}
                            status={status}
                            pieceCounts={pieceCounts}
                          />
                        </div>

                        <p className="col-span-1 text-xs text-gray-600">{createdDate}</p>

                        <div className="col-span-1 flex justify-end">
                          <Link to={`/orders/${order.id}`}>
                            <Button variant="secondary" size="sm">
                              {t('common.view')}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {canLoadMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    loading={loadingMore}
                    onClick={() => loadOrders({ append: true, cursor: lastDoc })}
                  >
                    {t('orders.list.loadMore')}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-700">{t('orders.list.noOrders')}</p>
              <p className="mt-1 text-sm text-gray-600">{t('orders.list.noOrdersSubtitle')}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
