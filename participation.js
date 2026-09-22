const consentForm = document.querySelector('#consent-form');
const consentCheckbox = document.querySelector('#legal-consent');
const purchaseContacts = document.querySelector('#purchase-contacts');

consentForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!consentForm.reportValidity() || !consentCheckbox.checked) return;
  purchaseContacts.hidden = false;
  document.querySelector('#purchase-title').focus();
});
consentCheckbox.addEventListener('change', () => {
  purchaseContacts.hidden = true;
});
// Each visit requires an explicit choice; do not restore consent from browser history.
window.addEventListener('pageshow', () => {
  consentCheckbox.checked = false;
  purchaseContacts.hidden = true;
});
