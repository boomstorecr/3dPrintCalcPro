import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess(false);

    if (!email.trim()) {
      setError(t('validation.emailRequired'));
      return;
    }

    setSubmitting(true);

    try {
      await resetPassword(email.trim());
      setSuccess(true);
    } catch (err) {
      setError(err?.message || 'Failed to send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t('auth.resetPassword')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('auth.resetPasswordSubtitle')}</p>

      {success && (
        <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {t('auth.resetEmailSent')}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!success && (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <Input
            id="email"
            name="email"
            type="email"
            label={t('auth.email')}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
          />

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t('auth.sending') : t('auth.sendResetLink')}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </div>
  );
}
