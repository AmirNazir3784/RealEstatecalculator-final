(function () {
  'use strict';
  var form = document.getElementById('commercial-form');
  if (!form) return;
  function num(id) { var el = document.getElementById(id); var v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : 0; }
  function set(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function usd(n) { return '$' + Math.round(n).toLocaleString('en-US') + '.00'; }
  function usd0(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return n.toFixed(2) + '%'; }
  var OUTPUTS = ['dscr', 'dscr-verdict', 'sub-noi', 'sub-cap', 'row-egi', 'row-expenses',
    'row-noi', 'row-debt', 'tile-payment', 'tile-coc', 'strip-loan', 'strip-down', 'strip-balloon'];
  var last = null;
  function verdictFor(d) {
    if (!isFinite(d)) return 'No loan — coverage does not apply.';
    if (d < 1) return 'Below break-even — income misses the loan.';
    if (d < 1.2) return 'Tight — under the 1.20 lenders want.';
    if (d < 1.35) return 'Solid — clears the usual lender minimum.';
    return 'Strong — well above lender minimums.';
  }
  function run() {
    var price = num('property-price');
    var downPct = num('down-payment-rate');
    var rate = num('interest-rate');
    var amortYears = num('amortization-years');
    var termYears = num('loan-term-years');
    var feesPct = num('loan-fees-rate');
    var gross = num('gross-rent');
    var vacancy = num('vacancy-rate');
    var tax = num('property-tax');
    var ins = num('home-insurance');
    var maint = num('maintenance-cost');
    var mgmtPct = num('management-rate');
    if (!(price > 0) || !(amortYears > 0)) {
      OUTPUTS.forEach(function (id) { set(id, '—'); });
      set('sticky-value', '—');
      last = null;
      return;
    }
    var down = price * downPct / 100;
    var loan = Math.max(0, price - down);
    var fees = loan * feesPct / 100;
    var r = rate / 100 / 12;
    var n = Math.round(amortYears * 12);
    var pmt = loan > 0 ? (r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n) : 0;
    var k = Math.min(Math.round(termYears * 12), n);
    var balloon = loan > 0 && k < n ? pmt * (1 - Math.pow(1 + r, -(n - k))) / (r > 0 ? r : 1) : 0;
    if (loan > 0 && r === 0) balloon = Math.max(0, loan - pmt * k);
    var egi = gross * (1 - vacancy / 100);
    var mgmt = egi * mgmtPct / 100;
    var expenses = tax + ins + maint + mgmt;
    var noi = egi - expenses;
    var ads = pmt * 12;
    var dscr = ads > 0 ? noi / ads : Infinity;
    var cashFlow = noi - ads;
    var cap = noi / price * 100;
    var invested = down + fees;
    var coc = invested > 0 ? cashFlow / invested * 100 : 0;
    set('dscr', ads > 0 ? dscr.toFixed(2) : '—');
    set('dscr-verdict', verdictFor(dscr));
    set('sub-noi', usd0(noi));
    set('sub-cap', pct(cap));
    set('row-egi', usd(egi));
    set('row-expenses', usd(expenses));
    set('row-noi', usd(noi));
    set('row-debt', usd(ads));
    set('tile-payment', usd(pmt));
    set('tile-coc', pct(coc));
    set('strip-loan', usd0(loan));
    set('strip-down', usd0(down));
    set('strip-balloon', usd0(balloon));
    set('balloon-label', 'Balloon due (yr ' + Math.round(termYears) + ')');
    set('sticky-value', ads > 0 ? dscr.toFixed(2) : '—');
    var segD = document.getElementById('seg-debt');
    var segE = document.getElementById('seg-expenses');
    var segC = document.getElementById('seg-cash');
    if (segD && segE && segC && egi > 0) {
      var dW = Math.max(0, Math.min(100, ads / egi * 100));
      var eW = Math.max(0, Math.min(100 - dW, expenses / egi * 100));
      var cW = Math.max(0, 100 - dW - eW);
      segD.style.width = dW + '%'; segE.style.width = eW + '%'; segC.style.width = cW + '%';
    }
    last = { price: price, dscr: dscr, noi: noi, cap: cap, pmt: pmt, coc: coc, loan: loan, down: down, balloon: balloon, termYears: termYears };
  }
  form.addEventListener('input', run);
  var copyBtn = document.getElementById('copy-results');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    if (!last) return;
    var text = 'Commercial property: ' + usd0(last.price) + '\n' +
      'DSCR: ' + last.dscr.toFixed(2) + '\n' +
      'NOI: ' + usd0(last.noi) + ' · Cap rate: ' + pct(last.cap) + '\n' +
      'Monthly loan payment: ' + usd(last.pmt) + '\n' +
      'Cash-on-cash return: ' + pct(last.coc) + '\n' +
      'Loan: ' + usd0(last.loan) + ' · Down: ' + usd0(last.down) + ' · Balloon (yr ' + Math.round(last.termYears) + '): ' + usd0(last.balloon);
    function done() { set('copy-note', 'Copied to clipboard.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
  });
  run();
})();
