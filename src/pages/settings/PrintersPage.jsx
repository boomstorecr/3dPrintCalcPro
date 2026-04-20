import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from 'react-i18next';
import { formatCurrency, getCurrencySymbol } from '../../lib/currency';
import {
  getPrinters,
  createPrinter,
  createPrinterFromPreset,
  updatePrinter,
  deletePrinter,
  PRINTER_PRESETS,
} from '../../lib/printers';

const EMPTY_FORM = {
  name: '',
  brand: '',
  type: 'FDM',
  wattage: '',
  hourly_amortization_fee: '',
  profit_margin_percent: '30',
  failure_margin_percent: '5',
};

function formatPercent(decimalValue) {
  const number = Number(decimalValue ?? 0);
  if (Number.isNaN(number)) {
    return '0%';
  }

  return `${(number * 100).toFixed(2).replace(/\.00$/, '')}%`;
}

function getTypeBadgeVariant(type) {
  return type === 'Resin' ? 'info' : 'success';
}

function getTypeLabel(type, t) {
  return type === 'Resin' ? t('settings.printers.resin') : t('settings.printers.fdm');
}

function arePresetAndFormEquivalent(preset, formValues) {
  if (!preset) {
    return false;
  }

  const formWattage = Number(formValues.wattage);
  const formHourlyFee = Number(formValues.hourly_amortization_fee);
  const formProfitMarginDecimal = Number(formValues.profit_margin_percent) / 100;
  const formFailureMarginDecimal = Number(formValues.failure_margin_percent) / 100;

  if (
    Number.isNaN(formWattage) ||
    Number.isNaN(formHourlyFee) ||
    Number.isNaN(formProfitMarginDecimal) ||
    Number.isNaN(formFailureMarginDecimal)
  ) {
    return false;
  }

  return (
    formValues.name.trim() === preset.name &&
    formValues.brand.trim() === preset.brand &&
    formValues.type === preset.type &&
    formWattage === preset.wattage &&
    formHourlyFee === preset.hourlyAmortizationFee &&
    formProfitMarginDecimal === preset.defaultProfitMargin &&
    formFailureMarginDecimal === preset.defaultFailureMargin
  );
}

