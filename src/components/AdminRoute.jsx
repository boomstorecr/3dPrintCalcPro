import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from './ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

export default function AdminRoute() {
  const { user, userProfile, loading } = useAuth();
  const { error } = useToast();

  const isAdmin = userProfile?.role === 'Admin';

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      error('Admin access required');
    }
  }, [error, isAdmin, loading, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}