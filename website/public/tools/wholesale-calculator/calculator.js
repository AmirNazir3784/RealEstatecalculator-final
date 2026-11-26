(function () {
  'use strict';
  var form = document.getElementById('wholesale-form');
  if (!form) return;
  function val(id) { var el = document.getElementById(id); var n = el ? parseFloat(el.value) : NaN; return isNaN(n) ? 0 : n; }
  function set(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function usd(v) { return (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }
  function compute() {
    var arv = Math.max(val('arv'), 0);
    var repairs = Math.max(val('repairs'), 0);
    var pct = Math.min(Math.max(val('discount-pct'), 0), 100);
    var fee = Math.max(val('wholesale-fee'), 0);
    var asking = Math.max(val('asking-price'), 0);
    var closing = Math.max(val('closing-costs'), 0);
    var buyer = arv * pct / 100 - repairs - closing;
    var offer = buyer - fee;
    return { arv: arv, repairs: repairs, pct: pct, fee: fee, asking: asking, closing: closing, buyer: buyer, offer: offer };
  }
  function run() {
    var r = compute();
    set('ws-value', usd(r.offer));
    set('sticky-value', usd(r.offer));
    var head = r.offer - r.asking;
    set('ws-verdict', r.asking <= 0 ? 'Enter an asking price to test the deal'
      : head >= 0 ? 'Works at asking — ' + usd(head) + ' to spare'
      : 'Asking is ' + usd(-head) + ' over your max');
    var vEl = document.getElementById('ws-verdict');
    if (vEl) {
      vEl.classList.toggle('is-good', r.asking > 0 && head >= 0);
      vEl.classList.toggle('is-bad', r.asking > 0 && head < 0);
    }
    set('row-buyer', usd(r.buyer));
    set('row-offer', usd(r.offer));
    set('row-fee', usd(r.fee));
    var total = Math.max(r.buyer, 0);
    var offerEl = document.getElementById('seg-offer'), feeEl = document.getElementById('seg-fee');
    if (offerEl && feeEl && total > 0) {
      offerEl.style.width = (Math.max(r.offer, 0) / total * 100) + '%';
      feeEl.style.width = (Math.max(r.fee, 0) / total * 100) + '%';
    }
    set('tile-arv', r.arv > 0 ? (r.offer / r.arv * 100).toFixed(1) + '%' : '—');
    set('tile-headroom', r.asking > 0 ? usd(head) : '—');
    var body = document.getElementById('ladder-body');
    if (body) {
      body.innerHTML = [65, 70, 75, 80].map(function (p) {
        var b = r.arv * p / 100 - r.repairs - r.closing;
        var o = b - r.fee;
        return '<tr' + (p === Math.round(r.pct) ? ' class="final-row"' : '') + '><td>' + p + '% of ARV</td><td>' + usd(b) + '</td><td>' + usd(o) + '</td></tr>';
      }).join('');
    }
  }
  form.addEventListener('input', run);
  run();
  var copyBtn = document.getElementById('copy-results');
  if (copyBtn && navigator.clipboard) {
    copyBtn.addEventListener('click', function () {
      var r = compute();
      var text = 'Wholesale Calculator — maximum offer to seller ' + usd(r.offer) + ' on a ' + usd(r.arv) + ' ARV (' + r.pct + '% rule, ' + usd(r.repairs) + ' repairs, ' + usd(r.fee) + ' wholesale fee).';
      navigator.clipboard.writeText(text).then(function () {
        var old = copyBtn.textContent;
        copyBtn.textContent = 'Copied ✓';
        setTimeout(function () { copyBtn.textContent = old; }, 1600);
      });
    });
  }
})();
