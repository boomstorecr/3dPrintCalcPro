import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { DollarSign, Receipt, Package, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { getMonthlyIncomeSummary } from '../lib/bills';
import { formatCurrency } from '../lib/currency';
import { db } from '../lib/firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table } from '../components/ui/Table';
import { Spinner } from '../components/ui/Spinner';

const STATUS_BADGE_VARIANT = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
};

const ORDER_STATUS_BADGE_VARIANT = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'danger',
};

function normalizeStatusKey(status) {
  return String(status || 'draft')
    .toLowerCase()
    .replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function getQuoteTotal(quote) {
  const breakdown = quote?.cost_breakdown || quote?.costBreakdown || {};
  const candidates = [
    breakdown?.totalPriceOverride,
    quote?.total_price_override,
    breakdown?.totalPrice,
    quote?.total_price,
    quote?.totalPrice,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (n > 0) return n;
  }
  return 0;
}

function toDateString(value, lang) {
  if (!value) return '-';
  const date = typeof value.toDate === 'function' ? value.toDate() :
    (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(lang || undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DashboardPage() {
  const { userProfile, companyCurrency } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalQuotes: 0,
    thisMonth: 0,
    totalRevenue: 0,
    averageQuote: 0,
    activeOrders: 0,
    monthlyIncome: 0,
    paidBillsCount: 0,
  });
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [lowStockMaterials, setLowStockMaterials] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    if (!userProfile?.company_id) return;

    let cancelled = false;

    const fetchDashboardData = async () => {
      const companyId = userProfile.company_id;
      setLoading(true);

      let totalQuotes = 0;
      let thisMonth = 0;
      let revenue = 0;
      let acceptedCount = 0;
      let activeOrders = 0;
      let monthlyIncome = 0;
      let paidBillsCount = 0;

      // 1. All quotes — total count + revenue from accepted
      try {
        const allQ = query(
          collection(db, 'quotes'),
          where('company_id', '==', companyId)
        );
        const allSnap = await getDocs(allQ);
        totalQuotes = allSnap.size;

        allSnap.forEach((d) => {
          const data = d.data();
          if (data.status === 'accepted') {
            revenue += getQuoteTotal(data);
            acceptedCount += 1;
          }
        });
      } catch (err) {
        console.error('[Dashboard] Error fetching quotes:', err);
      }

      // 2. This month quotes
      try {
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const monthQ = query(
          collection(db, 'quotes'),
          where('company_id', '==', companyId),
          where('date', '>=', Timestamp.fromDate(startOfMonth))
        );
        const monthSnap = await getDocs(monthQ);
        thisMonth = monthSnap.size;
      } catch (err) {
        console.error('[Dashboard] Error fetching month quotes:', err);
      }

      // 3. Recent quotes (last 5)
      try {
        const recentQ = query(
          collection(db, 'quotes'),
          where('company_id', '==', companyId),
          orderBy('date', 'desc'),
          limit(5)
        );
        const recentSnap = await getDocs(recentQ);
        if (!cancelled) {
          setRecentQuotes(recentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('[Dashboard] Error fetching recent quotes:', err);
      }

      // 4. Orders — active count + recent 5
      try {
        const ordersQ = query(
          collection(db, 'orders'),
          where('company_id', '==', companyId),
          orderBy('created_at', 'desc'),
          limit(20)
        );
        const ordersSnap = await getDocs(ordersQ);
        const allOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        activeOrders = allOrders.filter(
          (o) => o.status === 'pending' || o.status === 'in_progress'
        ).length;
        if (!cancelled) {
          setRecentOrders(allOrders.slice(0, 5));
        }
      } catch (err) {
        console.error('[Dashboard] Error fetching orders:', err);
      }

      // 5. Low stock materials
      try {
        const matsQ = query(
          collection(db, 'materials'),
          where('company_id', '==', companyId)
        );
        const matsSnap = await getDocs(matsQ);
        const lowStock = matsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((m) => (Number(m.stock_kg) || 0) < 0.5);
        if (!cancelled) {
          setLowStockMaterials(lowStock);
        }
      } catch (err) {
        console.error('[Dashboard] Error fetching materials:', err);
      }

      // 6. Monthly income summary
      try {
        const incomeSummary = await getMonthlyIncomeSummary(companyId, 6);
        if (!cancelled) {
          setMonthlyTrend(incomeSummary);
        }

        const now = new Date();
        const currentEntry = incomeSummary.find(
          (e) => e.month === now.getMonth() + 1 && e.year === now.getFullYear()
        );
        monthlyIncome = Number(currentEntry?.total) || 0;
        paidBillsCount = Number(currentEntry?.count) || 0;
      } catch (err) {
        console.error('[Dashboard] Error fetching income:', err);
      }

      if (!cancelled) {
        setStats({
          totalQuotes,
          thisMonth,
          totalRevenue: revenue,
          averageQuote: acceptedCount > 0 ? revenue / acceptedCount : 0,
          activeOrders,
          monthlyIncome,
          paidBillsCount,
        });
        setLoading(false);
      }
    };

    fetchDashboardData();

    return () => {
      cancelled = true;
    };
  }, [userProfile?.company_id]);

  const lang = i18n.language || undefined;

  const currentDate = new Date().toLocaleDateString(lang, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // --- Table columns ---

  const quotesColumns = useMemo(
    () => [
      {
        key: 'client_name',
        label: t('common.client', { defaultValue: 'Client' }),
        render: (row) => (
          <span className="font-medium text-gray-900">
            {row.client_name || 'Unnamed Client'}
          </span>
        ),
      },
      {
        key: 'piece_name',
        label: t('quotes.new.pieceName', { defaultValue: 'Piece' }),
        render: (row) => row.piece_name || row.pieceName || '-',
      },
      {
        key: 'date',
        label: t('common.date', { defaultValue: 'Date' }),
        render: (row) => toDateString(row.date, lang),
      },
      {
        key: 'total',
        label: t('common.total', { defaultValue: 'Total' }),
        render: (row) => formatCurrency(getQuoteTotal(row), companyCurrency),
      },
      {
        key: 'status',
        label: t('common.status', { defaultValue: 'Status' }),
        render: (row) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.status] || 'neutral'}>
            {t(`status.${normalizeStatusKey(row.status)}`)}
          </Badge>
        ),
      },
    ],
    [t, lang, companyCurrency]
  );

  const ordersColumns = useMemo(
    () => [
      {
        key: 'client_name',
        label: t('common.client', { defaultValue: 'Client' }),
        render: (row) => (
          <span className="font-medium text-gray-900">
            {row.client_name || 'Unnamed Client'}
          </span>
        ),
      },
      {
        key: 'created_at',
        label: t('common.date', { defaultValue: 'Date' }),
        render: (row) => toDateString(row.created_at, lang),
      },
      {
        key: 'completion_percent',
        label: t('orders.detail.progress', { defaultValue: 'Progress' }),
        render: (row) => {
          const pct = row.completion_percent || 0;
          return (
            <div className="flex items-center gap-2">
              <div className="h-2 w-20 rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-indigo-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{pct}%</span>
            </div>
          );
        },
      },
      {
        key: 'status',
        label: t('common.status', { defaultValue: 'Status' }),
        render: (row) => (
          <Badge variant={ORDER_STATUS_BADGE_VARIANT[row.status] || 'neutral'}>
            {t(`orders.detail.${normalizeStatusKey(row.status)}`, { defaultValue: row.status })}
          </Badge>
        ),
      },
    ],
    [t, lang]
  );

  const trendColumns = useMemo(
    () => [
      {
        key: 'month',
        label: t('dashboard.month', { defaultValue: 'Month' }),
        render: (row) =>
          new Date(row.year, row.month - 1, 1).toLocaleDateString(lang, {
            month: 'long',
            year: 'numeric',
          }),
      },
      {
        key: 'count',
        label: t('dashboard.billsCount', { defaultValue: 'Bills' }),
      },
      {
        key: 'total',
        label: t('dashboard.totalIncome', { defaultValue: 'Income' }),
        render: (row) => formatCurrency(row.total, companyCurrency),
      },
    ],
    [t, lang, companyCurrency]
  );

  const lowStockColumns = useMemo(
    () => [
      {
        key: 'name',
        label: t('settings.materials.name', { defaultValue: 'Material' }),
        render: (row) => (
          <div className="flex items-center gap-2">
            {row.color ? (
              <span
                className="inline-block h-3 w-3 rounded-full border border-gray-300"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <span className="font-medium">{row.name}</span>
          </div>
        ),
      },
      {
        key: 'brand',
        label: t('inventory.brand', { defaultValue: 'Brand' }),
        render: (row) => row.brand || '-',
      },
      {
        key: 'type',
        label: t('settings.materials.type', { defaultValue: 'Type' }),
      },
      {
        key: 'stock_kg',
        label: t('inventory.stockKg', { defaultValue: 'Stock (kg)' }),
        render: (row) => (
          <span className="font-semibold text-red-600">
            {(Number(row.stock_kg) || 0).toFixed(2)}
          </span>
        ),
      },
    ],
    [t]
  );

  if (loading || !userProfile) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {t('dashboard.welcome', { name: userProfile?.display_name || '' })}
            </h1>
            <Badge variant={userProfile.role === 'Admin' ? 'info' : 'neutral'}>
              {userProfile.role}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">{currentDate}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate('/quotes/new')}>
            {t('dashboard.createNewQuote', { defaultValue: 'New Quote' })}
          </Button>
          <Button onClick={() => navigate('/inventory')} variant="secondary">
            {t('dashboard.manageMaterials', { defaultValue: 'Inventory' })}
          </Button>
          {userProfile.role === 'Admin' && (
            <Button onClick={() => navigate('/settings')} variant="secondary">
              {t('dashboard.companySettings', { defaultValue: 'Settings' })}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5">
          <p className="mb-1 text-sm font-medium text-gray-500">{t('dashboard.totalQuotes', { defaultValue: 'Total Quotes' })}</p>
          <p className="text-3xl font-bold text-gray-900">{stats.totalQuotes}</p>
          <p className="mt-1 text-xs text-gray-400">{t('dashboard.acrossAllTime', { defaultValue: 'All time' })}</p>
        </Card>

        <Card className="p-5">
          <p className="mb-1 text-sm font-medium text-gray-500">{t('dashboard.thisMonth', { defaultValue: 'This Month' })}</p>
          <p className="text-3xl font-bold text-gray-900">{stats.thisMonth}</p>
          <p className="mt-1 text-xs text-gray-400">{t('dashboard.quotesThisMonth', { defaultValue: 'Quotes created' })}</p>
        </Card>

        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">{t('dashboard.activeOrders', { defaultValue: 'Active Orders' })}</p>
            <Package className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.activeOrders}</p>
          <p className="mt-1 text-xs text-gray-400">{t('dashboard.pendingInProgress', { defaultValue: 'Pending / In progress' })}</p>
        </Card>

        <Card className="p-5">
          <p className="mb-1 text-sm font-medium text-gray-500">{t('dashboard.totalRevenue', { defaultValue: 'Total Revenue' })}</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue, companyCurrency)}</p>
          <p className="mt-1 text-xs text-gray-400">{t('dashboard.fromAccepted', { defaultValue: 'From accepted quotes' })}</p>
        </Card>

        <Card className="border-green-200 bg-green-50/40 p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">{t('dashboard.incomeThisMonth', { defaultValue: 'Income This Month' })}</p>
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-700">{formatCurrency(stats.monthlyIncome, companyCurrency)}</p>
          <p className="mt-1 text-xs text-green-700/80">{t('dashboard.fromPaidBills', { defaultValue: 'From paid bills' })}</p>
        </Card>

        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">{t('dashboard.paidBills', { defaultValue: 'Paid Bills' })}</p>
            <Receipt className="h-5 w-5 text-gray-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.paidBillsCount}</p>
          <p className="mt-1 text-xs text-gray-400">{t('dashboard.thisMonth', { defaultValue: 'This month' })}</p>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockMaterials.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <div className="mb-3 flex items-center gap-2 px-1">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-semibold text-amber-900">
              {t('dashboard.lowStock', { defaultValue: 'Low Stock Alert' })}
            </h2>
            <Link to="/inventory" className="ml-auto text-sm font-medium text-amber-700 hover:text-amber-900">
              {t('dashboard.viewInventory', { defaultValue: 'Go to Inventory →' })}
            </Link>
          </div>
          <Table columns={lowStockColumns} data={lowStockMaterials} onRowClick={() => navigate('/inventory')} />
        </Card>
      )}

      {/* Recent Quotes & Recent Orders — side by side on large screens */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between px-1">
            <h2 className="text-lg font-semibold text-gray-800">
              {t('dashboard.recentQuotes', { defaultValue: 'Recent Quotes' })}
            </h2>
            <Link to="/quotes" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              {t('dashboard.viewAll', { defaultValue: 'View all →' })}
            </Link>
          </div>
          {recentQuotes.length > 0 ? (
            <Table
              columns={quotesColumns}
              data={recentQuotes}
              onRowClick={(row) => navigate(`/quotes/${row.id}`)}
            />
          ) : (
            <p className="px-1 py-8 text-center text-sm text-gray-500">
              {t('dashboard.noQuotes', { defaultValue: 'No quotes yet.' })}
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between px-1">
            <h2 className="text-lg font-semibold text-gray-800">
              {t('dashboard.recentOrders', { defaultValue: 'Recent Orders' })}
            </h2>
            <Link to="/orders" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
              {t('dashboard.viewAll', { defaultValue: 'View all →' })}
            </Link>
          </div>
          {recentOrders.length > 0 ? (
            <Table
              columns={ordersColumns}
              data={recentOrders}
              onRowClick={(row) => navigate(`/orders/${row.id}`)}
            />
          ) : (
            <p className="px-1 py-8 text-center text-sm text-gray-500">
              {t('dashboard.noOrders', { defaultValue: 'No orders yet.' })}
            </p>
          )}
        </Card>
      </div>

      {/* Monthly Income Trend */}
      <Card>
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 className="text-lg font-semibold text-gray-800">
            {t('dashboard.monthlyTrend', { defaultValue: 'Monthly Income Trend' })}
          </h2>
          <Link to="/bills" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
            {t('dashboard.viewAll', { defaultValue: 'View all →' })}
          </Link>
        </div>
        {monthlyTrend.length > 0 ? (
          <Table columns={trendColumns} data={monthlyTrend} />
        ) : (
          <p className="px-1 py-8 text-center text-sm text-gray-500">
            {t('dashboard.noIncomeData', { defaultValue: 'No income data available yet.' })}
          </p>
        )}
      </Card>
    </div>
  );
}
