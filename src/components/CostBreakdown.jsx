import { Card } from './ui/Card';

function formatCurrency(value, currency) {
  const amount = Number(value) || 0;

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function BreakdownRow({ label, value, currency, muted = false, strong = false, large = false, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${className}`}>
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-gray-700'} ${strong ? 'font-semibold text-gray-900' : ''}`}>
        {label}
      </span>
      <span className={`${large ? 'text-lg' : 'text-sm'} ${strong ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
        {formatCurrency(value, currency)}
      </span>
    </div>
  );
}

export default function CostBreakdown({ breakdown, currency = 'USD' }) {
  if (!breakdown) {
    return (
      <Card title="Live Cost Breakdown">
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-sm text-gray-500">
          Add items to see cost breakdown
        </div>
      </Card>
    );
  }

  const profitMarginPercent = Number(breakdown.profitMarginPercent) || 0;
  const extraCosts = Array.isArray(breakdown.extraCosts) ? breakdown.extraCosts : [];

  return (
    <Card title="Live Cost Breakdown">
      <div className="space-y-3">
        <BreakdownRow label="Material Cost" value={breakdown.materialCost} currency={currency} />
        <BreakdownRow label="Electricity Cost" value={breakdown.electricityCost} currency={currency} />
        <BreakdownRow label="Amortization Cost" value={breakdown.amortizationCost} currency={currency} />

        {extraCosts.map((extra, index) => (
          <BreakdownRow
            key={`${extra?.name || 'Extra'}-${index}`}
            label={extra?.name ? `Extra: ${extra.name}` : `Extra #${index + 1}`}
            value={extra?.amount}
            currency={currency}
            muted
          />
        ))}

        <BreakdownRow label="Extras Total" value={breakdown.extraCostsTotal} currency={currency} muted />

        <BreakdownRow
          label="Subtotal"
          value={breakdown.subtotal}
          currency={currency}
          strong
          className="border-t border-gray-200 pt-3"
        />

        <div className="flex items-center justify-between gap-4 text-sm text-gray-700">
          <span>Profit Margin (+{profitMarginPercent.toFixed(2)}%)</span>
          <span>{formatCurrency(breakdown.profitAmount, currency)}</span>
        </div>

        <BreakdownRow
          label="Total Price"
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
