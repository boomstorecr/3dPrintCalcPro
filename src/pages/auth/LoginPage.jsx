import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [firebaseError, setFirebaseError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: '',
    }));

    setFirebaseError('');
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.email.trim()) nextErrors.email = t('validation.emailRequired');
    if (!form.password) nextErrors.password = t('validation.passwordRequired');

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFirebaseError('');

    if (!validate()) return;

    setSubmitting(true);

    try {
      await login(form.email.trim(), form.password);
      navigate('/');
    } catch (error) {
      setFirebaseError(error?.message || 'Failed to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t('auth.signIn')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('auth.signInSubtitle')}</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          label={t('auth.email')}
          value={form.email}
          onChange={handleChange}
          error={errors.email}
        />

        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          label={t('auth.password')}
          value={form.password}
          onChange={handleChange}
          error={errors.password}
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            {t('auth.forgotPassword')}
          </Link>
        </div>

        {firebaseError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {firebaseError}
          </p>
        )}

        <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="w-full">
          {t('auth.signInButton')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
          {t('auth.register')}
        </Link>
      </p>
    </div>
  );
}
