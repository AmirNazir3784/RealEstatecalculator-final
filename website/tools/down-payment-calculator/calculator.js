// Down Payment Calculator — scoped to #down-payment-form only.
// Conventional PMI uses LTV bands; the 3.5% tier card uses FHA MIP maths.
// All figures are estimates computed in the browser; nothing is sent anywhere.
(function () {
  var form = document.querySelector('#down-payment-form');
  if (!form) return;
  form.addEventListener('submit', function (event) { event.preventDefault(); });

  function el(id) { return document.getElementById(id); }
  function num(id) {
    var node = el(id);
    if (!node) return NaN;
    var raw = String(node.value).replace(/,/g, '').trim();
    return raw === '' ? NaN : Number(raw);
  }
  function setText(id, text) { var node = el(id); if (node) node.textContent = text; }
  function money(n) {
    return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '—';
  }
  function pctText(n) {
    if (!Number.isFinite(n)) return '—';
    var rounded = Math.round(n * 100) / 100;
    return (rounded % 1 === 0 ? String(rounded) : String(rounded)) + '%';
  }
  function trimNum(n) {
    var rounded = Math.round(n * 100) / 100;
    return rounded % 1 === 0 ? String(rounded) : String(rounded);
  }
  function monthlyPI(loan, annualRatePct, years) {
    var r = annualRatePct / 100 / 12, n = years * 12;
    if (!(loan > 0) || !(n > 0)) return 0;
    if (r === 0) return loan / n;
    var f = Math.pow(1 + r, n);
    return loan * r * f / (f - 1);
  }
  // Conventional PMI default bands, annual % of the loan, by LTV.
  function pmiBand(ltv) {
    if (ltv > 95) return 0.95;
    if (ltv > 90) return 0.75;
    if (ltv > 85) return 0.60;
    if (ltv > 80) return 0.35;
    return 0;
  }
  var TIERS = [3, 3.5, 5, 10, 15, 20];

  function tierMonthly(pct, price, ratePct, years, overrideRate) {
    var down = price * pct / 100, loan = price - down, ltv = price > 0 ? loan / price * 100 : 0;
    if (pct === 3.5) {
      // FHA: upfront MIP 1.75% financed into the loan; annual MIP 0.55%
      // above 95% LTV, 0.50% at or below; billed monthly on the base loan.
      var financed = loan * 1.0175;
      var mipRate = ltv > 95 ? 0.55 : 0.50;
      return monthlyPI(financed, ratePct, years) + loan * mipRate / 100 / 12;
    }
    var band = overrideRate !== null && overrideRate !== undefined ? overrideRate : pmiBand(ltv);
    return monthlyPI(loan, ratePct, years) + (ltv > 80 ? loan * band / 100 / 12 : 0);
  }

  function compute(source) {
    var price = num('dp-price');
    var rate = num('dp-rate');
    var years = Number(el('dp-term') && el('dp-term').value) || 30;
    var closingPct = num('dp-closing-pct');
    if (!Number.isFinite(closingPct) || closingPct < 0) closingPct = 0;
    var earnest = num('dp-earnest');
    if (!Number.isFinite(earnest) || earnest < 0) earnest = 0;
    var overrideRaw = el('dp-pmi-rate') ? String(el('dp-pmi-rate').value).trim() : '';
    var override = overrideRaw === '' ? null : Number(overrideRaw);
    if (override !== null && (!Number.isFinite(override) || override < 0)) override = null;

    var downDollars = el('dp-down-dollars'), downPercent = el('dp-down-percent');
    if (source === 'dollars') {
      var d = num('dp-down-dollars');
      if (Number.isFinite(d) && Number.isFinite(price) && price > 0 && downPercent) {
        downPercent.value = trimNum(d / price * 100);
      }
    } else if (source === 'percent' || source === 'chip' || source === 'tier') {
      var p = num('dp-down-percent');
      if (Number.isFinite(p) && Number.isFinite(price) && downDollars) {
        downDollars.value = String(Math.round(price * p / 100));
      }
    } else if (source === 'price') {
      var p2 = num('dp-down-percent');
      if (Number.isFinite(p2) && Number.isFinite(price) && downDollars) {
        downDollars.value = String(Math.round(price * p2 / 100));
      }
    }

    var pct = num('dp-down-percent');
    var valid = Number.isFinite(price) && price > 0 && Number.isFinite(pct) && pct >= 0 && pct <= 100 &&
      Number.isFinite(rate) && rate >= 0;
    setText('dp-error', valid ? '' : 'Check your inputs: the home price must be above $0 and the down payment between 0% and 100%.');

    var chips = form.querySelectorAll('.dp-chip');
    for (var i = 0; i < chips.length; i++) {
      var chipPct = Number(chips[i].getAttribute('data-pct'));
      chips[i].setAttribute('aria-pressed', valid && Math.abs(chipPct - pct) < 0.001 ? 'true' : 'false');
    }
    setText('dp-closing-summary-pct', trimNum(closingPct) + '%');

    if (!valid) {
      setText('dp-cash-to-close', '—'); setText('sticky-value', '—'); setText('dp-loan', '—'); setText('dp-ltv', '—');
      setText('dp-pi', '—'); setText('dp-pmi', '—'); setText('dp-composition', '');
      setText('dp-bd-down', '—'); setText('dp-bd-close', '—'); setText('dp-bd-total', '—');
      var badBanner = el('dp-pmi-banner');
      if (badBanner) {
        badBanner.className = 'dp-pmi-banner dp-banner-some';
        setText('dp-pmi-banner-ic', '!');
        setText('dp-pmi-banner-text', 'Check your inputs to see the PMI estimate.');
      }
      return;
    }

    var down = price * pct / 100;
    var loan = price - down;
    var ltv = loan / price * 100;
    var closing = price * closingPct / 100;
    var cashToClose = down + closing - earnest;
    var pi = monthlyPI(loan, rate, years);
    var band = pmiBand(ltv);
    var appliedRate = override !== null ? override : band;
    var pmi = ltv > 80 ? loan * appliedRate / 100 / 12 : 0;

    setText('dp-cash-to-close', money(cashToClose));
    setText('sticky-value', money(cashToClose));
    setText('dp-loan', money(loan));
    setText('dp-ltv', pctText(ltv));
    setText('dp-pi', money(pi));
    setText('dp-pmi', money(pmi));
    var composition = 'Down payment ' + money(down) + ' + est. closing costs ' + money(closing);
    if (earnest > 0) composition += ' − earnest money ' + money(earnest);
    setText('dp-composition', composition);
    // Composition bar: down payment (navy) + closing costs (gold) vs the price.
    var barDown = el('dp-bar-down'), barClose = el('dp-bar-close');
    if (barDown) barDown.style.width = pct + '%';
    if (barClose) barClose.style.width = closingPct + '%';
    // Breakdown panel.
    setText('dp-bd-down', money(down) + ' (' + pctText(pct) + ')');
    setText('dp-bd-close', money(closing) + ' (' + pctText(closingPct) + ')');
    var earnestRow = el('dp-bd-earnest-row');
    if (earnestRow) earnestRow.hidden = earnest <= 0;
    setText('dp-bd-earnest', '−' + money(earnest));
    setText('dp-bd-total', money(cashToClose));
    // PMI banner: mint confirmation when no PMI, amber estimate otherwise.
    var banner = el('dp-pmi-banner');
    if (banner) {
      if (pmi <= 0) {
        banner.className = 'dp-pmi-banner dp-banner-none';
        setText('dp-pmi-banner-ic', '✓');
        setText('dp-pmi-banner-text', 'No PMI required at ' + pctText(pct) + ' down — one less monthly cost, and a smaller loan.');
      } else {
        banner.className = 'dp-pmi-banner dp-banner-some';
        setText('dp-pmi-banner-ic', '!');
        setText('dp-pmi-banner-text', 'PMI estimated at ' + money(pmi) + '/mo — it can be cancelled at 80% LTV and ends automatically at 78%.');
      }
    }
    setText('dp-pmi-note', ltv > 80
      ? (override !== null
        ? 'Using your rate: ' + trimNum(appliedRate) + '% a year at ' + pctText(ltv) + ' LTV.'
        : 'Auto estimate: ' + trimNum(band) + '% a year at ' + pctText(ltv) + ' LTV.')
      : 'No PMI at ' + pctText(ltv) + ' LTV (20% down or more).');

    var handoff = el('dp-handoff');
    if (handoff) {
      handoff.setAttribute('href', '../mortgage-calculator/?price=' + Math.round(price) +
        '&down=' + Math.round(down) + '&rate=' + trimNum(rate) + '&term=' + years);
    }

    var cards = document.querySelectorAll('.dp-tier-card');
    for (var t = 0; t < cards.length; t++) {
      var card = cards[t];
      var tierPct = Number(card.getAttribute('data-pct'));
      if (!Number.isFinite(tierPct)) continue;
      var isSelected = Math.abs(tierPct - pct) < 0.001;
      var tDown = price * tierPct / 100;
      var tCash = tDown + closing - earnest;
      var tMonthly = tierMonthly(tierPct, price, rate, years, isSelected ? override : null);
      var fDown = card.querySelector('[data-f="down"]');
      var fCtc = card.querySelector('[data-f="ctc"]');
      var fMonthly = card.querySelector('[data-f="monthly"]');
      if (fDown) fDown.textContent = money(tDown);
      if (fCtc) fCtc.textContent = money(tCash);
      if (fMonthly) fMonthly.textContent = money(tMonthly);
      card.classList.toggle('selected', isSelected);
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
  }

  function on(id, source) {
    var node = el(id);
    if (node) node.addEventListener('input', function () { compute(source); });
  }
  on('dp-price', 'price');
  on('dp-down-dollars', 'dollars');
  on('dp-down-percent', 'percent');
  on('dp-rate', 'other');
  on('dp-closing-pct', 'other');
  on('dp-pmi-rate', 'other');
  on('dp-earnest', 'other');
  var term = el('dp-term');
  if (term) term.addEventListener('change', function () { compute('other'); });

  var chips = form.querySelectorAll('.dp-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function () {
      var pctInput = el('dp-down-percent');
      if (pctInput) pctInput.value = this.getAttribute('data-pct');
      compute('chip');
    });
  }
  var picks = document.querySelectorAll('.dp-tier-card');
  for (var j = 0; j < picks.length; j++) {
    picks[j].addEventListener('click', function () {
      var pctInput = el('dp-down-percent');
      if (pctInput) pctInput.value = this.getAttribute('data-pct');
      compute('tier');
      var calc = document.querySelector('.dp-calc-section');
      if (calc && calc.scrollIntoView) calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  compute('percent');
})();

// FAQ accordion: button toggles, one open at a time.
(function () {
  if (typeof document.querySelectorAll !== 'function') return;
  var toggles = document.querySelectorAll('.dp-faq-toggle');
  if (!toggles.length) return;
  function closeAll(except) {
    for (var i = 0; i < toggles.length; i++) {
      if (toggles[i] === except) continue;
      toggles[i].setAttribute('aria-expanded', 'false');
      var panel = document.getElementById(toggles[i].getAttribute('aria-controls'));
      if (panel) panel.hidden = true;
    }
  }
  for (var i = 0; i < toggles.length; i++) {
    toggles[i].addEventListener('click', function () {
      var open = this.getAttribute('aria-expanded') === 'true';
      closeAll(this);
      this.setAttribute('aria-expanded', open ? 'false' : 'true');
      var panel = document.getElementById(this.getAttribute('aria-controls'));
      if (panel) panel.hidden = open;
    });
  }
})();
