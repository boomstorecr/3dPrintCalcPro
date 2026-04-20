import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register, registerWorker } = useAuth();

  const [isInviteMode, setIsInviteMode] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
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

  const handleInviteToggle = () => {
    setIsInviteMode((prev) => !prev);
    setErrors((prev) => ({
      ...prev,
      companyName: '',
      inviteCode: '',
    }));
    setFirebaseError('');
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.displayName.trim()) nextErrors.displayName = t('validation.displayNameRequired');
    if (!form.email.trim()) nextErrors.email = t('validation.emailRequired');
    if (!form.password) nextErrors.password = t('validation.passwordRequired');
    if (form.password && form.password.length < 6) {
      nextErrors.password = t('validation.passwordMinLength');
    }
    if (!form.confirmPassword) nextErrors.confirmPassword = t('validation.confirmPasswordRequired');
    if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = t('validation.passwordsNoMatch');
    }

    if (isInviteMode) {
      if (!form.inviteCode.trim()) nextErrors.inviteCode = t('validation.inviteCodeRequired');
    } else if (!form.companyName.trim()) {
      nextErrors.companyName = t('validation.companyNameRequired');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const findInvite = async (inviteCode) => {
    const normalizedCode = inviteCode.trim();
    const companiesSnapshot = await getDocs(collection(db, 'companies'));

    for (const companyDoc of companiesSnapshot.docs) {
      const invitesRef = collection(doc(db, 'companies', companyDoc.id), 'invites');
      const inviteQuery = query(
        invitesRef,
        where('code', '==', normalizedCode),
        where('used', '==', false)
      );
      const inviteSnapshot = await getDocs(inviteQuery);

      if (!inviteSnapshot.empty) {
        const inviteDoc = inviteSnapshot.docs[0];
        return {
          companyId: companyDoc.id,
          inviteDocId: inviteDoc.id,
        };
      }
    }

    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFirebaseError('');

    if (!validate()) return;

    setSubmitting(true);

    try {
      const email = form.email.trim();
      const displayName = form.displayName.trim();

      if (isInviteMode) {
        const inviteData = await findInvite(form.inviteCode);

        if (!inviteData) {
          setFirebaseError(t('validation.invalidInviteCode'));
          setSubmitting(false);
          return;
        }

        await registerWorker(email, form.password, displayName, inviteData.companyId);
        await updateDoc(doc(db, 'companies', inviteData.companyId, 'invites', inviteData.inviteDocId), {
          used: true,
        });
      } else {
        await register(email, form.password, displayName, form.companyName.trim());
      }

      navigate('/');
    } catch (error) {
      setFirebaseError(error?.message || 'Failed to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t('auth.register')}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {isInviteMode ? t('auth.registerSubtitleInvite') : t('auth.registerSubtitleAdmin')}
      </p>

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isInviteMode}
            onChange={handleInviteToggle}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          {t('auth.haveInviteCode')}
        </label>
      </div>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        {!isInviteMode ? (
          <Input
            id="companyName"
            name="companyName"
            type="text"
            label={t('auth.companyName')}
            value={form.companyName}
            onChange={handleChange}
            error={errors.companyName}
          />
        ) : (
          <Input
            id="inviteCode"
            name="inviteCode"
            type="text"
            label={t('auth.inviteCode')}
            value={form.inviteCode}
            onChange={handleChange}
            error={errors.inviteCode}
          />
        )}

        <Input
          id="displayName"
          name="displayName"
          type="text"
          label={t('auth.displayName')}
          value={form.displayName}
          onChange={handleChange}
          error={errors.displayName}
        />

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
          autoComplete="new-password"
          label={t('auth.password')}
          value={form.password}
          onChange={handleChange}
          error={errors.password}
        />

        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          label={t('auth.confirmPassword')}
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
        />

        {firebaseError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {firebaseError}
          </p>
        )}

        <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="w-full">
          {submitting && !isInviteMode
            ? t('auth.creatingAccount')
            : isInviteMode
              ? t('auth.joinCompany')
              : t('auth.createAccount')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  );
}
