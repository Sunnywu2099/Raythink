import { getScrollContainer, getScrollEventTarget, scrollContainerMediaQuery } from '@theme/scroll-container';

/**
 * @param {string | undefined} id
 * @returns {HTMLElement | null}
 */
function findTarget(id) {
  const key = id?.trim().replace(/^#/, '');
  if (!key) return null;

  const direct = document.getElementById(key) || document.getElementById(`shopify-section-${key}`);
  if (direct instanceof HTMLElement) return direct;

  const match = document.querySelector(`[id$="${CSS.escape(key)}"]`);
  return match instanceof HTMLElement ? match : null;
}

/**
 * Visible height of the sticky header. Zero when the header is not stuck to the top.
 * @returns {number}
 */
function stickyHeaderOffset() {
  const header = document.querySelector('#header-component');
  if (!(header instanceof HTMLElement)) return 0;

  const section = header.closest('.shopify-section');
  if (!(section instanceof HTMLElement)) return 0;
  if (getComputedStyle(section).position !== 'sticky') return 0;

  const rect = section.getBoundingClientRect();
  if (rect.top > 1) return Math.round(rect.height);
  return Math.max(0, Math.round(rect.bottom));
}

class RtNav extends HTMLElement {
  /** @type {boolean} */
  #ready = false;

  /** @type {AbortController | undefined} */
  #abort;

  /** @type {AbortController | undefined} */
  #scrollAbort;

  /** @type {ResizeObserver | undefined} */
  #headerObserver;

  /** @type {number | null} */
  #frame = null;

  connectedCallback() {
    if (this.#ready) return;
    this.#ready = true;
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.addEventListener('click', this.#onClick, { signal });
    this.#bindScroll();
    scrollContainerMediaQuery.addEventListener('change', this.#bindScroll, { signal });

    const header = document.querySelector('#header-component');
    if (header instanceof HTMLElement) {
      this.#headerObserver = new ResizeObserver(() => this.#sync());
      this.#headerObserver.observe(header);
      const section = header.closest('.shopify-section');
      if (section) this.#headerObserver.observe(section);
    }

    this.#sync();
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#scrollAbort?.abort();
    this.#headerObserver?.disconnect();
    this.#headerObserver = undefined;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#ready = false;
  }

  #bindScroll = () => {
    this.#scrollAbort?.abort();
    this.#scrollAbort = new AbortController();
    getScrollEventTarget().addEventListener('scroll', this.#onScroll, {
      passive: true,
      signal: this.#scrollAbort.signal,
    });
    this.#sync();
  };

  #onScroll = () => {
    if (this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#sync();
    });
  };

  #sync() {
    const offset = stickyHeaderOffset();
    const section = this.closest('.shopify-section');
    (section instanceof HTMLElement ? section : this).style.setProperty('--rt-nav-top', `${offset}px`);
    this.#syncActive(offset + this.offsetHeight);
  }

  /**
   * @param {number} line
   */
  #syncActive(line) {
    /** @type {HTMLButtonElement | null} */
    let current = null;

    for (const button of this.#buttons()) {
      const target = findTarget(button.dataset.rtNavTarget);
      if (!target) continue;
      if (target.getBoundingClientRect().top <= line + 8) current = button;
    }

    this.#setActive(current);
  }

  /**
   * @param {HTMLButtonElement | null} current
   */
  #setActive(current) {
    for (const button of this.#buttons()) {
      const active = button === current;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
  }

  /**
   * @param {HTMLButtonElement} button
   */
  #reveal(button) {
    const scroller = button.parentElement;
    if (!scroller) return;
    const left = button.offsetLeft - (scroller.clientWidth - button.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  /** @returns {HTMLButtonElement[]} */
  #buttons() {
    return [...this.querySelectorAll('[data-rt-nav-target]')].filter((button) => button instanceof HTMLButtonElement);
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const source = event.target instanceof Element ? event.target : null;
    const button = source?.closest('[data-rt-nav-target]');
    if (!(button instanceof HTMLButtonElement) || !this.contains(button)) return;

    const target = findTarget(button.dataset.rtNavTarget);
    if (!target) return;

    const container = getScrollContainer();
    const containerTop =
      container === document.scrollingElement || container === document.documentElement ? 0 : container.getBoundingClientRect().top;
    const offset = stickyHeaderOffset() + this.offsetHeight;
    const top = container.scrollTop + target.getBoundingClientRect().top - containerTop - offset;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    container.scrollTo({
      top: Math.max(0, top),
      behavior: reduce ? 'auto' : 'smooth',
    });
    this.#setActive(button);
    this.#reveal(button);
  };
}

if (!customElements.get('rt-nav')) {
  customElements.define('rt-nav', RtNav);
}
