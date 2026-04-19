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

const PIECE_STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
];

const STATUS_BADGE_VARIANT = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
};

function statusLabel(status) {
  const labels = { pending: 'Pending', in_progress: 'In Progress', completed: 'Completed' };
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
          info('Order not found.');
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
          error('Failed to load order details.');
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
      success('Piece status updated.');
    } catch (updateError) {
      console.error('[OrderDetailPage] Failed to update piece status', updateError);
      setOrder(originalOrder);
      error('Failed to update piece status.');
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

      success('Piece notes saved.');
    } catch (saveError) {
      console.error('[OrderDetailPage] Failed to save piece notes', saveError);
      error('Failed to save piece notes.');
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
      success('Public tracking link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error('Failed to copy link.');
    }
  };

  const handleDelete = async () => {
    if (!order) {
      return;
    }

    setDeleting(true);

    try {
      await deleteOrder(order.id);
      success('Order deleted successfully.');
      navigate('/orders');
    } catch (deleteError) {
      console.error('[OrderDetailPage] Failed to delete order', deleteError);
      error('Failed to delete order.');
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
      <Card title="Order Details">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Order not found.</p>
          <Link to="/orders">
            <Button variant="secondary">Back to Orders</Button>
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
              <Button variant="secondary">Back</Button>
            </Link>

            <Badge variant={STATUS_BADGE_VARIANT[order.status] || 'neutral'}>
              {statusLabel(order.status)}
            </Badge>

            {order.quote_id ? (
              <Link to={`/quotes/${order.quote_id}`}>
                <Button variant="secondary">View Quote</Button>
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleCopyLink} disabled={!publicUrl}>
              {copied ? 'Copied!' : 'Share'}
            </Button>
            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} disabled={deleting}>
              Delete
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
                <p className="text-sm text-gray-500">Order Details</p>
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                <span className="font-medium text-gray-900">Client:</span> {order.client_name || 'Unnamed Client'}
              </p>
              <p>
                <span className="font-medium text-gray-900">Created:</span>{' '}
                {formatDate(order.created_at || order.createdAt)}
              </p>
              <p>
                <span className="font-medium text-gray-900">Overall Status:</span> {statusLabel(order.status)}
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Progress</h3>
              <span className="text-sm text-gray-600">{order.completion_percent || 0}% complete</span>
            </div>
            <OrderProgressBar
              completionPercent={order.completion_percent || 0}
              status={order.status || 'pending'}
              pieceCounts={pieceCounts}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>Total: {pieceCounts.total}</span>
              <span>Completed: {pieceCounts.completed}</span>
              <span>In Progress: {pieceCounts.inProgress}</span>
              <span>Pending: {pieceCounts.pending}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Order Pieces">
        <div className="space-y-4">
          {(order.pieces || []).length > 0 ? (
            (order.pieces || []).map((piece) => (
              <div key={piece.id} className="space-y-3 rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{piece.name}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[piece.status] || 'neutral'}>
                    {statusLabel(piece.status)}
                  </Badge>
                </div>

                <Select
                  id={`piece-status-${piece.id}`}
                  label="Status"
                  value={piece.status}
                  onChange={(e) => handlePieceStatusChange(piece.id, e.target.value)}
                  options={PIECE_STATUS_OPTIONS}
                  disabled={updatingPiece === piece.id}
                />

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Notes</label>
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
                      placeholder="Add notes..."
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
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-600">No pieces found for this order.</p>
          )}
        </div>
      </Card>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Order">
        <div className="space-y-5">
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this order for{' '}
            <span className="font-semibold">{order.client_name || 'this client'}</span>? This action cannot be undone.
          </p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              Delete Order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
