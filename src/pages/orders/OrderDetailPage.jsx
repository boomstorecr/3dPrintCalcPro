import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import OrderProgressBar from '../../components/OrderProgressBar';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { db } from '../../lib/firebase';
import { getOrder, updatePieceStatus, updatePieceNotes, deleteOrder } from '../../lib/orders';
import { useTranslation } from 'react-i18next';

function getPieceStatusOptions(t) {
  return [
    { label: t('orders.detail.markPending'), value: 'pending' },
    { label: t('orders.detail.markInProgress'), value: 'in_progress' },
    { label: t('orders.detail.markCompleted'), value: 'completed' },
  ];
}

const STATUS_BADGE_VARIANT = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
};

function statusLabel(status, t) {
  const labels = {
    pending: t('orders.detail.pending'),
    in_progress: t('orders.detail.inProgress'),
    completed: t('orders.detail.completed'),
  };

  return labels[status] || status;
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

function deriveOrderStatus(pieces) {
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return 'pending';
  }

  const allCompleted = pieces.every((piece) => piece.status === 'completed');
  if (allCompleted) {
    return 'completed';
  }

  const anyActive = pieces.some((piece) => piece.status === 'in_progress' || piece.status === 'completed');
  if (anyActive) {
    return 'in_progress';
  }

  return 'pending';
}

