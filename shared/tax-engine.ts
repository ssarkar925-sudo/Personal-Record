/**
 * Indian Income Tax Engine (FY 2024-25, FY 2025-26 & FY 2026-27)
 * Finance Act 2024 updated slabs, Section 115BAC New Regime vs Old Regime comparison,
 * deductions optimizer (80C, 80D, 80CCD, 24b, 80TTA/TTB, HRA), and Advance Tax schedule.
 */

export type TaxRegime = 'new' | 'old';

export interface TaxDeductionInputs {
  isSalaried: boolean;
  isSeniorCitizen?: boolean;
  isParentsSenior?: boolean;
  section80cMinor: number;
  section80dSelfMinor: number;
  section80dParentsMinor: number;
  section80ccd1bMinor: number;
  section24bMinor: number;
  section80ttaMinor: number;
  hraExemptionMinor: number;
  otherDeductionsMinor?: number;
}

export interface TaxIncomeInputs {
  salaryIncomeMinor: number;
  businessNetProfitMinor: number;
  otherIncomeMinor: number;
  stcgEquityMinor: number;
  ltcgEquityMinor: number;
}

export interface TaxSlabBreakdown {
  slabLabel: string;
  ratePct: number;
  taxableInSlabMinor: number;
  taxAmountMinor: number;
}

export interface TaxRegimeResult {
  regime: TaxRegime;
  grossTotalIncomeMinor: number;
  standardDeductionMinor: number;
  chapterVIAClaimsMinor: number;
  totalDeductionsMinor: number;
  netTaxableIncomeMinor: number;
  normalTaxableIncomeMinor: number;
  slabTaxMinor: number;
  stcgTaxMinor: number;
  ltcgTaxMinor: number;
  taxBeforeRebateMinor: number;
  rebate87aMinor: number;
  taxAfterRebateMinor: number;
  cessMinor: number;
  totalTaxLiabilityMinor: number;
  effectiveTaxRatePct: number;
  slabs: TaxSlabBreakdown[];
}

export interface TaxComparisonResult {
  newRegime: TaxRegimeResult;
  oldRegime: TaxRegimeResult;
  recommendedRegime: 'new' | 'old' | 'equal';
  savingsMinor: number;
  summaryText: string;
}

export interface AdvanceTaxInstallment {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  title: string;
  dueDate: string;
  cumulativePct: number;
  cumulativeTargetMinor: number;
  installmentTargetMinor: number;
  status: 'paid' | 'upcoming' | 'overdue';
}

// Caps in minor units (paise)
export const DEDUCTION_CAPS = {
  // New Regime Standard Deduction: ₹75,000 as per Finance Act 2024
  NEW_STANDARD_DEDUCTION_MINOR: 75_000 * 100,
  // Old Regime Standard Deduction: ₹50,000
  OLD_STANDARD_DEDUCTION_MINOR: 50_000 * 100,
  // 80C Cap: ₹1,50,000
  SEC_80C_MAX_MINOR: 150_000 * 100,
  // 80D Self: ₹25,000 (non-senior) / ₹50,000 (senior)
  SEC_80D_SELF_NON_SENIOR_MINOR: 25_000 * 100,
  SEC_80D_SELF_SENIOR_MINOR: 50_000 * 100,
  // 80D Parents: ₹25,000 (non-senior) / ₹50,000 (senior)
  SEC_80D_PARENTS_NON_SENIOR_MINOR: 25_000 * 100,
  SEC_80D_PARENTS_SENIOR_MINOR: 50_000 * 100,
  // 80CCD(1B) NPS Cap: ₹50,000
  SEC_80CCD1B_MAX_MINOR: 50_000 * 100,
  // Section 24(b) Home loan interest: ₹2,00,000
  SEC_24B_MAX_MINOR: 200_000 * 100,
  // 80TTA / 80TTB
  SEC_80TTA_MAX_MINOR: 10_000 * 100,
  SEC_80TTB_MAX_MINOR: 50_000 * 100,
  // Equity LTCG exemption: ₹1,25,000 as per Finance Act 2024
  LTCG_EXEMPTION_MINOR: 125_000 * 100,
};

