import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import FileImport from '../../components/FileImport';
import CostBreakdown from '../../components/CostBreakdown';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../lib/currency';
import { getMaterials } from '../../lib/materials';
import { getPrinters } from '../../lib/printers';
import { calculateQuote } from '../../lib/pricingEngine';
import { db } from '../../lib/firebase';
import { createQuote, getQuote, updateQuote } from '../../lib/quotes';
import { uploadQuotePhoto } from '../../lib/storage';

const createMaterialRow = (grams = '', color = null) => ({
  id: crypto.randomUUID(),
  materialId: '',
  grams: grams === '' ? '' : String(grams),
  color,
});

const createExtraCostRow = () => ({
  id: crypto.randomUUID(),
  name: '',
  amount: '',
});

function parseNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function NewQuotePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile, companyCurrency, companyTaxRate } = useAuth();
  const { t } = useTranslation();
  const { error, success } = useToast();

  const editQuoteId = searchParams.get('edit');
  const duplicateQuoteId = searchParams.get('duplicate');
  const isEditMode = Boolean(editQuoteId);

  const companyId = userProfile?.company_id;

  const [clientName, setClientName] = useState('');
  const [designUrl, setDesignUrl] = useState('');
  const [estimatedDeliveryDays, setEstimatedDeliveryDays] = useState('');
  const [expirationDate, setExpirationDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountNote, setDiscountNote] = useState('');
  const [photoFile, setPhotoFile] = useState(null);

  const [importedFiles, setImportedFiles] = useState(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState('');

  const [materialsCatalog, setMaterialsCatalog] = useState([]);
  const [materialRows, setMaterialRows] = useState([createMaterialRow()]);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState('');
  const [loadingPrinters, setLoadingPrinters] = useState(true);

  const [printHours, setPrintHours] = useState('');
  const [printHoursAutoFilled, setPrintHoursAutoFilled] = useState(false);

  const [extraCostRows, setExtraCostRows] = useState([createExtraCostRow()]);

  const [companyConfig, setCompanyConfig] = useState({
    kwhCost: 0,
    printerWattage: 0,
    hourlyAmortizationFee: 0,
    profitMargin: 0,
    failureMargin: 0,
    taxRate: parseNumeric(companyTaxRate),
    currency: 'USD',
  });

  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [loadingCompanyConfig, setLoadingCompanyConfig] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [breakdown, setBreakdown] = useState(null);

  useEffect(() => {
    const loadMaterials = async () => {
      if (!companyId) {
        setMaterialsCatalog([]);
        setLoadingMaterials(false);
        return;
      }

      setLoadingMaterials(true);

      try {
        const rows = await getMaterials(companyId);
        setMaterialsCatalog(rows);
      } catch (loadError) {
        console.error('[NewQuotePage] Failed to load materials', loadError);
        error(t('toast.loadFailed'));
      } finally {
        setLoadingMaterials(false);
      }
    };

    loadMaterials();
  }, [companyId, error, t]);

  useEffect(() => {
    const loadPrinters = async () => {
      if (!companyId) {
        setPrinters([]);
        setLoadingPrinters(false);
        return;
      }

      setLoadingPrinters(true);

      try {
        const rows = await getPrinters(companyId);
        setPrinters(rows);
      } catch (loadError) {
        console.error('[NewQuotePage] Failed to load printers', loadError);
        error(t('toast.loadFailed'));
      } finally {
        setLoadingPrinters(false);
      }
    };

    loadPrinters();
  }, [companyId, error, t]);

  useEffect(() => {
    const loadCompanyConfig = async () => {
      if (!companyId) {
        setLoadingCompanyConfig(false);
        return;
      }

      setLoadingCompanyConfig(true);

      try {
        const companyRef = doc(db, 'companies', companyId);
        const companySnap = await getDoc(companyRef);

        if (!companySnap.exists()) {
          setCompanyConfig((prev) => ({
            ...prev,
            taxRate: parseNumeric(companyTaxRate),
            currency: 'USD',
          }));
          return;
        }

        const companyData = companySnap.data() || {};
        const globalConfig = companyData.global_config || {};

        setCompanyConfig({
          kwhCost: parseNumeric(globalConfig.kwh_cost ?? companyData.kwhCost),
          printerWattage: 0,
          hourlyAmortizationFee: 0,
          profitMargin: 0,
          failureMargin: 0,
          taxRate: parseNumeric(companyTaxRate),
          currency: companyData.currency || globalConfig.currency || 'USD',
        });
      } catch (loadError) {
        console.error('[NewQuotePage] Failed to load company config', loadError);
        error(t('toast.loadFailed'));
      } finally {
        setLoadingCompanyConfig(false);
      }
    };

    loadCompanyConfig();
  }, [companyId, companyTaxRate, error, t]);

  useEffect(() => {
    setCompanyConfig((prev) => ({
      ...prev,
      taxRate: parseNumeric(companyTaxRate),
    }));
  }, [companyTaxRate]);

  useEffect(() => {
    if (!selectedPrinterId) {
      setCompanyConfig((prev) => ({
        ...prev,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0,
        failureMargin: 0,
      }));
      return;
    }

    const printer = printers.find((p) => p.id === selectedPrinterId);
    if (!printer) {
      return;
    }

    setCompanyConfig((prev) => ({
      ...prev,
      printerWattage: parseNumeric(printer.wattage),
      hourlyAmortizationFee: parseNumeric(printer.hourly_amortization_fee),
      profitMargin: parseNumeric(printer.profit_margin),
      failureMargin: parseNumeric(printer.failure_margin),
    }));
  }, [selectedPrinterId, printers]);

  useEffect(() => {
    const sourceQuoteId = editQuoteId || duplicateQuoteId;

    if (!sourceQuoteId) {
      return;
    }

    let cancelled = false;

    const hydrateFromQuote = async () => {
      setLoadingQuote(true);

      try {
        const quote = await getQuote(sourceQuoteId);

        if (!quote) {
          error(t('common.noData'));
          return;
        }

        if (companyId && quote.company_id !== companyId) {
          error('You do not have access to this quote.');
          navigate('/quotes');
          return;
        }

        if (cancelled) {
          return;
        }

        const initialClientName = String(quote.client_name ?? quote.client?.name ?? '');
        const initialDesignUrl = String(quote.design_url ?? quote.client?.designUrl ?? '');

        const quoteMaterials = Array.isArray(quote.materials) ? quote.materials : [];
        const mappedMaterialRows =
          quoteMaterials.length > 0
            ? quoteMaterials.map((material) => ({
                id: crypto.randomUUID(),
                materialId: String(material.materialId ?? material.material_id ?? ''),
                grams: material.grams === '' ? '' : String(material.grams ?? ''),
                color: material.color || null,
              }))
            : [createMaterialRow()];

        const quoteExtraCosts = Array.isArray(quote.extra_costs)
          ? quote.extra_costs
          : Array.isArray(quote.extraCosts)
            ? quote.extraCosts
            : [];
        const mappedExtraCostRows =
          quoteExtraCosts.length > 0
            ? quoteExtraCosts.map((extraCost) => ({
                id: crypto.randomUUID(),
                name: String(extraCost.name ?? ''),
                amount: extraCost.amount === '' ? '' : String(extraCost.amount ?? ''),
              }))
            : [createExtraCostRow()];

        const fileData = quote.file_data || quote.importedModel || null;
        let filesArray = [];
        if (Array.isArray(fileData)) {
          filesArray = fileData;
        } else if (fileData && typeof fileData === 'object') {
          filesArray = [fileData];
        }

        setClientName(initialClientName);
        setDesignUrl(initialDesignUrl);
        if (quote.expiration_date) {
          setExpirationDate(String(quote.expiration_date));
        } else {
          const qDate = quote.date?.toDate ? quote.date.toDate() : new Date(quote.date || Date.now());
          const expDate = new Date(qDate);
          expDate.setDate(expDate.getDate() + 30);
          setExpirationDate(expDate.toISOString().split('T')[0]);
        }
        setNotes(String(quote.notes || ''));
        setDiscountType(quote.discount?.type || 'percentage');
        setDiscountValue(quote.discount?.value?.toString() || quote.discount_percent?.toString() || '');
        setDiscountNote(quote.discount?.note || quote.discount_note || '');
        setEstimatedDeliveryDays(quote.estimated_delivery_days?.toString() || '');
        setPhotoFile(null);
        setCurrentPhotoUrl(isEditMode ? String(quote.photo_url || '') : '');
        setMaterialRows(mappedMaterialRows);
        setExtraCostRows(mappedExtraCostRows);
        setPrintHours(String(quote.print_hours ?? quote.printHours ?? ''));
        setPrintHoursAutoFilled(false);
        if (quote.printer_id) {
          setSelectedPrinterId(String(quote.printer_id));
        } else {
          setSelectedPrinterId('');
        }

        if (filesArray.length > 0) {
          setImportedFiles({
            files: filesArray.map((f) => ({
              fileName: f.fileName || '',
              fileType: f.fileType || '',
              volumeCm3: parseNumeric(f.volumeCm3),
              partCount: parseNumeric(f.partCount) || 1,
              estimatedGrams: parseNumeric(f.estimatedGrams),
              estimatedHours: parseNumeric(f.estimatedHours),
              plates: [],
              colorEntries: [],
              objects: [],
            })),
            totalGrams: filesArray.reduce((sum, f) => sum + parseNumeric(f.estimatedGrams), 0),
            totalHours: filesArray.reduce((sum, f) => sum + parseNumeric(f.estimatedHours), 0),
            colorEntries: [],
          });
        } else {
          setImportedFiles(null);
        }
      } catch (loadError) {
        console.error('[NewQuotePage] Failed to load source quote', loadError);
        error(t('toast.loadFailed'));
      } finally {
        if (!cancelled) {
          setLoadingQuote(false);
        }
      }
    };

    hydrateFromQuote();

    return () => {
      cancelled = true;
    };
  }, [companyId, duplicateQuoteId, editQuoteId, error, isEditMode, navigate, t]);

  const materialOptions = useMemo(
    () =>
      materialsCatalog.map((material) => ({
        value: material.id,
        label: material.name || material.type || 'Unnamed Material',
      })),
    [materialsCatalog]
  );

  useEffect(() => {
    const pricedMaterials = materialRows
      .filter((row) => row.materialId)
      .map((row) => {
        const selectedMaterial = materialsCatalog.find((material) => material.id === row.materialId);

        return {
          grams: parseNumeric(row.grams),
          costPerKg: parseNumeric(selectedMaterial?.cost_per_kg ?? selectedMaterial?.costPerKg),
        };
      });

    const extraCosts = extraCostRows
      .filter((row) => row.name.trim() || row.amount !== '')
      .map((row) => ({
        name: row.name.trim(),
        amount: parseNumeric(row.amount),
      }));

    const hasAnyInput =
      pricedMaterials.some((item) => item.grams > 0) ||
      parseNumeric(printHours) > 0 ||
      extraCosts.some((item) => item.amount > 0);

    if (!hasAnyInput) {
      setBreakdown(null);
      return;
    }

    const quote = calculateQuote({
      materials: pricedMaterials,
      printHours: parseNumeric(printHours),
      discount: {
        type: discountType,
        value: parseFloat(discountValue) || 0,
      },
      companyConfig,
      extraCosts,
    });

    setBreakdown({
      ...quote,
      profitMarginPercent: parseNumeric(companyConfig.profitMargin) * 100,
    });
  }, [materialRows, materialsCatalog, printHours, discountType, discountValue, extraCostRows, companyConfig]);

  const handleFileResult = (aggregated) => {
    setImportedFiles(aggregated);

    if (aggregated.totalHours > 0 && !printHoursAutoFilled) {
      const currentHours = parseNumeric(printHours);
      if (currentHours <= 0) {
        setPrintHours(String(aggregated.totalHours.toFixed(2)));
        setPrintHoursAutoFilled(true);
      }
    }

    const hasManualMaterials = materialRows.some((row) => row.materialId !== '');

    if (!hasManualMaterials) {
      if (aggregated.colorEntries && aggregated.colorEntries.length > 0) {
        const newRows = aggregated.colorEntries.map((entry) => createMaterialRow(entry.grams.toFixed(2), entry.color));
        setMaterialRows(newRows);
      } else if (aggregated.totalGrams > 0) {
        setMaterialRows([createMaterialRow(aggregated.totalGrams.toFixed(2))]);
      }
    }
  };

  const handleFileClear = () => {
    setImportedFiles(null);
    setMaterialRows([createMaterialRow()]);
    if (printHoursAutoFilled) {
      setPrintHours('');
      setPrintHoursAutoFilled(false);
    }
  };

  const handlePrintHoursChange = (event) => {
    setPrintHours(event.target.value);
    setPrintHoursAutoFilled(false);
  };

  const handleMaterialRowChange = (id, field, value) => {
    setMaterialRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  };

  const handleAddMaterialRow = () => {
    setMaterialRows((prev) => [...prev, createMaterialRow()]);
  };

  const handleRemoveMaterialRow = (id) => {
    setMaterialRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const handleExtraCostChange = (id, field, value) => {
    setExtraCostRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  };

  const handleAddExtraCost = () => {
    setExtraCostRows((prev) => [...prev, createExtraCostRow()]);
  };

  const handleRemoveExtraCost = (id) => {
    setExtraCostRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const handleSaveDraft = async () => {
    if (!companyId || !user?.uid) {
      error(t('toast.saveFailed'));
      return;
    }

    if (!clientName.trim()) {
      error(t('validation.nameRequired'));
      return;
    }

    const materialLines = materialRows
      .filter((row) => row.materialId && parseNumeric(row.grams) > 0)
      .map((row) => {
        const selectedMaterial = materialsCatalog.find((material) => material.id === row.materialId);

        return {
          materialId: row.materialId,
          materialName: selectedMaterial?.name || selectedMaterial?.type || 'Unnamed Material',
          grams: parseNumeric(row.grams),
          costPerKg: parseNumeric(selectedMaterial?.cost_per_kg ?? selectedMaterial?.costPerKg),
          color: row.color || null,
        };
      });

    if (materialLines.length === 0) {
      error('At least one material with weight greater than 0 is required.');
      return;
    }

    if (parseNumeric(printHours) <= 0) {
      error('Estimated print time must be greater than 0.');
      return;
    }

    const extraCosts = extraCostRows
      .filter((row) => row.name.trim() || row.amount !== '')
      .map((row) => ({
        name: row.name.trim(),
        amount: parseNumeric(row.amount),
      }));

    const calculateResult = calculateQuote({
      materials: materialLines.map((line) => ({
        grams: line.grams,
        costPerKg: line.costPerKg,
      })),
      printHours: parseNumeric(printHours),
      discount: {
        type: discountType,
        value: parseFloat(discountValue) || 0,
      },
      companyConfig,
      extraCosts,
    });

    const selectedPrinter = printers.find((p) => p.id === selectedPrinterId);

    const quoteData = {
      company_id: companyId,
      user_id: user.uid,
      client_name: clientName.trim(),
      design_url: designUrl.trim(),
      expiration_date: expirationDate,
      estimated_delivery_days: parseInt(estimatedDeliveryDays, 10) || 0,
      notes: notes.trim(),
      discount: {
        type: discountType,
        value: parseFloat(discountValue) || 0,
        note: discountNote.trim(),
      },
      photo_url: isEditMode ? currentPhotoUrl : '',
      cost_breakdown: calculateResult,
      total_price: calculateResult.totalPrice,
      status: 'draft',
      file_data:
        importedFiles?.files?.map((f) => ({
          fileName: f.fileName,
          fileType: f.fileType,
          volumeCm3: f.volumeCm3 || 0,
          partCount: f.partCount || 0,
          estimatedGrams: f.estimatedGrams || 0,
          estimatedHours: f.estimatedHours || 0,
        })) || [],
      materials: materialLines,
      print_hours: parseNumeric(printHours),
      extra_costs: extraCosts,
      printer_id: selectedPrinterId || null,
      printer_snapshot: selectedPrinter
        ? {
            name: selectedPrinter.name,
            brand: selectedPrinter.brand || '',
            type: selectedPrinter.type || '',
            wattage: parseNumeric(selectedPrinter.wattage),
            hourly_amortization_fee: parseNumeric(selectedPrinter.hourly_amortization_fee),
            profit_margin: parseNumeric(selectedPrinter.profit_margin),
            failure_margin: parseNumeric(selectedPrinter.failure_margin),
          }
        : null,
    };

    setSavingDraft(true);

    try {
      let quoteId = editQuoteId;

      if (isEditMode) {
        await updateQuote(editQuoteId, quoteData);
      } else {
        quoteId = await createQuote(quoteData);
      }

      if (photoFile && quoteId) {
        const photoUrl = await uploadQuotePhoto(companyId, quoteId, photoFile);
        await updateQuote(quoteId, { photo_url: photoUrl });
      }

      success(t('toast.quoteSaved'));
      navigate(`/quotes/${quoteId}`);
    } catch (saveError) {
      console.error('[NewQuotePage] Failed to save draft', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card title={t('quotes.new.quoteDetails')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              id="client-name"
              label={t('quotes.new.clientName')}
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="e.g. Acme Robotics"
              required
              className="md:col-span-2"
            />

            <Input
              id="design-url"
              type="url"
              label={t('quotes.new.designUrl')}
              value={designUrl}
              onChange={(event) => setDesignUrl(event.target.value)}
              placeholder="https://"
              className="md:col-span-2"
            />

            <Input
              id="expiration-date"
              type="date"
              label={t('quotes.new.expirationDate')}
              value={expirationDate}
              onChange={(event) => setExpirationDate(event.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />

            <Input
              id="estimated-delivery-days"
              type="number"
              label={t('quotes.new.estimatedDelivery')}
              placeholder={t('quotes.new.estimatedDeliveryPlaceholder')}
              value={estimatedDeliveryDays}
              onChange={(event) => setEstimatedDeliveryDays(event.target.value)}
              min="0"
            />

            <div className="flex flex-col md:col-span-2">
              <label htmlFor="photo-upload" className="mb-1 text-sm font-medium text-gray-700">
                {t('quotes.new.photo')}
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
              />
              {photoFile && <p className="mt-2 text-xs text-gray-500">Selected: {photoFile.name}</p>}
            </div>
          </div>
        </Card>

        <Card title={t('quotes.new.fileSection')}>
          <FileImport onResult={handleFileResult} onClear={handleFileClear} />
        </Card>

        <Card title={t('quotes.new.printerConfig')}>
          <div className="space-y-3">
            {loadingPrinters && <p className="text-sm text-gray-500">{t('common.loading')}</p>}

            {!loadingPrinters && printers.length === 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t('quotes.new.noPrinters')}{' '}
                <Link to="/settings/printers" className="font-semibold underline">
                  {t('settings.tabs.printers')}
                </Link>
                .
              </div>
            )}

            {!loadingPrinters && printers.length > 0 && (
              <>
                <Select
                  id="printer-select"
                  label={t('quotes.new.selectPrinter')}
                  value={selectedPrinterId}
                  onChange={(event) => setSelectedPrinterId(event.target.value)}
                  options={printers.map((p) => ({
                    value: p.id,
                    label: `${p.name}${p.brand ? ` (${p.brand})` : ''}`,
                  }))}
                  placeholder={t('quotes.new.selectPrinter')}
                />

                {selectedPrinterId &&
                  (() => {
                    const printer = printers.find((p) => p.id === selectedPrinterId);
                    if (!printer) {
                      return null;
                    }

                    return (
                      <div className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 sm:grid-cols-4">
                        <div>
                          <span className="font-medium text-gray-900">{t('common.type')}:</span> {printer.type || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{t('quotes.new.wattage')}:</span> {printer.wattage || 0}W
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{t('quotes.new.hourlyFee')}:</span>{' '}
                          {formatCurrency(parseNumeric(printer.hourly_amortization_fee), companyCurrency || companyConfig.currency)}/hr
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{t('quotes.new.profitMargin')}:</span>{' '}
                          {(parseNumeric(printer.profit_margin) * 100).toFixed(1)}%
                        </div>
                      </div>
                    );
                  })()}
              </>
            )}
          </div>
        </Card>

        <Card title={t('quotes.new.materials')}>
          <div className="space-y-4">
            {loadingMaterials && <p className="text-sm text-gray-500">{t('common.loading')}</p>}

            {!loadingMaterials && materialsCatalog.length === 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t('quotes.new.noMaterials')}{' '}
                <Link to="/settings/materials" className="font-semibold underline">
                  {t('settings.tabs.materials')}
                </Link>
                .
              </div>
            )}

            {materialRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-12">
                {row.color && row.color !== 'default' && (
                  <div className="flex items-center gap-2 md:col-span-12">
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="text-xs text-gray-500">{t('quotes.new.autoFilled')}: {row.color}</span>
                  </div>
                )}

                <Select
                  id={`material-${row.id}`}
                  label={t('quotes.new.materialName')}
                  value={row.materialId}
                  onChange={(event) => handleMaterialRowChange(row.id, 'materialId', event.target.value)}
                  options={materialOptions}
                  placeholder={t('quotes.new.selectMaterial')}
                  className="md:col-span-6"
                  disabled={materialsCatalog.length === 0}
                />

                <Input
                  id={`material-grams-${row.id}`}
                  label={t('quotes.new.grams')}
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.grams}
                  onChange={(event) => handleMaterialRowChange(row.id, 'grams', event.target.value)}
                  className="md:col-span-4"
                />

                <div className="flex items-end md:col-span-2">
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full"
                    onClick={() => handleRemoveMaterialRow(row.id)}
                    disabled={materialRows.length === 1}
                  >
                    {t('common.delete')}
                  </Button>
                </div>

                {index === materialRows.length - 1 && (
                  <div className="md:col-span-12">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAddMaterialRow}
                      disabled={materialsCatalog.length === 0}
                    >
                      {t('quotes.new.addMaterial')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('quotes.new.printHours')}>
          <div className="space-y-2">
            <Input
              id="print-hours"
              label={t('quotes.new.printHours')}
              type="number"
              min="0"
              step="0.01"
              required
              value={printHours}
              onChange={handlePrintHoursChange}
              placeholder="e.g. 6.5"
            />
            {printHoursAutoFilled && <p className="text-xs text-indigo-600">{t('quotes.new.autoFilled')}</p>}
          </div>
        </Card>

        <Card title={t('quotes.new.extraCosts')}>
          <div className="space-y-4">
            {extraCostRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-12">
                <Input
                  id={`extra-name-${row.id}`}
                  label={t('quotes.new.extraName')}
                  value={row.name}
                  onChange={(event) => handleExtraCostChange(row.id, 'name', event.target.value)}
                  placeholder="e.g. Post-processing"
                  className="md:col-span-6"
                />

                <Input
                  id={`extra-amount-${row.id}`}
                  label={t('quotes.new.extraAmount')}
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(event) => handleExtraCostChange(row.id, 'amount', event.target.value)}
                  className="md:col-span-4"
                />

                <div className="flex items-end md:col-span-2">
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full"
                    onClick={() => handleRemoveExtraCost(row.id)}
                    disabled={extraCostRows.length === 1}
                  >
                    {t('common.delete')}
                  </Button>
                </div>

                {index === extraCostRows.length - 1 && (
                  <div className="md:col-span-12">
                    <Button type="button" variant="secondary" onClick={handleAddExtraCost}>
                      {t('quotes.new.addExtra')}
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <div className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-3">
              <Select
                id="discount-type"
                name="discountType"
                label={t('quotes.new.discountType')}
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value)}
                options={[
                  { value: 'percentage', label: t('quotes.new.discountTypePercentage') },
                  { value: 'fixed', label: t('quotes.new.discountTypeFixed') },
                ]}
              />

              <Input
                id="discount-value"
                name="discountValue"
                type="number"
                label={t('quotes.new.discount')}
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                min="0"
                max={discountType === 'percentage' ? '100' : undefined}
                step="0.01"
              />

              <Input
                id="discount-note"
                name="discountNote"
                type="text"
                label={t('quotes.new.discountNote')}
                placeholder={t('quotes.new.discountNotePlaceholder')}
                value={discountNote}
                onChange={(event) => setDiscountNote(event.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card title={t('quotes.new.notes')}>
          <textarea
            id="quote-notes"
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder={t('quotes.new.notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleSaveDraft} disabled={savingDraft || loadingQuote}>
            {savingDraft ? t('quotes.new.saving') : isEditMode ? t('quotes.new.saveQuote') : t('quotes.new.saveDraft')}
          </Button>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="sticky top-6 space-y-4">
          {loadingCompanyConfig && (
            <Card title={t('quotes.new.costBreakdown')}>
              <p className="text-sm text-gray-500">{t('common.loading')}</p>
            </Card>
          )}
          {!loadingCompanyConfig && <CostBreakdown breakdown={breakdown} currency={companyConfig.currency} />}
        </div>
      </div>
    </div>
  );
}
