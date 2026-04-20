import { useTranslation } from 'react-i18next';
import { Card } from './ui/Card';
import { formatCurrency } from '../lib/currency';

function BreakdownRow({ label, value, valueText, currency, muted = false, strong = false, large = false, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-700'} ${strong ? 'font-semibold text-gray-900' : ''}`}>
        {label}
      </span>
      <span className={`${large ? 'text-lg' : 'text-sm'} ${strong ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
        {typeof valueText === 'string' ? valueText : formatCurrency(value, currency)}
      </span>
    </div>
  );
}

export default function CostBreakdown({ breakdown, currency = 'USD' }) {
  const { t } = useTranslation();

  if (!breakdown) {
    return (
      <Card title={t('breakdown.title')}>
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
          {t('breakdown.emptyState')}
        </div>
      </Card>
    );
  }

  const profitMarginPercent = Number(breakdown.profitMarginPercent) || 0;
  const discountAmount = Number(breakdown.discountAmount) || 0;
  const discountType = breakdown.discount?.type;
  const discountValue = Number(breakdown.discount?.value) || 0;
  const taxRate = Number(breakdown.taxRate) || 0;
  const taxAmount = Number(breakdown.taxAmount) || 0;
  const extraCosts = Array.isArray(breakdown.extraCosts) ? breakdown.extraCosts : [];

  return (
    <Card title={t('breakdown.title')}>
      <div className="space-y-3">
        <BreakdownRow label={t('breakdown.materialCost')} value={breakdown.materialCost} currency={currency} />
        <BreakdownRow label={t('breakdown.electricityCost')} value={breakdown.electricityCost} currency={currency} />
        <BreakdownRow label={t('breakdown.amortizationCost')} value={breakdown.amortizationCost} currency={currency} />

        {extraCosts.map((extra, index) => (
          <BreakdownRow
            key={`${extra?.name || 'Extra'}-${index}`}
            label={extra?.name ? `${t('breakdown.extras')}: ${extra.name}` : `${t('breakdown.extras')} #${index + 1}`}
            value={extra?.amount}
            currency={currency}
            muted
          />
        ))}

        <BreakdownRow
          label={t('breakdown.subtotal')}
          value={breakdown.subtotal}
          currency={currency}
          strong
          className="border-t border-gray-200 pt-3"
        />

        <div className="flex items-center justify-between gap-4 text-sm text-gray-700">
          <span>{t('breakdown.profitMargin')} (+{profitMarginPercent.toFixed(2)}%)</span>
          <span>{formatCurrency(breakdown.profitAmount, currency)}</span>
        </div>

        {discountAmount > 0 && (
          <BreakdownRow
            label={t('breakdown.priceBeforeDiscount')}
            value={breakdown.priceBeforeDiscount}
            currency={currency}
          />
        )}

        {discountAmount > 0 && (
          <BreakdownRow
            label={
              discountType === 'percentage'
                ? `${t('breakdown.discount')} (${discountValue}%)`
                : t('breakdown.discountFixed')
            }
            valueText={`-${formatCurrency(breakdown.discountAmount, currency)}`}
            currency={currency}
          />
        )}

        {discountAmount > 0 && (
          <BreakdownRow
            label={t('breakdown.priceAfterDiscount')}
            value={breakdown.priceAfterDiscount}
            currency={currency}
          />
        )}

        {taxAmount > 0 && (
          <BreakdownRow
            label={`${t('breakdown.tax')} (${(taxRate * 100).toFixed(0)}%)`}
            value={breakdown.taxAmount}
            currency={currency}
          />
        )}

        <BreakdownRow
          label={t('breakdown.totalPrice')}
          value={breakdown.totalPrice}
          currency={currency}
          strong
          large
          className="border-t border-gray-200 pt-4"
        />
      </div>
    </Card>
  );
}
