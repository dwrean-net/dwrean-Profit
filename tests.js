'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const C = require('./js/calculations.js');
function close(actual, expected, message) { assert.ok(Math.abs(actual - expected) <= .02, message+': expected '+expected+', received '+actual); }
const expense = (amount, rate, vatDeductible = true, taxDeductible = true) => ({ name:'Έξοδο',amount,vatRate:rate,vatDeductible,taxDeductible });
const common = { revenue: 4000, revenueMode:'net', vatRate:24, efka:260.77, expenses:[], taxEnabled:true, ageGroup:'over30', children:0, targetIncome:2000, billableHours:100, avgJobValue:200 };
test('2026 standard progressive tax brackets', () => {
  close(C.incomeTax2026(10000),900,'€10k');
  close(C.incomeTax2026(20000),2900,'€20k');
  close(C.incomeTax2026(30000),5500,'€30k');
  close(C.incomeTax2026(40000),8900,'€40k');
  close(C.incomeTax2026(60000),16700,'€60k');
  close(C.incomeTax2026(70000),21100,'€70k');
});
test('2026 children and age relief', () => {
  close(C.incomeTax2026(30000,'over30',1),900+1800+2400,'one child');
  close(C.incomeTax2026(30000,'over30',3),900+900+2000,'three children');
  close(C.incomeTax2026(20000,'over30',4),0,'four children');
  close(C.incomeTax2026(30000,'over30',5),1600,'five children');
  close(C.incomeTax2026(30000,'under26',0),2600,'up to 25');
  close(C.incomeTax2026(30000,'26to30',0),900+900+2600,'26 to 30');
  close(C.incomeTax2026(30000,'26to30',4),1800,'under 30 with 4 kids');
});
test('VAT net sales and recoverable input VAT', () => {
  const r = C.calculate({ ...common, expenses:[expense(100,24,true),expense(100,13,false)] });
  close(r.revenueNet,4000,'Net sales');close(r.revenueGross,4960,'Gross sales');
  close(r.inputVat,24,'Recoverable VAT');close(r.vatDue,936,'VAT balance');
  close(r.expenseCost,213,'Cost includes non-recoverable VAT');
  close(r.preTax,3526.23,'Pre-tax profit');
});
test('gross revenue strips VAT correctly', () => {
  const r=C.calculate({...common,revenue:1240,revenueMode:'gross',expenses:[],efka:0});
  close(r.revenueNet,1000,'Net'); close(r.outputVat,240,'Output VAT');
});
test('VAT exemption increases expense cost and disables VAT deductions', () => {
  const r=C.calculate({...common,vatExempt:true,expenses:[expense(100,24,true)],efka:0});
  close(r.outputVat,0,'Output');close(r.inputVat,0,'Recoverable input');close(r.expenseCost,124,'Expense');close(r.vatDue,0,'Due');
});
test('tax-deductibility controls tax base independently of business cost', () => {
  const a=C.calculate({...common,revenue:1000,efka:0,expenses:[expense(500,0,false,false)]});
  close(a.preTax,500,'Accounting profit');close(a.annualTaxable,12000,'Taxable profit');
});
test('minimum manually supplied taxable floor', () => {
  const r=C.calculate({...common,revenue:0,efka:0,minimumTaxable:12000});
  close(r.annualTaxable,12000,'minimum taxable');
  close(r.annualTax,1300,'tax based on floor');
  assert.ok(r.afterTax < 0);
});
test('suppresses misleading tax estimate for other income', () => {
  const r=C.calculate({...common,otherIncome:true});
  assert.equal(r.annualTax,null);assert.equal(r.afterTax,null);
  close(r.displayedIncome,r.preTax,'Pre-tax displayed');
});
test('tax advance is separate from profit and reduced first year', () => {
  const standard=C.calculate({...common});
  const first=C.calculate({...common,firstTimeTax:true});
  close(first.taxAdvance,standard.taxAdvance/2,'first tax year');
  close(first.displayedIncome,standard.displayedIncome,'advance is not a cost');
});
test('goal solver returns a turnover that hits the after-tax target', () => {
  const required=C.requiredTurnover(common);
  assert.ok(required>common.targetIncome+common.efka);
  close(C.calculate(common,required).displayedIncome,common.targetIncome,'Solved target');
});
test('scenario uses correct revenue and expense adjustments', () => {
  const {base,changed}=C.withScenario({...common,salesChange:20,expenseChange:10,taxEnabled:false,expenses:[expense(100,0,false)]});
  close(changed.revenueNet,base.revenueNet*1.2,'Changed revenue');
  close(changed.expenseCost,base.expenseCost*1.1,'Changed costs');
});
test('zero hours/price and empty expenses are safe', () => {
  const x={...common,billableHours:0,avgJobValue:0,expenses:[]};
  const r=C.calculate(x);
  assert.equal(r.hourly,null);
  assert.ok(Number.isFinite(C.requiredTurnover(x)));
});
