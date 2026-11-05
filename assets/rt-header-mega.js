class RtMegaMenu extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.abort = new AbortController();

    const tabsBox = this.querySelector('[data-rt-mega-tabs]');
    const stage = this.querySelector('[data-rt-mega-stage]');
    const source = this.querySelector('[data-rt-mega-source]');
    if (!tabsBox || !stage || !source) return;

    source.querySelectorAll('[data-rt-mega-tab]').forEach((tab) => tabsBox.append(tab));
    source.querySelectorAll('[data-rt-mega-panel]').forEach((panel) => stage.append(panel));

    const tabs = [...tabsBox.querySelectorAll('[data-rt-mega-tab]')];
    const panels = [...stage.querySelectorAll('[data-rt-mega-panel]')];
    const inDrawer = Boolean(this.closest('.menu-drawer'));
    const { signal } = this.abort;

    const activate = (tab) => {
      tabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle('is-active', selected);
        item.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      panels.forEach((panel) => {
        const match = !panel.hasAttribute('data-rt-mega-loose') && panel.dataset.panelId === tab.dataset.panelId;
        panel.classList.toggle('is-active', match);
      });
    };

    if (!inDrawer && tabs[0]) activate(tabs[0]);

    tabs.forEach((tab) => {
      tab.addEventListener('pointerenter', () => activate(tab), { signal });
      tab.addEventListener('focus', () => activate(tab), { signal });
    });
  }

  disconnectedCallback() {
    this.abort?.abort();
    this.ready = false;
  }
}

if (!customElements.get('rt-mega-menu')) {
  customElements.define('rt-mega-menu', RtMegaMenu);
}
