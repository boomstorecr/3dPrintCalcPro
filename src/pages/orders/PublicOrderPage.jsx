import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import OrderProgressBar from '../../components/OrderProgressBar';
import { getPublicOrder } from '../../lib/orders';
import { useTranslation } from 'react-i18next';

const STATUS_BADGE_VARIANT = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
};

function statusLabel(status, t) {
  const labels = {
    pending: t('status.pending'),
    in_progress: t('status.inProgress'),
    completed: t('status.completed'),
  };

  return labels[status] || status;
}

export default function PublicOrderPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadPublicOrder() {
      setLoading(true);

      try {
        if (!token) {
          if (active) {
            setOrder(null);
          }
          return;
        }

        const data = await getPublicOrder(token);

        if (!active) {
          return;
        }

        setOrder(data);
      } catch (error) {
        console.error('Failed to load public order:', {
          token,
          message: error?.message,
        });

        if (active) {
          setOrder(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPublicOrder();

    return () => {
      active = false;
    };
  }, [token]);

  const pieceCounts = useMemo(() => {
    const pieces = order?.pieces || [];

    return {
      total: pieces.length,
      completed: pieces.filter((p) => p.status === 'completed').length,
      inProgress: pieces.filter((p) => p.status === 'in_progress').length,
      pending: pieces.filter((p) => p.status === 'pending').length,
    };
  }, [order]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">{t('orders.public.notFound')}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('orders.public.notFoundSubtitle')}
          </p>
        </div>
      </div>
    );
  }

  const pieces = Array.isArray(order.pieces) ? order.pieces : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-4">
            {order.company_logo_url && (
              <img
                src={order.company_logo_url}
                alt=""
                className="h-12 w-12 rounded-md border border-gray-200 object-contain"
              />
            )}
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{order.company_name || 'Company'}</h1>
              <p className="text-sm text-gray-500">{t('orders.public.orderTracking')}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">{t('orders.public.client')}</p>
              <p className="text-lg font-medium text-gray-900">{order.client_name || 'Client'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{t('orders.public.status')}</p>
              <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'neutral'} className="text-base">
                {statusLabel(order.status, t)}
              </Badge>
            </div>
          </div>

          <p className="text-sm text-gray-500">{t('orders.public.progress')}</p>
          <OrderProgressBar
            completionPercent={order.completion_percent || 0}
            status={order.status}
            pieceCounts={pieceCounts}
          />
        </div>

        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900">{t('orders.public.pieces')}</h2>

          {pieces.length === 0 ? (
            <p className="text-sm text-gray-500">No pieces found for this order.</p>
          ) : (
            <div className="space-y-3">
              {pieces.map((piece) => (
                <div
                  key={piece.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-3 w-3 rounded-full ${
                        piece.status === 'completed'
                          ? 'bg-green-500'
                          : piece.status === 'in_progress'
                            ? 'bg-blue-500'
                            : 'bg-gray-300'
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-800">{piece.name || 'Piece'}</span>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[piece.status] || 'neutral'} size="sm">
                    {statusLabel(piece.status, t)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="py-4 text-center text-xs text-gray-400">{t('orders.public.poweredBy')}</footer>
      </main>
    </div>
  );
}