/**
 * Computes Indian Income Tax under the New Tax Regime (Section 115BAC)
 * Finance Act 2024 slabs & rules.
 */
export function computeNewRegimeTax(
  income: TaxIncomeInputs,
  deductions: TaxDeductionInputs,
): TaxRegimeResult {
  const grossTotalIncomeMinor =
    Math.max(0, income.salaryIncomeMinor) +
    Math.max(0, income.businessNetProfitMinor) +
    Math.max(0, income.otherIncomeMinor) +
    Math.max(0, income.stcgEquityMinor) +
    Math.max(0, income.ltcgEquityMinor);

  // New regime allows standard deduction of ₹75,000 for salaried employees
  const standardDeductionMinor = deductions.isSalaried
    ? Math.min(Math.max(0, income.salaryIncomeMinor), DEDUCTION_CAPS.NEW_STANDARD_DEDUCTION_MINOR)
    : 0;

  // Chapter VI-A deductions (80C, 80D, 80CCD1B, 24b) are NOT allowed under Section 115BAC
  const chapterVIAClaimsMinor = 0;
  const totalDeductionsMinor = standardDeductionMinor;

  const netTaxableIncomeMinor = Math.max(0, grossTotalIncomeMinor - totalDeductionsMinor);

  // Special rate capital gains separated
  const stcgMinor = Math.max(0, income.stcgEquityMinor);
  const ltcgGrossMinor = Math.max(0, income.ltcgEquityMinor);
  const ltcgTaxableMinor = Math.max(0, ltcgGrossMinor - DEDUCTION_CAPS.LTCG_EXEMPTION_MINOR);

  // Normal income subject to slabs
  const specialIncomeMinor = stcgMinor + ltcgGrossMinor;
  const normalGrossMinor = Math.max(0, grossTotalIncomeMinor - specialIncomeMinor);
  const normalTaxableIncomeMinor = Math.max(0, normalGrossMinor - totalDeductionsMinor);

  // New Regime Slabs (Finance Act 2024):
  // 0 - 3L: 0%
  // 3L - 7L: 5% (max ₹20,000)
  // 7L - 10L: 10% (max ₹30,000)
  // 10L - 12L: 15% (max ₹30,000)
  // 12L - 15L: 20% (max ₹60,000)
  // > 15L: 30%
  const slabs: TaxSlabBreakdown[] = [];
  let remaining = normalTaxableIncomeMinor;
  let slabTaxMinor = 0;

  // Slab 1: 0 to 3,00,000 (0%)
  const s1Cap = 300_000 * 100;
  const s1Amount = Math.min(remaining, s1Cap);
  slabs.push({ slabLabel: '₹0 - ₹3,00,000', ratePct: 0, taxableInSlabMinor: s1Amount, taxAmountMinor: 0 });
  remaining = Math.max(0, remaining - s1Cap);

  // Slab 2: 3,00,001 to 7,00,000 (5%)
  const s2Cap = 400_000 * 100;
  const s2Amount = Math.min(remaining, s2Cap);
  const s2Tax = Math.round(s2Amount * 0.05);
  slabTaxMinor += s2Tax;
  slabs.push({ slabLabel: '₹3,00,001 - ₹7,00,000', ratePct: 5, taxableInSlabMinor: s2Amount, taxAmountMinor: s2Tax });
  remaining = Math.max(0, remaining - s2Cap);

  // Slab 3: 7,00,001 to 10,00,000 (10%)
  const s3Cap = 300_000 * 100;
  const s3Amount = Math.min(remaining, s3Cap);
  const s3Tax = Math.round(s3Amount * 0.10);
  slabTaxMinor += s3Tax;
  slabs.push({ slabLabel: '₹7,00,001 - ₹10,00,000', ratePct: 10, taxableInSlabMinor: s3Amount, taxAmountMinor: s3Tax });
  remaining = Math.max(0, remaining - s3Cap);

  // Slab 4: 10,00,001 to 12,00,000 (15%)
  const s4Cap = 200_000 * 100;
  const s4Amount = Math.min(remaining, s4Cap);
  const s4Tax = Math.round(s4Amount * 0.15);
  slabTaxMinor += s4Tax;
  slabs.push({ slabLabel: '₹10,00,001 - ₹12,00,000', ratePct: 15, taxableInSlabMinor: s4Amount, taxAmountMinor: s4Tax });
  remaining = Math.max(0, remaining - s4Cap);

  // Slab 5: 12,00,001 to 15,00,000 (20%)
  const s5Cap = 300_000 * 100;
  const s5Amount = Math.min(remaining, s5Cap);
  const s5Tax = Math.round(s5Amount * 0.20);
  slabTaxMinor += s5Tax;
  slabs.push({ slabLabel: '₹12,00,001 - ₹15,00,000', ratePct: 20, taxableInSlabMinor: s5Amount, taxAmountMinor: s5Tax });
  remaining = Math.max(0, remaining - s5Cap);

  // Slab 6: Above 15,00,000 (30%)
  if (remaining > 0) {
    const s6Tax = Math.round(remaining * 0.30);
    slabTaxMinor += s6Tax;
    slabs.push({ slabLabel: 'Above ₹15,00,000', ratePct: 30, taxableInSlabMinor: remaining, taxAmountMinor: s6Tax });
  } else {
    slabs.push({ slabLabel: 'Above ₹15,00,000', ratePct: 30, taxableInSlabMinor: 0, taxAmountMinor: 0 });
  }

  // Capital gains tax:
  // Equity STCG u/s 111A = 20% (Finance Act 2024)
  const stcgTaxMinor = Math.round(stcgMinor * 0.20);
  // Equity LTCG u/s 112A = 12.5% on excess over ₹1.25L (Finance Act 2024)
  const ltcgTaxMinor = Math.round(ltcgTaxableMinor * 0.125);

  const taxBeforeRebateMinor = slabTaxMinor + stcgTaxMinor + ltcgTaxMinor;

  // Section 87A Rebate in New Regime:
  // If Total Taxable Income <= ₹7,00,000, rebate of 100% up to ₹25,000 (Tax = 0)
  // Marginal relief: if taxable income is slightly above ₹7,00,000, tax cannot exceed income over ₹7,00,000
  let rebate87aMinor = 0;
  let taxAfterRebateMinor = taxBeforeRebateMinor;

  const threshold7LMinor = 700_000 * 100;
  if (netTaxableIncomeMinor <= threshold7LMinor) {
    rebate87aMinor = taxBeforeRebateMinor;
    taxAfterRebateMinor = 0;
  } else {
    // Marginal relief check
    const excessOver7L = netTaxableIncomeMinor - threshold7LMinor;
    if (taxBeforeRebateMinor > excessOver7L) {
      rebate87aMinor = taxBeforeRebateMinor - excessOver7L;
      taxAfterRebateMinor = excessOver7L;
    }
  }

  // 4% Health & Education Cess
  const cessMinor = Math.round(taxAfterRebateMinor * 0.04);
  const totalTaxLiabilityMinor = taxAfterRebateMinor + cessMinor;

  const effectiveTaxRatePct = grossTotalIncomeMinor > 0
    ? Number(((totalTaxLiabilityMinor / grossTotalIncomeMinor) * 100).toFixed(2))
    : 0;

  return {
    regime: 'new',
    grossTotalIncomeMinor,
    standardDeductionMinor,
    chapterVIAClaimsMinor,
    totalDeductionsMinor,
    netTaxableIncomeMinor,
    normalTaxableIncomeMinor,
    slabTaxMinor,
    stcgTaxMinor,
    ltcgTaxMinor,
    taxBeforeRebateMinor,
    rebate87aMinor,
    taxAfterRebateMinor,
    cessMinor,
    totalTaxLiabilityMinor,
    effectiveTaxRatePct,
    slabs,
  };
}

