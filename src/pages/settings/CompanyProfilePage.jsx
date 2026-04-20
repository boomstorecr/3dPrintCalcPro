import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from 'react-i18next';
import { CURRENCY_OPTIONS } from '../../lib/currency';
import { db } from '../../lib/firebase';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

export default function CompanyProfilePage() {
  const { userProfile } = useAuth();
  const { success, error } = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [logoUrl, setLogoUrl] = useState('');
  const [selectedLogoFile, setSelectedLogoFile] = useState(null);

  const companyId = userProfile?.company_id;
  const isAdmin = userProfile?.role === 'Admin';

  const logoPreviewUrl = useMemo(() => {
    if (!selectedLogoFile) {
      return logoUrl || '';
    }
    return URL.createObjectURL(selectedLogoFile);
  }, [selectedLogoFile, logoUrl]);

  useEffect(() => {
    return () => {
      if (selectedLogoFile && logoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [selectedLogoFile, logoPreviewUrl]);

  useEffect(() => {
    const loadCompanyProfile = async () => {
      if (!companyId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const companyRef = doc(db, 'companies', companyId);
        const companySnap = await getDoc(companyRef);

        if (!companySnap.exists()) {
          error('Company profile was not found.');
          setLoading(false);
          return;
        }

        const companyData = companySnap.data();
        setName(companyData.name ?? '');
        setLogoUrl(companyData.logo_url ?? '');
        setCurrency(companyData.global_config?.currency ?? 'USD');
      } catch (loadError) {
        console.error('[CompanyProfilePage] Failed to load company profile', loadError);
        error('Failed to load company profile.');
      } finally {
        setLoading(false);
      }
    };

    loadCompanyProfile();
  }, [companyId, error]);

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      setSelectedLogoFile(null);
      return;
    }

    const isAllowedType = ALLOWED_LOGO_TYPES.includes(file.type);
    const hasAllowedExtension = /\.(png|jpe?g|svg)$/i.test(file.name);

    if (!isAllowedType && !hasAllowedExtension) {
      error('Logo must be a PNG, JPG, or SVG image.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      error('Logo must be 2MB or smaller.');
      event.target.value = '';
      return;
    }

    setSelectedLogoFile(file);
  };

  const handleSave = async () => {
    if (!companyId || !isAdmin) {
      error('You are not authorized to update company settings.');
      return;
    }

    if (!name.trim()) {
      error('Company name is required.');
      return;
    }

    setSaving(true);

    try {
      let nextLogoUrl = logoUrl || '';

      if (selectedLogoFile) {
        nextLogoUrl = await fileToBase64(selectedLogoFile);
      }

      const companyRef = doc(db, 'companies', companyId);
      await updateDoc(companyRef, {
        name: name.trim(),
        logo_url: nextLogoUrl,
        'global_config.currency': currency,
      });

      setLogoUrl(nextLogoUrl);
      setSelectedLogoFile(null);
      success(t('toast.profileSaved'));
    } catch (saveError) {
      console.error('[CompanyProfilePage] Failed to save company profile', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title={t('settings.profile.title')}>
        <p className="text-sm text-gray-600">{t('settings.profile.adminOnly')}</p>
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
      <Card title={t('settings.profile.title')}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Input
            id="company-name"
            label={t('settings.profile.companyName')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter company name"
          />

          <Select
            id="company-currency"
            label={t('settings.profile.currency')}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            options={CURRENCY_OPTIONS}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            id="company-logo"
            type="file"
            label={t('settings.profile.logo')}
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            onChange={handleLogoChange}
          />

          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">Logo Preview</p>
            {logoPreviewUrl ? (
              <img
                src={logoPreviewUrl}
                alt="Company logo preview"
                className="h-24 w-24 rounded-md border border-gray-200 bg-white object-contain"
              />
            ) : (
              <p className="text-sm text-gray-500">No logo uploaded yet.</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            {saving ? t('settings.profile.saving') : t('settings.profile.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
