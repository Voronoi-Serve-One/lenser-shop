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

  const revealActive = () => {
    if (!active || nav.scrollWidth <= nav.clientWidth) {
      place(active);
      return;
    }

    const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
    nav.scrollLeft = Math.max(0, Math.min(target, nav.scrollWidth - nav.clientWidth));
    place(active);
  };

  revealActive();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      nav.classList.add('is-ready');
      revealActive();
    });
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
    document.fonts.ready.then(() => {
      revealActive();
      place(hovered || active);
    });
  }
})();

(() => {
  const forms = document.querySelectorAll('[data-auth-form], [data-account-form]');
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

    const sync = () => {
      const value = Number(input.value);
      if (decrease) decrease.disabled = value <= min;
      if (increase) increase.disabled = value >= max;
    };

    const setValue = (value) => {
      const next = clamp(value);
      const changed = String(next) !== input.value;
      input.value = String(next);
      sync();
      if (changed) {
        input.dispatchEvent(new CustomEvent('qtychange', { bubbles: true }));
      }
    };

    decrease?.addEventListener('click', () => setValue(Number(input.value) - 1));
    increase?.addEventListener('click', () => setValue(Number(input.value) + 1));
    input.addEventListener('change', () => setValue(Number(input.value) || min));
    input.addEventListener('blur', () => setValue(Number(input.value) || min));
    input.addEventListener('qty-sync', sync);
    sync();
  });
})();

(() => {
  const setupClickMenu = ({ triggerSelector, menuSelector, wrapperSelector, onOpen, onClose }) => {
    const trigger = document.querySelector(triggerSelector);
    const menu = document.querySelector(menuSelector);
    if (!trigger || !menu) return;

    const wrapper = trigger.closest(wrapperSelector);
    if (!wrapper) return;

    const setOpen = (open) => {
      if ((trigger.getAttribute('aria-expanded') === 'true') === open) return;
      trigger.setAttribute('aria-expanded', String(open));
      wrapper.classList.toggle('is-open', open);
      if (open && onOpen) onOpen();
      if (!open && onClose) onClose();
    };

    trigger.addEventListener('click', () => {
      setOpen(trigger.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (trigger.getAttribute('aria-expanded') !== 'true') return;
      setOpen(false);
      trigger.focus({ preventScroll: true });
    });

    wrapper.addEventListener('focusout', (event) => {
      if (!wrapper.contains(event.relatedTarget)) setOpen(false);
    });

    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
  };

  const lockSearchScroll = () => {
    const gutter = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.documentElement.style.setProperty('--search-scrollbar-gutter', `${gutter}px`);
    document.documentElement.classList.add('is-search-open');
    document.body.classList.add('is-search-open');
  };

  const unlockSearchScroll = () => {
    document.documentElement.classList.remove('is-search-open');
    document.body.classList.remove('is-search-open');
    document.documentElement.style.removeProperty('--search-scrollbar-gutter');
  };

  setupClickMenu({
    triggerSelector: '[data-account-trigger]',
    menuSelector: '[data-account-menu]',
    wrapperSelector: '.nav-item--account',
  });
  setupClickMenu({
    triggerSelector: '[data-cart-trigger]',
    menuSelector: '[data-cart-menu]',
    wrapperSelector: '.nav-item--cart',
  });
  setupClickMenu({
    triggerSelector: '[data-search-trigger]',
    menuSelector: '[data-search-menu]',
    wrapperSelector: '.nav-item--search',
    onOpen: () => {
      lockSearchScroll();
      const input = document.querySelector('[data-search-input]');
      if (!input) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => input.focus({ preventScroll: true }));
      });
    },
    onClose: unlockSearchScroll,
  });
})();

(() => {
  const header = document.querySelector('body > header');
  if (!header) return undefined;

  const brands = header.querySelector('.brands');
  const root = document.documentElement;
  let scrollFrame = 0;

  const measureBrands = () => {
    if (!brands) return;
    const wasCompact = header.classList.contains('is-compact');
    if (wasCompact) header.classList.remove('is-compact');
    const height = Math.round(brands.getBoundingClientRect().height);
    if (wasCompact) header.classList.add('is-compact');
    root.style.setProperty('--brands-height', `${height}px`);
  };

  const measureHeader = () => {
    root.style.setProperty('--header-height', `${Math.round(header.getBoundingClientRect().height)}px`);
  };

  const updateCompact = () => {
    header.classList.toggle('is-compact', window.scrollY > 72);
    measureHeader();
  };

  const onScroll = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateCompact();
    });
  };

  measureBrands();
  updateCompact();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    measureBrands();
    updateCompact();
  });

  if (document.fonts) {
    document.fonts.ready.then(() => {
      measureBrands();
      updateCompact();
    });
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(measureHeader).observe(header);
  }
})();

