import { Component } from '@theme/component';
import { morph } from '@theme/morph';
import { StandardEvents } from '@shopify/events';

/** Coordinates RT presentation and checkout while native components own selection and Add to cart. */
class RTProductInformation extends Component {
  #controller = new AbortController();
  /** @type {ResizeObserver | undefined} */
  #resizeObserver;
  /** @type {MutationObserver | undefined} */
  #mutationObserver;
  #frame = 0;
  #generation = 0;
  /** @type {HTMLElement | null} */
  #bar = null;
  /** @type {HTMLElement | null} */
  #page = null;
  #previousHeight = '';
  #checkoutPending = false;
  #pageEndFrame = 0;
  #atPageEnd = false;

  connectedCallback() {
    super.connectedCallback();
    this.#controller = new AbortController();
    this.#resetCheckout();
    const { signal } = this.#controller;
    this.addEventListener(StandardEvents.productSelect, this.#onProductSelect, { signal });
    this.#page = this.closest('.page-wrapper');
    this.#previousHeight = this.#page?.style.getPropertyValue('--rt-product-bottom-height') || '';
    // ResizeObserver runs before paint, so match the drawer's animated page width
    // in the same frame instead of scheduling a one-frame-late bar resize.
    this.#resizeObserver = new ResizeObserver(this.#measure);
    if (this.#page) this.#resizeObserver.observe(this.#page);
    this.#mutationObserver = new MutationObserver(this.#scheduleMeasure);
    this.#mutationObserver.observe(this, { childList: true, subtree: true });
    window.addEventListener('resize', this.#scheduleMeasure, { signal });
    window.addEventListener('pageshow', this.#resetCheckout, { signal });
    // Desktop locks the document and scrolls .page-wrapper. Mobile scrolls the window.
    this.#page?.addEventListener('scroll', this.#schedulePageEnd, { passive: true, signal });
    window.addEventListener('scroll', this.#schedulePageEnd, { passive: true, signal });
    this.#scheduleMeasure();
    this.#schedulePageEnd();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#scheduleMeasure();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#generation += 1;
    this.#controller?.abort();
    this.#resizeObserver?.disconnect();
    this.#mutationObserver?.disconnect();
    cancelAnimationFrame(this.#frame);
    cancelAnimationFrame(this.#pageEndFrame);
    if (this.#previousHeight) this.#page?.style.setProperty('--rt-product-bottom-height', this.#previousHeight);
    else this.#page?.style.removeProperty('--rt-product-bottom-height');
  }

  #scheduleMeasure = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(this.#measure);
  };

  #measure = () => {
    if (!this.isConnected) return;
    const bar = this.querySelector('[data-rt-product-bar]');
    if (!(bar instanceof HTMLElement)) {
      if (this.#bar) this.#resizeObserver?.unobserve(this.#bar);
      this.#bar = null;
      this.style.removeProperty('--rt-product-bottom-height');
      this.#page?.style.removeProperty('--rt-product-bottom-height');
      return;
    }
    if (bar !== this.#bar) {
      if (this.#bar) this.#resizeObserver?.unobserve(this.#bar);
      this.#bar = bar;
      this.#resizeObserver?.observe(bar);
    }
    const rect = this.#page?.getBoundingClientRect();
    const isRTL = getComputedStyle(this).direction === 'rtl';
    const width = this.#page?.clientWidth || window.innerWidth;
    const start = rect ? (isRTL ? window.innerWidth - rect.right : rect.left) : 0;
    this.style.setProperty('--rt-product-page-width', `${width}px`);
    this.style.setProperty('--rt-product-bar-start', `${start}px`);
    const height = `${Math.ceil(bar.getBoundingClientRect().height)}px`;
    this.style.setProperty('--rt-product-bottom-height', height);
    this.#page?.style.setProperty('--rt-product-bottom-height', height);
    this.#schedulePageEnd();
  };

  #schedulePageEnd = () => {
    cancelAnimationFrame(this.#pageEndFrame);
    this.#pageEndFrame = requestAnimationFrame(this.#syncPageEnd);
  };

  /** The element that actually scrolls this page. */
  #scrollingRoot() {
    const page = this.#page;
    if (page instanceof HTMLElement) {
      const overflow = getComputedStyle(page).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return page;
    }
    return document.scrollingElement;
  }

  // Hide across the bar's own height so the fade starts as the footer meets it,
  // and stay hidden through a short upward move so a bottom bounce does not flash it.
  #syncPageEnd = () => {
    if (!this.isConnected) return;
    const bar = this.#bar ?? this.querySelector('[data-rt-product-bar]');
    if (!(bar instanceof HTMLElement)) return;
    const scrolling = this.#scrollingRoot();
    if (!scrolling) return;
    const maxScroll = scrolling.scrollHeight - scrolling.clientHeight;
    const remaining = maxScroll - scrolling.scrollTop;
    const canScroll = maxScroll > 4;
    const reach = Math.max(48, bar.getBoundingClientRect().height);
    const atEnd = canScroll && (this.#atPageEnd ? remaining <= reach + 64 : remaining <= reach);
    this.#atPageEnd = atEnd;
    bar.toggleAttribute('data-rt-at-page-end', atEnd);
    bar.inert = atEnd;
  };

  /** @param {import('@shopify/events').ProductSelectEvent} event */
  #onProductSelect = async (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;
    const generation = ++this.#generation;
    this.setAttribute('data-rt-variant-pending', '');
    this.removeAttribute('data-rt-variant-error');
    this.#gateCheckout(true);
    this.#setError('');
    try {
      const { detail } = await event.promise;
      if (!this.isConnected || generation !== this.#generation) return;
      if (!detail?.html) throw new Error('Missing product selection response');
      if (detail.productId && String(detail.productId) !== this.dataset.productId && !detail.newProduct) return;
      for (const fragment of this.querySelectorAll('[data-rt-product-fragment]')) {
        if (!(fragment instanceof HTMLElement)) continue;
        if (fragment.matches('rt-product-media-gallery')) continue;
        const key = fragment.dataset.rtProductFragment;
        const replacement = [...detail.html.querySelectorAll('[data-rt-product-fragment]')].find(
          (node) => node.getAttribute('data-rt-product-fragment') === key
        );
        if (replacement) morph(fragment, replacement);
      }
      const selectedMediaId = detail.html.querySelector('rt-product-media-gallery')?.getAttribute('data-selected-media-id');
      if (selectedMediaId) {
        const gallery = /** @type {import('./rt-product-media-gallery').RTProductMediaGallery | null} */ (this.querySelector('rt-product-media-gallery'));
        gallery?.selectMedia(selectedMediaId);
      }
      // Native form listeners may morph the quantity container later in this same microtask batch.
      queueMicrotask(() => {
        if (!this.isConnected || generation !== this.#generation) return;
        const productForm = this.querySelector('product-form-component');
        const renderedForm = detail.html.querySelector('product-form-component');
        // A quantity-rule update can only remove nodes. Refresh the form's refs
        // explicitly so cart counts never retain a detached label or rules node.
        if (productForm instanceof Component) productForm.updatedCallback();
        if (productForm instanceof HTMLElement && renderedForm instanceof HTMLElement) {
          // Also update the minimum when the optional quantity block is hidden.
          productForm.dataset.quantityDefault = renderedForm.dataset.quantityDefault || '1';
        }
        const quantity = /** @type {import('./component-quantity-selector').QuantitySelectorComponent | null} */ (this.querySelector('quantity-selector-component'));
        const input = quantity?.querySelector('input');
        if (input instanceof HTMLInputElement) {
          input.disabled = !detail.resource?.available;
          input.dataset.variantId = String(detail.resource?.id || '');
        }
        quantity?.updateButtonStates?.();
        if (!detail.resource?.available) {
          for (const button of quantity?.querySelectorAll('button') || []) button.disabled = true;
        }
      });
    } catch (error) {
      if (!this.isConnected || generation !== this.#generation || (error instanceof Error && error.name === 'AbortError')) return;
      this.setAttribute('data-rt-variant-error', '');
      const button = this.querySelector('[ref="addToCartButton"]');
      if (button instanceof HTMLButtonElement) button.disabled = true;
      this.#setError(this.dataset.variantError || '');
    } finally {
      if (this.isConnected && generation === this.#generation) {
        this.removeAttribute('data-rt-variant-pending');
        this.#gateCheckout(this.hasAttribute('data-rt-variant-error'));
        this.#scheduleMeasure();
      }
    }
  };

  /** @param {boolean} blocked */
  #gateCheckout(blocked) {
    const checkout = this.querySelector('[ref="acceleratedCheckoutButtonContainer"]');
    if (checkout instanceof HTMLElement) checkout.inert = blocked;
  }

  /** @param {string} message */
  #setError(message) {
    const form = this.querySelector('product-form-component');
    const liveRegion = form?.querySelector('[ref="liveRegion"]');
    if (liveRegion) liveRegion.textContent = message;
    const error = form?.querySelector('[data-rt-variant-error-text]');
    if (error instanceof HTMLElement) {
      error.textContent = message;
      error.hidden = !message;
    }
  }

  /** @param {SubmitEvent} event */
  handleSubmit(event) {
    if (this.#checkoutPending) {
      event.preventDefault();
      return;
    }
    if (this.hasAttribute('data-rt-variant-error')) {
      event.preventDefault();
      this.#setError(this.dataset.variantError || '');
      return;
    }
    const submitter = event.submitter;
    if (submitter instanceof HTMLButtonElement && submitter.hasAttribute('data-rt-buy-now')) {
      event.preventDefault();
      // Never submit the previous variant while its replacement is being resolved.
      if (this.hasAttribute('data-rt-variant-pending')) return;
      void this.#buyNow(submitter);
      return;
    }
    const form = /** @type {(HTMLElement & { handleSubmit: (event: SubmitEvent) => void }) | null} */ (
      event.target instanceof Element ? event.target.closest('product-form-component') : null
    );
    form?.handleSubmit(event);
  }

  /** @param {HTMLButtonElement} button */
  async #buyNow(button) {
    const form = button.form;
    if (!form || !form.reportValidity()) return;
    const addButton = this.querySelector('[ref="addToCartButton"]');
    if (addButton instanceof HTMLButtonElement && addButton.disabled) return;
    const quantity = /** @type {import('./component-quantity-selector').QuantitySelectorComponent | null} */ (
      form.querySelector('quantity-selector-component')
    );
    const validation = quantity?.canAddToCart();
    if (validation && !validation.canAdd) {
      const message = form.closest('product-form-component')?.getAttribute('data-quantity-error-max') || '';
      this.#setError(message.replace('{{ maximum }}', String(validation.maxQuantity ?? '')));
      return;
    }

    // Capture the same form, including line item properties and selling plan.
    const body = new FormData(form);
    if (!body.get('id')) return;
    this.#setError('');
    this.#checkoutPending = true;
    form.inert = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    let message = button.dataset.error || '';
    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        body,
        signal: this.#controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.status) {
        if (typeof result.description === 'string') message = result.description;
        throw new Error(message);
      }
      if (!this.isConnected || this.#controller.signal.aborted) return;
      // The checkout includes existing cart lines; never clear the visitor's cart.
      window.location.assign(button.value);
    } catch {
      if (!this.isConnected || this.#controller.signal.aborted) return;
      this.#setError(message);
      this.#resetCheckout();
      button.focus({ preventScroll: true });
    }
  }

  // Browsers can restore the product page from the back-forward cache after checkout.
  #resetCheckout = () => {
    this.#checkoutPending = false;
    const button = this.querySelector('[data-rt-buy-now]');
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.form) button.form.inert = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  };
}

if (!customElements.get('rt-product-information')) {
  customElements.define('rt-product-information', RTProductInformation);
}
