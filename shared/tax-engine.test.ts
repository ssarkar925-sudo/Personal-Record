import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNewRegimeTax,
  computeOldRegimeTax,
  compareTaxRegimes,
  computeAdvanceTaxSchedule,
} from './tax-engine.ts';

describe('Indian Income Tax Engine', () => {
  it('New Regime gives ₹0 tax up to ₹7,75,000 for salaried (standard deduction ₹75k + 87A rebate)', () => {
    const income = {
      salaryIncomeMinor: 775_000 * 100,
      businessNetProfitMinor: 0,
      otherIncomeMinor: 0,
      stcgEquityMinor: 0,
      ltcgEquityMinor: 0,
    };
    const deductions = {
      isSalaried: true,
      section80cMinor: 0,
      section80dSelfMinor: 0,
      section80dParentsMinor: 0,
      section80ccd1bMinor: 0,
      section24bMinor: 0,
      section80ttaMinor: 0,
      hraExemptionMinor: 0,
    };

    const result = computeNewRegimeTax(income, deductions);
    assert.equal(result.standardDeductionMinor, 75_000 * 100);
    assert.equal(result.netTaxableIncomeMinor, 700_000 * 100);
    assert.equal(result.totalTaxLiabilityMinor, 0);
  });

  it('New Regime correctly computes slab tax for ₹15,00,000 gross salary', () => {
    // Gross: 15,00,000
    // Standard deduction: 75,000
    // Taxable: 14,25,000
    // Slabs:
    // 0 - 3L: 0
    // 3L - 7L (4L @ 5%): 20,000
    // 7L - 10L (3L @ 10%): 30,000
    // 10L - 12L (2L @ 15%): 30,000
    // 12L - 14.25L (2.25L @ 20%): 45,000
    // Base Tax: 1,25,000
    // Cess (4%): 5,000
    // Total Tax: 1,30,000
    const income = {
      salaryIncomeMinor: 1_500_000 * 100,
      businessNetProfitMinor: 0,
      otherIncomeMinor: 0,
      stcgEquityMinor: 0,
      ltcgEquityMinor: 0,
    };
    const deductions = {
      isSalaried: true,
      section80cMinor: 0,
      section80dSelfMinor: 0,
      section80dParentsMinor: 0,
      section80ccd1bMinor: 0,
      section24bMinor: 0,
      section80ttaMinor: 0,
      hraExemptionMinor: 0,
    };

    const result = computeNewRegimeTax(income, deductions);
    assert.equal(result.netTaxableIncomeMinor, 1_425_000 * 100);
    assert.equal(result.slabTaxMinor, 125_000 * 100);
    assert.equal(result.cessMinor, 5_000 * 100);
    assert.equal(result.totalTaxLiabilityMinor, 130_000 * 100);
  });

  it('Old Regime respects deduction caps and computes correct tax', () => {
    // Gross: 12,00,000
    // Standard deduction: 50,000
    // 80C: 1,50,000 (claims 2,00,000 capped at 1,50,000)
    // 80D: 25,000 (claims 30,000 capped at 25,000)
    // 24b: 2,00,000 (home loan interest)
    // Total deductions: 50k + 150k + 25k + 200k = 4,25,000
    // Net Taxable: 7,75,000
    // Slabs:
    // 0 - 2.5L: 0
    // 2.5L - 5L (2.5L @ 5%): 12,500
    // 5L - 7.75L (2.75L @ 20%): 55,000
    // Base Tax: 67,500
    // Cess (4%): 2,700
    // Total Tax: 70,200
    const income = {
      salaryIncomeMinor: 1_200_000 * 100,
      businessNetProfitMinor: 0,
      otherIncomeMinor: 0,
      stcgEquityMinor: 0,
      ltcgEquityMinor: 0,
    };
    const deductions = {
      isSalaried: true,
      section80cMinor: 200_000 * 100,
      section80dSelfMinor: 30_000 * 100,
      section80dParentsMinor: 0,
      section80ccd1bMinor: 0,
      section24bMinor: 200_000 * 100,
      section80ttaMinor: 0,
      hraExemptionMinor: 0,
    };

    const result = computeOldRegimeTax(income, deductions);
    assert.equal(result.standardDeductionMinor, 50_000 * 100);
    assert.equal(result.chapterVIAClaimsMinor, 375_000 * 100);
    assert.equal(result.netTaxableIncomeMinor, 775_000 * 100);
    assert.equal(result.slabTaxMinor, 67_500 * 100);
    assert.equal(result.cessMinor, 2_700 * 100);
    assert.equal(result.totalTaxLiabilityMinor, 70_200 * 100);
  });

  it('Compares regimes accurately and recommends optimal choice', () => {
    // If user has minimal deductions, New Regime is better
    const income = {
      salaryIncomeMinor: 1_200_000 * 100,
      businessNetProfitMinor: 0,
      otherIncomeMinor: 0,
      stcgEquityMinor: 0,
      ltcgEquityMinor: 0,
    };
    const minimalDeductions = {
      isSalaried: true,
      section80cMinor: 50_000 * 100,
      section80dSelfMinor: 10_000 * 100,
      section80dParentsMinor: 0,
      section80ccd1bMinor: 0,
      section24bMinor: 0,
      section80ttaMinor: 0,
      hraExemptionMinor: 0,
    };

    const comp = compareTaxRegimes(income, minimalDeductions);
    assert.equal(comp.recommendedRegime, 'new');
    assert.ok(comp.savingsMinor > 0);
  });

  it('Advance Tax schedule partitions tax liability across 4 quarters', () => {
    const annualTax = 100_000 * 100;
    const schedule = computeAdvanceTaxSchedule(annualTax, 2026, '2026-07-01');

    assert.equal(schedule.length, 4);
    assert.equal(schedule[0].quarter, 'Q1');
    assert.equal(schedule[0].cumulativeTargetMinor, 15_000 * 100);
    assert.equal(schedule[0].status, 'overdue'); // July 1 is past June 15

    assert.equal(schedule[1].quarter, 'Q2');
    assert.equal(schedule[1].cumulativeTargetMinor, 45_000 * 100);
    assert.equal(schedule[1].status, 'upcoming'); // Sept 15 is upcoming
  });
});
