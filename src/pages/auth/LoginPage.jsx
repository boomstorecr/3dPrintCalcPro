import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';

export default function LoginPage() {
  const navigate = useNavigate();
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

    if (!form.email.trim()) nextErrors.email = 'Email is required';
    if (!form.password) nextErrors.password = 'Password is required';

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
      <h1 className="text-2xl font-bold text-slate-900">Sign In</h1>
      <p className="mt-1 text-sm text-slate-600">Access your 3DPrintCalc Pro workspace.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          label="Email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
        />

        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          label="Password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
        />

        {firebaseError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {firebaseError}
          </p>
        )}

        <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="w-full">
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
          Register
        </Link>
      </p>
    </div>
  );
}