(() => {
  const buttons = Array.from(document.querySelectorAll('[data-nav-toggle]'));
  if (!buttons.length) return;

  const setLabel = (button, open) => {
    const label = button.getAttribute('aria-label') || '';
    button.setAttribute('aria-label', label.replace(/^(Show|Hide)\b/, open ? 'Hide' : 'Show'));
  };

  const close = (button) => {
    button.setAttribute('aria-expanded', 'false');
    button.closest('.nav-item')?.classList.remove('is-open');
    setLabel(button, false);
  };

  buttons.forEach((button) => {
    const menu = document.getElementById(button.getAttribute('aria-controls'));
    const wrapper = button.closest('.nav-item');
    if (!menu || !wrapper) return;

    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      buttons.forEach((other) => {
        if (other !== button) close(other);
      });
      button.setAttribute('aria-expanded', String(open));
      wrapper.classList.toggle('is-open', open);
      setLabel(button, open);
    });

    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) close(button);
    });

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) close(button);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (button.getAttribute('aria-expanded') !== 'true') return;
      close(button);
      button.focus({ preventScroll: true });
    });

    wrapper.addEventListener('focusout', (event) => {
      if (!wrapper.contains(event.relatedTarget)) close(button);
    });
  });
})();

(() => {
  const input = document.querySelector('.search-form--page input[name="q"]');
  if (!input || input.value) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  requestAnimationFrame(() => input.focus({ preventScroll: true }));
})();

