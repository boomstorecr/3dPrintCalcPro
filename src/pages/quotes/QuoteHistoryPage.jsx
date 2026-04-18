import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { getQuotesByCompany } from '../../lib/quotes';

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Expired', value: 'expired' },
];

const statusBadgeVariant = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
};

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
  const { userProfile } = useAuth();
  const { error } = useToast();

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
      error('Failed to load quote history.');
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

  const columns = useMemo(
    () => [
      {
        key: 'clientName',
        label: 'Client Name',
        render: (row) => getClientName(row),
      },
      {
        key: 'date',
        label: 'Date',
        render: (row) => getQuoteDate(row),
      },
      {
        key: 'total',
        label: 'Total Price',
        render: (row) =>
          new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: row.currency || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(getQuoteTotal(row)),
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => {
          const normalizedStatus = String(row.status || 'draft').toLowerCase();

          return (
            <Badge variant={statusBadgeVariant[normalizedStatus] || 'neutral'}>
              {normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)}
            </Badge>
          );
        },
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (row) => (
          <Link to={`/quotes/${row.id}`}>
            <Button size="sm" variant="secondary">
              View
            </Button>
          </Link>
        ),
      },
    ],
    []
  );

  const hasQuotes = filteredQuotes.length > 0;
  const canLoadMore = Boolean(lastDoc) && !loading && !loadingMore;

  return (
    <div className="space-y-6">
      <Card title="Quote History">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              id="quote-status-filter"
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              options={STATUS_OPTIONS}
            />
            <Input
              id="quote-search"
              label="Search by Client"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Type client name"
            />
          </div>

          <Link to="/quotes/new">
            <Button>New Quote</Button>
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
                  Load More
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center">
            <p className="text-sm text-gray-600">No quotes found for the selected filters.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
