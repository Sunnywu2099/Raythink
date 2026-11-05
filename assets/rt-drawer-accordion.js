class RtDrawerAccordion extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.abort = new AbortController();

    window.addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element)) return;
        const trigger = event.target.closest('.menu-list__trigger');
        if (!trigger || !this.contains(trigger)) return;

        const disclosure = trigger.querySelector('.menu-list__disclosure');
        const item = trigger.closest('.menu-list__list-item');
        if (!disclosure || !item) return;

        event.preventDefault();
        event.stopPropagation();

        const open = !item.classList.contains('is-open');
        item.classList.toggle('is-open', open);
        disclosure.setAttribute('aria-expanded', open ? 'true' : 'false');
      },
      { capture: true, signal: this.abort.signal }
    );
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.ready = false;
  }
}

if (!customElements.get('rt-drawer-accordion')) {
  customElements.define('rt-drawer-accordion', RtDrawerAccordion);
}
