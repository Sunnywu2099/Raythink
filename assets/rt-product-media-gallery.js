import { Component } from '@theme/component';
import { SlideshowSelectEvent } from '@theme/events';
import { scrollIntoView } from '@theme/scrolling';

/**
 * @typedef {object} GalleryRefs
 * @property {import('./dialog').DialogComponent} [zoomDialog]
 * @extends {Component<GalleryRefs>}
 */
export class RTProductMediaGallery extends Component {
  #controller = new AbortController();
  #frame = 0;
  /** @type {Map<string, number>} */
  #indices = new Map();
  #modelSignature = '';

  connectedCallback() {
    super.connectedCallback();
    this.#controller = new AbortController();
    this.addEventListener(SlideshowSelectEvent.eventName, this.#onSlideSelect, { signal: this.#controller.signal });
    this.#initialize();
    this.#setupModels();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#initialize();
    this.#setupModels();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller?.abort();
    cancelAnimationFrame(this.#frame);
    this.#pause(this);
  }

  #initialize() {
    for (const group of this.querySelectorAll('[data-rt-gallery-group]')) {
      if (!(group instanceof HTMLElement)) continue;
      const slideshow = this.#slideshow(group);
      const index = Number(slideshow?.getAttribute('initial-slide')) || 0;
      const name = group.dataset.rtGalleryGroup || '';
      const count = group.querySelectorAll('slideshow-slide').length;
      const current = Math.min(this.#indices.get(name) ?? index, Math.max(0, count - 1));
      this.#indices.set(name, current);
      this.#syncControls(group, current);
    }
    if (this.dataset.selectedMediaId) this.selectMedia(this.dataset.selectedMediaId);
  }

  /** Selects the group and slide for a newly selected variant's media. @param {string | number} mediaId */
  selectMedia(mediaId) {
    const slide = [...this.querySelectorAll('[data-rt-media-id]')].find(
      (element) => element.getAttribute('data-rt-media-id') === String(mediaId)
    );
    const group = slide?.closest('[data-rt-gallery-group]');
    if (!(group instanceof HTMLElement) || !slide) return;
    const slides = [...group.querySelectorAll('slideshow-slide')];
    const index = slides.indexOf(slide);
    if (index < 0) return;
    this.#indices.set(group.dataset.rtGalleryGroup || '', index);
    this.#activate(group.dataset.rtGalleryGroup);
  }

  /** @param {MouseEvent} event */
  changeGroup(event) {
    if (!(event.target instanceof HTMLButtonElement)) return;
    this.#activate(event.target.dataset.rtGroup);
  }

  /** @param {string | undefined} name */
  #activate(name) {
    const groups = [...this.querySelectorAll('[data-rt-gallery-group]')].filter((node) => node instanceof HTMLElement);
    const active = groups.find((group) => group.dataset.rtGalleryGroup === name);
    if (!active) return;
    this.dataset.activeGroup = name;
    for (const group of groups) {
      group.hidden = group !== active;
      if (group !== active) this.#pause(group);
    }
    for (const button of this.querySelectorAll('[data-rt-group]')) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-rt-group') === name));
    }
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      if (!this.isConnected) return;
      const index = this.#indices.get(name || '') || 0;
      const slideshow = this.#slideshow(active);
      slideshow?.setAttribute('initial-slide', String(index));
      slideshow?.select(index, undefined, { animate: false });
      this.#syncControls(active, index);
    });
  }

  /** @param {MouseEvent} event */
  selectSlide(event) {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const group = event.target.closest('[data-rt-gallery-group]');
    this.#slideshow(group)?.select(Number(event.target.dataset.rtSlide), event);
  }

  /** @param {MouseEvent} event */
  previous(event) {
    const group = event.target instanceof Element ? event.target.closest('[data-rt-gallery-group]') : null;
    this.#slideshow(group)?.previous(event);
  }

  /** @param {MouseEvent} event */
  next(event) {
    const group = event.target instanceof Element ? event.target.closest('[data-rt-gallery-group]') : null;
    this.#slideshow(group)?.next(event);
  }

  /** @param {Event} event */
  #onSlideSelect = (event) => {
    if (!(event instanceof SlideshowSelectEvent) || !(event.target instanceof Element)) return;
    const group = event.target.closest('[data-rt-gallery-group]');
    if (!(group instanceof HTMLElement)) return;
    this.#indices.set(group.dataset.rtGalleryGroup || '', event.detail.index);
    this.#syncControls(group, event.detail.index);
    for (const slide of group.querySelectorAll('slideshow-slide')) {
      if (slide !== event.detail.slide) this.#pause(slide);
    }
  };

  /** @param {HTMLElement} group @param {number} index */
  #syncControls(group, index) {
    const count = group.querySelectorAll('slideshow-slide').length;
    const counter = group.querySelector('[data-rt-gallery-counter]');
    if (counter) counter.textContent = `${index + 1}/${count}`;
    for (const button of group.querySelectorAll('[data-rt-slide]')) {
      button.setAttribute('aria-current', String(Number(button.getAttribute('data-rt-slide')) === index));
    }
    for (const button of group.querySelectorAll('.rt-product-gallery__arrow, .rt-product-gallery__thumbnail-arrow')) {
      if (!(button instanceof HTMLButtonElement)) continue;
      const next = button.classList.contains('rt-product-gallery__arrow--next') || button.classList.contains('rt-product-gallery__thumbnail-arrow--next');
      button.disabled = next ? index >= count - 1 : index <= 0;
    }
    const activeThumbnail = group.querySelector('.rt-product-gallery__thumbnail[aria-current="true"]');
    if (activeThumbnail instanceof HTMLElement && activeThumbnail.offsetWidth) {
      const strip = activeThumbnail.parentElement;
      if (!strip) return;
      const itemRect = activeThumbnail.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      if (itemRect.left < stripRect.left || itemRect.right > stripRect.right) {
        scrollIntoView(activeThumbnail, { ancestor: strip, inline: 'center', behavior: 'instant' });
      }
    }
  }

  /** @param {Element | null} group */
  #slideshow(group) {
    return /** @type {import('./slideshow').Slideshow | null} */ (group?.querySelector('slideshow-component') || null);
  }

  /** @param {Element} container */
  #pause(container) {
    for (const media of container.querySelectorAll('deferred-media, product-model')) {
      if ('pauseMedia' in media && typeof media.pauseMedia === 'function') media.pauseMedia();
    }
  }

  #setupModels() {
    const source = this.querySelector('[data-rt-product-models]')?.textContent;
    if (!source || this.#modelSignature === source) return;
    const signal = this.#controller.signal;
    const setup = () => {
      if (signal.aborted || this.#modelSignature === source) return;
      const xr = /** @type {Window & { ShopifyXR?: { addModels: (models: object[]) => void, setupXRElements: () => void } }} */ (window).ShopifyXR;
      if (!xr) {
        document.addEventListener('shopify_xr_initialized', setup, { once: true, signal });
        return;
      }
      xr.addModels(JSON.parse(source));
      xr.setupXRElements();
      this.#modelSignature = source;
    };
    Shopify.loadFeatures([{ name: 'shopify-xr', version: '1.0', onLoad: (error) => { if (!error) setup(); } }]);
  }

  /** Uses a real image link as the fallback when enhancement is unavailable. @param {MouseEvent} event */
  openZoom(event) {
    if (!(event.target instanceof HTMLAnchorElement)) return;
    const dialog = this.refs.zoomDialog;
    const image = dialog?.querySelector('[data-rt-zoom-image]');
    if (!dialog || !(image instanceof HTMLImageElement) || !event.target.dataset.rtZoomSrc) return;
    event.preventDefault();
    image.src = event.target.dataset.rtZoomSrc;
    image.alt = event.target.dataset.rtZoomAlt || '';
    event.target.focus({ preventScroll: true });
    dialog.showDialog();
  }
}

if (!customElements.get('rt-product-media-gallery')) {
  customElements.define('rt-product-media-gallery', RTProductMediaGallery);
}