function computeCompletionPercent(pieces) {
  if (!Array.isArray(pieces) || pieces.length === 0) {
    return 0;
  }

  const completedCount = pieces.filter((piece) => piece.status === 'completed').length;
  return Math.round((completedCount / pieces.length) * 100);
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { success, error, info } = useToast();
  const { t } = useTranslation();

  const [order, setOrder] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingPiece, setUpdatingPiece] = useState(null); // pieceId being updated
  const [deleting, setDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState({}); // { pieceId: notesValue }
  const [savingNotes, setSavingNotes] = useState(null); // pieceId being saved
  const [copied, setCopied] = useState(false);

  const pieceCounts = useMemo(() => {
    const pieces = order?.pieces || [];
    return {
      total: pieces.length,
      completed: pieces.filter((p) => p.status === 'completed').length,
      inProgress: pieces.filter((p) => p.status === 'in_progress').length,
      pending: pieces.filter((p) => p.status === 'pending').length,
    };
  }, [order]);

  const publicUrl = order?.public_token
    ? `${window.location.origin}/order/track/${order.public_token}`
    : '';

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const orderData = await getOrder(id);

        if (!orderData) {
          info(t('toast.loadFailed'));
          if (!cancelled) {
            setOrder(null);
            setCompany(null);
          }
          return;
        }

        if (userProfile?.company_id && orderData.company_id !== userProfile.company_id) {
          error('You do not have access to this order.');
          navigate('/orders');
          return;
        }

        let companyData = null;

        if (orderData.company_id) {
          const companyRef = doc(db, 'companies', orderData.company_id);
          const companySnap = await getDoc(companyRef);

          if (companySnap.exists()) {
            companyData = { id: companySnap.id, ...companySnap.data() };
          }
        }

        if (!cancelled) {
          setOrder({ id: orderData.id || id, ...orderData });
          setCompany(companyData);
        }
      } catch (loadError) {
        console.error('[OrderDetailPage] Failed to load order details', loadError);
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
  }, [id, userProfile?.company_id, navigate, error, info]);

  const handlePieceStatusChange = async (pieceId, newStatus) => {
    if (!order) {
      return;
    }

    if (newStatus === (order.pieces || []).find((piece) => piece.id === pieceId)?.status) {
      return;
    }

    const originalOrder = order;
    const updatedPieces = (order.pieces || []).map((piece) =>
      piece.id === pieceId ? { ...piece, status: newStatus } : piece
    );

    const optimisticOrder = {
      ...order,
      pieces: updatedPieces,
      status: deriveOrderStatus(updatedPieces),
      completion_percent: computeCompletionPercent(updatedPieces),
    };

    setUpdatingPiece(pieceId);
    setOrder(optimisticOrder);

    try {
      await updatePieceStatus(order.id, pieceId, newStatus);
      success(t('toast.orderUpdated'));
    } catch (updateError) {
      console.error('[OrderDetailPage] Failed to update piece status', updateError);
      setOrder(originalOrder);
      error(t('toast.saveFailed'));
    } finally {
      setUpdatingPiece(null);
    }
  };

  const handleSaveNotes = async (pieceId) => {
    if (!order) {
      return;
    }

    const piece = (order.pieces || []).find((item) => item.id === pieceId);
    const nextNotes = editingNotes[pieceId] ?? piece?.notes ?? '';

    setSavingNotes(pieceId);

    try {
      await updatePieceNotes(order.id, pieceId, nextNotes);

      setOrder((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          pieces: (prev.pieces || []).map((item) =>
            item.id === pieceId ? { ...item, notes: nextNotes } : item
          ),
        };
      });

      setEditingNotes((prev) => {
        const next = { ...prev };
        delete next[pieceId];
        return next;
      });

      success(t('toast.orderUpdated'));
    } catch (saveError) {
      console.error('[OrderDetailPage] Failed to save piece notes', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSavingNotes(null);
    }
  };

  const handleCopyLink = async () => {
    if (!publicUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      success(t('toast.linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error(t('toast.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!order) {
      return;
    }

    setDeleting(true);

    try {
      await deleteOrder(order.id);
      success(t('toast.orderDeleted'));
      navigate('/orders');
    } catch (deleteError) {
      console.error('[OrderDetailPage] Failed to delete order', deleteError);
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

  if (!order) {
    return (
      <Card title={t('orders.detail.title')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Order not found.</p>
          <Link to="/orders">
            <Button variant="secondary">{t('orders.detail.back')}</Button>
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
            <Link to="/orders">
              <Button variant="secondary">{t('orders.detail.back')}</Button>
            </Link>

            <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'neutral'}>
              {statusLabel(order.status, t)}
            </Badge>

            {order.quote_id ? (
              <Link to={`/quotes/${order.quote_id}`}>
                <Button variant="secondary">{t('orders.detail.viewQuote')}</Button>
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleCopyLink} disabled={!publicUrl}>
              {copied ? t('orders.detail.copied') : t('orders.detail.share')}
            </Button>
            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} disabled={deleting}>
              {t('orders.detail.delete')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
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
                <p className="text-sm text-gray-500">{t('orders.detail.title')}</p>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                <span className="font-medium text-gray-900">{t('orders.detail.client')}:</span>{' '}
                {order.client_name || 'Unnamed Client'}
              </p>
              <p>
                <span className="font-medium text-gray-900">{t('orders.detail.created')}:</span>{' '}
                {formatDate(order.created_at || order.createdAt)}
              </p>
              <p>
                <span className="font-medium text-gray-900">{t('orders.detail.overallStatus')}:</span>{' '}
                {statusLabel(order.status, t)}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">{t('orders.detail.progress')}</h3>
              <span className="text-sm text-gray-600">{order.completion_percent || 0}% complete</span>
            </div>
            <OrderProgressBar
              completionPercent={order.completion_percent || 0}
              status={order.status || 'pending'}
              pieceCounts={pieceCounts}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>{t('orders.detail.total')}: {pieceCounts.total}</span>
              <span>{t('orders.detail.completed')}: {pieceCounts.completed}</span>
              <span>{t('orders.detail.inProgress')}: {pieceCounts.inProgress}</span>
              <span>{t('orders.detail.pending')}: {pieceCounts.pending}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card title={t('orders.detail.pieces')}>
        <div className="space-y-4">
          {(order.pieces || []).length > 0 ? (
            (order.pieces || []).map((piece) => (
              <div key={piece.id} className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{piece.name}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[piece.status] || 'neutral'}>
                    {statusLabel(piece.status, t)}
                  </Badge>
                </div>

                <Select
                  id={`piece-status-${piece.id}`}
                  label={t('orders.detail.pieceStatus')}
                  value={piece.status}
                  onChange={(e) => handlePieceStatusChange(piece.id, e.target.value)}
                  options={getPieceStatusOptions(t)}
                  disabled={updatingPiece === piece.id}
                />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">{t('orders.detail.notes')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                      value={editingNotes[piece.id] ?? piece.notes ?? ''}
                      onChange={(e) =>
                        setEditingNotes((prev) => ({
                          ...prev,
                          [piece.id]: e.target.value,
                        }))
                      }
                      placeholder={t('orders.detail.notesPlaceholder')}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSaveNotes(piece.id)}
                      disabled={
                        savingNotes === piece.id ||
                        (editingNotes[piece.id] ?? piece.notes ?? '') === (piece.notes ?? '')
                      }
                      loading={savingNotes === piece.id}
                    >
                      {t('orders.detail.save')}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-600">{t('orders.detail.noPieces')}</p>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={t('orders.detail.delete')}
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-700">{t('orders.detail.deleteConfirm')}</p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
              {t('orders.detail.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {t('orders.detail.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
