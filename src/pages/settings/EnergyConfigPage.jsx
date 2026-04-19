import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

    setSaving(true);

    try {
      const companyRef = doc(db, 'companies', companyId);
      await updateDoc(companyRef, {
        'global_config.kwh_cost': parsedValues.kwh_cost,
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
      <Card title="Energy & Electricity">
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
      <Card title="Energy & Electricity">
        <p className="mb-4 text-sm text-gray-600">
          Printer-specific settings like wattage, hourly fees, and margins are now configured per printer in the{' '}
          <Link to="/settings/printers" className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
            Printers section
          </Link>
          .
        </p>

        <div className="grid grid-cols-1 gap-5">
          <Input
            id="kwh-cost"
            type="number"
            min="0"
            step="0.0001"
            label="Cost per kWh"
            value={formValues.kwh_cost}
            onChange={handleChange('kwh_cost')}
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
