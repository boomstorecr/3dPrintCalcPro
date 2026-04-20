import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/firebase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table } from '../components/ui/Table';
import { Spinner } from '../components/ui/Spinner';

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalQuotes: 0,
    thisMonth: 0,
    totalRevenue: 0,
    averageQuote: 0
  });
  const [recentQuotes, setRecentQuotes] = useState([]);

  useEffect(() => {
    if (!userProfile?.company_id) return;

    const fetchDashboardData = async () => {
      const companyId = userProfile.company_id;

      let totalQuotes = 0;
      let thisMonth = 0;
      let revenue = 0;
      let averageQuote = 0;

      // 1. Total Quotes
      try {
        const allQ = query(
          collection(db, 'quotes'),
          where('company_id', '==', companyId)
        );
        const allSnap = await getDocs(allQ);
        totalQuotes = allSnap.size;
      } catch (err) {
        console.error('Error fetching total quotes:', err);
      }

      // 2. This Month
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
        console.error('Error fetching this month quotes:', err);
      }

      // 3. Accepted Quotes & Revenue
      try {
        const acceptedQ = query(
          collection(db, 'quotes'),
          where('company_id', '==', companyId),
          where('status', '==', 'accepted')
        );
        const acceptedSnap = await getDocs(acceptedQ);

        acceptedSnap.forEach(doc => {
          const data = doc.data();
          revenue += (data.total_price || 0);
        });

        const acceptedCount = acceptedSnap.size;
        averageQuote = acceptedCount > 0 ? (revenue / acceptedCount) : 0;
      } catch (err) {
        console.error('Error fetching accepted quotes:', err);
      }

      setStats({
        totalQuotes,
        thisMonth,
        totalRevenue: revenue,
        averageQuote
      });

      // 4. Recent Quotes
      try {
        const recentQ = query(
          collection(db, 'quotes'),
          where('company_id', '==', companyId),
          orderBy('date', 'desc'),
          limit(5)
        );
        const recentSnap = await getDocs(recentQ);
        const recent = recentSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRecentQuotes(recent);
      } catch (err) {
        console.error('Error fetching recent quotes:', err);
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, [userProfile]);

  if (loading || !userProfile) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner className="w-8 h-8 text-blue-600" />
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  });

  // Helper for status badge colors
  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'green';
      case 'rejected': return 'red';
      case 'sent': return 'blue';
      default: return 'gray';
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {userProfile.display_name}
            </h1>
            <Badge color={userProfile.role === 'admin' ? 'purple' : 'gray'}>
              {userProfile.role?.charAt(0).toUpperCase() + userProfile.role?.slice(1)}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{currentDate}</p>
        </div>
        
        {/* 4. Quick Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/quotes/new')} variant="primary">
            New Quote
          </Button>
          <Button onClick={() => navigate('/settings/materials')} variant="secondary">
            Materials
          </Button>
          {userProfile.role === 'admin' && (
            <Button onClick={() => navigate('/settings')} variant="secondary">
              Settings
            </Button>
          )}
        </div>
      </div>

      {/* 2. Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="text-sm font-medium text-gray-500 mb-1">Total Quotes</div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalQuotes}</div>
          <div className="text-xs text-gray-400 mt-1">Across all time</div>
        </Card>
        
        <Card className="p-5">
          <div className="text-sm font-medium text-gray-500 mb-1">This Month</div>
          <div className="text-3xl font-bold text-gray-900">{stats.thisMonth}</div>
          <div className="text-xs text-gray-400 mt-1">Quotes created this month</div>
        </Card>
        
        <Card className="p-5">
          <div className="text-sm font-medium text-gray-500 mb-1">Total Revenue</div>
          <div className="text-3xl font-bold text-gray-900">
            ${stats.totalRevenue.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400 mt-1">From accepted quotes</div>
        </Card>
        
        <Card className="p-5">
          <div className="text-sm font-medium text-gray-500 mb-1">Average Quote</div>
          <div className="text-3xl font-bold text-gray-900">
            {stats.averageQuote > 0 ? `$${stats.averageQuote.toFixed(2)}` : 'N/A'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Revenue per accepted quote</div>
        </Card>
      </div>

      {/* 3. Recent Quotes Table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Recent Quotes</h2>
          <Link to="/quotes" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            View All →
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          {recentQuotes.length > 0 ? (
            <Table>
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {recentQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {quote.client_name || 'Unnamed Client'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-500">
                      {quote.date?.toDate ? quote.date.toDate().toLocaleDateString() : 'Unknown'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-gray-900">
                      ${quote.total_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm">
                      <Badge color={getStatusColor(quote.status)}>
                        {quote.status ? quote.status.toUpperCase() : 'DRAFT'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-sm text-right">
                      <Link 
                        to={`/quotes/${quote.id}`}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No recent quotes found. Create your first quote to get started!
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
