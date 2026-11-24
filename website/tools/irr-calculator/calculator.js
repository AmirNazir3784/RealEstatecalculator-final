(function () {
  'use strict';
  var form = document.getElementById('irr-form');
  if (!form) return;
  function num(id) { var el = document.getElementById(id); var v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : 0; }
  function set(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function usd(n) { return '$' + Math.round(n).toLocaleString('en-US') + '.00'; }
  function usd0(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return n.toFixed(2) + '%'; }
  function rateLabel(x) { return (Math.round(x * 100) / 100).toString() + '%'; }
  var OUTPUTS = ['irr-value', 'irr-verdict', 'sub-profit', 'sub-multiple', 'row-initial',
    'row-cashflow', 'row-sale', 'row-profit', 'tile-avg-cf', 'tile-coc',
];
  var last = null;

  function readInputs() {
    return {
      price: num('property-price'), downPct: num('down-payment-rate'),
      closingPct: num('closing-costs-rate'), rate: num('interest-rate'),
      termYears: num('loan-term-years'), holdYears: num('hold-period-years'),
      rent: num('gross-rent'), vacancy: num('vacancy-rate'),
      tax: num('property-tax'), ins: num('home-insurance'),
      maint: num('maintenance-cost'), mgmt: num('management-rate'),
      rentG: num('rent-growth-rate'), expG: num('expense-growth-rate'),
      appr: num('appreciation-rate'), sellPct: num('selling-costs-rate'),
      capex: num('capex-cost'), repairs: num('initial-repairs')
    };
  }

  function irrOf(flows) {
    function npv(rate) {
      var s = 0;
      for (var t = 0; t < flows.length; t++) s += flows[t] / Math.pow(1 + rate, t);
      return s;
    }
    var lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2, fm = npv(mid);
      if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2 * 100;
  }

  function solve(inp, apprOverride, rentOverride) {
    var appr = apprOverride != null ? apprOverride : inp.appr;
    var rentG = rentOverride != null ? rentOverride : inp.rentG;
    var hold = Math.round(inp.holdYears);
    var down = inp.price * inp.downPct / 100;
    var initial = down + inp.price * inp.closingPct / 100 + inp.repairs;
    var loan = Math.max(0, inp.price - down);
    var r = inp.rate / 100 / 12;
    var months = Math.round(inp.termYears * 12);
    var pmt = 0;
    if (loan > 0 && months > 0) pmt = r > 0 ? loan * r / (1 - Math.pow(1 + r, -months)) : loan / months;
    var bal = loan, flows = [-initial], years = [], totalCF = 0, cf1 = 0;
    for (var y = 1; y <= hold; y++) {
      var ds = 0;
      for (var m = 0; m < 12; m++) {
        if (bal <= 0) break;
        var interest = bal * r;
        var principal = Math.min(pmt - interest, bal);
        if (principal < 0) principal = 0;
        bal -= principal;
        ds += interest + principal;
      }
      var rentT = inp.rent * Math.pow(1 + rentG / 100, y - 1);
      var egi = rentT * (1 - inp.vacancy / 100);
      var exp = (inp.tax + inp.ins + inp.maint) * Math.pow(1 + inp.expG / 100, y - 1) + egi * inp.mgmt / 100;
      var cf = egi - exp - ds - inp.capex;
      var value = inp.price * Math.pow(1 + appr / 100, y);
      years.push({ y: y, cf: cf, bal: bal, value: value, equity: value - bal });
      totalCF += cf;
      if (y === 1) cf1 = cf;
      flows.push(cf);
    }
    var saleValue = inp.price * Math.pow(1 + appr / 100, hold);
    var netSale = saleValue * (1 - inp.sellPct / 100) - bal;
    flows[flows.length - 1] += netSale;
    return {
      irr: irrOf(flows), initial: initial, totalCF: totalCF, netSale: netSale,
      profit: totalCF + netSale - initial,
      multiple: initial > 0 ? (totalCF + netSale) / initial : 0,
      avgCF: hold > 0 ? totalCF / hold : 0,
      coc1: initial > 0 ? cf1 / initial * 100 : 0,
      rentShare: (totalCF + netSale) > 0 ? Math.max(0, Math.min(100, totalCF / (totalCF + netSale) * 100)) : 50,
      years: years, hold: hold
    };
  }

  function verdictFor(v) {
    if (v == null) return 'No positive return on these numbers.';
    if (v < 8) return 'Modest — below typical investor targets.';
    if (v < 12) return 'Fair — in line with long-run rental returns.';
    if (v < 18) return 'Solid — a strong leveraged return.';
    return 'Excellent — check the assumptions twice.';
  }

  function clearOutputs() {
    OUTPUTS.forEach(function (id) { set(id, '—'); });
    set('sticky-value', '—');
    var body = document.getElementById('years-body');
    if (body) body.innerHTML = '';
    last = null;
  }

  function run() {
    var inp = readInputs();
    if (!(inp.price > 0) || !(inp.holdYears >= 1)) { clearOutputs(); return; }
    var res = solve(inp, null, null);
    last = res;
    set('irr-value', res.irr == null ? '—' : pct(res.irr));
    set('irr-verdict', verdictFor(res.irr));
    set('sub-profit', usd0(res.profit));
    set('sub-multiple', res.multiple.toFixed(2) + '×');
    set('row-initial', usd(res.initial));
    set('row-cashflow-label', 'Cash flow over ' + res.hold + (res.hold === 1 ? ' year' : ' years'));
    set('row-cashflow', usd(res.totalCF));
    set('row-sale-label', 'Net sale proceeds (year ' + res.hold + ')');
    set('row-sale', usd(res.netSale));
    set('row-profit', usd(res.profit));
    set('tile-avg-cf', usd0(res.avgCF));
    set('tile-coc', pct(res.coc1));
    set('sticky-value', res.irr == null ? '—' : pct(res.irr));
    var segRent = document.getElementById('seg-rent'), segSale = document.getElementById('seg-sale');
    if (segRent) segRent.style.width = res.rentShare + '%';
    if (segSale) segSale.style.width = (100 - res.rentShare) + '%';
    var body = document.getElementById('years-body');
    if (body) {
      var html = '';
      res.years.forEach(function (row) {
        var cfText = usd0(row.cf) + (row.y === res.hold ? ' + sale' : '');
        html += '<tr><td>' + row.y + '</td><td>' + cfText + '</td><td>' + usd0(row.bal) +
          '</td><td>' + usd0(row.value) + '</td><td>' + usd0(row.equity) + '</td></tr>';
      });
      body.innerHTML = html;
    }
  }

  form.addEventListener('input', run);
  var copyBtn = document.getElementById('copy-results');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    if (!last) return;
    var text = 'IRR Calculator — everyrealestatecalculator.com\n' +
      'IRR: ' + (last.irr == null ? '—' : pct(last.irr)) + '\n' +
      'Initial investment: ' + usd(last.initial) + '\n' +
      'Cash flow over ' + last.hold + ' years: ' + usd(last.totalCF) + '\n' +
      'Net sale proceeds: ' + usd(last.netSale) + '\n' +
      'Total profit: ' + usd(last.profit) + '\n' +
      'Equity multiple: ' + last.multiple.toFixed(2) + '×';
    function done() { set('copy-note', 'Copied to clipboard.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
  });
  run();
})();
