/* dwrean Profit web UI — all user information stays in this browser. */
(() => {
  'use strict';
  const C = window.DwreanProfitCore;
  const STORAGE_KEY = 'dwrean-profit-data-v1';
  const $ = id => document.getElementById(id);
  const euro = (value, digits = 2) => Number.isFinite(value)
    ? new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : '—';
  const number = (value, digits = 0) => Number.isFinite(value)
    ? new Intl.NumberFormat('el-GR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : '—';
  const percent = value => Number.isFinite(value) ? `${number(value, 1)}%` : '—';
  const text = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const esc = value => String(value).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  const moneyInput = id => C.n($(id).value);
  let expenses = [];
  let updatedTimer = null;
  let toastTimer = null;
  let nextId = 10;

  const example = () => ({
    revenue: 4000, revenueMode: 'net', vatRate: 24, vatExempt: false,
    expenses: [
      { id: 'e1', name: 'Ενοίκιο επαγγελματικού χώρου', amount: 450, vatRate: 0, vatDeductible: false, taxDeductible: true },
      { id: 'e2', name: 'Προγράμματα / συνδρομές', amount: 120, vatRate: 24, vatDeductible: true, taxDeductible: true },
      { id: 'e3', name: 'Τηλέφωνο / Internet', amount: 70, vatRate: 24, vatDeductible: true, taxDeductible: true },
      { id: 'e4', name: 'Ρεύμα / λογαριασμοί', amount: 140, vatRate: 6, vatDeductible: false, taxDeductible: true },
      { id: 'e5', name: 'Λογιστής / υπηρεσίες', amount: 180, vatRate: 24, vatDeductible: true, taxDeductible: true }
    ],
    efka: 260.77, taxEnabled: true, ageGroup: 'over30', children: 0, minimumTaxable: 0,
    firstTimeTax: false, otherIncome: false, targetIncome: 2000,
    billableHours: 100, avgJobValue: 200, salesChange: 0, expenseChange: 0
  });

  function readSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed?.data && Array.isArray(parsed.data.expenses)) return C.normalizeInput(parsed.data);
    } catch (error) { /* no local storage or malformed file: continue with example */ }
    return null;
  }

  function saveToBrowser(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data })); }
    catch (error) { /* private mode may disallow local storage; calculations still work */ }
  }

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3500);
  }

  function setForm(data) {
    const x = C.normalizeInput(data);
    ['revenue', 'vatRate', 'efka', 'ageGroup', 'children', 'minimumTaxable', 'targetIncome', 'billableHours', 'avgJobValue', 'salesChange', 'expenseChange'].forEach(id => { $(id).value = x[id]; });
    ['vatExempt', 'taxEnabled', 'otherIncome', 'firstTimeTax'].forEach(id => { $(id).checked = x[id]; });
    $('revenueMode').value = x.revenueMode;
    $('efkaPreset').value = Array.from($('efkaPreset').options).some(o => o.value !== 'custom' && Math.abs(Number(o.value) - x.efka) < .01) ? String(x.efka) : 'custom';
    expenses = x.expenses;
    renderExpenseList();
    refresh();
  }

  function readForm() {
    return C.normalizeInput({
      revenue: moneyInput('revenue'), revenueMode: $('revenueMode').value, vatRate: $('vatRate').value,
      vatExempt: $('vatExempt').checked,
      expenses,
      efka: moneyInput('efka'),
      taxEnabled: $('taxEnabled').checked,
      ageGroup: $('ageGroup').value,
      children: $('children').value,
      minimumTaxable: moneyInput('minimumTaxable'),
      otherIncome: $('otherIncome').checked,
      firstTimeTax: $('firstTimeTax').checked,
      targetIncome: moneyInput('targetIncome'), billableHours: moneyInput('billableHours'),
      avgJobValue: moneyInput('avgJobValue'),
      salesChange: $('salesChange').value, expenseChange: $('expenseChange').value
    });
  }

  function renderExpenseList() {
    const vatExempt = $('vatExempt').checked;
    const wrap = $('expensesList');
    if (!expenses.length) {
      wrap.innerHTML = '<div class="hint" style="padding:14px">Δεν υπάρχουν έξοδα. Πάτησε «Προσθήκη» για να καταχωρίσεις ένα.</div>';
      return;
    }
    wrap.innerHTML = expenses.map((e, idx) => `<div class="expense-item" data-index="${idx}">
      <label>Κατηγορία<input type="text" maxlength="80" data-key="name" value="${esc(e.name)}" aria-label="Όνομα εξόδου ${idx+1}"></label>
      <label>Ποσό χωρίς ΦΠΑ<input type="number" min="0" max="1000000000" step="0.01" data-key="amount" value="${e.amount}" aria-label="Ποσό εξόδου ${idx+1}"></label>
      <label>ΦΠΑ<select data-key="vatRate" aria-label="ΦΠΑ εξόδου ${idx+1}">${[0,4,6,9,13,17,24].map(v=>`<option value="${v}" ${e.vatRate===v?'selected':''}>${v}%</option>`).join('')}</select></label>
      <button type="button" class="expense-remove" data-remove="${idx}" title="Διαγραφή εξόδου" aria-label="Διαγραφή εξόδου ${idx+1}">×</button>
      <div class="expense-options"><label title="Αν μπορείς να συμψηφίσεις τον ΦΠΑ του συγκεκριμένου εξόδου"><input type="checkbox" data-key="vatDeductible" ${e.vatDeductible?'checked':''} ${vatExempt?'disabled':''}> Έκπτωση ΦΠΑ</label><label title="Αν η δαπάνη εκπίπτει από τα φορολογητέα κέρδη"><input type="checkbox" data-key="taxDeductible" ${e.taxDeductible?'checked':''}> Εκπίπτει φορολογικά</label></div>
    </div>`).join('');
  }

  function distribution(result) {
    const after = result.displayedIncome;
    const segments = [
      { value: Math.max(0, after), cls:'mint' },
      { value: result.expenseCost, cls:'violet' },
      { value: result.efka, cls:'blue' },
      { value: result.monthlyTax || 0, cls:'orange' }
    ];
    const total = segments.reduce((s,x)=>s+x.value,0);
    const bar = $('distribution');
    bar.replaceChildren();
    if (total > 0) {
      segments.forEach(x => {
        if (x.value <= 0) return;
        const seg = document.createElement('div');
        seg.className = `segment segment-${x.cls}`;
        seg.style.width = `${x.value / total * 100}%`;
        bar.appendChild(seg);
      });
    }
    const note = result.displayedIncome < 0
      ? 'Προσοχή: τα έξοδα και οι επιβαρύνσεις υπερβαίνουν τον τζίρο. Η μπάρα κατανέμει τις δαπάνες και δεν απεικονίζει το έλλειμμα.'
      : result.taxAvailable ? 'Ποσοστά ενδεικτικά. Ο ΦΠΑ δεν προστίθεται στο καθαρό έσοδο.' : 'Δεν περιλαμβάνεται φόρος εισοδήματος, επειδή η εκτίμηση είναι απενεργοποιημένη.';
    text('distributionNote', note);
    bar.setAttribute('aria-label', `${note} Κέρδος ${euro(after)}, έξοδα ${euro(result.expenseCost)}, ΕΦΚΑ ${euro(result.efka)}, φόρος ${euro(result.monthlyTax)}.`);
  }

  function renderValues(x) {
    const result = C.calculate(x);
    const taxEnabledAndValid = result.taxAvailable;
    const info = taxEnabledAndValid ? 'Μετά από έξοδα, ΕΦΚΑ και εκτίμηση φόρου εισοδήματος' : 'Πριν από φόρο εισοδήματος — δεν υπολογίζεται εκτίμηση φόρου';
    text('afterTaxLabel', info);
    text('netIncome', euro(result.displayedIncome));
    $('netIncome').classList.toggle('negative', result.displayedIncome < 0);
    text('profitMargin', `Περιθώριο: ${percent(result.margin)}`);
    const status = $('profitStatus');
    status.className = 'status-pill';
    if (result.displayedIncome < -.005) {
      status.classList.add('negative'); status.textContent = 'Ζημιογόνο αποτέλεσμα';
    } else if (result.displayedIncome <= .005) {
      status.classList.add('neutral'); status.textContent = 'Οριακό αποτέλεσμα';
    } else { status.textContent = taxEnabledAndValid ? 'Θετικό μετά την εκτίμηση φόρου' : 'Θετικό πριν από τον φόρο'; }
    text('metricRevenue', euro(result.revenueNet));
    text('metricExpenses', euro(result.expenseCost));
    text('metricEfka', euro(result.efka));
    text('metricPreTax', euro(result.preTax));
    text('metricTax', euro(result.monthlyTax));
    text('metricHourly', euro(result.hourly));
    text('totalExpensesPreview', euro(result.expenseCost));
    text('vatDue', result.vatExempt ? 'Δεν εφαρμόζεται' : euro(result.vatDue));
    const vatText = result.vatExempt
      ? `Απαλλασσόμενο καθεστώς: δεν υπολογίζουμε ΦΠΑ πωλήσεων ή συμψηφισμό ΦΠΑ δαπανών. ΦΠΑ αγορών που καταβλήθηκε: ${euro(result.paidInputVat)} (συμπεριλαμβάνεται στο κόστος).`
      : `ΦΠΑ πωλήσεων: ${euro(result.outputVat)} · Εκπιπτόμενος ΦΠΑ εξόδων: ${euro(result.inputVat)}.${result.vatCredit > 0 ? ` Πιστωτικό υπόλοιπο προ υπολοίπων/μεταφορών: ${euro(result.vatCredit)}.` : ''} Πρόκειται για απλοποιημένο μηνιαίο ισοζύγιο, όχι δήλωση ΦΠΑ.`;
    text('vatExplanation', vatText);
    text('annualTaxable', taxEnabledAndValid ? euro(result.annualTaxable) : '—');
    text('annualTax', euro(result.annualTax));
    text('advanceTax', euro(result.taxAdvance));
    $('taxFields').classList.toggle('dimmed', !x.taxEnabled);
    $('taxFields').setAttribute('aria-disabled', String(!x.taxEnabled));
    const required = C.requiredTurnover(x);
    text('requiredRevenue', required === null ? 'Δεν υπολογίζεται' : euro(required));
    text('requiredHourly', required === null || !x.billableHours ? '—' : euro(required / x.billableHours));
    text('requiredClients', required === null || !x.avgJobValue ? '—' : number(Math.ceil((required - 1e-7) / x.avgJobValue)));
    text('goalExplanation', taxEnabledAndValid
      ? 'Οι υπολογισμοί στόχου περιλαμβάνουν εκτίμηση φόρου, με τις ίδιες υποθέσεις που επέλεξες.'
      : 'Ο στόχος υπολογίζεται προ φόρου εισοδήματος, επειδή δεν υπάρχει διαθέσιμη εκτίμηση φόρου.');
    distribution(result);
    const scenario = C.withScenario(x);
    text('salesChangeLabel', `${x.salesChange > 0 ? '+' : ''}${x.salesChange}%`);
    text('expenseChangeLabel', `${x.expenseChange > 0 ? '+' : ''}${x.expenseChange}%`);
    text('scenarioBase', euro(scenario.base.displayedIncome));
    text('scenarioNew', euro(scenario.changed.displayedIncome));
    const diff = scenario.difference;
    text('scenarioDifference', `${diff > .005 ? '+' : ''}${euro(diff)} τον μήνα ${diff > .005 ? 'περισσότερα' : diff < -.005 ? 'διαφορά σε σχέση με σήμερα' : '— χωρίς μεταβολή'}`);
    $('scenarioDifference').classList.toggle('bad', diff < -.005);
    fillPrintReport(result, required, vatText);
    saveToBrowser(x);
  }

  function fillPrintReport(result, required, vatText) {
    text('printDate', `Δημιουργήθηκε: ${new Intl.DateTimeFormat('el-GR', { dateStyle:'long', timeStyle:'short' }).format(new Date())}. Στοιχεία ανά μήνα εκτός όπου σημειώνεται «έτος».`);
    const rows = [
      ['Έσοδα χωρίς ΦΠΑ', euro(result.revenueNet)],
      ['Λειτουργικά έξοδα (περιλαμβάνεται τυχόν μη εκπιπτόμενος ΦΠΑ)', euro(result.expenseCost)],
      ['Εισφορές e-ΕΦΚΑ', euro(result.efka)],
      ['Κέρδος προ φόρου εισοδήματος', euro(result.preTax)],
      ['Εκτίμηση φόρου εισοδήματος / μήνα', euro(result.monthlyTax)],
      ['Διαθέσιμο / μήνα' + (result.taxAvailable ? ' (μετά εκτίμησης φόρου)' : ' (προ φόρου)'), euro(result.displayedIncome)],
      ['ΦΠΑ προς απόδοση / μήνα (ενδεικτικό)', result.vatExempt ? 'Δεν εφαρμόζεται' : euro(result.vatDue)],
      ['Εκτιμώμενο φορολογητέο / έτος', result.taxAvailable ? euro(result.annualTaxable) : '—'],
      ['Φόρος εισοδήματος / έτος', euro(result.annualTax)],
      ['Προκαταβολή φόρου / έτος', euro(result.taxAdvance)],
      ['Απαιτούμενος τζίρος για τον προσωπικό στόχο / μήνα', euro(required)],
      ['Απαιτούμενη χρέωση / ώρα χωρίς ΦΠΑ', required !== null && result.billableHours ? euro(required / result.billableHours) : '—'],
      ['Απαιτούμενος αριθμός πελατών / μήνα', required !== null && result.avgJobValue ? number(Math.ceil((required - 1e-7) / result.avgJobValue)) : '—']
    ];
    const tbody = $('printRows');
    tbody.replaceChildren();
    for (const [name,value] of rows) {
      const tr = document.createElement('tr');
      if (name.startsWith('Διαθέσιμο /')) tr.className = 'major';
      for (const item of [name, value]) { const td = document.createElement('td'); td.textContent = item; tr.appendChild(td); }
      tbody.appendChild(tr);
    }
    text('printNotes', `${vatText} Η ετήσια εκτίμηση βασίζεται σε 12 ίδιους μήνες, στα δηλωμένα φορολογικά εκπιπτόμενα έξοδα και στις δηλωμένες εισφορές. Το ελάχιστο τεκμαρτό καθαρό εισόδημα εφαρμόζεται μόνο αν το έχεις συμπληρώσει από στοιχεία λογιστή. Η προκαταβολή φόρου εμφανίζεται ξεχωριστά και δεν αφαιρείται δεύτερη φορά από τα κέρδη. Η έκπτωση ΦΠΑ και οι φορολογικές δαπάνες είναι ευθύνη του χρήστη.`);
  }

  function refresh() {
    try { renderValues(readForm()); }
    catch (err) { console.error('Σφάλμα υπολογισμού:', err); toast('Δεν ήταν δυνατό να ολοκληρωθεί ο υπολογισμός.'); }
  }
  function download(textContent, name, mime) {
    const objectUrl = URL.createObjectURL(new Blob([textContent], { type: mime }));
    const a = document.createElement('a');
    a.href = objectUrl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
  function saveData() {
    download(JSON.stringify({ app:'dwrean-profit', version:1, taxYear:2026, data:readForm() }, null, 2),
      `dwrean-profit-${new Date().toISOString().slice(0,10)}.json`, 'application/json;charset=utf-8');
    toast('Το αντίγραφο δεδομένων αποθηκεύτηκε.');
  }
  function saveCsv() {
    const x = readForm(); const r = C.calculate(x); const required = C.requiredTurnover(x);
    const rows = [
      ['Μέγεθος', 'Ποσό σε EUR', 'Περίοδος'],
      ['Έσοδα χωρίς ΦΠΑ',r.revenueNet,'μήνας'],
      ['Λειτουργικά έξοδα',r.expenseCost,'μήνας'],
      ['Εισφορές e-ΕΦΚΑ',r.efka,'μήνας'],
      ['Κέρδος προ φόρου',r.preTax,'μήνας'],
      ['Φόρος εισοδήματος (εκτίμηση)',r.monthlyTax,'μήνας'],
      ['Διαθέσιμο (εκτίμηση)',r.displayedIncome,'μήνας'],
      ['ΦΠΑ προς απόδοση (εκτίμηση)',r.vatDue,'μήνας'],
      ['Φορολογητέο εισόδημα (εκτίμηση)',r.taxAvailable?r.annualTaxable:null,'έτος'],
      ['Φόρος εισοδήματος (εκτίμηση)',r.annualTax,'έτος'],
      ['Προκαταβολή φόρου (εκτίμηση)',r.taxAdvance,'έτος'],
      ['Απαιτούμενος τζίρος για στόχο',required,'μήνας'],
      ['ΣΗΜΕΙΩΣΗ','Ενδεικτικοί υπολογισμοί. Όχι φορολογική εκκαθάριση.','']
    ];
    const quote = v => `"${String(v===null || v===undefined?'':v).replace(/"/g,'""')}"`;
    download('\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n'),
      `dwrean-profit-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8');
    toast('Το CSV είναι έτοιμο.');
  }

  function bindListeners() {
    const inputIds = ['revenue','revenueMode','vatRate','vatExempt','efka','taxEnabled','ageGroup','children','minimumTaxable','otherIncome','firstTimeTax','targetIncome','billableHours','avgJobValue','salesChange','expenseChange'];
    inputIds.forEach(id => {
      $(id).addEventListener('input', () => {
        if (id === 'efka') $('efkaPreset').value = 'custom';
        if (id === 'vatExempt') renderExpenseList();
        refresh();
      });
    });
    $('efkaPreset').addEventListener('change', () => {
      const v = $('efkaPreset').value;
      if (v !== 'custom') $('efka').value = v;
      refresh();
    });
    $('expensesList').addEventListener('input', event => {
      const row = event.target.closest('[data-index]');
      if (!row) return;
      const e = expenses[Number(row.dataset.index)];
      if (!e) return;
      const key = event.target.dataset.key;
      if (key === 'amount' || key === 'vatRate') e[key] = C.n(event.target.value);
      else if (key === 'name') e[key] = event.target.value.slice(0,80);
      else if (key === 'vatDeductible' || key === 'taxDeductible') e[key] = event.target.checked;
      refresh();
    });
    $('expensesList').addEventListener('change', event => {
      const row = event.target.closest('[data-index]');
      if (!row) return;
      const e = expenses[Number(row.dataset.index)];
      if (!e) return;
      const key = event.target.dataset.key;
      if (key === 'vatRate' || key === 'amount') e[key] = C.n(event.target.value);
      if (key === 'vatDeductible' || key === 'taxDeductible') e[key] = event.target.checked;
      refresh();
    });
    $('expensesList').addEventListener('click', event => {
      const remove = event.target.closest('[data-remove]');
      if (!remove) return;
      expenses.splice(Number(remove.dataset.remove),1);
      renderExpenseList();refresh();
    });
    $('addExpense').addEventListener('click', () => {
      if (expenses.length >= 100) return toast('Μπορείς να προσθέσεις έως 100 κατηγορίες εξόδων.');
      expenses.push({ id:`e-${++nextId}`, name:'Νέο έξοδο', amount:0, vatRate:24, vatDeductible:true, taxDeductible:true });
      renderExpenseList();refresh();
      const fields = document.querySelectorAll('#expensesList [data-key="name"]');
      fields[fields.length-1]?.focus();
      fields[fields.length-1]?.select();
    });
    $('btnPrint').addEventListener('click', () => { refresh(); window.print(); });
    $('btnSaveData').addEventListener('click', saveData);
    $('btnCSV').addEventListener('click', saveCsv);
    $('btnReset').addEventListener('click', () => {
      if (!window.confirm('Να αντικατασταθούν τα στοιχεία σου με τα αρχικά παραδείγματα;')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      setForm(example());toast('Εμφανίζονται ξανά τα ενδεικτικά στοιχεία.');
    });
    $('fileImport').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 1024 * 1024) throw new Error('Το αρχείο είναι πολύ μεγάλο (μέγιστο 1 MB).');
        const object = JSON.parse(await file.text());
        if (object?.app !== 'dwrean-profit' || object.version !== 1 || !object.data || !Array.isArray(object.data.expenses))
          throw new Error('Το αρχείο δεν είναι έγκυρο αντίγραφο dwrean Profit v1.');
        setForm(object.data);
        toast('Τα δεδομένα εισήχθησαν επιτυχώς.');
      } catch (err) { toast(err.message || 'Αποτυχία εισαγωγής του αρχείου.'); }
      finally { event.target.value = ''; }
    });
    $('copyrightYear').textContent = String(new Date().getFullYear());
  }

  function init() {
    bindListeners();
    setForm(readSaved() || example());
  }
  document.addEventListener('DOMContentLoaded', init);
})();
