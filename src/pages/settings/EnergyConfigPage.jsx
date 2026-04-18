import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { db } from '../../lib/firebase';

const DEFAULT_FORM = {
  kwh_cost: '0',
  printer_wattage: '0',
  hourly_amortization_fee: '0',
  base_profit_margin: '0',
  failure_margin: '0',
};

export default function EnergyConfigPage() {
  const { userProfile } = useAuth();
  const { success, error } = useToast();

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
          printer_wattage: String(config.printer_wattage ?? 0),
          hourly_amortization_fee: String(config.hourly_amortization_fee ?? 0),
          base_profit_margin: String((config.base_profit_margin ?? 0) * 100),
          failure_margin: String((config.failure_margin ?? 0) * 100),
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
      printer_wattage: Number(formValues.printer_wattage),
      hourly_amortization_fee: Number(formValues.hourly_amortization_fee),
      base_profit_margin_percent: Number(formValues.base_profit_margin),
      failure_margin_percent: Number(formValues.failure_margin),
    };

    const invalidNumericValue = Object.values(parsedValues).some(
      (value) => Number.isNaN(value) || !Number.isFinite(value)
    );

    if (invalidNumericValue) {
      error('All fields must be valid numbers.');
      return;
    }

    if (
      parsedValues.kwh_cost < 0 ||
      parsedValues.printer_wattage < 0 ||
      parsedValues.hourly_amortization_fee < 0
    ) {
      error('Cost and machine values must be non-negative.');
      return;
    }

    if (parsedValues.failure_margin_percent < 0 || parsedValues.failure_margin_percent > 100) {
      error('Failure margin must be between 0% and 100%.');
      return;
    }

    if (parsedValues.base_profit_margin_percent < 0 || parsedValues.base_profit_margin_percent > 1000) {
      error('Profit margin must be between 0% and 1000%.');
      return;
    }

    setSaving(true);

    try {
      const companyRef = doc(db, 'companies', companyId);
      await updateDoc(companyRef, {
        'global_config.kwh_cost': parsedValues.kwh_cost,
        'global_config.printer_wattage': parsedValues.printer_wattage,
        'global_config.hourly_amortization_fee': parsedValues.hourly_amortization_fee,
        'global_config.base_profit_margin': parsedValues.base_profit_margin_percent / 100,
        'global_config.failure_margin': parsedValues.failure_margin_percent / 100,
      });

      success('Energy configuration saved successfully.');
    } catch (saveError) {
      console.error('[EnergyConfigPage] Failed to save config', saveError);
      error('Failed to save energy configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title="Energy Configuration">
        <p className="text-sm text-gray-600">Only administrators can edit energy and pricing settings.</p>
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
      <Card title="Energy Configuration">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Input
            id="kwh-cost"
            type="number"
            min="0"
            step="0.0001"
            label="Cost per kWh"
            value={formValues.kwh_cost}
            onChange={handleChange('kwh_cost')}
          />

          <Input
            id="printer-wattage"
            type="number"
            min="0"
            step="1"
            label="Printer Wattage"
            value={formValues.printer_wattage}
            onChange={handleChange('printer_wattage')}
          />

          <Input
            id="hourly-amortization-fee"
            type="number"
            min="0"
            step="0.01"
            label="Hourly Machine Fee"
            value={formValues.hourly_amortization_fee}
            onChange={handleChange('hourly_amortization_fee')}
          />

          <Input
            id="base-profit-margin"
            type="number"
            min="0"
            max="1000"
            step="0.01"
            label="Profit Margin %"
            value={formValues.base_profit_margin}
            onChange={handleChange('base_profit_margin')}
          />

          <Input
            id="failure-margin"
            type="number"
            min="0"
            max="100"
            step="0.01"
            label="Failure Margin %"
            value={formValues.failure_margin}
            onChange={handleChange('failure_margin')}
          />
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            Save Configuration
          </Button>
        </div>
      </Card>
    </div>
  );
}