/**
 * Computes Indian Income Tax under the Old Tax Regime
 * with full Chapter VI-A deductions and Sec 24(b) set-off.
 */
export function computeOldRegimeTax(
  income: TaxIncomeInputs,
  deductions: TaxDeductionInputs,
): TaxRegimeResult {
  const grossTotalIncomeMinor =
    Math.max(0, income.salaryIncomeMinor) +
    Math.max(0, income.businessNetProfitMinor) +
    Math.max(0, income.otherIncomeMinor) +
    Math.max(0, income.stcgEquityMinor) +
    Math.max(0, income.ltcgEquityMinor);

  // Standard deduction: ₹50,000 for salaried
  const standardDeductionMinor = deductions.isSalaried
    ? Math.min(Math.max(0, income.salaryIncomeMinor), DEDUCTION_CAPS.OLD_STANDARD_DEDUCTION_MINOR)
    : 0;

  // Chapter VI-A deductions
  const sec80cClaimMinor = Math.min(Math.max(0, deductions.section80cMinor), DEDUCTION_CAPS.SEC_80C_MAX_MINOR);

  const max80dSelf = deductions.isSeniorCitizen
    ? DEDUCTION_CAPS.SEC_80D_SELF_SENIOR_MINOR
    : DEDUCTION_CAPS.SEC_80D_SELF_NON_SENIOR_MINOR;
  const sec80dSelfMinor = Math.min(Math.max(0, deductions.section80dSelfMinor), max80dSelf);

  const max80dParents = deductions.isParentsSenior
    ? DEDUCTION_CAPS.SEC_80D_PARENTS_SENIOR_MINOR
    : DEDUCTION_CAPS.SEC_80D_PARENTS_NON_SENIOR_MINOR;
  const sec80dParentsMinor = Math.min(Math.max(0, deductions.section80dParentsMinor), max80dParents);

  const sec80ccd1bMinor = Math.min(Math.max(0, deductions.section80ccd1bMinor), DEDUCTION_CAPS.SEC_80CCD1B_MAX_MINOR);
  const sec24bMinor = Math.min(Math.max(0, deductions.section24bMinor), DEDUCTION_CAPS.SEC_24B_MAX_MINOR);

  const max80tta = deductions.isSeniorCitizen
    ? DEDUCTION_CAPS.SEC_80TTB_MAX_MINOR
    : DEDUCTION_CAPS.SEC_80TTA_MAX_MINOR;
  const sec80ttaMinor = Math.min(Math.max(0, deductions.section80ttaMinor), max80tta);

  const hraExemptionMinor = Math.max(0, deductions.hraExemptionMinor);
  const otherDeductionsMinor = Math.max(0, deductions.otherDeductionsMinor ?? 0);

  const chapterVIAClaimsMinor =
    sec80cClaimMinor +
    sec80dSelfMinor +
    sec80dParentsMinor +
    sec80ccd1bMinor +
    sec24bMinor +
    sec80ttaMinor +
    hraExemptionMinor +
    otherDeductionsMinor;

  const totalDeductionsMinor = standardDeductionMinor + chapterVIAClaimsMinor;

  const netTaxableIncomeMinor = Math.max(0, grossTotalIncomeMinor - totalDeductionsMinor);

  // Capital gains
  const stcgMinor = Math.max(0, income.stcgEquityMinor);
  const ltcgGrossMinor = Math.max(0, income.ltcgEquityMinor);
  const ltcgTaxableMinor = Math.max(0, ltcgGrossMinor - DEDUCTION_CAPS.LTCG_EXEMPTION_MINOR);

  const specialIncomeMinor = stcgMinor + ltcgGrossMinor;
  const normalGrossMinor = Math.max(0, grossTotalIncomeMinor - specialIncomeMinor);
  const normalTaxableIncomeMinor = Math.max(0, normalGrossMinor - totalDeductionsMinor);

  // Old Regime Slabs:
  // 0 - 2.5L: 0%
  // 2.5L - 5L: 5% (max ₹12,500)
  // 5L - 10L: 20% (max ₹1,00,000)
  // > 10L: 30%
  const slabs: TaxSlabBreakdown[] = [];
  let remaining = normalTaxableIncomeMinor;
  let slabTaxMinor = 0;

  // Slab 1: 0 to 2,50,000 (0%)
  const s1Cap = (deductions.isSeniorCitizen ? 300_000 : 250_000) * 100;
  const s1Amount = Math.min(remaining, s1Cap);
  slabs.push({
    slabLabel: deductions.isSeniorCitizen ? '₹0 - ₹3,00,000 (Senior)' : '₹0 - ₹2,50,000',
    ratePct: 0,
    taxableInSlabMinor: s1Amount,
    taxAmountMinor: 0,
  });
  remaining = Math.max(0, remaining - s1Cap);

  // Slab 2: 2,50,001 to 5,00,000 (5%)
  const s2Cap = (500_000 * 100) - s1Cap;
  const s2Amount = Math.min(remaining, s2Cap);
  const s2Tax = Math.round(s2Amount * 0.05);
  slabTaxMinor += s2Tax;
  slabs.push({
    slabLabel: deductions.isSeniorCitizen ? '₹3,00,001 - ₹5,00,000' : '₹2,50,001 - ₹5,00,000',
    ratePct: 5,
    taxableInSlabMinor: s2Amount,
    taxAmountMinor: s2Tax,
  });
  remaining = Math.max(0, remaining - s2Cap);

  // Slab 3: 5,00,001 to 10,00,000 (20%)
  const s3Cap = 500_000 * 100;
  const s3Amount = Math.min(remaining, s3Cap);
  const s3Tax = Math.round(s3Amount * 0.20);
  slabTaxMinor += s3Tax;
  slabs.push({ slabLabel: '₹5,00,001 - ₹10,00,000', ratePct: 20, taxableInSlabMinor: s3Amount, taxAmountMinor: s3Tax });
  remaining = Math.max(0, remaining - s3Cap);

  // Slab 4: Above 10,00,000 (30%)
  if (remaining > 0) {
    const s4Tax = Math.round(remaining * 0.30);
    slabTaxMinor += s4Tax;
    slabs.push({ slabLabel: 'Above ₹10,00,000', ratePct: 30, taxableInSlabMinor: remaining, taxAmountMinor: s4Tax });
  } else {
    slabs.push({ slabLabel: 'Above ₹10,00,000', ratePct: 30, taxableInSlabMinor: 0, taxAmountMinor: 0 });
  }

  // Capital gains tax:
  const stcgTaxMinor = Math.round(stcgMinor * 0.20);
  const ltcgTaxMinor = Math.round(ltcgTaxableMinor * 0.125);

  const taxBeforeRebateMinor = slabTaxMinor + stcgTaxMinor + ltcgTaxMinor;

  // Section 87A Rebate in Old Regime:
  // If Total Taxable Income <= ₹5,00,000, 100% rebate up to ₹12,500 (Tax = 0)
  let rebate87aMinor = 0;
  let taxAfterRebateMinor = taxBeforeRebateMinor;
  if (netTaxableIncomeMinor <= 500_000 * 100) {
    rebate87aMinor = taxBeforeRebateMinor;
    taxAfterRebateMinor = 0;
  }

  // 4% Health & Education Cess
  const cessMinor = Math.round(taxAfterRebateMinor * 0.04);
  const totalTaxLiabilityMinor = taxAfterRebateMinor + cessMinor;

  const effectiveTaxRatePct = grossTotalIncomeMinor > 0
    ? Number(((totalTaxLiabilityMinor / grossTotalIncomeMinor) * 100).toFixed(2))
    : 0;

  return {
    regime: 'old',
    grossTotalIncomeMinor,
    standardDeductionMinor,
    chapterVIAClaimsMinor,
    totalDeductionsMinor,
    netTaxableIncomeMinor,
    normalTaxableIncomeMinor,
    slabTaxMinor,
    stcgTaxMinor,
    ltcgTaxMinor,
    taxBeforeRebateMinor,
    rebate87aMinor,
    taxAfterRebateMinor,
    cessMinor,
    totalTaxLiabilityMinor,
    effectiveTaxRatePct,
    slabs,
  };
}

