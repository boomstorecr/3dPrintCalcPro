import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../lib/currency';
import { getQuotesByCompany } from '../../lib/quotes';

const STATUS_VALUES = ['all', 'draft', 'sent', 'accepted', 'rejected', 'expired'];

const statusBadgeVariant = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
};

function normalizeStatusKey(status) {
  return String(status || 'draft')
    .toLowerCase()
    .replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function getClientName(quote) {
  return quote.client_name || quote.clientName || quote.client?.name || 'Unnamed Client';
}

function getQuoteDate(quote) {
  const createdAt = quote.created_at || quote.createdAt;

  if (!createdAt) {
    return '-';
  }

  if (typeof createdAt.toDate === 'function') {
    return createdAt.toDate().toLocaleDateString();
  }

  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return parsedDate.toLocaleDateString();
}

function getQuoteTotal(quote) {
  const rawTotal = quote.total_price ?? quote.totalPrice ?? quote.breakdown?.total ?? 0;
  const numericTotal = Number(rawTotal);
  return Number.isFinite(numericTotal) ? numericTotal : 0;
}

export default function QuoteHistoryPage() {
  const { userProfile, companyCurrency } = useAuth();
  const { error } = useToast();
  const { t } = useTranslation();

  const companyId = userProfile?.company_id;

  const [quotes, setQuotes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastDoc, setLastDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadQuotes = async ({ append = false, cursor = null } = {}) => {
    if (!companyId) {
      setQuotes([]);
      setLastDoc(null);
      setLoading(false);
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const options = {
        pageSize: 20,
      };

      if (statusFilter !== 'all') {
        options.statusFilter = statusFilter;
      }

      if (cursor) {
        options.lastDoc = cursor;
      }

      const result = await getQuotesByCompany(companyId, options);
      const nextQuotes = result?.quotes || [];

      setQuotes((prev) => (append ? [...prev, ...nextQuotes] : nextQuotes));
      setLastDoc(result?.lastDoc || null);
    } catch (loadError) {
      console.error('[QuoteHistoryPage] Failed to load quotes', loadError);
      error(t('toast.loadFailed'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setQuotes([]);
    setLastDoc(null);
    loadQuotes();
  }, [companyId, statusFilter]);

  const filteredQuotes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return quotes;
    }

    return quotes.filter((quote) => getClientName(quote).toLowerCase().includes(normalizedSearch));
  }, [quotes, searchTerm]);

  const statusOptions = useMemo(
    () =>
      STATUS_VALUES.map((value) => ({
        value,
        label: value === 'all' ? t('status.allStatuses') : t(`status.${normalizeStatusKey(value)}`),
      })),
    [t]
  );

  const columns = useMemo(
    () => [
      {
        key: 'clientName',
        label: t('common.client'),
        render: (row) => getClientName(row),
      },
      {
        key: 'date',
        label: t('common.date'),
        render: (row) => getQuoteDate(row),
      },
      {
        key: 'total',
        label: t('common.total'),
        render: (row) => formatCurrency(getQuoteTotal(row), companyCurrency || row.currency || 'USD'),
      },
      {
        key: 'status',
        label: t('common.status'),
        render: (row) => {
          const normalizedStatus = String(row.status || 'draft').toLowerCase();

          return (
            <Badge variant={statusBadgeVariant[normalizedStatus] || 'neutral'}>
              {t(`status.${normalizeStatusKey(normalizedStatus)}`)}
            </Badge>
          );
        },
      },
      {
        key: 'actions',
        label: t('common.actions'),
        render: (row) => (
          <Link to={`/quotes/${row.id}`}>
            <Button size="sm" variant="secondary">
              {t('common.view')}
            </Button>
          </Link>
        ),
      },
    ],
    [companyCurrency, t]
  );

  const hasQuotes = filteredQuotes.length > 0;
  const canLoadMore = Boolean(lastDoc) && !loading && !loadingMore;

  return (
    <div className="space-y-6">
      <Card title={t('quotes.history.title')}>
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              id="quote-status-filter"
              label={t('common.status')}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              options={statusOptions}
            />
            <Input
              id="quote-search"
              label={t('common.search')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('quotes.history.searchByClient')}
            />
          </div>

          <Link to="/quotes/new">
            <Button>{t('common.newQuote')}</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : hasQuotes ? (
          <div className="space-y-4">
            <Table columns={columns} data={filteredQuotes} />

            {canLoadMore && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  loading={loadingMore}
                  onClick={() => loadQuotes({ append: true, cursor: lastDoc })}
                >
                  {t('common.loadMore')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
            <p className="text-sm text-gray-600">{t('quotes.history.noQuotes')}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
