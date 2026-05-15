import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { addClient, getClient, updateClient } from '../../lib/clients';

export default function NewClientPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation();
  const { userProfile } = useAuth();
  const { success, error } = useToast();

  const companyId = userProfile?.company_id;
  const isEditMode = useMemo(() => Boolean(id), [id]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadClient = async () => {
      if (!isEditMode || !id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const client = await getClient(id);

        if (!client) {
          error(t('clients.notFound'));
          navigate('/clients');
          return;
        }

        if (companyId && client.company_id !== companyId) {
          error(t('clients.loadFailed'));
          navigate('/clients');
          return;
        }

        if (!cancelled) {
          setFormData({
            name: String(client.name || ''),
            email: String(client.email || ''),
            phone: String(client.phone || ''),
            address: String(client.address || ''),
          });
        }
      } catch (loadError) {
        console.error('[NewClientPage] Failed to load client', loadError);
        if (!cancelled) {
          error(t('clients.loadFailed'));
          navigate('/clients');
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
  }, [isEditMode, id, companyId, navigate, error, t]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (field === 'name' && nameError) {
      setNameError('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!companyId) {
      error(t('clients.actionFailed'));
      return;
    }

    const trimmedName = formData.name.trim();

    if (!trimmedName) {
      setNameError(t('clients.requiredName'));
      return;
    }

    const payload = {
      name: trimmedName,
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
    };

    setSaving(true);

    try {
      if (isEditMode && id) {
        await updateClient(id, payload);
        success(t('clients.updateSuccess'));
      } else {
        await addClient(companyId, payload);
        success(t('clients.saveSuccess'));
      }

      navigate('/clients');
    } catch (saveError) {
      console.error('[NewClientPage] Failed to save client', saveError);
      error(t('clients.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="secondary" onClick={() => navigate('/clients')}>
          {t('clients.back')}
        </Button>
      </div>

      <Card title={isEditMode ? t('clients.editClient') : t('clients.newClient')}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="client-name"
            label={t('clients.name')}
            value={formData.name}
            onChange={(event) => handleChange('name', event.target.value)}
            error={nameError}
            required
          />

          <Input
            id="client-email"
            type="email"
            label={t('clients.email')}
            value={formData.email}
            onChange={(event) => handleChange('email', event.target.value)}
          />

          <Input
            id="client-phone"
            type="tel"
            label={t('clients.phone')}
            value={formData.phone}
            onChange={(event) => handleChange('phone', event.target.value)}
          />

          <div className="flex flex-col">
            <label htmlFor="client-address" className="mb-1 text-sm font-medium text-gray-700">
              {t('clients.address')}
            </label>
            <textarea
              id="client-address"
              rows={4}
              value={formData.address}
              onChange={(event) => handleChange('address', event.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/clients')} disabled={saving}>
              {t('clients.cancel')}
            </Button>
            <Button type="submit" loading={saving} disabled={saving}>
              {t('clients.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}