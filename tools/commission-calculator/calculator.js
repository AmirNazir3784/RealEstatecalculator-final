// Commission calculator — scoped to #commission-form only.
// Uses only document.querySelector, querySelectorAll and getElementById so the
// repo's DOM-stub tests can execute it. No shared-script logic lives here.
//
// Order of operations (shown on the page): referral and franchise fees come
// off the TOTAL commission first, each calculated on that total. The remainder
// is split between the listing side and the buyer side; your side depends on
// your role, then your agent split and the transaction fee apply to your side.
(function () {
  var form = document.querySelector('#commission-form');
  if (!form) return;
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  var mode = 'quick';
  var estimateValid = false;
  var report = '';
  var defaults = { 'sale-price': 450000, 'commission-rate': 3, 'listing-share': 50,
    'agent-split': 70, 'referral-fee': 0, 'franchise-fee': 0,
    'transaction-fee': 295, 'other-closing-costs': 0, 'mortgage-payoff': 0 };
  var sliderDefaults = { 'sale-price': { max: 2000000, step: 1000 },
    'commission-rate': { max: 10, step: 0.1 } };

  function presentation() {
    var labels = { quick: 'Total estimated commission', agent: 'Your estimated net commission', seller: 'Estimated seller proceeds' };
    set('primary-label', labels[mode]);
    set('sticky-label', { quick: 'Total commission', agent: 'Agent net', seller: 'Seller proceeds' }[mode]);
    set('input-title', { quick: 'Quick commission estimate', agent: 'Estimate your agent earnings', seller: 'Estimate your seller proceeds' }[mode]);
    set('mode-helper', { quick: 'Enter the property sale price and negotiated commission rate.',
      agent: 'Choose your role and brokerage split. Add applicable fees below.',
      seller: 'Enter your sale details, then add any optional selling costs.' }[mode]);
    ['quick', 'agent', 'seller'].forEach(function (name) {
      var button = document.getElementById('mode-' + name);
      if (button && button.setAttribute) button.setAttribute('aria-pressed', String(mode === name));
      setVisible(name + '-results', mode === name);
    });
    setVisible('agent-inputs', mode === 'agent');
    setVisible('seller-inputs', mode === 'seller');
    setVisible('listing-share-field', mode === 'agent' && role() !== 'both');
    var hasFees = num('referral-fee') !== 0 || num('franchise-fee') !== 0 || num('transaction-fee') !== 0;
    var custom = num('referral-fee') !== 0 || num('franchise-fee') !== 0 || num('transaction-fee') !== 295;
    setVisible('fee-indicator', hasFees);
    set('fee-indicator', custom ? 'Custom fees applied' : 'Example fee applied');
  }

  function usd(n) {
    return Number.isFinite(n)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n)
      : '—';
  }
  function num(id) {
    var el = document.getElementById(id);
    return el ? Number(String(el.value).replace(/,/g, '').trim()) : 0;
  }
  function set(id, s) {
    var el = document.getElementById(id);
    if (el) el.textContent = s;
  }
  function setWidth(id, pct) {
    var el = document.getElementById(id);
    if (el && el.style) el.style.width = pct + '%';
  }
  function hideRow(id, hide) {
    var el = document.getElementById(id);
    if (el) el.hidden = hide;
  }
  function setVisible(id, showIt) {
    var el = document.getElementById(id);
    if (el) el.hidden = !showIt;
  }
  function neg(n) {
    return '\u2212' + usd(n);
  }
  function valid(n, a, b) {
    return Number.isFinite(n) && n >= a && n <= b;
  }
  function role() {
    var el = document.getElementById('agent-role');
    var v = el && el.value ? el.value : 'both';
    return v === 'listing' || v === 'buyer' ? v : 'both';
  }

  var OUTPUTS = ['commission-total',
    'listing-side', 'buyer-side', 'your-side-gross',
    'commission-agent', 'breakdown-broker', 'breakdown-fee',
    'breakdown-net', 'commission-net',
    'selling-cost', 'seller-net', 'seller-payoff', 'breakdown-deductions'];

  function run() {
    presentation();
    set('copy-note', '');
    var price = num('sale-price'), rate = num('commission-rate'),
      listingShare = num('listing-share'), split = num('agent-split'),
      referralPct = num('referral-fee'), franchisePct = num('franchise-fee'),
      fee = num('transaction-fee'), otherPct = num('other-closing-costs'),
      payoff = num('mortgage-payoff');
    // With Both sides the allocation cannot affect earnings. Use the documented
    // default only for the explanatory side figures if a retained value is invalid.
    if (role() === 'both' && !valid(listingShare, 0, 100)) listingShare = defaults['listing-share'];

    // Named validation: every problem is reported by field name in the panel.
    // Validate only inputs relevant to the selected mode. Empty optional
    // amounts use num()'s existing zero behavior; required fields stay strict.
    var FIELDS = [
      { id: 'sale-price', label: 'Property sale price', value: price, max: 1e12 },
      { id: 'commission-rate', label: 'Total commission rate', value: rate, max: 100 },
      { id: 'listing-share', label: 'Listing side share', value: listingShare, max: 100 },
      { id: 'agent-split', label: 'Your commission split', value: split, max: 100 },
      { id: 'referral-fee', label: 'Referral fee', value: referralPct, max: 100 },
      { id: 'franchise-fee', label: 'Franchise / royalty fee', value: franchisePct, max: 100 },
      { id: 'transaction-fee', label: 'Transaction fee', value: fee, max: 1e12 },
      { id: 'other-closing-costs', label: 'Other seller closing costs', value: otherPct, max: 100 },
      { id: 'mortgage-payoff', label: 'Mortgage payoff', value: payoff, max: 1e12 }
    ];
    var problems = [];
    for (var fi = 0; fi < FIELDS.length; fi++) {
      var f = FIELDS[fi];
      var fel = document.getElementById(f.id);
      var shared = fi < 2, seller = fi >= 7;
      var applicable = shared || (mode === 'seller' ? seller : mode === 'agent' && !seller);
      if (f.id === 'listing-share' && role() === 'both') applicable = false;
      if (fel && fel.setAttribute) {
        fel.setAttribute('aria-invalid', 'false');
        // Disabled controls retain their value and cannot block native validation.
        fel.disabled = !applicable;
      }
      if (!applicable) continue;
      var message = '';
      var optional = fi >= 4;
      if (fel && fel.validity && fel.validity.badInput) message = f.label + ' must be a number.';
      else if (!fel || (fel.value === '' && !optional)) message = f.label + ' is empty.';
      else if (!valid(f.value, 0, f.max)) message = f.label + (f.max === 100 ? ' must be 0–100%.' : f.value > f.max ? ' must be at most 1,000,000,000,000.' : ' must be 0 or more.');
      if (message) {
        problems.push(message);
        if (fel && fel.setAttribute) fel.setAttribute('aria-invalid', 'true');
      }
    }
    var ok = problems.length === 0;
    estimateValid = ok;
    ['copy-results', 'print-results'].forEach(function (id) {
      var button = document.getElementById(id);
      if (button) button.disabled = !ok;
    });

    if (!ok) {
      set('commission-total', problems[0]);
      set('result-empty', problems.join(' '));
      OUTPUTS.slice(1).forEach(function (id) { set(id, '—'); });
      set('validation-note', problems.join(' '));
      set('primary-result', '—');
      set('sticky-value', '—');
      set('print-report', 'No valid estimate. ' + problems.join(' '));
      report = '';
      set('lg-referral', '—'); set('lg-franchise', '—'); set('lg-broker', '—');
      hideRow('result-body', true); hideRow('result-empty', false);
      setWidth('bd-referral', 0); setWidth('bd-franchise', 0);
      setWidth('bd-yours', 0); setWidth('bd-broker', 0);
      return;
    }
    set('validation-note', '');
    hideRow('result-body', false); hideRow('result-empty', true);

    var total = price * rate / 100;
    var referral = total * referralPct / 100;
    var franchise = total * franchisePct / 100;
    var splittable = total - referral - franchise;
    var listingSide = splittable * listingShare / 100;
    var buyerSide = splittable - listingSide;
    var r = role();
    var yourSide = r === 'listing' ? listingSide : r === 'buyer' ? buyerSide : splittable;
    var yourShare = yourSide * split / 100;
    var brokerShare = yourSide - yourShare;
    var net = yourShare - fee;
    var otherCosts = price * otherPct / 100;
    var sellingCost = total + otherCosts;
    var sellerNet = price - total - otherCosts - payoff;

    set('commission-total', usd(total));
    set('listing-side', usd(listingSide));
    set('buyer-side', usd(buyerSide));
    set('your-side-gross', usd(yourSide));
    set('commission-agent', usd(yourShare));
    set('legend-agent-share', usd(yourShare));
    set('breakdown-broker', neg(brokerShare));
    set('breakdown-fee', neg(fee));
    set('breakdown-net', usd(net));
    set('seller-payoff', usd(payoff));
    set('commission-net', usd(net));
    set('selling-cost', usd(sellingCost));
    set('seller-net', usd(sellerNet));
    set('primary-result', usd(mode === 'quick' ? total : mode === 'agent' ? net : sellerNet));
    set('sticky-value', usd(mode === 'quick' ? total : mode === 'agent' ? net : sellerNet));
    set('quick-price', usd(price)); set('quick-rate', rate + '%');
    set('quick-formula', usd(price) + ' × ' + rate + '% = ' + usd(total));
    set('seller-price', usd(price)); set('seller-commission', neg(total));
    set('seller-other', neg(otherCosts));

    // Legend shows only segments above $0; the breakdown hides its
    // referral/franchise row when both are $0.
    set('lg-referral', usd(referral)); set('lg-franchise', usd(franchise));
    set('lg-broker', usd(brokerShare));
    setVisible('lg-item-referral', referral > 0);
    setVisible('lg-item-franchise', franchise > 0);
    setVisible('lg-item-yours', yourShare > 0);
    setVisible('lg-item-broker', brokerShare > 0);
    var deductions = referral + franchise;
    setVisible('breakdown-deductions-row', deductions > 0);
    if (deductions > 0) set('breakdown-deductions', neg(deductions));
    // Retain the other side in the graphic so one-side allocations sum to 100%.
    var otherSide = splittable - yourSide;
    set('other-side', usd(otherSide));
    setVisible('lg-item-other', otherSide > 0);
    var showChart = total > 0 && splittable >= 0;
    set('split-caption', showChart ? 'Allocation of total commission before the transaction fee' : 'No split graphic for zero commission or percentage fees exceeding the total. The signed results above still apply.');

    if (showChart) {
      setWidth('bd-referral', (referral / total) * 100);
      setWidth('bd-franchise', (franchise / total) * 100);
      setWidth('bd-yours', (yourShare / total) * 100);
      setWidth('bd-broker', (brokerShare / total) * 100);
      setWidth('bd-other', (otherSide / total) * 100);
    } else {
      setWidth('bd-referral', 0); setWidth('bd-franchise', 0);
      setWidth('bd-yours', 0); setWidth('bd-broker', 0);
      setWidth('bd-other', 0);
    }
    report = makeReport(price, rate, total, referral, franchise, listingSide, buyerSide,
      yourSide, yourShare, brokerShare, fee, net, otherCosts, payoff, sellerNet);
    set('print-report', report);
  }

  function makeReport(price, rate, total, referral, franchise, listingSide, buyerSide,
    yourSide, yourShare, brokerShare, fee, net, otherCosts, payoff, sellerNet) {
    var names = { quick: 'Quick Commission', agent: 'Agent Earnings', seller: 'Seller Proceeds' };
    var lines = ['Real Estate Commission Calculator — ' + names[mode],
      'Property sale price: ' + usd(price), 'Commission rate: ' + rate + '%',
      'Total commission: ' + usd(total),
      'Total commission = Sale price × Commission rate ÷ 100'];
    if (mode === 'agent') {
      lines.push('Role: ' + { listing: 'Listing agent', buyer: 'Buyer agent', both: 'Both sides' }[role()]);
      if (role() !== 'both') lines.push('Listing side allocation: ' + num('listing-share') + '%');
      lines.push('Agent split: ' + num('agent-split') + '%',
        'Referral fee (' + num('referral-fee') + '% of total): ' + usd(referral),
        'Franchise fee (' + num('franchise-fee') + '% of total): ' + usd(franchise),
        'Listing side after fees: ' + usd(listingSide), 'Buyer side after fees: ' + usd(buyerSide),
        'Your applicable side after fees: ' + usd(yourSide), 'Your share before transaction fee: ' + usd(yourShare),
        'Brokerage share on your side: ' + usd(brokerShare), 'Transaction fee: ' + usd(fee),
        'Your estimated net commission: ' + usd(net),
        'Order: deduct referral and franchise independently from total; allocate sides; apply agent split; subtract transaction fee.',
        'Before personal taxes and additional business expenses. Team splits and broker caps are not included.');
    } else if (mode === 'seller') {
      lines.push('Other closing costs (' + num('other-closing-costs') + '% of price): ' + usd(otherCosts),
        'Mortgage payoff: ' + usd(payoff), 'Estimated seller proceeds: ' + usd(sellerNet),
        'Assumes the entire entered commission is deducted from seller proceeds. Payment arrangements vary by agreement.',
        'Sale price − entered commission − other closing costs − mortgage payoff.',
        'Not a complete settlement statement or taxable profit estimate; other selling expenses and taxes may apply.');
    } else lines.push('Gross commission only; no agent-side fees or seller deductions apply.');
    lines.push('Example rates are illustrative. Commission rates are negotiable and not set by law.',
      'Estimates only, not financial advice.');
    return lines.join('\n');
  }

  ['quick', 'agent', 'seller'].forEach(function (name) {
    var button = document.getElementById('mode-' + name);
    if (button) button.addEventListener('click', function () { mode = name; run(); });
  });
  var resetBtn = document.getElementById('reset-calculator');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    Object.keys(defaults).forEach(function (id) {
      var input = document.getElementById(id), slider = document.getElementById(id + '-slider');
      if (input) input.value = String(defaults[id]);
      if (slider) {
        slider.max = String(sliderDefaults[id].max);
        slider.step = String(sliderDefaults[id].step);
        slider.value = String(defaults[id]);
      }
    });
    var roleInput = document.getElementById('agent-role');
    if (roleInput) roleInput.value = 'both';
    ['advanced-fees', 'calculation-breakdown'].forEach(function (id) {
      var section = document.getElementById(id);
      if (section) section.open = false;
    });
    mode = 'quick'; run();
    set('copy-note', 'Defaults restored, including the $295 example transaction fee.');
  });

  document.querySelectorAll('#commission-form input').forEach(function (input) {
    input.addEventListener('input', run);
  });
  var roleEl = document.getElementById('agent-role');
  if (roleEl) roleEl.addEventListener('change', run);
  // Slider sync by delegation on the form (keeps the per-input listeners above intact).
  form.addEventListener('input', function (e) {
    var t = e && e.target;
    if (!t || !t.id) return;
    if (t.type === 'range') {
      var numEl = document.getElementById(t.id.replace(/-slider$/, ''));
      if (numEl) numEl.value = t.value;
      run();
    } else if (t.type === 'number') {
      var slider = document.getElementById(t.id + '-slider');
      if (slider) {
        var v = Number(String(t.value).replace(/,/g, ''));
        var config = sliderDefaults[t.id];
        if (t.value !== '' && valid(v, 0, Number(t.max))) {
          // Keep valid typed prices/rates synchronized beyond the initial
          // slider range and at finer precision, without changing the input.
          slider.max = String(Math.max(config.max, v));
          var steps = v / config.step;
          slider.step = Math.abs(steps - Math.round(steps)) < 1e-8 ? String(config.step) : 'any';
          slider.value = String(v);
        }
      }
    }
  });
  // NOTE: no thousand-separator rewriting here, on load or on blur. These
  // are type="number" fields, and a browser erases a comma-formatted value
  // ("450,000" is not a valid floating-point number), which used to empty
  // the sale price on first load and on blur. Typed values are left alone;
  // num() already strips commas when reading, so pasted values still work.
  function copyResults() {
    if (!estimateValid) return;
    var text = report;
    var done = function (ok) {
      set('copy-note', ok ? 'Results copied.' : 'Copy is not available in this browser — use Print instead.');
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        var p = navigator.clipboard.writeText(text);
        if (p && p.then) p.then(function () { done(true); }, function () { done(false); });
        else done(true);
      } else done(false);
    } catch (err) { done(false); }
  }
  var copyBtn = document.getElementById('copy-results');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    copyResults();
  });
  var printBtn = document.getElementById('print-results');
  if (printBtn) printBtn.addEventListener('click', function () {
    if (estimateValid && typeof window !== 'undefined' && window.print) window.print();
  });
  run();
})();