/**
 * Compare New vs Old Tax Regimes and recommend the optimal choice.
 */
export function compareTaxRegimes(
  income: TaxIncomeInputs,
  deductions: TaxDeductionInputs,
): TaxComparisonResult {
  const newRegime = computeNewRegimeTax(income, deductions);
  const oldRegime = computeOldRegimeTax(income, deductions);

  const diffMinor = oldRegime.totalTaxLiabilityMinor - newRegime.totalTaxLiabilityMinor;

  let recommendedRegime: 'new' | 'old' | 'equal' = 'equal';
  let savingsMinor = 0;
  let summaryText = '';

  if (diffMinor > 0) {
    recommendedRegime = 'new';
    savingsMinor = diffMinor;
    summaryText = `New Tax Regime saves you ₹${Math.round(savingsMinor / 100).toLocaleString('en-IN')}!`;
  } else if (diffMinor < 0) {
    recommendedRegime = 'old';
    savingsMinor = Math.abs(diffMinor);
    summaryText = `Old Tax Regime saves you ₹${Math.round(savingsMinor / 100).toLocaleString('en-IN')} thanks to high deductions!`;
  } else {
    recommendedRegime = 'equal';
    savingsMinor = 0;
    summaryText = 'Tax liability is identical under both regimes.';
  }

  return {
    newRegime,
    oldRegime,
    recommendedRegime,
    savingsMinor,
    summaryText,
  };
}

