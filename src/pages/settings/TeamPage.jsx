import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from 'react-i18next';
import {
  createInvite,
  deleteInvite,
  getInvites,
  getTeamMembers,
  removeTeamMember,
} from '../../lib/team';

function maskInviteCode(code) {
  if (!code) {
    return '----';
  }

  const visiblePart = String(code).slice(-4);
  return `****-****-${visiblePart}`;
}

function formatInviteDate(invite) {
  const createdAt = invite.created_at;

  if (!createdAt) {
    return '-';
  }

  if (typeof createdAt.toDate === 'function') {
    return createdAt.toDate().toLocaleDateString();
  }

  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return parsedDate.toLocaleDateString();
}

function getDisplayName(member) {
  return member.display_name || member.displayName || member.email || 'Unnamed User';
}

function getRole(member) {
  return member.role || 'Worker';
}

export default function TeamPage() {
  const { user, userProfile } = useAuth();
  const { success, error, info } = useToast();
  const { t } = useTranslation();

  const companyId = userProfile?.company_id;
  const isAdmin = userProfile?.role === 'Admin';

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [newInviteCode, setNewInviteCode] = useState('');

  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [pendingRemoveMember, setPendingRemoveMember] = useState(null);

  const loadMembers = async () => {
    if (!companyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    setLoadingMembers(true);

    try {
      const rows = await getTeamMembers(companyId);
      setMembers(rows);
    } catch (loadError) {
      console.error('[TeamPage] Failed to load members', loadError);
      error('Failed to load team members.');
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadInvites = async () => {
    if (!companyId) {
      setInvites([]);
      setLoadingInvites(false);
      return;
    }

    setLoadingInvites(true);

    try {
      const rows = await getInvites(companyId);
      setInvites(rows);
    } catch (loadError) {
      console.error('[TeamPage] Failed to load invites', loadError);
      error('Failed to load invite codes.');
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    loadMembers();
    loadInvites();
  }, [companyId]);

  const handleGenerateInvite = async () => {
    if (!companyId) {
      error('No company is available for this user.');
      return;
    }

    setSaving(true);

    try {
      const code = await createInvite(companyId);
      setNewInviteCode(code);
      success(t('toast.inviteGenerated'));
      await loadInvites();
    } catch (createError) {
      console.error('[TeamPage] Failed to create invite', createError);
      error('Failed to generate invite code.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInviteCode = async (codeToCopy) => {
    if (!codeToCopy) {
      info('No invite code available to copy.');
      return;
    }

    try {
      await navigator.clipboard.writeText(codeToCopy);
      success(t('toast.copySuccess'));
    } catch (copyError) {
      console.error('[TeamPage] Failed to copy invite code', copyError);
      error('Could not copy invite code.');
    }
  };

  const handleOpenRemoveModal = (member) => {
    if (!member || member.id === user?.uid) {
      return;
    }

    setPendingRemoveMember(member);
    setIsRemoveModalOpen(true);
  };

  const closeRemoveModal = () => {
    if (saving) {
      return;
    }

    setIsRemoveModalOpen(false);
    setPendingRemoveMember(null);
  };

  const handleRemoveMember = async () => {
    if (!pendingRemoveMember?.id) {
      error('No team member selected.');
      return;
    }

    setSaving(true);

    try {
      await removeTeamMember(pendingRemoveMember.id);
      success(t('toast.memberRemoved'));
      closeRemoveModal();
      await loadMembers();
    } catch (removeError) {
      console.error('[TeamPage] Failed to remove member', removeError);
      error('Failed to remove team member.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInvite = async (invite) => {
    if (!companyId || !invite?.id) {
      error('No invite selected to delete.');
      return;
    }

    if (invite.used) {
      info('Used invites cannot be deleted.');
      return;
    }

    setSaving(true);

    try {
      await deleteInvite(companyId, invite.id);
      success('Invite code deleted.');
      await loadInvites();
    } catch (deleteError) {
      console.error('[TeamPage] Failed to delete invite', deleteError);
      error('Failed to delete invite code.');
    } finally {
      setSaving(false);
    }
  };

  const memberColumns = useMemo(
    () => [
      {
        key: 'display_name',
        label: t('common.name'),
        render: (row) => getDisplayName(row),
      },
      {
        key: 'email',
        label: t('settings.team.email'),
        render: (row) => row.email || '—',
      },
      {
        key: 'role',
        label: t('settings.team.role'),
        render: (row) => {
          const role = getRole(row);
          const variant = role === 'Admin' ? 'info' : 'neutral';
          return <Badge variant={variant}>{role === 'Admin' ? t('settings.team.admin') : t('settings.team.worker')}</Badge>;
        },
      },
      {
        key: 'actions',
        label: t('common.actions'),
        render: (row) => {
          const isSelf = row.id === user?.uid;

          if (isSelf) {
            return <span className="text-xs text-gray-500">Current user</span>;
          }

          return (
            <Button size="sm" variant="danger" onClick={() => handleOpenRemoveModal(row)}>
              {t('settings.team.removeMember')}
            </Button>
          );
        },
      },
    ],
    [t, user?.uid]
  );

  const inviteColumns = useMemo(
    () => [
      {
        key: 'code',
        label: t('settings.team.invites'),
        render: (row) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{maskInviteCode(row.code)}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleCopyInviteCode(row.code)}
            >
              {t('settings.team.copyCode')}
            </Button>
          </div>
        ),
      },
      {
        key: 'status',
        label: t('common.status'),
        render: (row) => <Badge variant={row.used ? 'neutral' : 'success'}>{row.used ? t('settings.team.used') : t('settings.team.unused')}</Badge>,
      },
      {
        key: 'created_at',
        label: t('common.date'),
        render: (row) => formatInviteDate(row),
      },
      {
        key: 'actions',
        label: t('common.actions'),
        render: (row) => (
          <Button
            size="sm"
            variant="danger"
            onClick={() => handleDeleteInvite(row)}
            disabled={Boolean(row.used)}
          >
            {t('settings.team.deleteInvite')}
          </Button>
        ),
      },
    ],
    [t]
  );

  if (!isAdmin) {
    return (
      <Card title={t('settings.team.title')}>
        <p className="text-sm text-gray-600">Only administrators can manage team members and invites.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={t('settings.team.members')}>
        {loadingMembers ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-600">{t('settings.team.noMembers')}</p>
        ) : (
          <Table columns={memberColumns} data={members} />
        )}
      </Card>

      <Card title={t('settings.team.invites')}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleGenerateInvite} loading={saving}>
              {t('settings.team.generateInvite')}
            </Button>
            {newInviteCode && (
              <Button variant="secondary" onClick={() => handleCopyInviteCode(newInviteCode)}>
                {t('settings.team.copyCode')}
              </Button>
            )}
          </div>

          {newInviteCode && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Latest Invite Code</p>
              <p className="mt-1 break-all font-mono text-lg text-indigo-900">{newInviteCode}</p>
            </div>
          )}

          {loadingInvites ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : invites.length === 0 ? (
            <p className="text-sm text-gray-600">{t('settings.team.noInvites')}</p>
          ) : (
            <Table columns={inviteColumns} data={invites} />
          )}
        </div>
      </Card>

      <Modal isOpen={isRemoveModalOpen} onClose={closeRemoveModal} title={t('settings.team.removeMember')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {t('settings.team.removeConfirm')} {getDisplayName(pendingRemoveMember || {})}?
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRemoveModal} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleRemoveMember} loading={saving}>
              {t('settings.team.removeMember')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
