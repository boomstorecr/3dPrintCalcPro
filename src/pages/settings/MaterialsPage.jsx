import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Table } from '../../components/ui/Table';
import { Spinner } from '../../components/ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../lib/currency';
import { db } from '../../lib/firebase';

const MATERIAL_TYPE_OPTIONS = [
  { label: 'PLA', value: 'PLA' },
  { label: 'PETG', value: 'PETG' },
  { label: 'ABS', value: 'ABS' },
  { label: 'TPU', value: 'TPU' },
  { label: 'ASA', value: 'ASA' },
  { label: 'Nylon', value: 'Nylon' },
  { label: 'Resin', value: 'Resin' },
  { label: 'Other', value: 'Other' },
];

const EMPTY_FORM = {
  name: '',
  type: 'PLA',
  cost_per_kg: '',
  density_g_per_cm3: '',
};

export default function MaterialsPage() {
  const { userProfile, companyCurrency } = useAuth();
  const { success, error } = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState([]);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [pendingDeleteMaterial, setPendingDeleteMaterial] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);

  const companyId = userProfile?.company_id;
  const isAdmin = userProfile?.role === 'Admin';

  const loadMaterials = async () => {
    if (!companyId) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const materialsRef = collection(db, 'materials');
      const materialsQuery = query(materialsRef, where('company_id', '==', companyId));
      const snapshot = await getDocs(materialsQuery);

      const materialList = snapshot.docs.map((materialDoc) => ({
        id: materialDoc.id,
        ...materialDoc.data(),
      }));

      setMaterials(materialList);
    } catch (loadError) {
      console.error('[MaterialsPage] Failed to load materials', loadError);
      error('Failed to load materials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, [companyId]);

  const columns = useMemo(
    () => [
      {
        key: 'name',
        label: t('settings.materials.name'),
      },
      {
        key: 'type',
        label: t('settings.materials.type'),
      },
      {
        key: 'cost_per_kg',
        label: t('settings.materials.costPerKg'),
        render: (row) => formatCurrency(Number(row.cost_per_kg ?? 0), companyCurrency),
      },
      {
        key: 'actions',
        label: t('common.actions'),
        render: (row) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenEditModal(row);
              }}
            >
              {t('settings.materials.edit')}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenDeleteModal(row);
              }}
            >
              {t('settings.materials.delete')}
            </Button>
          </div>
        ),
      },
    ],
    [companyCurrency, t]
  );

  const handleOpenAddModal = () => {
    setEditingMaterial(null);
    setFormValues(EMPTY_FORM);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (material) => {
    setEditingMaterial(material);
    setFormValues({
      name: material.name ?? '',
      type: material.type ?? 'PLA',
      cost_per_kg: String(material.cost_per_kg ?? ''),
      density_g_per_cm3: String(material.density_g_per_cm3 ?? ''),
    });
    setIsFormModalOpen(true);
  };

  const handleOpenDeleteModal = (material) => {
    setPendingDeleteMaterial(material);
    setIsDeleteModalOpen(true);
  };

  const closeFormModal = () => {
    if (saving) {
      return;
    }

    setIsFormModalOpen(false);
    setEditingMaterial(null);
    setFormValues(EMPTY_FORM);
  };

  const closeDeleteModal = () => {
    if (saving) {
      return;
    }

    setIsDeleteModalOpen(false);
    setPendingDeleteMaterial(null);
  };

  const handleInputChange = (field) => (event) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSaveMaterial = async () => {
    if (!isAdmin) {
      error('Only administrators can manage materials.');
      return;
    }

    if (!companyId) {
      error('No company selected for this user.');
      return;
    }

    const costPerKg = Number(formValues.cost_per_kg);
    const density = Number(formValues.density_g_per_cm3);

    if (!formValues.name.trim()) {
      error('Material name is required.');
      return;
    }

    if (!formValues.type) {
      error('Material type is required.');
      return;
    }

    if (Number.isNaN(costPerKg) || costPerKg < 0) {
      error('Cost per kg must be a non-negative number.');
      return;
    }

    if (Number.isNaN(density) || density < 0) {
      error('Density must be a non-negative number.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: formValues.name.trim(),
        type: formValues.type,
        cost_per_kg: costPerKg,
        density_g_per_cm3: density,
      };

      if (editingMaterial?.id) {
        const materialRef = doc(db, 'materials', editingMaterial.id);
        await updateDoc(materialRef, payload);
        success(t('toast.materialSaved'));
      } else {
        await addDoc(collection(db, 'materials'), {
          ...payload,
          company_id: companyId,
        });
        success(t('toast.materialSaved'));
      }

      closeFormModal();
      await loadMaterials();
    } catch (saveError) {
      console.error('[MaterialsPage] Failed to save material', saveError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!isAdmin) {
      error('Only administrators can manage materials.');
      return;
    }

    if (!pendingDeleteMaterial?.id) {
      error('No material selected to delete.');
      return;
    }

    setSaving(true);

    try {
      await deleteDoc(doc(db, 'materials', pendingDeleteMaterial.id));
      success(t('toast.materialDeleted'));
      closeDeleteModal();
      await loadMaterials();
    } catch (deleteError) {
      console.error('[MaterialsPage] Failed to delete material', deleteError);
      error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title={t('settings.materials.title')}>
        <p className="text-sm text-gray-600">Only administrators can manage material settings.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={t('settings.materials.title')}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">Manage material pricing for quote calculations.</p>
          <Button onClick={handleOpenAddModal}>{t('settings.materials.add')}</Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : materials.length === 0 ? (
          <p className="text-sm text-gray-600">
            {t('settings.materials.noMaterials')}. {t('settings.materials.noMaterialsSubtitle')}
          </p>
        ) : (
          <Table columns={columns} data={materials} />
        )}
      </Card>

      <Modal
        isOpen={isFormModalOpen}
        onClose={closeFormModal}
        title={editingMaterial ? t('settings.materials.edit') : t('settings.materials.add')}
      >
        <div className="space-y-4">
          <Input
            id="material-name"
            label={t('settings.materials.name')}
            value={formValues.name}
            onChange={handleInputChange('name')}
            placeholder="e.g. PLA Premium"
          />

          <Select
            id="material-type"
            label={t('settings.materials.type')}
            value={formValues.type}
            onChange={handleInputChange('type')}
            options={MATERIAL_TYPE_OPTIONS}
          />

          <Input
            id="material-cost"
            label={t('settings.materials.costPerKg')}
            type="number"
            min="0"
            step="0.01"
            value={formValues.cost_per_kg}
            onChange={handleInputChange('cost_per_kg')}
          />

          <Input
            id="material-density"
            label={t('settings.materials.density')}
            type="number"
            min="0"
            step="0.0001"
            value={formValues.density_g_per_cm3}
            onChange={handleInputChange('density_g_per_cm3')}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeFormModal} disabled={saving}>
              {t('settings.materials.cancel')}
            </Button>
            <Button onClick={handleSaveMaterial} loading={saving}>
              {saving ? t('settings.materials.saving') : t('settings.materials.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={closeDeleteModal} title={t('settings.materials.delete')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {t('settings.materials.deleteConfirm')} {pendingDeleteMaterial?.name || t('settings.materials.name')}?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteModal} disabled={saving}>
              {t('settings.materials.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeleteMaterial} loading={saving}>
              {saving ? t('settings.materials.saving') : t('settings.materials.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
