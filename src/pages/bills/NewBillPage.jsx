import { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { createBill } from '../../lib/bills';
import { getClients } from '../../lib/clients';
import { formatCurrency } from '../../lib/currency';
import { getOrder } from '../../lib/orders';
import { getQuote, getQuotesByCompany } from '../../lib/quotes';

const createMaterialRow = (material = {}) => ({
  id: crypto.randomUUID(),
  name: String(material.name ?? material.materialName ?? ''),
  grams: material.grams === '' ? '' : String(material.grams ?? ''),
  costPerKg: material.costPerKg === '' ? '' : String(material.costPerKg ?? material.cost_per_kg ?? ''),
  color: material.color || null,
});

const createExtraCostRow = (extra = {}) => ({
  id: crypto.randomUUID(),
  name: String(extra.name ?? ''),
  amount: extra.amount === '' ? '' : String(extra.amount ?? ''),
});

function parseNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowSubtotal(materialRow) {
  return (parseNumeric(materialRow.grams) / 1000) * parseNumeric(materialRow.costPerKg);
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
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function getQuotePiecesCount(quoteData) {
  const fileDataArray = Array.isArray(quoteData?.file_data)
    ? quoteData.file_data
    : quoteData?.file_data
      ? [quoteData.file_data]
      : [];

  const summedPartCount = fileDataArray.reduce((sum, file) => {
    const parsed = Number(file?.partCount ?? file?.partsCount);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  return summedPartCount > 0 ? summedPartCount : 1;
}

function getQuoteFinalTotal(quoteData) {
  const breakdown = quoteData?.cost_breakdown || quoteData?.costBreakdown || quoteData?.breakdown || {};
  const candidates = [
    breakdown?.totalPriceOverride,
    quoteData?.total_price_override,
    quoteData?.totalPriceOverride,
    quoteData?.total_price,
    quoteData?.totalPrice,
    breakdown?.totalPrice,
    breakdown?.priceAfterDiscount,
    quoteData?.price_after_discount,
    quoteData?.priceAfterDiscount,
  ];

  for (const candidate of candidates) {
    const numeric = parseNumeric(candidate);
    if (numeric > 0) {
      return numeric;
    }
  }

  return 0;
}

export default function NewBillPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile, companyCurrency } = useAuth();
  const { success, error, info } = useToast();

  const companyId = userProfile?.company_id;
  const orderId = searchParams.get('orderId');
  const quoteId = searchParams.get('quoteId');

  const [clientName, setClientName] = useState('');
  const [designUrl, setDesignUrl] = useState('');
  const [materialRows, setMaterialRows] = useState([createMaterialRow()]);
  const [extraCostRows, setExtraCostRows] = useState([createExtraCostRow()]);
  const [total, setTotal] = useState('');
  const [isTotalOverridden, setIsTotalOverridden] = useState(false);
  const [isTotalFromQuote, setIsTotalFromQuote] = useState(false);
  const [piecesCount, setPiecesCount] = useState('1');
  const [orderCreatedAt, setOrderCreatedAt] = useState(null);
  const [billingDate, setBillingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('unpaid');
  const [notes, setNotes] = useState('');
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');

  const [loadingSource, setLoadingSource] = useState(false);
  const [saving, setSaving] = useState(false);

  const materialSubtotalTotal = useMemo(
    () => materialRows.reduce((sum, row) => sum + rowSubtotal(row), 0),
    [materialRows]
  );

  const extraCostTotal = useMemo(
    () =>
      extraCostRows.reduce((sum, row) => {
        return sum + parseNumeric(row.amount);
      }, 0),
    [extraCostRows]
  );

  const calculatedTotal = materialSubtotalTotal + extraCostTotal;

  const clientOptions = useMemo(
    () =>
      clients
        .map((client) => {
          const name = String(client.name ?? '').trim();
          return {
            value: name,
            label: name,
          };
        })
        .filter((option) => option.value),
    [clients]
  );

  const quoteOptions = useMemo(
    () =>
      quotes.map((quote) => {
        const client = quote.client_name || quote.clientName || 'No client';
        const piece = quote.piece_name || quote.pieceName || '';
        const date = formatDate(quote.date);
        const label = piece ? `${client} — ${piece} — ${date}` : `${client} — ${date}`;
        return { value: quote.id, label };
      }),
    [quotes]
  );

  useEffect(() => {
    if (isTotalOverridden || isTotalFromQuote) {
      return;
    }

    if (calculatedTotal <= 0) {
      setTotal('');
      return;
    }

    setTotal(calculatedTotal.toFixed(2));
  }, [calculatedTotal, isTotalOverridden, isTotalFromQuote]);

  useEffect(() => {
    let cancelled = false;

    const loadClients = async () => {
      if (!companyId) {
        setClients([]);
        setLoadingClients(false);
        return;
      }

      setLoadingClients(true);

      try {
        const loadedClients = await getClients(companyId);

        if (!cancelled) {
          setClients(loadedClients);
        }
      } catch (loadError) {
        console.error('[NewBillPage] Failed to load clients', loadError);

        if (!cancelled) {
          setClients([]);
          info(t('toast.loadFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoadingClients(false);
        }
      }
    };

    loadClients();

    return () => {
      cancelled = true;
    };
  }, [companyId, info, t]);

  useEffect(() => {
    let cancelled = false;

    const loadQuotes = async () => {
      if (!companyId) {
        setQuotes([]);
        setLoadingQuotes(false);
        return;
      }

      setLoadingQuotes(true);

      try {
        const { quotes: loadedQuotes = [] } = await getQuotesByCompany(companyId, { pageSize: 200 });

        if (!cancelled) {
          setQuotes(loadedQuotes);
        }
      } catch (loadError) {
        console.error('[NewBillPage] Failed to load quotes', loadError);

        if (!cancelled) {
          setQuotes([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingQuotes(false);
        }
      }
    };

    loadQuotes();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!orderId && !quoteId) {
      return;
    }

    let cancelled = false;

    const hydrateFromSource = async () => {
      setLoadingSource(true);

      try {
        if (orderId) {
          const orderData = await getOrder(orderId);

          if (orderData) {
            if (companyId && orderData.company_id !== companyId) {
              error(t('toast.loadFailed'));
              navigate('/orders');
              return;
            }

            if (!cancelled) {
              setClientName(String(orderData.client_name ?? ''));
              setPiecesCount(String(Array.isArray(orderData.pieces) ? orderData.pieces.length : 1));
              setOrderCreatedAt(orderData.created_at || null);
            }
          }
        }

        if (quoteId) {
          try {
            const quoteData = await getQuote(quoteId);

            if (quoteData) {
              if (companyId && quoteData.company_id !== companyId) {
                error(t('toast.loadFailed'));
                navigate('/quotes');
                return;
              }

              if (!cancelled) {
                setClientName((prev) => {
                  if (prev.trim()) {
                    return prev;
                  }
                  return String(quoteData.client_name ?? '');
                });

                setDesignUrl(String(quoteData.design_url ?? ''));

                const mappedMaterials = Array.isArray(quoteData.materials)
                  ? quoteData.materials.map((material) =>
                      createMaterialRow({
                        name: material.materialName ?? material.name,
                        grams: material.grams,
                        costPerKg: material.costPerKg ?? material.cost_per_kg,
                        color: material.color,
                      })
                    )
                  : [];

                if (mappedMaterials.length > 0) {
                  setMaterialRows(mappedMaterials);
                }

                const mappedExtras = Array.isArray(quoteData.extra_costs)
                  ? quoteData.extra_costs.map((extra) => createExtraCostRow(extra))
                  : [];

                if (mappedExtras.length > 0) {
                  setExtraCostRows(mappedExtras);
                }

                const quoteTotal = getQuoteFinalTotal(quoteData);
                if (quoteTotal > 0) {
                  setTotal(String(quoteTotal));
                  setIsTotalFromQuote(true);
                  setIsTotalOverridden(false);
                } else {
                  setIsTotalFromQuote(false);
                }

                if (!orderId) {
                  setPiecesCount(String(getQuotePiecesCount(quoteData)));
                }

                setSelectedQuoteId(quoteId);
              }
            } else {
              info(t('toast.loadFailed'));
            }
          } catch (quoteLoadError) {
            console.warn('[NewBillPage] Quote load failed, manual mode enabled', quoteLoadError);
            info(t('toast.loadFailed'));
          }
        }
      } catch (loadError) {
        console.error('[NewBillPage] Failed to load source data', loadError);
        if (!cancelled) {
          error(t('toast.loadFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoadingSource(false);
        }
      }
    };

    hydrateFromSource();

    return () => {
      cancelled = true;
    };
  }, [orderId, quoteId, companyId, navigate, error, info, t]);

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

  const handleTotalChange = (value) => {
    setTotal(value);
    setIsTotalFromQuote(false);
    setIsTotalOverridden(true);
  };

  const handleQuoteSelect = (value) => {
    setSelectedQuoteId(value);

    if (!value) {
      setSelectedQuoteId('');
      return;
    }

    const quoteData = quotes.find((quote) => quote.id === value);
    if (!quoteData) {
      return;
    }

    setDesignUrl(String(quoteData.design_url ?? ''));

    const mappedMaterials = Array.isArray(quoteData.materials)
      ? quoteData.materials.map((material) =>
          createMaterialRow({
            name: material.materialName ?? material.name,
            grams: material.grams,
            costPerKg: material.costPerKg ?? material.cost_per_kg,
            color: material.color,
          })
        )
      : [];

    setMaterialRows(mappedMaterials.length > 0 ? mappedMaterials : [createMaterialRow()]);

    const mappedExtras = Array.isArray(quoteData.extra_costs)
      ? quoteData.extra_costs.map((extra) => createExtraCostRow(extra))
      : [];

    setExtraCostRows(mappedExtras.length > 0 ? mappedExtras : [createExtraCostRow()]);

    const quoteTotal = getQuoteFinalTotal(quoteData);
    if (quoteTotal > 0) {
      setTotal(String(quoteTotal));
      setIsTotalFromQuote(true);
      setIsTotalOverridden(false);
    } else {
      setIsTotalFromQuote(false);
    }

    if (!orderId) {
      setPiecesCount(String(getQuotePiecesCount(quoteData)));
    }
  };

  const handleSubmit = async () => {
    if (!companyId || !user?.uid) {
      error(t('toast.saveFailed'));
      return;
    }

    if (!clientName.trim()) {
      error(t('validation.nameRequired'));
      return;
    }

    const numericTotal = parseNumeric(total);
    if (numericTotal <= 0) {
      error(t('toast.saveFailed'));
      return;
    }

    const materials = materialRows
      .filter((row) => row.name.trim() || parseNumeric(row.grams) > 0 || parseNumeric(row.costPerKg) > 0)
      .map((row) => ({
        materialName: row.name.trim(),
        name: row.name.trim(),
        grams: parseNumeric(row.grams),
        costPerKg: parseNumeric(row.costPerKg),
        color: row.color || null,
      }));

    const extraCosts = extraCostRows
      .filter((row) => row.name.trim() || row.amount !== '')
      .map((row) => ({
        name: row.name.trim(),
        amount: parseNumeric(row.amount),
      }));

    const billingDateParsed = new Date(`${billingDate}T00:00:00`);
    const billingDateValue = Number.isNaN(billingDateParsed.getTime())
      ? Timestamp.now()
      : Timestamp.fromDate(billingDateParsed);

    const payload = {
      company_id: companyId,
      user_id: user.uid,
      order_id: orderId || null,
      quote_id: selectedQuoteId || quoteId || null,
      client_name: clientName.trim(),
      design_url: designUrl.trim(),
      materials,
      extra_costs: extraCosts,
      total: numericTotal,
      pieces_count: Math.max(1, parseInt(piecesCount, 10) || 1),
      order_created_at: orderCreatedAt || null,
      billing_date: billingDateValue,
      status,
      notes: notes.trim(),
      currency: companyCurrency || 'USD',
    };

    setSaving(true);

    try {
      const newBillId = await createBill(payload);
      success(t('bills.billCreated'));
      navigate(`/bills/${newBillId}`);
    } catch (saveError) {
      console.error('[NewBillPage] Failed to create bill', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingSource) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card title={t('bills.newBill')}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              id="bill-client-name"
              label={t('bills.clientName')}
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              options={clientOptions}
              placeholder={t('bills.selectClient', { defaultValue: 'Select a client...' })}
              disabled={loadingClients || !companyId}
              required
              className="md:col-span-2"
            />

            <Select
              id="bill-quote"
              label={t('bills.quote', { defaultValue: 'Quote' })}
              value={selectedQuoteId}
              onChange={(event) => handleQuoteSelect(event.target.value)}
              options={quoteOptions}
              placeholder={t('bills.selectQuote', { defaultValue: 'Select a quote (optional)...' })}
              disabled={loadingQuotes || !companyId}
              className="md:col-span-2"
            />

            <Input
              id="bill-design-url"
              type="url"
              label={t('bills.designUrl')}
              value={designUrl}
              onChange={(event) => setDesignUrl(event.target.value)}
              className="md:col-span-2"
            />

            {orderId && (
              <div className="md:col-span-2">
                <label htmlFor="bill-order-date" className="mb-1 block text-sm font-medium text-gray-700">
                  {t('bills.orderDate')}
                </label>
                <input
                  id="bill-order-date"
                  type="text"
                  value={formatDate(orderCreatedAt)}
                  readOnly
                  className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                />
              </div>
            )}

            <Input
              id="bill-pieces-count"
              type="number"
              min="1"
              step="1"
              label={t('bills.piecesCount')}
              value={piecesCount}
              onChange={(event) => setPiecesCount(event.target.value)}
            />

            <Input
              id="bill-billing-date"
              type="date"
              label={t('bills.billingDate')}
              value={billingDate}
              onChange={(event) => setBillingDate(event.target.value)}
            />

            <Select
              id="bill-status"
              label={t('bills.status')}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              options={[
                { value: 'unpaid', label: t('bills.unpaid') },
                { value: 'paid', label: t('bills.paid') },
              ]}
              className="md:col-span-2"
            />
          </div>
        </Card>

        <Card title={t('bills.materials')}>
          <div className="space-y-4">
            {materialRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-12">
                <Input
                  id={`bill-material-name-${row.id}`}
                  label={t('bills.materialName')}
                  value={row.name}
                  onChange={(event) => handleMaterialRowChange(row.id, 'name', event.target.value)}
                  className="md:col-span-4"
                />

                <Input
                  id={`bill-material-grams-${row.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  label={t('bills.grams')}
                  value={row.grams}
                  onChange={(event) => handleMaterialRowChange(row.id, 'grams', event.target.value)}
                  className="md:col-span-2"
                />

                <Input
                  id={`bill-material-cost-${row.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  label={t('bills.costPerKg')}
                  value={row.costPerKg}
                  onChange={(event) => handleMaterialRowChange(row.id, 'costPerKg', event.target.value)}
                  className="md:col-span-2"
                />

                <div className="md:col-span-2">
                  <label htmlFor={`bill-material-color-${row.id}`} className="mb-1 block text-sm font-medium text-gray-700">
                    {t('bills.color')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`bill-material-color-${row.id}`}
                      type="color"
                      value={typeof row.color === 'string' && row.color.startsWith('#') ? row.color : '#000000'}
                      onChange={(event) => handleMaterialRowChange(row.id, 'color', event.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-gray-300"
                      title={t('bills.color')}
                      aria-label={t('bills.color')}
                    />
                    {row.color && (
                      <button
                        type="button"
                        onClick={() => handleMaterialRowChange(row.id, 'color', null)}
                        className="text-xs text-gray-400 hover:text-red-500"
                        aria-label={t('bills.color')}
                        title={t('bills.color')}
                      >
                        X
                      </button>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <p className="mb-1 text-sm font-medium text-gray-700">{t('bills.subtotal')}</p>
                  <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {formatCurrency(rowSubtotal(row), companyCurrency || 'USD')}
                  </p>
                </div>

                <div className="flex items-end md:col-span-12 md:justify-between">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => handleRemoveMaterialRow(row.id)}
                    disabled={materialRows.length === 1}
                  >
                    X
                  </Button>

                  {index === materialRows.length - 1 && (
                    <Button type="button" variant="secondary" onClick={handleAddMaterialRow}>
                      {t('bills.addMaterial')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('bills.extraCosts')}>
          <div className="space-y-4">
            {extraCostRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-1 gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-12">
                <Input
                  id={`bill-extra-name-${row.id}`}
                  label={t('bills.costName')}
                  value={row.name}
                  onChange={(event) => handleExtraCostChange(row.id, 'name', event.target.value)}
                  className="md:col-span-7"
                />

                <Input
                  id={`bill-extra-amount-${row.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  label={t('bills.amount')}
                  value={row.amount}
                  onChange={(event) => handleExtraCostChange(row.id, 'amount', event.target.value)}
                  className="md:col-span-3"
                />

                <div className="flex items-end md:col-span-2">
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full"
                    onClick={() => handleRemoveExtraCost(row.id)}
                    disabled={extraCostRows.length === 1}
                  >
                    X
                  </Button>
                </div>

                {index === extraCostRows.length - 1 && (
                  <div className="md:col-span-12">
                    <Button type="button" variant="secondary" onClick={handleAddExtraCost}>
                      {t('bills.addExtraCost')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('bills.total')}>
          <Input
            id="bill-total"
            type="number"
            min="0"
            step="0.01"
            label={t('bills.total')}
            value={total}
            onChange={(event) => handleTotalChange(event.target.value)}
          />
        </Card>

        <Card title={t('bills.notes')}>
          <textarea
            id="bill-notes"
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" onClick={handleSubmit} loading={saving} disabled={saving}>
            {t('bills.createBill')}
          </Button>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="sticky top-6 space-y-4">
          <Card title={t('bills.total')}>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span>{t('bills.materials')}</span>
                <span>{formatCurrency(materialSubtotalTotal, companyCurrency || 'USD')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('bills.extraCosts')}</span>
                <span>{formatCurrency(extraCostTotal, companyCurrency || 'USD')}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 text-base font-semibold text-gray-900">
                <div className="flex items-center justify-between">
                  <span>{t('bills.total')}</span>
                  <span>{formatCurrency(parseNumeric(total), companyCurrency || 'USD')}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
