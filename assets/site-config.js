// Working umbrella label, not a registered company identity.
// Change this value to an approved brand when available. RealtorCRM stays separate.
window.siteConfig = Object.freeze({ brandName: 'Every Real Estate Calculator', crmBaseUrl: 'https://realtorcrm.everyrealestatecalculator.com' });
(function () {
  const name = window.siteConfig.brandName.trim();
  document.querySelectorAll('[data-brand-name]').forEach(node => { node.textContent = name; });
  document.querySelectorAll('.brand[aria-label]').forEach(node => {
    node.setAttribute('aria-label', `${name}, homepage`);
  });
  document.title = document.title.replace(/Every Real Estate Calculator/g, () => name);
  document.querySelectorAll('meta[property="og:title"], meta[name="twitter:title"]').forEach(node => {
    node.setAttribute('content', document.title);
  });
})();
