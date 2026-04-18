import { calculateQuote, round2 } from '../pricingEngine';

describe('round2', () => {
  it('rounds down', () => {
    expect(round2(1.234)).toBe(1.23);
  });

  it('rounds up', () => {
    expect(round2(1.235)).toBe(1.24);
  });

  it('handles zero', () => {
    expect(round2(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(round2(-5.678)).toBe(-5.68);
  });

  it('keeps numbers with 2 decimals', () => {
    expect(round2(3.14)).toBe(3.14);
  });

  it('handles large numbers', () => {
    expect(round2(99999.999)).toBe(100000);
  });
});

describe('calculateQuote', () => {
  it('calculates the happy path breakdown correctly', () => {
    const result = calculateQuote({
      materials: [{ grams: 500, costPerKg: 20 }],
      printHours: 4,
      companyConfig: {
        kwhCost: 0.12,
        printerWattage: 200,
        hourlyAmortizationFee: 0.5,
        profitMargin: 0.3,
        failureMargin: 0.05,
      },
      extraCosts: [{ name: 'Packaging', amount: 5 }],
    });

    expect(result.materialCost).toBe(10.5);
    expect(result.electricityCost).toBe(0.1);
    expect(result.amortizationCost).toBe(2);
    expect(result.extraCostsTotal).toBe(5);
    expect(result.subtotal).toBe(17.6);
    expect(result.profitAmount).toBe(5.28);
    expect(result.totalPrice).toBe(22.88);
  });

  it('sets electricity and amortization to 0 when printHours is 0', () => {
    const result = calculateQuote({
      materials: [{ grams: 100, costPerKg: 20 }],
      printHours: 0,
      companyConfig: {
        kwhCost: 0.12,
        printerWattage: 200,
        hourlyAmortizationFee: 0.5,
        profitMargin: 0.3,
        failureMargin: 0.05,
      },
      extraCosts: [{ name: 'Packaging', amount: 5 }],
    });

    expect(result.electricityCost).toBe(0);
    expect(result.amortizationCost).toBe(0);
  });

  it('returns materialCost 0 for empty materials array', () => {
    const result = calculateQuote({
      materials: [],
      printHours: 2,
      companyConfig: {
        kwhCost: 0.12,
        printerWattage: 200,
        hourlyAmortizationFee: 0.5,
        profitMargin: 0.3,
        failureMargin: 0.05,
      },
      extraCosts: [{ name: 'Packaging', amount: 5 }],
    });

    expect(result.materialCost).toBe(0);
  });

  it('sums multiple materials correctly', () => {
    const result = calculateQuote({
      materials: [
        { grams: 100, costPerKg: 20 },
        { grams: 250, costPerKg: 30 },
        { grams: 50, costPerKg: 40 },
      ],
      printHours: 0,
      companyConfig: {
        kwhCost: 0.12,
        printerWattage: 200,
        hourlyAmortizationFee: 0.5,
        profitMargin: 0,
        failureMargin: 0,
      },
      extraCosts: [],
    });

    expect(result.materialCost).toBe(11.5);
  });

  it('applies 10 percent failure margin in material cost', () => {
    const result = calculateQuote({
      materials: [{ grams: 100, costPerKg: 20 }],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0,
        failureMargin: 0.1,
      },
      extraCosts: [],
    });

    expect(result.materialCost).toBe(2.2);
  });

  it('applies profit margin over subtotal', () => {
    const result = calculateQuote({
      materials: [],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0.3,
        failureMargin: 0,
      },
      extraCosts: [{ name: 'Base', amount: 100 }],
    });

    expect(result.subtotal).toBe(100);
    expect(result.profitAmount).toBe(30);
    expect(result.totalPrice).toBe(130);
  });

  it('keeps totalPrice equal to subtotal when profit margin is 0', () => {
    const result = calculateQuote({
      materials: [{ grams: 100, costPerKg: 20 }],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0,
        failureMargin: 0,
      },
      extraCosts: [],
    });

    expect(result.totalPrice).toBe(result.subtotal);
  });

  it('handles missing and empty extraCosts as zero total', () => {
    const missingExtraCostsResult = calculateQuote({
      materials: [{ grams: 100, costPerKg: 20 }],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0,
        failureMargin: 0,
      },
    });

    const emptyExtraCostsResult = calculateQuote({
      materials: [{ grams: 100, costPerKg: 20 }],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0,
        failureMargin: 0,
      },
      extraCosts: [],
    });

    expect(missingExtraCostsResult.extraCostsTotal).toBe(0);
    expect(emptyExtraCostsResult.extraCostsTotal).toBe(0);
    expect(missingExtraCostsResult.extraCosts).toEqual([]);
    expect(emptyExtraCostsResult.extraCosts).toEqual([]);
  });

  it('supports 200 percent profit margin', () => {
    const result = calculateQuote({
      materials: [],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 2,
        failureMargin: 0,
      },
      extraCosts: [{ name: 'Base', amount: 10 }],
    });

    expect(result.subtotal).toBe(10);
    expect(result.profitAmount).toBe(20);
    expect(result.totalPrice).toBe(30);
  });

  it('contains floating point precision issues through round2', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);

    const result = calculateQuote({
      materials: [],
      printHours: 0,
      companyConfig: {
        kwhCost: 0,
        printerWattage: 0,
        hourlyAmortizationFee: 0,
        profitMargin: 0,
        failureMargin: 0,
      },
      extraCosts: [
        { name: 'A', amount: 0.1 },
        { name: 'B', amount: 0.2 },
      ],
    });

    expect(result.extraCostsTotal).toBe(0.3);
    expect(result.subtotal).toBe(0.3);
    expect(result.totalPrice).toBe(0.3);
  });
});