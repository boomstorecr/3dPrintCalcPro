export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function calculateQuote(input) {
  const materials = Array.isArray(input?.materials) ? input.materials : [];
  const extraCostsInput = Array.isArray(input?.extraCosts) ? input.extraCosts : [];
  const printHours = Number(input?.printHours) || 0;

  const companyConfig = input?.companyConfig || {};
  const kwhCost = Number(companyConfig.kwhCost) || 0;
  const printerWattage = Number(companyConfig.printerWattage) || 0;
  const hourlyAmortizationFee = Number(companyConfig.hourlyAmortizationFee) || 0;
  const profitMargin = Number(companyConfig.profitMargin) || 0;
  const failureMargin = Number(companyConfig.failureMargin) || 0;

  const materialCostRaw = materials.reduce((sum, material) => {
    const grams = Number(material?.grams) || 0;
    const costPerKg = Number(material?.costPerKg) || 0;
    const unitCostPerGram = costPerKg / 1000;

    return sum + grams * (1 + failureMargin) * unitCostPerGram;
  }, 0);

  const electricityCostRaw = printHours > 0
    ? (printHours * printerWattage / 1000) * kwhCost
    : 0;

  const amortizationCostRaw = printHours > 0
    ? printHours * hourlyAmortizationFee
    : 0;

  const extraCosts = extraCostsInput.map((item) => ({
    name: item?.name ?? "",
    amount: round2(Number(item?.amount) || 0),
  }));

  const extraCostsTotalRaw = extraCosts.reduce((sum, item) => sum + item.amount, 0);

  const materialCost = round2(materialCostRaw);
  const electricityCost = round2(electricityCostRaw);
  const amortizationCost = round2(amortizationCostRaw);
  const extraCostsTotal = round2(extraCostsTotalRaw);

  const subtotal = round2(materialCost + electricityCost + amortizationCost + extraCostsTotal);
  const profitAmount = round2(subtotal * profitMargin);
  const priceBeforeDiscount = round2(subtotal + profitAmount);
  const legacyDiscountPercent = Number(input?.discountPercent);
  const hasLegacyDiscountPercent = Number.isFinite(legacyDiscountPercent);
  const normalizedDiscount = input?.discount?.type === 'fixed' || input?.discount?.type === 'percentage'
    ? {
      type: input.discount.type,
      value: Number(input?.discount?.value) || 0,
    }
    : hasLegacyDiscountPercent
      ? {
        type: 'percentage',
        value: legacyDiscountPercent,
      }
      : {
        type: undefined,
        value: 0,
      };

  const discountAmountRaw = normalizedDiscount.type === 'fixed'
    ? Math.min(normalizedDiscount.value || 0, priceBeforeDiscount)
    : normalizedDiscount.type === 'percentage'
      ? priceBeforeDiscount * ((normalizedDiscount.value || 0) / 100)
      : 0;

  const discountAmount = round2(discountAmountRaw);
  const priceAfterDiscount = round2(Math.max(0, priceBeforeDiscount - discountAmount));
  const taxRate = Number(companyConfig.taxRate) || 0;
  const taxAmount = round2(priceAfterDiscount * taxRate);
  const totalPrice = round2(priceAfterDiscount + taxAmount);

  return {
    materialCost,
    electricityCost,
    amortizationCost,
    extraCosts,
    extraCostsTotal,
    subtotal,
    profitAmount,
    priceBeforeDiscount,
    discount: normalizedDiscount,
    discountAmount,
    priceAfterDiscount,
    taxRate,
    taxAmount,
    totalPrice,
  };
}
