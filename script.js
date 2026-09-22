const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileNav = document.querySelector('[data-mobile-nav]');
const modal = document.querySelector('[data-modal]');
const progressBar = document.querySelector('[data-progress]');
let modalTrigger;
let savedOverflow = '';
let backgroundState = [];

function updatePage() {
  header?.classList.toggle('scrolled', window.scrollY > 8);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) progressBar.style.width = (max > 0 ? Math.min(100, Math.max(0, window.scrollY / max * 100)) : 0) + '%';
}
updatePage();
window.addEventListener('scroll', updatePage, { passive: true });
window.addEventListener('resize', updatePage);
window.addEventListener('load', updatePage);

function setMenu(open) {
  if (!mobileNav || !menuToggle) return;
  mobileNav.classList.toggle('open', open);
  mobileNav.inert = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
}
menuToggle?.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
mobileNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('click', event => {
  if (mobileNav?.classList.contains('open') && !header.contains(event.target)) setMenu(false);
});
window.matchMedia('(min-width:981px)').addEventListener('change', event => {
  if (event.matches) setMenu(false);
});

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion:reduce)').matches) {
  document.documentElement.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function openModal(event) {
  if (!modal) return;
  modalTrigger = event.currentTarget;
  const format = modalTrigger.dataset.ticket === 'online' ? 'Онлайн-участь' : 'Офлайн-участь у Києві';
  modal.querySelector('#modal-title').textContent = format;
  modal.querySelector('[data-ticket-message]').textContent = 'Щоб уточнити вартість та придбати квиток, зв’яжіться з організаторкою Ольгою. Конференція відбудеться 17 жовтня о 10:00.';
  savedOverflow = document.body.style.overflow;
  backgroundState = [...document.querySelectorAll('body > header, body > main, body > footer')].map(el => [el, el.inert]);
  backgroundState.forEach(([el]) => { el.inert = true; });
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  modal.querySelector('.modal-close').focus();
}
function closeModal() {
  if (!modal?.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = savedOverflow;
  backgroundState.forEach(([el, old]) => { el.inert = old; });
  modalTrigger?.focus();
}
document.querySelectorAll('[data-buy-button]').forEach(btn => btn.addEventListener('click', openModal));
document.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', closeModal));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (modal?.classList.contains('open')) closeModal();
    else if (mobileNav?.classList.contains('open')) {
      setMenu(false);
      menuToggle.focus();
    }
  }
  if (event.key === 'Tab' && modal?.classList.contains('open')) {
    const focusable = [...modal.querySelectorAll('button, a[href], [tabindex="0"]')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
const marquee = document.querySelector('[data-marquee] .ticker-track');
if (marquee) [...marquee.children].forEach(child => {
  const copy = child.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  marquee.append(copy);
});
