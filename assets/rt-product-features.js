import { Component } from '@theme/component';

/**
 * @typedef {object} FeatureRefs
 * @property {HTMLElement} items
 * @property {HTMLButtonElement} toggle
 * @extends {Component<FeatureRefs>}
 */
class RTProductFeatures extends Component {
  requiredRefs = ['items', 'toggle'];
  #expanded = false;
  #controller = new AbortController();
  #observer = new MutationObserver(() => this.updatedCallback());

  connectedCallback() {
    super.connectedCallback();
    this.#controller = new AbortController();
    this.addEventListener('shopify:block:select', this.#onBlockSelect, { signal: this.#controller.signal });
    this.#sync();
    // Editor updates may change only attributes or individual child blocks.
    this.#observer.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-show-learn-more'],
    });
  }

  updatedCallback() {
    super.updatedCallback();
    this.#sync();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
    this.#observer.disconnect();
  }

  /** Expands or collapses the remaining descriptions without submitting the product form. */
  toggleFeatures() {
    this.#expanded = !this.#expanded;
    this.#sync();
  }

  #items() {
    return [...this.refs.items.children].filter(
      (item) => item instanceof HTMLElement && item.classList.contains('rt-product-icon-text')
    );
  }

  #sync() {
    const items = this.#items();
    const hasMore = this.dataset.showLearnMore !== 'false' && items.length > 3;
    if (!hasMore) this.#expanded = false;
    for (const [index, item] of items.entries()) {
      if (item instanceof HTMLElement) item.hidden = hasMore && !this.#expanded && index >= 3;
    }
    const toggle = this.refs.toggle;
    toggle.hidden = !hasMore;
    toggle.setAttribute('aria-expanded', String(this.#expanded));
    const label = (this.#expanded ? toggle.dataset.collapseLabel : toggle.dataset.expandLabel) || '';
    if (toggle.textContent !== label) toggle.textContent = label;
  }

  /** Reveal an extra description when the merchant selects it in the theme editor. @param {Event} event */
  #onBlockSelect = (event) => {
    if (!(event.target instanceof Element)) return;
    const item = event.target.closest('.rt-product-icon-text');
    if (!item || this.#items().indexOf(item) < 3) return;
    this.#expanded = true;
    this.#sync();
  };
}

if (!customElements.get('rt-product-features')) {
  customElements.define('rt-product-features', RTProductFeatures);
}
