import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Edit, Trash2, Mail, Phone, MapPin } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getClient, deleteClient } from '../../lib/clients';

function formatDate(value) {
  if (!value) {
    return '';
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString();
  }

  if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000).toLocaleDateString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString();
}

export default function ClientDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation();
  const { userProfile } = useAuth();
  const { success, error } = useToast();

  const companyId = userProfile?.company_id;

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadClient = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const data = await getClient(id, companyId);

        if (!data) {
          if (!cancelled) {
            setClient(null);
          }
          return;
        }

        if (companyId && data.company_id !== companyId) {
          error(t('clients.loadFailed'));
          navigate('/clients');
          return;
        }

        if (!cancelled) {
          setClient(data);
        }
      } catch (loadError) {
        console.error('[ClientDetailPage] Failed to load client', loadError);
        if (!cancelled) {
          error(t('clients.loadFailed'));
          setClient(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadClient();

    return () => {
      cancelled = true;
    };
  }, [id, companyId, navigate, error, t]);

  const createdAtLabel = useMemo(() => formatDate(client?.created_at), [client?.created_at]);

  const handleDelete = async () => {
    if (!client?.id) {
      return;
    }

    setDeleting(true);

    try {
      await deleteClient(client.id);
      success(t('clients.deleteSuccess'));
      navigate('/clients');
    } catch (deleteError) {
      console.error('[ClientDetailPage] Failed to delete client', deleteError);
      error(t('clients.actionFailed'));
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

  if (!client) {
    return (
      <Card title={t('clients.clientDetail')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('clients.notFound')}</p>
          <Button variant="secondary" onClick={() => navigate('/clients')}>
            {t('clients.back')}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => navigate('/clients')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('clients.back')}
            </Button>
            <h1 className="text-2xl font-semibold text-gray-900">{t('clients.clientDetail')}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate(`/clients/${client.id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />
              {t('clients.edit')}
            </Button>
            <Button variant="danger" onClick={() => setIsDeleteModalOpen(true)} disabled={deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('clients.delete')}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={client.name || t('clients.notProvided')}>
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('clients.email')}</p>
              {client.email ? (
                <a href={`mailto:${client.email}`} className="text-sm text-indigo-600 hover:text-indigo-700">
                  {client.email}
                </a>
              ) : (
                <p className="text-sm text-gray-700">{t('clients.notProvided')}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('clients.phone')}</p>
              {client.phone ? (
                <a href={`tel:${client.phone}`} className="text-sm text-indigo-600 hover:text-indigo-700">
                  {client.phone}
                </a>
              ) : (
                <p className="text-sm text-gray-700">{t('clients.notProvided')}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('clients.address')}</p>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{client.address || t('clients.notProvided')}</p>
            </div>
          </div>

          {createdAtLabel ? (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('clients.createdAt')}</p>
              <p className="text-sm text-gray-700">{createdAtLabel}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={t('clients.delete')}
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-700">{t('clients.confirmDelete')}</p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)} disabled={deleting}>
              {t('clients.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {t('clients.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}