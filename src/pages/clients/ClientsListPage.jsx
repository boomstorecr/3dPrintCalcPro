import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getClients, deleteClient } from '../../lib/clients';

function truncateText(value, maxLength = 52) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

export default function ClientsListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { userProfile } = useAuth();
  const { success, error } = useToast();

  const companyId = userProfile?.company_id;

  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const filteredClients = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return clients;
    }

    return clients.filter((client) => String(client.name || '').toLowerCase().includes(normalizedSearch));
  }, [clients, searchTerm]);

  const loadClients = async () => {
    if (!companyId) {
      setClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await getClients(companyId);
      setClients(data || []);
    } catch (loadError) {
      console.error('[ClientsListPage] Failed to load clients', loadError);
      error(t('clients.loadFailed'));
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [companyId]);

  const handleConfirmDelete = (client) => {
    setSelectedClient(client);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedClient?.id) {
      return;
    }

    setDeleting(true);

    try {
      await deleteClient(selectedClient.id);
      success(t('clients.deleteSuccess'));
      await loadClients();
    } catch (deleteError) {
      console.error('[ClientsListPage] Failed to delete client', deleteError);
      error(t('clients.actionFailed'));
    } finally {
      setDeleting(false);
      setIsDeleteModalOpen(false);
      setSelectedClient(null);
    }
  };

  const hasClients = filteredClients.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-gray-900">{t('clients.title')}</h1>
                <Badge variant="info">{clients.length}</Badge>
              </div>
            </div>

            <Button onClick={() => navigate('/clients/new')}>{t('clients.newClient')}</Button>
          </div>

          <div className="max-w-md">
            <Input
              id="clients-search"
              label={t('clients.search')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('clients.searchPlaceholder')}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : hasClients ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {filteredClients.map((client) => (
                  <article
                    key={client.id}
                    className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{client.name || t('clients.notProvided')}</h2>
                    </div>

                    <dl className="space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <dt className="font-medium text-gray-500">{t('clients.email')}</dt>
                        <dd className="text-right text-gray-700">{client.email || t('clients.notProvided')}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="font-medium text-gray-500">{t('clients.phone')}</dt>
                        <dd className="text-right text-gray-700">{client.phone || t('clients.notProvided')}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-4">
                        <dt className="font-medium text-gray-500">{t('clients.address')}</dt>
                        <dd className="max-w-[60%] text-right text-gray-700">
                          {truncateText(client.address || t('clients.notProvided'))}
                        </dd>
                      </div>
                    </dl>

                    <div className="grid grid-cols-3 gap-2">
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${client.id}`)}>
                        {t('clients.view')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${client.id}/edit`)}>
                        {t('clients.edit')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleConfirmDelete(client)}>
                        {t('clients.delete')}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-gray-200 md:block">
                <div className="grid grid-cols-12 gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <p className="col-span-2">{t('clients.name')}</p>
                  <p className="col-span-2">{t('clients.email')}</p>
                  <p className="col-span-2">{t('clients.phone')}</p>
                  <p className="col-span-3">{t('clients.address')}</p>
                  <p className="col-span-3 text-right">{t('clients.actions')}</p>
                </div>

                <div className="divide-y divide-gray-200 bg-white">
                  {filteredClients.map((client) => (
                    <div key={client.id} className="grid grid-cols-12 items-center gap-3 px-4 py-4">
                      <p className="col-span-2 truncate text-sm font-semibold text-gray-900">{client.name || t('clients.notProvided')}</p>
                      <p className="col-span-2 truncate text-sm text-gray-700">{client.email || t('clients.notProvided')}</p>
                      <p className="col-span-2 truncate text-sm text-gray-700">{client.phone || t('clients.notProvided')}</p>
                      <p className="col-span-3 truncate text-sm text-gray-700">
                        {truncateText(client.address || t('clients.notProvided'))}
                      </p>

                      <div className="col-span-3 flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${client.id}`)}>
                          {t('clients.view')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/clients/${client.id}/edit`)}>
                          {t('clients.edit')}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleConfirmDelete(client)}>
                          {t('clients.delete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-700">{t('clients.noClients')}</p>
              <div className="mt-4">
                <Button onClick={() => navigate('/clients/new')}>{t('clients.newClient')}</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedClient(null);
        }}
        title={t('clients.delete')}
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-700">{t('clients.confirmDelete')}</p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setSelectedClient(null);
              }}
              disabled={deleting}
            >
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