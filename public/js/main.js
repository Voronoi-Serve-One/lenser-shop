(() => {
  const nav = document.querySelector('.nav-bottom');
  if (!nav) return;

  const indicator = nav.querySelector('.nav-bottom__indicator');
  if (!indicator) return;

  const links = Array.from(nav.querySelectorAll('a'));
  const active = nav.querySelector('a.active');
  let hovered = null;

  const place = (link) => {
    if (!link) {
      indicator.style.setProperty('--indicator-width', '0px');
      return;
    }

    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    const x = linkRect.left - navRect.left + nav.scrollLeft;

    indicator.style.setProperty('--indicator-x', `${x}px`);
    indicator.style.setProperty('--indicator-width', `${linkRect.width}px`);
  };

  const restore = () => {
    hovered = null;
    place(active);
  };

  place(active);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => nav.classList.add('is-ready'));
  });

  nav.addEventListener('pointerover', (event) => {
    const link = event.target.closest('a');
    if (!link || !links.includes(link)) return;
    hovered = link;
    place(link);
  });

  nav.addEventListener('pointerleave', restore);

  nav.addEventListener('focusin', (event) => {
    const link = event.target.closest('a');
    if (!link || !links.includes(link)) return;
    hovered = link;
    place(link);
  });

  nav.addEventListener('focusout', (event) => {
    if (event.relatedTarget && nav.contains(event.relatedTarget)) return;
    restore();
  });

  window.addEventListener('resize', () => place(hovered || active));

  if (document.fonts) {
    document.fonts.ready.then(() => place(hovered || active));
  }
})();