/**
 * Compute the 4 Advance Tax Installments (Section 208/211)
 * Based on total annual tax liability and reference date.
 */
export function computeAdvanceTaxSchedule(
  annualTaxMinor: number,
  fyStartYear: number,
  refDate: string,
): AdvanceTaxInstallment[] {
  // Installments:
  // Q1: Jun 15 (15%)
  // Q2: Sep 15 (45%)
  // Q3: Dec 15 (75%)
  // Q4: Mar 15 (100%)
  const q1Date = `${fyStartYear}-06-15`;
  const q2Date = `${fyStartYear}-09-15`;
  const q3Date = `${fyStartYear}-12-15`;
  const q4Date = `${fyStartYear + 1}-03-15`;

  const q1Cum = Math.round(annualTaxMinor * 0.15);
  const q2Cum = Math.round(annualTaxMinor * 0.45);
  const q3Cum = Math.round(annualTaxMinor * 0.75);
  const q4Cum = annualTaxMinor;

  const determineStatus = (dueDate: string): 'paid' | 'upcoming' | 'overdue' => {
    if (refDate > dueDate) return 'overdue';
    return 'upcoming';
  };

  return [
    {
      quarter: 'Q1',
      title: '1st Installment (15%)',
      dueDate: q1Date,
      cumulativePct: 15,
      cumulativeTargetMinor: q1Cum,
      installmentTargetMinor: q1Cum,
      status: determineStatus(q1Date),
    },
    {
      quarter: 'Q2',
      title: '2nd Installment (45%)',
      dueDate: q2Date,
      cumulativePct: 45,
      cumulativeTargetMinor: q2Cum,
      installmentTargetMinor: q2Cum - q1Cum,
      status: determineStatus(q2Date),
    },
    {
      quarter: 'Q3',
      title: '3rd Installment (75%)',
      dueDate: q3Date,
      cumulativePct: 75,
      cumulativeTargetMinor: q3Cum,
      installmentTargetMinor: q3Cum - q2Cum,
      status: determineStatus(q3Date),
    },
    {
      quarter: 'Q4',
      title: '4th Installment (100%)',
      dueDate: q4Date,
      cumulativePct: 100,
      cumulativeTargetMinor: q4Cum,
      installmentTargetMinor: q4Cum - q3Cum,
      status: determineStatus(q4Date),
    },
  ];
}
