const consentForm = document.querySelector('#consent-form');
const consentCheckbox = document.querySelector('#legal-consent');

consentForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!consentForm.reportValidity() || !consentCheckbox.checked) return;
  window.location.assign('thank-you.html');
});
// Require an explicit choice on every visit, including browser history navigation.
window.addEventListener('pageshow', () => {
  consentCheckbox.checked = false;
});
