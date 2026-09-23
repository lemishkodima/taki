const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileNav = document.querySelector('[data-mobile-nav]');
const progressBar = document.querySelector('[data-progress]');

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

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileNav?.classList.contains('open')) {
    setMenu(false);
    menuToggle.focus();
  }
});
const marquee = document.querySelector('[data-marquee] .ticker-track');
if (marquee) [...marquee.children].forEach(child => {
  const copy = child.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  marquee.append(copy);
});

// One ticket, with the dated rates specified in Конференція.docx.
// 1 October 2026, 00:00 Kyiv (UTC+03:00).
function updateTicketPrice(now = new Date()) {
  const standardRate = now.getTime() >= Date.parse('2026-10-01T00:00:00+03:00');
  document.querySelector('[data-rate="early"]')?.classList.toggle('price-active', !standardRate);
  document.querySelector('[data-rate="standard"]')?.classList.toggle('price-active', standardRate);
}
updateTicketPrice();
window.addEventListener('pageshow', () => updateTicketPrice());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateTicketPrice();
});
setInterval(updateTicketPrice, 1000);
