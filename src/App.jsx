import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { Spinner } from './components/ui/Spinner';
import { AuthProvider } from './contexts/AuthContext';
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import AccountPage from './pages/AccountPage';
import NewQuotePage from './pages/quotes/NewQuotePage';
import QuotePreviewPage from './pages/quotes/QuotePreviewPage';
import QuoteHistoryPage from './pages/quotes/QuoteHistoryPage';
import OrdersListPage from './pages/orders/OrdersListPage';
import OrderDetailPage from './pages/orders/OrderDetailPage';
import PublicOrderPage from './pages/orders/PublicOrderPage';
import SettingsLayout from './pages/settings/SettingsLayout';
import CompanyProfilePage from './pages/settings/CompanyProfilePage';
import EnergyConfigPage from './pages/settings/EnergyConfigPage';
import PrintersPage from './pages/settings/PrintersPage';
import TeamPage from './pages/settings/TeamPage';

const BillsListPage = lazy(() => import('./pages/bills/BillsListPage'));
const NewBillPage = lazy(() => import('./pages/bills/NewBillPage'));
const BillDetailPage = lazy(() => import('./pages/bills/BillDetailPage'));
const ClientsListPage = lazy(() => import('./pages/clients/ClientsListPage'));
const NewClientPage = lazy(() => import('./pages/clients/NewClientPage'));
const ClientDetailPage = lazy(() => import('./pages/clients/ClientDetailPage'));
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage'));

function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
              </div>
            }
          >
            <Routes>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/quotes/new" element={<NewQuotePage />} />
                  <Route path="/quotes/:id" element={<QuotePreviewPage />} />
                  <Route path="/quotes" element={<QuoteHistoryPage />} />
                  <Route path="/orders" element={<OrdersListPage />} />
                  <Route path="/orders/:id" element={<OrderDetailPage />} />
                  <Route path="/bills" element={<BillsListPage />} />
                  <Route path="/bills/new" element={<NewBillPage />} />
                  <Route path="/bills/:id" element={<BillDetailPage />} />
                  <Route path="/clients" element={<ClientsListPage />} />
                  <Route path="/clients/new" element={<NewClientPage />} />
                  <Route path="/clients/:id" element={<ClientDetailPage />} />
                  <Route path="/clients/:id/edit" element={<NewClientPage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/account" element={<AccountPage />} />

                  <Route element={<AdminRoute />}>
                    <Route path="/settings" element={<SettingsLayout />}>
                      <Route index element={<Navigate to="/settings/profile" replace />} />
                      <Route path="profile" element={<CompanyProfilePage />} />
                      <Route path="energy" element={<EnergyConfigPage />} />
                      <Route path="printers" element={<PrintersPage />} />
                      <Route path="team" element={<TeamPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>

              <Route path="/order/track/:token" element={<PublicOrderPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default App;
