// Боковое меню-шторка (задача 37).
// Кнопка «‹» на краю меню задвигает его, страница занимает всю ширину. Задвинутое меню
// выдвигается шторкой поверх страницы кнопкой «Меню» и уезжает обратно после выбора
// раздела или локации, по Esc и по щелчку мимо; «›» на краю шторки закрепляет меню.
// Пока меню задвинуто, в шапке видна открытая локация (задача 38): щелчок по ней выдвигает
// шторку с курсором в поиске локаций.
// Подключается синхронно в <head>, чтобы задвинутое меню не мелькало при загрузке.
// Работает при <html data-drawer="on">. Выбор «задвинуто/закреплено» хранится в браузере.
// Параметр адреса: ?nav=hidden|pinned
(function () {
  "use strict";

  const NAV_KEY = "plan-fact-budget-nav-v1";
  const LABELS = {
    ru: { hide: "Задвинуть меню", pin: "Закрепить меню", open: "Меню", openTitle: "Выдвинуть меню" },
    en: { hide: "Hide menu", pin: "Pin menu", open: "Menu", openTitle: "Show menu" }
  };
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>';
  const PANEL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/></svg>';

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }

  let nav = (params.get("nav") || read(NAV_KEY, "pinned")) === "hidden" ? "hidden" : "pinned";
  root.dataset.nav = nav;
  if (params.has("nav")) write(NAV_KEY, nav);

  let sidebar = null;
  let edge = null;
  let opener = null;
  let locator = null;
  let returnFocus = null;

  const peeking = () => root.dataset.navPeek === "1";
  const dialogOpen = () => Boolean(document.querySelector("dialog[open]"));

  // Фокус не уводим из открытого окна: за модальным окном страница всё равно недоступна.
  function moveFocus(target) {
    if (target && !dialogOpen()) target.focus({ preventScroll: true });
  }

  const labels = () => LABELS[root.lang === "en" ? "en" : "ru"];

  // Подписи кнопок зависят от состояния меню и языка.
  function applyLabels(element) {
    const text = labels();
    const label = nav === "hidden" ? text.pin : text.hide;
    const expected = element === edge ? { title: label, "aria-label": label } : { title: text.openTitle };
    Object.entries(expected).forEach(([name, value]) => {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    });
  }

  function syncLabels() {
    if (!edge) return;
    applyLabels(edge);
    applyLabels(opener);
    opener.firstElementChild.textContent = labels().open;
  }

  function setExpanded(open) {
    [opener, locator].forEach((button) => button?.setAttribute("aria-expanded", String(open)));
  }

  // Прокручивает контейнер так, чтобы элемент был виден; страница при этом не прокручивается.
  function reveal(container, element) {
    if (!container || !element) return;
    const outer = container.getBoundingClientRect();
    const inner = element.getBoundingClientRect();
    if (inner.top < outer.top) container.scrollTop -= outer.top - inner.top;
    else if (inner.bottom > outer.bottom) container.scrollTop += Math.min(inner.bottom - outer.bottom, inner.top - outer.top);
  }

  // С поля локации в шапке — сразу к поиску локаций, открытая локация видна в списке.
  function focusLocations() {
    const list = sidebar.querySelector(".location-list");
    reveal(sidebar, sidebar.querySelector(".location-group"));
    reveal(list, list?.querySelector(".location-item.is-active"));
    const search = sidebar.querySelector("#sidebar-location-search");
    moveFocus(search);
    if (search && document.activeElement === search) search.select();
  }

  function setPeek(open, trigger = opener) {
    if (open === peeking() || (open && root.dataset.drawer !== "on")) return;
    if (open) root.dataset.navPeek = "1";
    else delete root.dataset.navPeek;
    setExpanded(open);
    if (open) {
      returnFocus = trigger;
      if (trigger === locator) focusLocations();
      else moveFocus(sidebar.querySelector(".nav-item.is-active") || sidebar.querySelector(".nav-item"));
    } else {
      const active = document.activeElement;
      if (!active || active === document.body || active === edge || sidebar.contains(active)) moveFocus(returnFocus || opener);
    }
  }

  function setNav(value) {
    const edgeFocused = document.activeElement === edge;
    nav = value === "hidden" ? "hidden" : "pinned";
    delete root.dataset.navPeek;
    setExpanded(false);
    root.dataset.nav = nav;
    write(NAV_KEY, nav);
    syncLabels();
    if (edgeFocused && nav === "hidden") moveFocus(opener);
  }

  function mount() {
    sidebar = document.querySelector(".sidebar");
    const topbar = document.querySelector(".topbar");
    if (!sidebar || !topbar) return;
    if (!sidebar.id) sidebar.id = "app-sidebar";

    edge = document.createElement("button");
    edge.type = "button";
    edge.className = "pf-nav-edge";
    edge.setAttribute("aria-controls", sidebar.id);
    edge.innerHTML = CHEVRON;
    edge.addEventListener("click", () => setNav(nav === "pinned" ? "hidden" : "pinned"));

    opener = document.createElement("button");
    opener.type = "button";
    opener.className = "pf-nav-open";
    opener.setAttribute("aria-controls", sidebar.id);
    opener.setAttribute("aria-expanded", "false");
    opener.innerHTML = `<span class="pf-nav-open-caption"></span><span class="pf-nav-open-box">${PANEL_ICON}</span>`;
    opener.addEventListener("click", () => setPeek(true, opener));
    topbar.prepend(opener);

    locator = document.getElementById("topbar-location-button");
    if (locator) {
      locator.setAttribute("aria-controls", sidebar.id);
      locator.setAttribute("aria-expanded", "false");
      locator.addEventListener("click", () => setPeek(true, locator));
    }

    const scrim = document.createElement("div");
    scrim.className = "pf-nav-scrim";
    scrim.addEventListener("click", () => setPeek(false));
    document.body.append(edge, scrim);

    // Выбор раздела или локации и поиск тикета задвигают выдвинутую шторку.
    sidebar.addEventListener("click", (event) => {
      if (peeking() && event.target.closest(".nav-item, .location-item")) setPeek(false);
    });
    sidebar.addEventListener("submit", () => setPeek(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && peeking() && !dialogOpen()) setPeek(false);
    });

    // Подписи следуют за языком интерфейса; выключенная шторка не остаётся выдвинутой.
    new MutationObserver(() => {
      if (root.dataset.drawer !== "on") setPeek(false);
      syncLabels();
    }).observe(root, { attributes: true, attributeFilter: ["lang", "data-drawer"] });
    // Перевод страницы в app.js при каждой перерисовке возвращает подписям значения, запомненные
    // при первом проходе, — у кнопок шторки сразу восстанавливаем актуальные.
    const keepLabels = new MutationObserver((records) => records.forEach((record) => applyLabels(record.target)));
    [edge, opener].forEach((element) => keepLabels.observe(element, { attributes: true, attributeFilter: ["title", "aria-label"] }));
    syncLabels();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
