import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

function mapPasswordError(err, t) {
  const code = err?.code;

  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Incorrect current password.';
  }

  if (code === 'auth/weak-password') {
    return t('validation.passwordMinLength');
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please try again later.';
  }

  return err?.message || t('toast.saveFailed');
}

export default function AccountPage() {
  const { t } = useTranslation();
  const { user, changePassword } = useAuth();
  const { success } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (!currentPassword) {
      setPasswordError(t('validation.passwordRequired'));
      return;
    }

    if (!newPassword) {
      setPasswordError(t('validation.passwordRequired'));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(t('validation.passwordMinLength'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError(t('validation.passwordsNoMatch'));
      return;
    }

    setChangingPassword(true);

    try {
      await changePassword(currentPassword, newPassword);
      success(t('settings.account.passwordChanged'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordError(mapPasswordError(err, t));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('settings.account.changePassword')}</h1>
        <p className="mt-1 text-sm text-slate-600">{user?.email || '-'}</p>
      </div>

      <Card>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <Input
            id="currentPassword"
            type="password"
            label={t('settings.account.currentPassword')}
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setPasswordError('');
            }}
          />
          <Input
            id="newPassword"
            type="password"
            label={t('settings.account.newPassword')}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordError('');
            }}
          />
          <Input
            id="confirmNewPassword"
            type="password"
            label={t('settings.account.confirmNewPassword')}
            value={confirmNewPassword}
            onChange={(e) => {
              setConfirmNewPassword(e.target.value);
              setPasswordError('');
            }}
          />

          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}

          <Button type="submit" disabled={changingPassword}>
            {changingPassword ? t('settings.account.updating') : t('settings.account.updatePassword')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
