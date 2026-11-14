/* Round "back to top" button. Shows after scrolling down a bit. */
(function () {
  const b = document.createElement('button');
  b.className = 'totop';
  b.type = 'button';
  b.setAttribute('aria-label', 'Back to top');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  b.addEventListener('click', () => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    document.querySelector('.skip')?.focus({ preventScroll: true });
  });
  document.body.append(b);
  const update = () => b.classList.toggle('show', window.scrollY > 500);
  window.addEventListener('scroll', update, { passive: true });
  update();
})();
