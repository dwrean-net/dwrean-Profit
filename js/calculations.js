/* dwrean Profit — pure business calculations. All amounts are in EUR. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DwreanProfitCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';
  const n = x => Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0;
  const clamp = (x, min, max) => Math.min(max, Math.max(min, Number(x) || 0));

  // Official 2026 individual business-income bracket rates; not a tax return.
  // https://minfin.gov.gr/forologiki-politiki/forologikos-odigos/forologia-eisodimatos/
  function taxRates2026(ageGroup = 'over30', children = 0) {
    const k = clamp(Math.floor(n(children)), 0, 20);
    const second = k === 0 ? 20 : k === 1 ? 18 : k === 2 ? 16 : k === 3 ? 9 : 0;
    const third = k <= 2 ? 26 - 2 * k : k === 3 ? 20 : k === 4 ? 18 : Math.max(0, 18 - 2 * (k - 4));
    const rates = [k >= 4 ? 0 : 9, second, third, 34, 39, 44];
    if (ageGroup === 'under26') { rates[0] = 0; rates[1] = 0; }
    if (ageGroup === '26to30') { rates[1] = Math.min(rates[1], 9); }
    return rates.map(rate => rate / 100);
  }

  function incomeTax2026(annualTaxable, ageGroup = 'over30', children = 0) {
    let remaining = n(annualTaxable);
    const rates = taxRates2026(ageGroup, children);
    const widths = [10000, 10000, 10000, 10000, 20000, Infinity];
    let tax = 0;
    for (let i = 0; i < widths.length && remaining > 0; i++) {
      const taxable = Math.min(remaining, widths[i]);
      tax += taxable * rates[i];
      remaining -= taxable;
    }
    return Math.round((tax + Number.EPSILON) * 100) / 100;
  }

  function normalizeInput(data = {}) {
    const expenses = Array.isArray(data.expenses) ? data.expenses.slice(0, 100).map((x, i) => ({
      id: String(x.id || `exp-${i}`),
      name: String(x.name || 'Έξοδο').slice(0, 80),
      amount: clamp(x.amount, 0, 1e9),
      vatRate: [0, 4, 6, 9, 13, 17, 24].includes(Number(x.vatRate)) ? Number(x.vatRate) : 24,
      vatDeductible: Boolean(x.vatDeductible),
      taxDeductible: x.taxDeductible !== false
    })) : [];
    return {
      revenue: clamp(data.revenue, 0, 1e9),
      revenueMode: data.revenueMode === 'gross' ? 'gross' : 'net',
      vatRate: [0, 4, 6, 9, 13, 17, 24].includes(Number(data.vatRate)) ? Number(data.vatRate) : 24,
      vatExempt: Boolean(data.vatExempt),
      expenses,
      efka: clamp(data.efka, 0, 1e9),
      taxEnabled: data.taxEnabled !== false,
      otherIncome: Boolean(data.otherIncome),
      ageGroup: ['over30', '26to30', 'under26'].includes(data.ageGroup) ? data.ageGroup : 'over30',
      children: Math.floor(clamp(data.children, 0, 20)),
      minimumTaxable: clamp(data.minimumTaxable, 0, 1e9),
      firstTimeTax: Boolean(data.firstTimeTax),
      targetIncome: clamp(data.targetIncome, 0, 1e9),
      billableHours: clamp(data.billableHours, 0, 1e6),
      avgJobValue: clamp(data.avgJobValue, 0, 1e9),
      salesChange: clamp(data.salesChange, -50, 100),
      expenseChange: clamp(data.expenseChange, -30, 50)
    };
  }

  function calculate(raw, revenueOverride, expenseMultiplier = 1) {
    const x = normalizeInput(raw);
    const rate = x.vatExempt ? 0 : x.vatRate / 100;
    const revenueNet = revenueOverride === undefined
      ? (x.revenueMode === 'gross' ? x.revenue / (1 + rate) : x.revenue)
      : n(revenueOverride);
    const revenueGross = revenueNet * (1 + rate);
    let expenseCost = 0, deductibleExpenseCost = 0, inputVat = 0, paidInputVat = 0;
    const multiplier = clamp(expenseMultiplier, 0, 1000);
    const expenses = x.expenses.map(expense => {
      const amount = expense.amount * multiplier;
      const vat = amount * (expense.vatRate / 100);
      const deductibleVat = !x.vatExempt && expense.vatDeductible ? vat : 0;
      const cost = amount + vat - deductibleVat;
      expenseCost += cost;
      if (expense.taxDeductible) deductibleExpenseCost += cost;
      inputVat += deductibleVat;
      paidInputVat += vat;
      return { ...expense, amount, vat, deductibleVat, cost };
    });
    const outputVat = revenueNet * rate;
    const vatBalance = outputVat - inputVat;
    const preTax = revenueNet - expenseCost - x.efka;
    const annualAccountingProfit = preTax * 12;
    const annualTaxableCalculated = (revenueNet - deductibleExpenseCost - x.efka) * 12;
    const annualTaxable = Math.max(0, annualTaxableCalculated, x.minimumTaxable);
    const taxAvailable = x.taxEnabled && !x.otherIncome;
    const annualTax = taxAvailable ? incomeTax2026(annualTaxable, x.ageGroup, x.children) : null;
    const monthlyTax = annualTax === null ? null : annualTax / 12;
    const afterTax = taxAvailable ? preTax - monthlyTax : null;
    const displayedIncome = afterTax === null ? preTax : afterTax;
    const taxAdvance = annualTax === null ? null : (annualTax <= 30 ? 0 : annualTax * 0.55 * (x.firstTimeTax ? .5 : 1));
    return {
      ...x, revenueNet, revenueGross, expenses,
      expenseCost, deductibleExpenseCost, paidInputVat, inputVat, outputVat,
      vatBalance, vatDue: Math.max(0, vatBalance), vatCredit: Math.max(0, -vatBalance),
      preTax, annualAccountingProfit, annualTaxable, annualTaxableCalculated,
      taxAvailable, annualTax, monthlyTax, afterTax, displayedIncome,
      taxAdvance,
      margin: revenueNet ? displayedIncome / revenueNet * 100 : null,
      hourly: x.billableHours ? displayedIncome / x.billableHours : null
    };
  }

  function requiredTurnover(raw, target) {
    const x = normalizeInput(raw);
    const wanted = n(target === undefined ? x.targetIncome : target);
    function result(revenue) {
      const r = calculate(x, revenue);
      return r.displayedIncome;
    }
    let lo = 0, hi = Math.max(100, x.revenue * 2, x.efka + wanted + x.expenses.reduce((sum, e) => sum + e.amount * 1.24, 0));
    while (result(hi) < wanted && hi < 1e11) hi *= 2;
    if (result(hi) < wanted) return null;
    for (let i = 0; i < 85; i++) {
      const mid = (lo + hi) / 2;
      if (result(mid) >= wanted) hi = mid; else lo = mid;
    }
    return hi;
  }

  function withScenario(raw) {
    const x = normalizeInput(raw);
    const base = calculate(x);
    const changed = calculate(x, base.revenueNet * (1 + x.salesChange / 100), 1 + x.expenseChange / 100);
    return { base, changed, difference: changed.displayedIncome - base.displayedIncome };
  }

  return { n, clamp, normalizeInput, taxRates2026, incomeTax2026, calculate, requiredTurnover, withScenario };
});
