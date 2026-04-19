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

const STATUS_FILTER_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
];

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

function getStatusLabel(status) {
  if (status === 'in_progress') return 'In Progress';
  if (status === 'completed') return 'Completed';
  return 'Pending';
}

function getClientName(order) {
  return order.client_name || order.clientName || 'Unnamed Client';
}

export default function OrdersListPage() {
  const { userProfile } = useAuth();
  const { error } = useToast();

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
      error('Failed to load orders. Please try again.');
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
            <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
            <p className="text-sm text-gray-600">
              Track production progress for all company orders in one place.
            </p>
          </div>

          <div className="max-w-xs">
            <Select
              id="order-status-filter"
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              options={STATUS_FILTER_OPTIONS}
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
                          {getStatusLabel(status)}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        <OrderProgressBar
                          completionPercent={completionPercent}
                          status={status}
                          pieceCounts={pieceCounts}
                        />

                        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">Created</p>
                          <p className="text-sm font-medium text-gray-700">{createdDate}</p>
                        </div>

                        <div className="pt-1">
                          <Link to={`/orders/${order.id}`}>
                            <Button variant="secondary" size="sm" className="w-full">
                              View
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
                  <p className="col-span-3">Client</p>
                  <p className="col-span-2">Pieces</p>
                  <p className="col-span-2">Status</p>
                  <p className="col-span-3">Progress</p>
                  <p className="col-span-1">Created</p>
                  <p className="col-span-1 text-right">Action</p>
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
                            {getStatusLabel(status)}
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
                              View
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
                    Load More
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
              <p className="text-sm text-gray-600">
                No orders found. Orders are created from accepted quotes.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
