// Track only a valid form submission to the configured payment provider.
document.querySelectorAll('form.ticket-consent-form').forEach(form => {
  let submitted = false;
  form.addEventListener('submit', event => {
    if (event.defaultPrevented || submitted || !form.checkValidity()) return;
    const destination = new URL(form.action, location.href);
    if (destination.origin !== 'https://secure.wayforpay.com') return;
    submitted = true;
    event.preventDefault();
    try {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'InitiateCheckout', { currency: 'UAH' });
      }
    } catch (_) { /* Analytics must never prevent payment. */ }
    // Give the asynchronous Pixel request a short head start, then always proceed.
    window.setTimeout(() => HTMLFormElement.prototype.submit.call(form), 250);
  });
  window.addEventListener('pageshow', () => { submitted = false; });
});
