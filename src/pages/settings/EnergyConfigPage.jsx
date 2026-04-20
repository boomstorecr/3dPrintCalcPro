import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from 'react-i18next';
import { db } from '../../lib/firebase';

const DEFAULT_FORM = {
  kwh_cost: '0',
  taxRate: '0',
};

export default function EnergyConfigPage() {
  const { userProfile } = useAuth();
  const { success, error } = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formValues, setFormValues] = useState(DEFAULT_FORM);

  const companyId = userProfile?.company_id;
  const isAdmin = userProfile?.role === 'Admin';

  useEffect(() => {
    const loadConfig = async () => {
      if (!companyId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const companyRef = doc(db, 'companies', companyId);
        const companySnap = await getDoc(companyRef);

        if (!companySnap.exists()) {
          error('Company configuration was not found.');
          setLoading(false);
          return;
        }

        const config = companySnap.data().global_config ?? {};

        setFormValues({
          kwh_cost: String(config.kwh_cost ?? 0),
          taxRate: String((config.tax_rate ?? 0) * 100),
        });
      } catch (loadError) {
        console.error('[EnergyConfigPage] Failed to load config', loadError);
        error('Failed to load energy configuration.');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [companyId, error]);

  const handleChange = (field) => (event) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSave = async () => {
    if (!companyId || !isAdmin) {
      error('You are not authorized to update this configuration.');
      return;
    }

    const parsedValues = {
      kwh_cost: Number(formValues.kwh_cost),
      tax_rate: Number(formValues.taxRate) / 100,
    };

    const invalidNumericValue = Object.values(parsedValues).some(
      (value) => Number.isNaN(value) || !Number.isFinite(value)
    );

    if (invalidNumericValue) {
      error('All fields must be valid numbers.');
      return;
    }

    if (
      parsedValues.kwh_cost < 0
    ) {
      error('kWh cost must be non-negative.');
      return;
    }

    if (Number(formValues.taxRate) < 0 || Number(formValues.taxRate) > 100) {
      error('Tax / IVA must be between 0 and 100.');
      return;
    }

    setSaving(true);

    try {
      const companyRef = doc(db, 'companies', companyId);
      await updateDoc(companyRef, {
        'global_config.kwh_cost': parsedValues.kwh_cost,
        'global_config.tax_rate': parsedValues.tax_rate,
      });

      success(t('toast.energySaved'));
    } catch (saveError) {
      console.error('[EnergyConfigPage] Failed to save config', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title={t('settings.energy.title')}>
        <p className="text-sm text-gray-600">{t('settings.energy.adminOnly')}</p>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={t('settings.energy.title')}>
        <p className="mb-4 text-sm text-gray-600">{t('settings.energy.description')}</p>

        <div className="grid grid-cols-1 gap-5">
          <Input
            id="kwh-cost"
            type="number"
            min="0"
            step="0.0001"
            label={t('settings.energy.kwhCost')}
            value={formValues.kwh_cost}
            onChange={handleChange('kwh_cost')}
          />

          <div className="space-y-1">
            <Input
              id="tax-rate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              label={t('settings.energy.taxRate')}
              value={formValues.taxRate}
              onChange={handleChange('taxRate')}
            />
            <p className="text-sm text-gray-600">{t('settings.energy.taxDescription')}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            {saving ? t('settings.energy.saving') : t('settings.energy.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
