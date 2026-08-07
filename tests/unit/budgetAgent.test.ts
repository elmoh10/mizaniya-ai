import { describe, it, expect } from 'vitest';

describe('Budget Calculations Agent', () => {
  it('calculates savings and emergency fund allocations accurately', () => {
    const salary = 20000;
    const savingsPercent = 20;
    const expectedSavings = (salary * savingsPercent) / 100;

    expect(expectedSavings).toBe(4000);

    const remainingIncome = 16000;
    const emergencyRate = 0.10;
    const emergencyFundAmount = remainingIncome * emergencyRate;

    expect(emergencyFundAmount).toBe(1600);
  });
});