export default function PrintersPage() {
  const { userProfile, companyCurrency } = useAuth();
  const { success, error } = useToast();
  const { t } = useTranslation();

  const companyId = userProfile?.company_id;
  const isAdmin = userProfile?.role === 'Admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState([]);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [editingPrinter, setEditingPrinter] = useState(null);
  const [pendingDeletePrinter, setPendingDeletePrinter] = useState(null);

  const [formMode, setFormMode] = useState('preset');
  const [selectedPresetIndex, setSelectedPresetIndex] = useState('');
  const [formValues, setFormValues] = useState(EMPTY_FORM);

  const typeOptions = useMemo(
    () => [
      { label: t('settings.printers.fdm'), value: 'FDM' },
      { label: t('settings.printers.resin'), value: 'Resin' },
    ],
    [t]
  );

  const presetGroups = useMemo(() => {
    return PRINTER_PRESETS.reduce((accumulator, preset, presetIndex) => {
      const brand = preset.brand || 'Other';

      if (!accumulator[brand]) {
        accumulator[brand] = [];
      }

      accumulator[brand].push({
        preset,
        value: String(presetIndex),
      });

      return accumulator;
    }, {});
  }, []);

  const loadPrinters = async () => {
    if (!companyId) {
      setPrinters([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const rows = await getPrinters(companyId);
      setPrinters(rows);
    } catch (loadError) {
      console.error('[PrintersPage] Failed to load printers', loadError);
      error('Failed to load printers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, [companyId]);

  const resetForm = () => {
    setFormMode('preset');
    setSelectedPresetIndex('');
    setFormValues(EMPTY_FORM);
    setEditingPrinter(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (printer) => {
    setEditingPrinter(printer);
    setFormMode('custom');
    setSelectedPresetIndex('');
    setFormValues({
      name: printer?.name ?? '',
      brand: printer?.brand ?? '',
      type: printer?.type ?? 'FDM',
      wattage: String(printer?.wattage ?? ''),
      hourly_amortization_fee: String(printer?.hourly_amortization_fee ?? ''),
      profit_margin_percent: String(Number(printer?.profit_margin ?? 0) * 100),
      failure_margin_percent: String(Number(printer?.failure_margin ?? 0) * 100),
    });
    setIsFormModalOpen(true);
  };

  const closeFormModal = () => {
    if (saving) {
      return;
    }

    setIsFormModalOpen(false);
    resetForm();
  };

  const handleOpenDeleteModal = (printer) => {
    setPendingDeletePrinter(printer);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (saving) {
      return;
    }

    setIsDeleteModalOpen(false);
    setPendingDeletePrinter(null);
  };

  const handleFieldChange = (field) => (event) => {
    setFormValues((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
  };

  const applyPresetToForm = (preset) => {
    if (!preset) {
      return;
    }

    setFormValues({
      name: preset.name ?? '',
      brand: preset.brand ?? '',
      type: preset.type ?? 'FDM',
      wattage: String(preset.wattage ?? ''),
      hourly_amortization_fee: String(preset.hourlyAmortizationFee ?? ''),
      profit_margin_percent: String(Number(preset.defaultProfitMargin ?? 0) * 100),
      failure_margin_percent: String(Number(preset.defaultFailureMargin ?? 0) * 100),
    });
  };

  const handlePresetChange = (event) => {
    const presetIndex = event.target.value;
    setSelectedPresetIndex(presetIndex);

    if (presetIndex === '') {
      setFormValues(EMPTY_FORM);
      return;
    }

    const selectedPreset = PRINTER_PRESETS[Number(presetIndex)];
    applyPresetToForm(selectedPreset);
  };

  const validateForm = () => {
    const name = formValues.name.trim();
    const wattage = Number(formValues.wattage);
    const hourlyFee = Number(formValues.hourly_amortization_fee);
    const profitMarginPercent = Number(formValues.profit_margin_percent);
    const failureMarginPercent = Number(formValues.failure_margin_percent);

    if (!name) {
      return 'Printer name is required.';
    }

    if (!formValues.type) {
      return 'Printer type is required.';
    }

    if (Number.isNaN(wattage) || wattage < 0) {
      return 'Wattage must be a number greater than or equal to 0.';
    }

    if (Number.isNaN(hourlyFee) || hourlyFee < 0) {
      return 'Hourly machine fee must be a number greater than or equal to 0.';
    }

    if (Number.isNaN(profitMarginPercent) || profitMarginPercent < 0 || profitMarginPercent > 1000) {
      return 'Profit margin must be between 0 and 1000%.';
    }

    if (Number.isNaN(failureMarginPercent) || failureMarginPercent < 0 || failureMarginPercent > 100) {
      return 'Failure margin must be between 0 and 100%.';
    }

    return null;
  };

  const handleSavePrinter = async () => {
    if (!isAdmin) {
      error('Only administrators can manage printers.');
      return;
    }

    if (!companyId) {
      error('No company selected for this user.');
      return;
    }

    const validationError = validateForm();

    if (validationError) {
      error(validationError);
      return;
    }

    const payload = {
      company_id: companyId,
      name: formValues.name.trim(),
      brand: formValues.brand.trim(),
      type: formValues.type,
      wattage: Number(formValues.wattage),
      hourly_amortization_fee: Number(formValues.hourly_amortization_fee),
      profit_margin: Number(formValues.profit_margin_percent) / 100,
      failure_margin: Number(formValues.failure_margin_percent) / 100,
    };

    const selectedPreset = selectedPresetIndex === '' ? null : PRINTER_PRESETS[Number(selectedPresetIndex)];

    setSaving(true);

    try {
      if (editingPrinter?.id) {
        await updatePrinter(editingPrinter.id, payload);
        success(t('toast.printerSaved'));
      } else if (formMode === 'preset' && arePresetAndFormEquivalent(selectedPreset, formValues)) {
        await createPrinterFromPreset(companyId, selectedPreset);
        success(t('toast.printerSaved'));
      } else {
        await createPrinter(payload);
        success(t('toast.printerSaved'));
      }

      closeFormModal();
      await loadPrinters();
    } catch (saveError) {
      console.error('[PrintersPage] Failed to save printer', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrinter = async () => {
    if (!isAdmin) {
      error('Only administrators can manage printers.');
      return;
    }

    if (!pendingDeletePrinter?.id) {
      error('No printer selected to delete.');
      return;
    }

    setSaving(true);

    try {
      await deletePrinter(pendingDeletePrinter.id);
      success(t('toast.printerDeleted'));
      closeDeleteModal();
      await loadPrinters();
    } catch (deleteError) {
      console.error('[PrintersPage] Failed to delete printer', deleteError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title={t('settings.printers.title')}>
        <p className="text-sm text-gray-600">Only administrators can manage printers. You have read-only access.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{t('settings.printers.title')}</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage your 3D printers. Each printer has its own configuration for cost calculations.
            </p>
          </div>
          <Button onClick={handleOpenAddModal}>{t('settings.printers.add')}</Button>
        </div>
      </Card>

      <Card title="Configured Printers">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : printers.length === 0 ? (
          <p className="text-sm text-gray-600">
            {t('settings.printers.noPrinters')}. {t('settings.printers.noPrintersSubtitle')}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {printers.map((printer) => (
              <div key={printer.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{printer.name || 'Unnamed Printer'}</h3>
                    <p className="text-sm text-gray-600">{printer.brand || '-'}</p>
                  </div>
                  <Badge variant={getTypeBadgeVariant(printer.type)}>
                    {getTypeLabel(printer.type, t)}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Wattage</p>
                    <p className="mt-1 font-medium text-gray-900">{Number(printer.wattage ?? 0).toFixed(2)} W</p>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Hourly Fee</p>
                    <p className="mt-1 font-medium text-gray-900">
                      {formatCurrency(Number(printer.hourly_amortization_fee ?? 0), companyCurrency)}/hr
                    </p>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Profit Margin</p>
                    <p className="mt-1 font-medium text-gray-900">{formatPercent(printer.profit_margin)}</p>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Failure Margin</p>
                    <p className="mt-1 font-medium text-gray-900">{formatPercent(printer.failure_margin)}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleOpenEditModal(printer)}>
                    {t('settings.printers.edit')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleOpenDeleteModal(printer)}>
                    {t('settings.printers.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={isFormModalOpen}
        onClose={closeFormModal}
        title={editingPrinter ? t('settings.printers.edit') : t('settings.printers.add')}
      >
        <div className="space-y-4">
          {!editingPrinter && (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Create Mode</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={formMode === 'preset' ? 'primary' : 'secondary'}
                  onClick={() => setFormMode('preset')}
                >
                  {t('settings.printers.fromPreset')}
                </Button>
                <Button
                  size="sm"
                  variant={formMode === 'custom' ? 'primary' : 'secondary'}
                  onClick={() => setFormMode('custom')}
                >
                  {t('settings.printers.custom')}
                </Button>
              </div>
            </div>
          )}

          {!editingPrinter && formMode === 'preset' && (
            <div className="flex flex-col">
              <label htmlFor="preset-select" className="mb-1 text-sm font-medium text-gray-700">
                Printer Preset
              </label>
              <select
                id="preset-select"
                value={selectedPresetIndex}
                onChange={handlePresetChange}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
              >
                <option value="">{t('settings.printers.selectPreset')}</option>
                {Object.entries(presetGroups).map(([brand, presets]) => (
                  <optgroup key={brand} label={brand}>
                    {presets.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.preset.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Selecting a preset auto-fills all fields. You can edit any value before saving.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              id="printer-name"
              label={t('settings.printers.name')}
              value={formValues.name}
              onChange={handleFieldChange('name')}
              placeholder="e.g. Bambu Lab X1 Carbon"
              required
            />
            <Input
              id="printer-brand"
              label={t('settings.printers.brand')}
              value={formValues.brand}
              onChange={handleFieldChange('brand')}
              placeholder="e.g. Bambu Lab"
            />
            <Select
              id="printer-type"
              label={t('settings.printers.type')}
              value={formValues.type}
              onChange={handleFieldChange('type')}
              options={typeOptions}
            />
            <Input
              id="printer-wattage"
              label={t('settings.printers.wattage')}
              type="number"
              min="0"
              step="0.01"
              value={formValues.wattage}
              onChange={handleFieldChange('wattage')}
              placeholder="0"
            />
            <Input
              id="printer-hourly-fee"
              label={`${t('settings.printers.hourlyFee')} (${getCurrencySymbol(companyCurrency)}/hr)`}
              type="number"
              min="0"
              step="0.01"
              value={formValues.hourly_amortization_fee}
              onChange={handleFieldChange('hourly_amortization_fee')}
              placeholder="0"
            />
            <Input
              id="printer-profit-margin"
              label={t('settings.printers.profitMargin')}
              type="number"
              min="0"
              max="1000"
              step="0.01"
              value={formValues.profit_margin_percent}
              onChange={handleFieldChange('profit_margin_percent')}
              placeholder="30"
            />
            <Input
              id="printer-failure-margin"
              label={t('settings.printers.failureMargin')}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={formValues.failure_margin_percent}
              onChange={handleFieldChange('failure_margin_percent')}
              placeholder="5"
              className="sm:col-span-2"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeFormModal} disabled={saving}>
              {t('settings.printers.cancel')}
            </Button>
            <Button onClick={handleSavePrinter} loading={saving}>
              {saving ? t('settings.printers.saving') : t('settings.printers.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={closeDeleteModal} title={t('settings.printers.delete')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {t('settings.printers.deleteConfirm')}{' '}
            <span className="font-semibold text-gray-900"> {pendingDeletePrinter?.name || 'this printer'}</span>?
            This action cannot be undone.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteModal} disabled={saving}>
              {t('settings.printers.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeletePrinter} loading={saving}>
              {saving ? t('settings.printers.saving') : t('settings.printers.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
