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

(() => {
  const forms = document.querySelectorAll('[data-auth-form]');
  if (!forms.length) return;

  const strengthCopy = [
    'At least 8 characters',
    'Weak. Add more characters.',
    'Fair. Add a number or symbol.',
    'Good. Add one more variation.',
    'Strong password.',
  ];

  const scorePassword = (value) => {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return Math.min(score, 4);
  };

  const setHint = (element, text, state) => {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('is-valid', state === 'valid');
    element.classList.toggle('is-invalid', state === 'invalid');
  };

  forms.forEach((form) => {
    const password = form.querySelector('[data-password]');
    const confirm = form.querySelector('[data-confirm]');
    const strength = form.querySelector('[data-strength]');
    const strengthLabel = form.querySelector('[data-strength-label]');
    const confirmHint = form.querySelector('[data-confirm-hint]');
    const capsHint = form.querySelector('[data-caps-hint]');
    const submit = form.querySelector('[data-submit]');

    form.querySelectorAll('[data-password-toggle]').forEach((toggle) => {
      const input = toggle.closest('.auth__control')?.querySelector('input');
      if (!input) return;

      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(reveal));
        toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
        input.focus({ preventScroll: true });
      });
    });

    const updateStrength = () => {
      if (!password || !strength) return;

      const score = scorePassword(password.value);
      strength.dataset.score = String(score);

      if (strengthLabel) {
        setHint(
          strengthLabel,
          strengthCopy[score],
          score === 4 ? 'valid' : ''
        );
      }
    };

    const checkConfirm = () => {
      if (!confirm || !password) return;

      if (!confirm.value) {
        setHint(confirmHint, 'Enter the same password again', '');
        confirm.setCustomValidity('');
        return;
      }

      const matches = confirm.value === password.value;
      setHint(
        confirmHint,
        matches ? 'Passwords match' : 'Passwords do not match',
        matches ? 'valid' : 'invalid'
      );
      confirm.setCustomValidity(matches ? '' : 'Passwords do not match.');
    };

    const updateCaps = (event) => {
      if (!capsHint || typeof event.getModifierState !== 'function') return;
      capsHint.hidden = !event.getModifierState('CapsLock');
    };

    if (password) {
      password.addEventListener('input', () => {
        updateStrength();
        checkConfirm();
      });
      password.addEventListener('keydown', updateCaps);
      password.addEventListener('keyup', updateCaps);
      password.addEventListener('blur', () => {
        if (capsHint) capsHint.hidden = true;
      });
    }

    if (confirm) {
      confirm.addEventListener('input', checkConfirm);
    }

    updateStrength();

    form.addEventListener('submit', () => {
      if (!submit || submit.disabled) return;
      form.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      submit.textContent = submit.dataset.busyLabel || submit.textContent;
    });
  });
})();

(() => {
  const roots = document.querySelectorAll('[data-tabs]');
  if (!roots.length) return;

  roots.forEach((root) => {
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));
    if (!tabs.length || !panels.length) return;

    const select = (index, focus = false) => {
      tabs.forEach((tab, tabIndex) => {
        const active = tabIndex === index;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });

      panels.forEach((panel, panelIndex) => {
        panel.hidden = panelIndex !== index;
      });

      if (focus) tabs[index].focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', (event) => {
        let next = index;

        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;

        event.preventDefault();
        select(next, true);
      });
    });

    const initial = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    select(initial >= 0 ? initial : 0);
  });
})();

(() => {
  const steppers = document.querySelectorAll('[data-qty]');
  if (!steppers.length) return;

  steppers.forEach((stepper) => {
    const input = stepper.querySelector('[data-qty-input]');
    if (!input) return;

    const decrease = stepper.querySelector('[data-qty-decrease]');
    const increase = stepper.querySelector('[data-qty-increase]');
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 10;
    const clamp = (value) => Math.min(max, Math.max(min, value));
    const setValue = (value) => {
      input.value = String(clamp(value));
    };

    decrease?.addEventListener('click', () => setValue(Number(input.value) - 1));
    increase?.addEventListener('click', () => setValue(Number(input.value) + 1));
    input.addEventListener('change', () => setValue(Number(input.value) || min));
    input.addEventListener('blur', () => setValue(Number(input.value) || min));
  });
})();
