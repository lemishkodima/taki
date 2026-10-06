// Track ticket checkout before sending visitors to WayForPay.
const paymentOrigin = 'https://secure.wayforpay.com';
const trackCheckout = () => {
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'InitiateCheckout', { currency: 'UAH' });
    }
  } catch (_) { /* Analytics must never prevent payment. */ }
};

// Direct purchase links in the header, hero, program and venue sections.
document.querySelectorAll('a[data-payment-cta]').forEach(link => {
  let navigating = false;
  link.addEventListener('click', event => {
    if (navigating || event.defaultPrevented) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== paymentOrigin) return;
    navigating = true;
    event.preventDefault();
    trackCheckout();
    // Give the asynchronous Pixel request a short head start, then always proceed.
    window.setTimeout(() => { window.location.href = destination.href; }, 250);
  });
  window.addEventListener('pageshow', () => { navigating = false; });
});

// Keep the ticket card's required legal consent validation.
document.querySelectorAll('form.ticket-consent-form').forEach(form => {
  let submitted = false;
  form.addEventListener('submit', event => {
    if (event.defaultPrevented || submitted || !form.checkValidity()) return;
    const destination = new URL(form.action, location.href);
    if (destination.origin !== paymentOrigin) return;
    submitted = true;
    event.preventDefault();
    trackCheckout();
    window.setTimeout(() => HTMLFormElement.prototype.submit.call(form), 250);
  });
  window.addEventListener('pageshow', () => { submitted = false; });
});
