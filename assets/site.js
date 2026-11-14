(function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.nav');
  var tools = document.querySelector('#tools-menu');
  var trigger = document.querySelector('#tools-menu-toggle');
  var panel = document.querySelector('#tools-mega-menu');
  var overlay = document.querySelector('#tools-menu-overlay');
  var closeTimer;
  var hoverOpened = false;
  var ready = tools && trigger && panel && overlay;
  function desktopHover() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 761px) and (hover: hover) and (pointer: fine)').matches;
  }
  function cancelClose() {
    if (closeTimer !== undefined && typeof clearTimeout === 'function') clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  function setTools(open, returnFocus) {
    if (!ready) return;
    cancelClose();
    hoverOpened = false;
    panel.hidden = !open;
    overlay.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (returnFocus && trigger.focus) trigger.focus();
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      if (!open) setTools(false);
    });
  }
  if (ready) {
    // Remember the state before pointer hover, so the first click opens on
    // both a mouse (whose pointerenter already opened it) and a touch screen.
    var openAtPointerDown;
    trigger.addEventListener('pointerdown', function () { openAtPointerDown = trigger.getAttribute('aria-expanded') === 'true' && !hoverOpened; });
    trigger.addEventListener('click', function (event) {
      var wasOpen = event.detail && openAtPointerDown !== undefined ? openAtPointerDown : trigger.getAttribute('aria-expanded') === 'true';
      openAtPointerDown = undefined;
      setTools(!wasOpen);
    });
    tools.addEventListener('pointerenter', function () {
      if (desktopHover()) {
        if (panel.hidden) { setTools(true); hoverOpened = true; }
        else cancelClose();
      }
    });
    tools.addEventListener('pointerleave', function () {
      if (!desktopHover() || (tools.contains && tools.contains(document.activeElement))) return;
      cancelClose();
      if (typeof setTimeout === 'function') closeTimer = setTimeout(function () { setTools(false); }, 180);
    });
    tools.addEventListener('focusin', cancelClose);
    tools.addEventListener('focusout', function (event) {
      if (!tools.contains(event.relatedTarget)) setTools(false);
    });
    overlay.addEventListener('click', function () { setTools(false); });
    document.addEventListener('click', function (event) {
      if (!tools.contains(event.target)) setTools(false);
    });
    // Close on a desktop/mobile breakpoint change; don't leave a detached
    // overlay behind a now-hidden mobile navigation.
    if (typeof window.matchMedia === 'function') {
      var mobile = window.matchMedia('(max-width: 760px)');
      if (mobile.addEventListener) mobile.addEventListener('change', function () { setTools(false); });
    }
  }
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (ready && !panel.hidden) {
      setTools(false, tools.contains(document.activeElement));
      return;
    }
    if (toggle && nav) {
      var returnFocus = nav.contains(document.activeElement);
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) toggle.focus();
    }
  });
  /* Stop the mouse wheel / trackpad from changing a focused number input.
     One delegated listener, so it also covers fields shown later (for example
     inside collapsible sections). blur() is used instead of preventDefault()
     so the page keeps scrolling normally; the listener is passive for the
     same reason. Keyboard stepping (Arrow Up / Down) is untouched, and range
     sliders are not covered: in Chromium the wheel neither changes a focused
     slider's value nor blocks page scrolling, so blurring one would only
     take keyboard focus away for no benefit. No calculator has a blur
     handler, and calculators recalculate on 'input' events, so blurring
     without a value change cannot produce a wrong result or a validation
     error; the value, selection properties and validity of the field are
     left exactly as they were. */
  document.addEventListener('wheel', function (e) {
    var el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number' && e.target === el) {
      el.blur();
    }
  }, { passive: true });
})();

/* RealtorCRM links: anchors marked data-crm-link get their href from the
   central site config, so the CRM origin is configured in exactly one
   place (assets/site-config.js) instead of being hardcoded per anchor.
   Without a configured base URL the anchors keep their in-page fallback
   href, so nothing breaks if the config is ever removed. */
(function () {
  var base = window.siteConfig && window.siteConfig.crmBaseUrl;
  if (!base) return;
  base = String(base).replace(/\/+$/, '');
  document.querySelectorAll('[data-crm-link]').forEach(function (a) {
    var kind = a.getAttribute('data-crm-link');
    if (kind === 'signup') a.href = base + '/?mode=create';
    else if (kind === 'login') a.href = base + '/';
  });
})();
