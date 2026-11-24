/* Rental Yield Calculator: gross yield = annual rent / price; net yield =
   NOI / price, where NOI = effective income (gross rent minus vacancy, plus
   other income) minus operating expenses. Financing is deliberately
   excluded — the same convention as the Cap Rate Calculator, whose engine
   this mirrors. The rent-needed rows solve the same equations backwards. */
(function () {
  var form = document.querySelector('#rental-yield-form');
  if (!form) return;
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  function num(id) {
    var el = document.getElementById(id);
    return el ? Number(String(el.value).replace(/,/g, '').trim()) : 0;
  }
  function set(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  function setWidth(id, pct) {
    var el = document.getElementById(id);
    if (el && el.style) el.style.width = pct + '%';
  }
  function hideRow(id, hide) {
    var el = document.getElementById(id);
    if (el) el.hidden = hide;
  }
  function usd(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function usd0(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    return n.toFixed(2) + '%';
  }
  function valid(v, min, max) {
    return Number.isFinite(v) && v >= min && v <= max;
  }
  var OUTPUTS = ['gross-yield', 'yield-verdict', 'annual-rent', 'vacancy-loss',
    'total-expenses', 'row-noi', 'noi-monthly', 'payback',
    'rent-for-5', 'rent-for-6', 'rent-for-7'];
  function verdictFor(net) {
    if (net < 0) return 'Negative — expenses exceed the rent at these inputs.';
    if (net < 3) return 'Low — the income is thin for the price.';
    if (net < 5) return 'Modest — below the middle of the rental market.';
    if (net < 7) return 'Solid — in line with strong residential rental markets.';
    return 'Strong — check what risk the high yield is pricing in.';
  }
  function run() {
    var price = num('property-price');
    var rent = num('monthly-rent');
    var vacancy = num('vacancy-rate');
    var other = num('other-income');
    var tax = num('property-tax');
    var ins = num('home-insurance');
    var maint = num('maintenance-cost');
    var mgmtRate = num('management-rate');
    var hoa = num('hoa-other');
    var ok = valid(price, 0, 1e12) && price > 0 && valid(rent, 0, 1e12) &&
      valid(vacancy, 0, 100) && valid(other, 0, 1e12) && valid(tax, 0, 1e12) &&
      valid(ins, 0, 1e12) && valid(maint, 0, 1e12) && valid(mgmtRate, 0, 100) &&
      valid(hoa, 0, 1e12);
    var required = ['property-price', 'monthly-rent', 'vacancy-rate', 'other-income',
      'property-tax', 'home-insurance', 'maintenance-cost', 'management-rate', 'hoa-other'];
    for (var ri = 0; ri < required.length; ri++) {
      var rel = document.getElementById(required[ri]);
      if (!rel || rel.value === '') { ok = false; break; }
    }
    if (!ok) {
      set('net-yield', price === 0 ? 'Enter a price above $0' : 'Check inputs');
      OUTPUTS.forEach(function (id) { set(id, '—'); });
      set('validation-note', 'Check the values: price above $0, rates 0–100%, amounts 0 or more, and no field left empty.');
      set('sticky-value', '—');
      hideRow('result-body', true); hideRow('result-empty', false);
      return;
    }
    set('validation-note', '');
    hideRow('result-body', false); hideRow('result-empty', true);
    var gross = rent * 12;
    var vacancyLoss = gross * vacancy / 100;
    var effective = gross - vacancyLoss + other;
    var mgmt = effective * mgmtRate / 100;
    var fixed = tax + ins + maint + hoa;
    var expenses = fixed + mgmt;
    var noi = effective - expenses;
    var grossYield = gross / price * 100;
    var netYield = noi / price * 100;
    set('net-yield', pct(netYield));
    set('yield-verdict', verdictFor(netYield));
    set('gross-yield', pct(grossYield));
    set('annual-rent', usd(gross));
    set('vacancy-loss', usd(vacancyLoss));
    set('total-expenses', usd(expenses));
    set('row-noi', usd(noi));
    set('noi-monthly', usd(noi / 12));
    set('payback', noi > 0 ? (price / noi).toFixed(1) + ' years' : '—');
    if (gross > 0) {
      setWidth('seg-kept', Math.max(0, noi / gross * 100));
      setWidth('seg-vacancy', vacancyLoss / gross * 100);
      setWidth('seg-expenses', expenses / gross * 100);
    }
    // Rent needed for a target net yield: NOI = EGI*(1-mgmt%) - fixed, and
    // EGI = 12*rent*(1-vacancy%) + other. Solve for rent.
    function rentFor(targetPct) {
      var targetNoi = price * targetPct / 100;
      var egiNeeded = (targetNoi + fixed) / (1 - mgmtRate / 100);
      var rentNeeded = (egiNeeded - other) / (12 * (1 - vacancy / 100));
      return rentNeeded > 0 ? usd0(rentNeeded) + '/mo' : '—';
    }
    set('rent-for-5', rentFor(5));
    set('rent-for-6', rentFor(6));
    set('rent-for-7', rentFor(7));
    set('sticky-value', pct(netYield));
  }
  document.querySelectorAll('#rental-yield-form input').forEach(function (input) {
    input.addEventListener('input', run);
  });
  function copyResults() {
    var pairs = [['Net rental yield', 'net-yield'], ['Gross yield', 'gross-yield'],
      ['Annual rent (gross)', 'annual-rent'], ['Vacancy loss', 'vacancy-loss'],
      ['Operating expenses', 'total-expenses'], ['Net operating income', 'row-noi'],
      ['Monthly net income', 'noi-monthly'], ['Rent repays the price in', 'payback']];
    var lines = ['Rental Yield Calculator'];
    pairs.forEach(function (pair) {
      var el = document.getElementById(pair[1]);
      if (el) lines.push(pair[0] + ': ' + el.textContent);
    });
    var done = function (ok) {
      set('copy-note', ok ? 'Results copied.' : 'Copy is not available in this browser.');
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        var p = navigator.clipboard.writeText(lines.join('\n'));
        if (p && p.then) p.then(function () { done(true); }, function () { done(false); });
        else done(true);
      } else done(false);
    } catch (err) { done(false); }
  }
  var copyBtn = document.getElementById('copy-results');
  if (copyBtn) copyBtn.addEventListener('click', copyResults);
  run();
})();
