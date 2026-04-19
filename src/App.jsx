import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { AuthProvider } from './contexts/AuthContext';
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import DashboardPage from './pages/DashboardPage';
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
import MaterialsPage from './pages/settings/MaterialsPage';
import TeamPage from './pages/settings/TeamPage';

function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/quotes/new" element={<NewQuotePage />} />
                <Route path="/quotes/:id" element={<QuotePreviewPage />} />
                <Route path="/quotes" element={<QuoteHistoryPage />} />
                <Route path="/orders" element={<OrdersListPage />} />
                <Route path="/orders/:id" element={<OrderDetailPage />} />

                <Route element={<AdminRoute />}>
                  <Route path="/settings" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="/settings/profile" replace />} />
                    <Route path="profile" element={<CompanyProfilePage />} />
                    <Route path="energy" element={<EnergyConfigPage />} />
                    <Route path="printers" element={<PrintersPage />} />
                    <Route path="materials" element={<MaterialsPage />} />
                    <Route path="team" element={<TeamPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route path="/order/track/:token" element={<PublicOrderPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default App;
