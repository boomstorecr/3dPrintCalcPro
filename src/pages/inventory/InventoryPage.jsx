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
  color: '#000000',
  cost_per_kg: '',
  brand: '',
  stock_kg: '',
};

export default function InventoryPage() {
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

      const materialList = snapshot.docs
        .map((materialDoc) => ({
          id: materialDoc.id,
          ...materialDoc.data(),
        }))
        .sort((a, b) =>
          String(a.brand || '').localeCompare(String(b.brand || ''), undefined, { sensitivity: 'base' })
        );

      setMaterials(materialList);
    } catch (loadError) {
      console.error('[InventoryPage] Failed to load materials', loadError);
      error(t('toast.loadFailed', { defaultValue: 'Failed to load data.' }));
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
        label: t('settings.materials.name', { defaultValue: 'Name' }),
      },
      {
        key: 'brand',
        label: t('inventory.brand', { defaultValue: 'Brand' }),
        render: (row) => row.brand || '-',
      },
      {
        key: 'color',
        label: t('settings.materials.color', { defaultValue: 'Color' }),
        render: (row) =>
          row.color ? (
            <span
              className="inline-block h-4 w-4 rounded-full border border-gray-300"
              style={{ backgroundColor: row.color }}
              title={row.color}
            />
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        key: 'type',
        label: t('settings.materials.type', { defaultValue: 'Type' }),
      },
      {
        key: 'cost_per_kg',
        label: t('settings.materials.costPerKg', { defaultValue: 'Cost/kg' }),
        render: (row) => formatCurrency(Number(row.cost_per_kg ?? 0), companyCurrency),
      },
      {
        key: 'stock_kg',
        label: t('inventory.stockKg', { defaultValue: 'Stock (kg)' }),
        render: (row) => {
          const stock = Number(row.stock_kg ?? 0);
          const isLow = stock < 0.5;
          return (
            <span className={isLow ? 'font-semibold text-red-600' : 'text-gray-700'}>
              {stock.toFixed(2)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        label: t('common.actions', { defaultValue: 'Actions' }),
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
              {t('settings.materials.edit', { defaultValue: 'Edit' })}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenDeleteModal(row);
              }}
            >
              {t('settings.materials.delete', { defaultValue: 'Delete' })}
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
      color: material.color ?? '#000000',
      cost_per_kg: String(material.cost_per_kg ?? ''),
      brand: material.brand ?? '',
      stock_kg: String(material.stock_kg ?? ''),
    });
    setIsFormModalOpen(true);
  };

  const handleOpenDeleteModal = (material) => {
    setPendingDeleteMaterial(material);
    setIsDeleteModalOpen(true);
  };

  const closeFormModal = () => {
    if (saving) return;
    setIsFormModalOpen(false);
    setEditingMaterial(null);
    setFormValues(EMPTY_FORM);
  };

  const closeDeleteModal = () => {
    if (saving) return;
    setIsDeleteModalOpen(false);
    setPendingDeleteMaterial(null);
  };

  const handleInputChange = (field) => (event) => {
    setFormValues((prev) => ({ ...prev, [field]: event.target.value }));
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
    const stockKg = Number(formValues.stock_kg);

    if (!formValues.name.trim()) {
      error(t('validation.nameRequired', { defaultValue: 'Material name is required.' }));
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

    if (Number.isNaN(stockKg) || stockKg < 0) {
      error('Stock must be a non-negative number.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: formValues.name.trim(),
        type: formValues.type,
        color: formValues.color,
        cost_per_kg: costPerKg,
        brand: formValues.brand.trim(),
        stock_kg: stockKg,
      };

      if (editingMaterial?.id) {
        const materialRef = doc(db, 'materials', editingMaterial.id);
        await updateDoc(materialRef, payload);
        success(t('toast.materialSaved', { defaultValue: 'Material saved.' }));
      } else {
        await addDoc(collection(db, 'materials'), {
          ...payload,
          company_id: companyId,
        });
        success(t('toast.materialSaved', { defaultValue: 'Material saved.' }));
      }

      closeFormModal();
      await loadMaterials();
    } catch (saveError) {
      console.error('[InventoryPage] Failed to save material', saveError);
      error(t('toast.saveFailed', { defaultValue: 'Failed to save.' }));
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
      success(t('toast.materialDeleted', { defaultValue: 'Material deleted.' }));
      closeDeleteModal();
      await loadMaterials();
    } catch (deleteError) {
      console.error('[InventoryPage] Failed to delete material', deleteError);
      error(t('toast.saveFailed', { defaultValue: 'Failed to save.' }));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Card title={t('inventory.title', { defaultValue: 'Inventory' })}>
        <p className="text-sm text-gray-600">Only administrators can manage inventory.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card title={t('inventory.title', { defaultValue: 'Inventory' })}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {t('inventory.description', { defaultValue: 'Manage your material inventory and stock levels.' })}
          </p>
          <Button onClick={handleOpenAddModal}>
            {t('settings.materials.add', { defaultValue: 'Add Material' })}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : materials.length === 0 ? (
          <p className="text-sm text-gray-600">
            {t('inventory.noMaterials', { defaultValue: 'No materials in inventory. Add your first material to get started.' })}
          </p>
        ) : (
          <Table columns={columns} data={materials} />
        )}
      </Card>

      <Modal
        isOpen={isFormModalOpen}
        onClose={closeFormModal}
        title={editingMaterial
          ? t('settings.materials.edit', { defaultValue: 'Edit Material' })
          : t('settings.materials.add', { defaultValue: 'Add Material' })
        }
      >
        <div className="space-y-4">
          <Input
            id="material-name"
            label={t('settings.materials.name', { defaultValue: 'Name' })}
            value={formValues.name}
            onChange={handleInputChange('name')}
            placeholder="e.g. PLA Premium"
          />

          <Input
            id="material-brand"
            label={t('inventory.brand', { defaultValue: 'Brand' })}
            value={formValues.brand}
            onChange={handleInputChange('brand')}
            placeholder="e.g. eSUN, Bambu Lab, Hatchbox"
          />

          <Select
            id="material-type"
            label={t('settings.materials.type', { defaultValue: 'Type' })}
            value={formValues.type}
            onChange={handleInputChange('type')}
            options={MATERIAL_TYPE_OPTIONS}
          />

          <Input
            id="material-cost"
            label={t('settings.materials.costPerKg', { defaultValue: 'Cost per kg' })}
            type="number"
            min="0"
            step="0.01"
            value={formValues.cost_per_kg}
            onChange={handleInputChange('cost_per_kg')}
          />

          <Input
            id="material-stock"
            label={t('inventory.stockKg', { defaultValue: 'Stock (kg)' })}
            type="number"
            min="0"
            step="0.01"
            value={formValues.stock_kg}
            onChange={handleInputChange('stock_kg')}
            placeholder="e.g. 5.00"
          />

          <div>
            <label htmlFor="material-color" className="mb-1 block text-sm font-medium text-gray-700">
              {t('settings.materials.color', { defaultValue: 'Color' })}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="material-color"
                value={formValues.color || '#000000'}
                onChange={(event) => setFormValues({ ...formValues, color: event.target.value })}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300"
              />
              <span className="text-sm text-gray-500">{formValues.color || '#000000'}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={closeFormModal} disabled={saving}>
              {t('settings.materials.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button onClick={handleSaveMaterial} loading={saving}>
              {saving
                ? t('settings.materials.saving', { defaultValue: 'Saving...' })
                : t('settings.materials.save', { defaultValue: 'Save' })
              }
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDeleteModalOpen} onClose={closeDeleteModal} title={t('settings.materials.delete', { defaultValue: 'Delete Material' })}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {t('settings.materials.deleteConfirm', { defaultValue: 'Are you sure you want to delete' })}{' '}
            {pendingDeleteMaterial?.name || t('settings.materials.name', { defaultValue: 'Name' })}?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDeleteModal} disabled={saving}>
              {t('settings.materials.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="danger" onClick={handleDeleteMaterial} loading={saving}>
              {saving
                ? t('settings.materials.saving', { defaultValue: 'Saving...' })
                : t('settings.materials.delete', { defaultValue: 'Delete' })
              }
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
