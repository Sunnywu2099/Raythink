class RtMegaMenu extends HTMLElement {
  connectedCallback() {
    if (this.ready) return;
    this.ready = true;
    this.abort = new AbortController();

    const tabsBox = this.querySelector('[data-rt-mega-tabs]');
    const stage = this.querySelector('[data-rt-mega-stage]');
    const source = this.querySelector('[data-rt-mega-source]');
    if (!tabsBox || !stage || !source) return;

    const linksBox = this.querySelector('[data-rt-mega-links]');
    const inDrawer = Boolean(this.closest('.menu-drawer'));

    if (inDrawer) {
      source.querySelectorAll('[data-rt-mega-category]').forEach((category) => tabsBox.append(category));
      source.querySelectorAll('[data-rt-mega-loose]').forEach((panel) => tabsBox.append(panel));
      const linkTarget = linksBox || tabsBox;
      source.querySelectorAll('[data-rt-mega-link-group]').forEach((group) => linkTarget.append(group));

      tabsBox.addEventListener(
        'click',
        (event) => {
          if (!(event.target instanceof Element)) return;
          const tab = event.target.closest('[data-rt-mega-tab]');
          if (!tab || !tabsBox.contains(tab)) return;
          const category = tab.closest('[data-rt-mega-category]');
          if (!category) return;
          const open = !category.classList.contains('is-open');
          category.classList.toggle('is-open', open);
          tab.setAttribute('aria-expanded', open ? 'true' : 'false');
        },
        { signal: this.abort.signal }
      );
      return;
    }

    source.querySelectorAll('[data-rt-mega-tab]').forEach((tab) => tabsBox.append(tab));
    source.querySelectorAll('[data-rt-mega-panel]').forEach((panel) => stage.append(panel));
    if (linksBox) {
      source.querySelectorAll('[data-rt-mega-link-group]').forEach((group) => linksBox.append(group));
    }

    const tabs = [...tabsBox.querySelectorAll('[data-rt-mega-tab]')];
    const panels = [...stage.querySelectorAll('[data-rt-mega-panel]')];
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

    if (tabs[0]) activate(tabs[0]);

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