(() => {
  const render = () => window.lucide?.createIcons();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();

(() => {
  const summary = document.querySelector('[data-error-summary]');
  if (!summary) return;
  summary.focus({ preventScroll: true });
})();

(() => {
  const region = document.querySelector('[data-toast-region]');
  if (!region) return;

  const removeToast = (toast) => {
    if (!toast.isConnected) return;
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 180);
  };

  const showToast = (message, { type = 'success', actionUrl = '', actionLabel = '' } = {}) => {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('i');
    icon.className = 'toast__icon';
    icon.setAttribute('data-lucide', type === 'error' ? 'circle-alert' : 'circle-check');
    icon.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'toast__body';

    const text = document.createElement('p');
    text.textContent = message;
    body.append(text);

    if (actionUrl && actionLabel) {
      const action = document.createElement('a');
      action.className = 'toast__action';
      action.href = actionUrl;
      action.textContent = actionLabel;
      body.append(action);
    }

    const close = document.createElement('button');
    close.className = 'toast__close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';

    toast.append(icon, body, close);
    region.append(toast);

    while (region.children.length > 3) {
      region.firstElementChild.remove();
    }

    window.lucide?.createIcons();

    const duration = actionUrl ? 6500 : 4200;
    let timer = window.setTimeout(() => removeToast(toast), duration);

    const pause = () => window.clearTimeout(timer);
    const resume = () => {
      pause();
      timer = window.setTimeout(() => removeToast(toast), Math.min(3200, duration));
    };

    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', resume);
    close.addEventListener('click', () => {
      pause();
      removeToast(toast);
    });
  };

  window.lenserToast = showToast;
})();

(() => {
  if (!window.fetch || !window.FormData) return;

  const postForm = async (endpoint, form, submitter) => {
    const data = new FormData(form);
    if (submitter && submitter.name) data.append(submitter.name, submitter.value);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'fetch',
        Accept: 'application/json',
      },
      body: new URLSearchParams(data),
      credentials: 'same-origin',
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.status === 401 && payload) {
      if (payload.registerUrl) {
        window.location.assign(payload.registerUrl);
        return { unauthorized: true };
      }

      if (payload.loginUrl) {
        window.lenserToast?.(payload.error || 'Sign in to continue.', {
          type: 'error',
          actionUrl: payload.loginUrl,
          actionLabel: 'Sign in',
        });
        return { unauthorized: true };
      }
    }

    if (!response.ok || !payload || payload.ok === false) {
      throw new Error(payload?.error || 'Something went wrong. Please try again.');
    }

    return payload;
  };

  const setPending = (button, pending) => {
    if (!button) return;
    button.disabled = pending;
    button.classList.toggle('is-pending', pending);
    button.setAttribute('aria-busy', String(pending));
  };

  const updateCartBadge = (count) => {
    const numericCount = Number(count) || 0;
    document.querySelectorAll('.icon-btn--cart').forEach((trigger) => {
      let badge = trigger.querySelector('.cart-count');
      if (numericCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'cart-count';
          badge.setAttribute('aria-hidden', 'true');
          trigger.append(badge);
        }
        badge.textContent = numericCount > 9 ? '9+' : String(numericCount);
      } else if (badge) {
        badge.remove();
      }

      const itemCopy = numericCount === 1 ? 'item' : 'items';
      trigger.setAttribute(
        'aria-label',
        numericCount > 0 ? `Cart, ${numericCount} ${itemCopy}` : 'Cart, empty',
      );
    });
  };

  const updateMiniCart = (html) => {
    const container = document.querySelector('[data-cart-menu]');
    if (!container || !html) return;
    container.innerHTML = html;
    window.lucide?.createIcons();
  };

  const formatPhp = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  });

  const updateCartTotals = (payload) => {
    const setText = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };

    if (typeof payload.subtotal === 'number') {
      setText('[data-cart-subtotal]', formatPhp.format(payload.subtotal));
    }
    if (typeof payload.shipping === 'number') {
      setText(
        '[data-cart-shipping]',
        payload.shipping === 0 ? 'Free' : formatPhp.format(payload.shipping),
      );
    }
    if (typeof payload.total === 'number') {
      setText('[data-cart-total]', formatPhp.format(payload.total));
    }
  };

  const updateCartLede = (count) => {
    const lede = document.querySelector('[data-cart-lede]');
    if (!lede) return;
    const numericCount = Number(count) || 0;
    lede.textContent =
      numericCount > 0
        ? `${numericCount} ${numericCount === 1 ? 'item' : 'items'} ready to check out.`
        : 'Nothing in your cart yet.';
  };

  const cartTimers = new WeakMap();

  document.querySelectorAll('[data-cart-line-form]').forEach((form) => {
    const input = form.querySelector('[data-qty-input]');
    if (!input) return;

    input.dataset.savedValue = input.value;

    input.addEventListener('qtychange', () => {
      window.clearTimeout(cartTimers.get(form));
      if (input.value === input.dataset.savedValue) return;

      cartTimers.set(
        form,
        window.setTimeout(() => {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
          } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }, 300),
      );
    });
  });

  const setWishlistState = (button, saved) => {
    if (!button) return;
    const label = saved ? 'Remove from saved gear' : 'Save to saved gear';
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  };

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const submitter =
      event.submitter || form.querySelector('button[type="submit"], button:not([type])');
    const wishlistButton =
      submitter && submitter.matches('[data-wishlist-toggle]')
        ? submitter
        : form.querySelector('[data-wishlist-toggle]');
    const wishlistAction = submitter?.getAttribute('formaction') || form.getAttribute('action') || '';
    const isWishlistSubmit =
      Boolean(wishlistButton) &&
      (form.action.includes('/wishlist/toggle') || wishlistAction.includes('/wishlist/toggle'));

    if (isWishlistSubmit) {
      event.preventDefault();
      const productId =
        wishlistButton.dataset.productId ||
        form.querySelector('input[name="productId"]')?.value ||
        '';
      setPending(wishlistButton, true);

      try {
        const payload = await postForm(wishlistAction || '/wishlist/toggle', form, submitter);
        if (payload.unauthorized) return;

        document
          .querySelectorAll(`[data-wishlist-toggle][data-product-id="${productId}"]`)
          .forEach((button) => setWishlistState(button, payload.saved));

        window.lenserToast?.(
          payload.saved
            ? `${payload.productName} saved to your gear.`
            : `${payload.productName} removed from saved gear.`,
        );
      } catch (error) {
        window.lenserToast?.(error.message, { type: 'error' });
      } finally {
        setPending(wishlistButton, false);
      }
      return;
    }

    if (form.matches('[data-cart-line-form]')) {
      event.preventDefault();

      const input = form.querySelector('[data-qty-input]');
      const line = form.closest('[data-cart-line]');

      if (form.dataset.saving === 'true') {
        form.dataset.pending = 'true';
        return;
      }

      const submittedValue = input ? input.value : null;

      form.dataset.saving = 'true';
      form.dataset.pending = 'false';
      line?.classList.add('is-saving');

      try {
        const payload = await postForm(form.action, form);
        if (payload.unauthorized) return;

        updateCartBadge(payload.cartCount);
        updateMiniCart(payload.miniCartHtml);
        updateCartTotals(payload);
        updateCartLede(payload.cartCount);

        if (input) {
          const savedValue = String(payload.quantity);
          if (input.value === submittedValue) {
            input.value = savedValue;
            input.dispatchEvent(new Event('qty-sync'));
          }
          input.dataset.savedValue = savedValue;
        }

        const lineTotal = line?.querySelector('[data-line-total]');
        if (lineTotal && typeof payload.lineTotal === 'number') {
          lineTotal.textContent = formatPhp.format(payload.lineTotal);
        }
      } catch (error) {
        if (input) {
          input.value = input.dataset.savedValue || input.value;
          input.dispatchEvent(new Event('qty-sync'));
        }
        window.lenserToast?.(error.message, { type: 'error' });
      } finally {
        form.dataset.saving = 'false';
        line?.classList.remove('is-saving');

        if (form.dataset.pending === 'true' && input && input.value !== input.dataset.savedValue) {
          form.dataset.pending = 'false';
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
        }
      }

      return;
    }

    if (!form.matches('form[action="/cart/add"]')) return;

    if (
      !submitter ||
      submitter.name === 'checkout' ||
      submitter.value === '1' ||
      (submitter.getAttribute('formaction') || '').includes('/wishlist/toggle') ||
      (submitter.getAttribute('formaction') || '').includes('/checkout')
    ) {
      return;
    }

    event.preventDefault();
    setPending(submitter, true);

    try {
      const payload = await postForm(form.action, form, submitter);
      if (payload.unauthorized) return;

      updateCartBadge(payload.cartCount);
      updateMiniCart(payload.miniCartHtml);
      window.lenserToast?.(`${payload.productName} added to your cart.`);
    } catch (error) {
      window.lenserToast?.(error.message, { type: 'error' });
    } finally {
      setPending(submitter, false);
    }
  });
})();
