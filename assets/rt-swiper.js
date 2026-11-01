const LIBRARY_SCRIPT_ID = 'rt-swiper-bundle';
const LIBRARY_STYLE_ID = 'rt-swiper-css';

/** @type {Promise<typeof window.Swiper> | undefined} */
let libraryPromise;

/**
 * Loads Swiper CSS/JS once per page, then shares the same constructor.
 * @param {HTMLElement} host
 * @returns {Promise<typeof window.Swiper>}
 */
function loadSwiperLibrary(host) {
  if (window.Swiper) return Promise.resolve(window.Swiper);
  if (libraryPromise) return libraryPromise;

  libraryPromise = new Promise((resolve, reject) => {
    const cssHref = host.dataset.swiperCss;
    const jsHref = host.dataset.swiperJs;

    if (!jsHref) {
      reject(new Error('rt-swiper: missing data-swiper-js'));
      return;
    }

    if (cssHref && !document.getElementById(LIBRARY_STYLE_ID)) {
      const link = document.createElement('link');
      link.id = LIBRARY_STYLE_ID;
      link.rel = 'stylesheet';
      link.href = cssHref;
      document.head.append(link);
    }

    const existing = document.getElementById(LIBRARY_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Swiper), { once: true });
      existing.addEventListener('error', () => reject(new Error('rt-swiper: failed to load bundle')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = LIBRARY_SCRIPT_ID;
    script.src = jsHref;
    script.async = true;
    script.addEventListener('load', () => resolve(window.Swiper), { once: true });
    script.addEventListener('error', () => reject(new Error('rt-swiper: failed to load bundle')), { once: true });
    document.head.append(script);
  });

  return libraryPromise;
}

/**
 * @param {string | undefined} value
 * @param {number | string} fallback
 */
function parseSlidesPerView(value, fallback = 1) {
  if (value == null || value === '') return fallback;
  if (value === 'auto') return 'auto';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {string | undefined} value
 * @param {number} fallback
 */
function parseNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

class RtSwiper extends HTMLElement {
  /** @type {{ destroy: (deleteInstance?: boolean, cleanStyles?: boolean) => void, isBeginning?: boolean, isEnd?: boolean, isLocked?: boolean } | undefined} */
  #swiper;

  /** @type {MediaQueryList | undefined} */
  #mediaQuery;

  #connectId = 0;

  #onMediaChange = () => {
    this.#syncMode();
  };

  connectedCallback() {
    this.#connectId += 1;
    const minWidth = this.dataset.enableMinWidth;

    if (minWidth) {
      this.#mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
      this.#mediaQuery.addEventListener('change', this.#onMediaChange);
    }

    this.#syncMode();
  }

  disconnectedCallback() {
    this.#connectId += 1;
    this.#mediaQuery?.removeEventListener('change', this.#onMediaChange);
    this.#mediaQuery = undefined;
    this.#destroy();
    this.removeAttribute('data-stacked');
  }

  #shouldUseCarousel() {
    return !this.#mediaQuery || this.#mediaQuery.matches;
  }

  #syncMode() {
    const connectId = this.#connectId;
    const useCarousel = this.#shouldUseCarousel();

    this.toggleAttribute('data-stacked', !useCarousel);

    if (!useCarousel) {
      this.#destroy();
      return;
    }

    loadSwiperLibrary(this)
      .then((SwiperConstructor) => {
        if (connectId !== this.#connectId || !this.isConnected || !SwiperConstructor) return;
        if (this.#swiper) return;
        this.#init(SwiperConstructor);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  /**
   * @param {typeof window.Swiper} SwiperConstructor
   */
  #init(SwiperConstructor) {
    this.#destroy();

    const root = this.querySelector('.swiper');
    if (!(root instanceof HTMLElement)) return;

    this.#swiper = new SwiperConstructor(root, this.#buildOptions());
    this.#syncNavState();
  }

  #destroy() {
    this.#swiper?.destroy(true, true);
    this.#swiper = undefined;
  }

  #syncNavState() {
    const prev = this.querySelector('[data-rt-swiper-prev]');
    const next = this.querySelector('[data-rt-swiper-next]');
    if (!(prev instanceof HTMLButtonElement) || !(next instanceof HTMLButtonElement)) return;

    const locked = Boolean(this.#swiper?.isLocked);
    const disablePrev = locked || Boolean(this.#swiper?.isBeginning);
    const disableNext = locked || Boolean(this.#swiper?.isEnd);

    prev.disabled = disablePrev;
    next.disabled = disableNext;
    prev.setAttribute('aria-disabled', String(disablePrev));
    next.setAttribute('aria-disabled', String(disableNext));
  }

  #buildOptions() {
    /** @type {Record<string, unknown>} */
    let extra = {};

    if (this.dataset.options) {
      try {
        extra = JSON.parse(this.dataset.options);
      } catch (error) {
        console.warn('rt-swiper: invalid data-options JSON', error);
      }
    }

    /** @type {Record<string, unknown>} */
    const options = {
      slidesPerView: parseSlidesPerView(this.dataset.slidesPerView),
      spaceBetween: parseNumber(this.dataset.spaceBetween, 0),
      speed: parseNumber(this.dataset.speed, 400),
      loop: this.dataset.loop === 'true',
      grabCursor: this.dataset.grabCursor !== 'false',
      watchOverflow: true,
      ...extra,
    };

    if (this.dataset.centeredSlides === 'true') {
      options.centeredSlides = true;
    }

    if (this.dataset.autoplay && this.dataset.autoplay !== 'false') {
      options.autoplay = {
        delay: parseNumber(this.dataset.autoplay, 4000),
        disableOnInteraction: false,
      };
    }

    const pagination = this.querySelector('[data-rt-swiper-pagination]');
    if (pagination instanceof HTMLElement) {
      options.pagination = {
        el: pagination,
        clickable: true,
      };
    }

    const prevEl = this.querySelector('[data-rt-swiper-prev]');
    const nextEl = this.querySelector('[data-rt-swiper-next]');
    if (prevEl instanceof HTMLElement && nextEl instanceof HTMLElement) {
      options.navigation = {
        prevEl,
        nextEl,
      };
    }

    if (this.dataset.breakpoints) {
      try {
        options.breakpoints = JSON.parse(this.dataset.breakpoints);
      } catch (error) {
        console.warn('rt-swiper: invalid data-breakpoints JSON', error);
      }
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      delete options.autoplay;
    }

    const userOn = options.on && typeof options.on === 'object' ? options.on : {};
    options.on = {
      ...userOn,
      init: (...args) => {
        userOn.init?.(...args);
        this.#syncNavState();
      },
      slideChange: (...args) => {
        userOn.slideChange?.(...args);
        this.#syncNavState();
      },
      toEdge: (...args) => {
        userOn.toEdge?.(...args);
        this.#syncNavState();
      },
      fromEdge: (...args) => {
        userOn.fromEdge?.(...args);
        this.#syncNavState();
      },
      lock: (...args) => {
        userOn.lock?.(...args);
        this.#syncNavState();
      },
      unlock: (...args) => {
        userOn.unlock?.(...args);
        this.#syncNavState();
      },
      breakpoint: (...args) => {
        userOn.breakpoint?.(...args);
        this.#syncNavState();
      },
    };

    return options;
  }
}

if (!customElements.get('rt-swiper')) {
  customElements.define('rt-swiper', RtSwiper);
}
