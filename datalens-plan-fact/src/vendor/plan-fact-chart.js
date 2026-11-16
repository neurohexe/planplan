// График исполнения бюджета на странице «Обзор» (задача 37).
// Данные берёт из уже отрисованной таблицы «План-факт по статьям», поэтому уважает все
// фильтры, выбранную локацию и режим валют, а app.js не меняет. Подписи — на языке
// интерфейса (<html lang>), суммы — в том же виде, что и в таблице.
((factory) => {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else api.start();
})(() => {
  "use strict";

  const SCALE_KEY = "plan-fact-budget-chart-scale-v1";
  // Как в formatMoney из app.js: у этих валют свой знак после суммы.
  const CURRENCY_SYMBOLS = { RUB: "₽", UZS: "сум", KGS: "сом", KZT: "₸", AMD: "драм" };

  const TEXT = {
    ru: {
      title: "Исполнение бюджета по проектам",
      leadPercent: "Сколько процентов плана уже потрачено и зарезервировано. Сначала — проекты ближе всего к лимиту.",
      leadMoney: "Фоновая полоса — план проекта, на ней — потрачено и зарезервировано. Сначала — крупные проекты.",
      scale: "Масштаб графика",
      money: "В деньгах",
      percent: "В % плана",
      mixedMoney: "В выборке разные валюты — суммы нельзя сложить на одной оси",
      grouped: "По всем локациям в валюте оригинала суммы разных валют не складываются. Выберите «В рублях» в переключателе валют вверху — график появится.",
      noRate: "Нет курса для пересчёта в рубли — суммы нельзя показать на графике.",
      skipped: (count) => `Без курса пересчёта на графике не показаны строки: ${count}.`,
      note: "Нажмите на проект — он раскроется в таблице ниже. Точные суммы — в таблице и во всплывающей подсказке.",
      mixedTotal: "В выборке несколько валют, поэтому общая полоса не строится. Проекты ниже — в % плана.",
      total: "Весь бюджет квартала",
      plan: "План",
      planOf: (amount) => `план ${amount}`,
      meter: (fact, reserve, free) => `Потрачено ${fact}, зарезервировано ${reserve}, свободно ${free} плана`,
      fact: "Потрачено",
      reserve: "Зарезервировано",
      free: "Свободно",
      freePlan: "Свободно (план)",
      over: "Перерасход",
      expected: "Ожидается",
      overProjects: (count) => {
        const tail = count % 100;
        const unit = count % 10;
        if (unit === 1 && tail !== 11) return "проект с перерасходом";
        if (unit >= 2 && unit <= 4 && (tail < 12 || tail > 14)) return "проекта с перерасходом";
        return "проектов с перерасходом";
      },
      overAmount: (amount) => `перерасход ${amount}`,
      freeAmount: (amount) => `свободно ${amount}`,
      row: (name, plan, fact, reserve, status, ratio) =>
        `${name}: план ${plan}, потрачено ${fact}, зарезервировано ${reserve}, ${status}, ожидается ${ratio}. Enter — показать в таблице.`,
      project: "Проект"
    },
    en: {
      title: "Budget execution by project",
      leadPercent: "Share of the plan already spent and reserved. Projects closest to the limit come first.",
      leadMoney: "The background bar is the project plan; spent and reserved amounts are drawn on it. Largest projects come first.",
      scale: "Chart scale",
      money: "Amounts",
      percent: "% of plan",
      mixedMoney: "The selection has different currencies, so amounts can't share one axis",
      grouped: "Across all locations in original currencies, amounts in different currencies can't be added up. Choose “In RUB” in the currency switch at the top to see the chart.",
      noRate: "No exchange rate to RUB, so the amounts can't be charted.",
      skipped: (count) => `Rows not charted for lack of an exchange rate: ${count}.`,
      note: "Click a project to expand it in the table below. Exact amounts are in the table and in the tooltip.",
      mixedTotal: "The selection has several currencies, so there is no total bar. Projects below are shown as % of plan.",
      total: "Whole quarter budget",
      plan: "Plan",
      planOf: (amount) => `plan ${amount}`,
      meter: (fact, reserve, free) => `Spent ${fact}, reserved ${reserve}, available ${free} of the plan`,
      fact: "Spent",
      reserve: "Reserved",
      free: "Available",
      freePlan: "Available (plan)",
      over: "Over budget",
      expected: "Expected",
      overProjects: (count) => (count === 1 ? "project over budget" : "projects over budget"),
      overAmount: (amount) => `over budget by ${amount}`,
      freeAmount: (amount) => `available ${amount}`,
      row: (name, plan, fact, reserve, status, ratio) =>
        `${name}: plan ${plan}, spent ${fact}, reserved ${reserve}, ${status}, expected ${ratio}. Press Enter to show it in the table.`,
      project: "Project"
    }
  };

  const formatters = new Map();
  function formatter(key, create) {
    if (!formatters.has(key)) formatters.set(key, create());
    return formatters.get(key);
  }
  const localeOf = (lang) => (lang === "en" ? "en-US" : "ru-RU");
  const spaces = (text) => text.replace(/[\u00a0\u202f]/g, " ");

  function grouped(value, lang) {
    const locale = localeOf(lang);
    return spaces(formatter(`n:${locale}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })).format(value));
  }

  function compactNumber(value, lang) {
    const locale = localeOf(lang);
    return spaces(formatter(`c:${locale}`, () => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })).format(value));
  }

  function formatMoney(value, currency, lang) {
    if (CURRENCY_SYMBOLS[currency]) return `${grouped(value, lang)} ${CURRENCY_SYMBOLS[currency]}`;
    const locale = localeOf(lang);
    try {
      return spaces(formatter(`m:${locale}:${currency}`, () => new Intl.NumberFormat(locale, {
        style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0
      })).format(value));
    } catch {
      return `${grouped(value, lang)} ${currency}`;
    }
  }

  // Короткая сумма для подписи у полосы: «20 тыс. ₽», «20K ₽», «$20K».
  function compactMoney(value, currency, lang) {
    if (value < 10000) return formatMoney(value, currency, lang);
    const zero = formatMoney(0, currency, lang);
    const symbol = zero.replace(/[\d\s]/g, "");
    return /^\d/.test(zero) ? `${compactNumber(value, lang)} ${symbol}` : `${symbol}${compactNumber(value, lang)}`;
  }

  // Как в таблице обзора: одна цифра после точки.
  function percent(value) {
    if (!Number.isFinite(value)) return ">100%";
    return `${Math.round(value * 10) / 10}%`;
  }

  // Суммы в таблице всегда целые (formatMoney без копеек), а разделители разрядов зависят
  // от языка: «1 234 567 ₽» или «1,234,567 ₽». Поэтому берём только цифры и знак минуса.
  function parseAmount(text) {
    const value = String(text ?? "");
    const first = value.search(/\d/);
    if (first < 0) return null;
    const amount = Number(value.replace(/\D/g, ""));
    return /[-−]/.test(value.slice(0, first)) ? -amount : amount;
  }

  function metrics(project) {
    const used = project.fact + project.reserve;
    const ratio = project.plan > 0 ? (used / project.plan) * 100 : (used > 0 ? Infinity : 0);
    return { used, ratio, free: project.plan - used, over: Math.max(0, used - project.plan) };
  }

  function niceStep(max, targetTicks) {
    const raw = max / targetTicks;
    const power = 10 ** Math.floor(Math.log10(raw || 1));
    const unit = [1, 2, 2.5, 5, 10].find((m) => m * power >= raw) || 10;
    return unit * power;
  }

  function start() {
    const root = document.documentElement;
    let panel = null;
    let tooltip = null;
    let scale = readScale();

    const lang = () => (root.lang === "en" ? "en" : "ru");
    const t = () => TEXT[lang()];
    const money = (value, currency) => formatMoney(value, currency, lang());

    function readScale() {
      try { return localStorage.getItem(SCALE_KEY) === "percent" ? "percent" : "money"; } catch { return "money"; }
    }

    // Строки проектов из таблицы обзора: { id, name, code, currency, plan, fact, reserve }.
    function readProjects() {
      const body = document.getElementById("overview-table-body");
      const result = { projects: [], rows: 0, grouped: false, skipped: 0 };
      if (!body) return result;
      const names = new Map();
      body.querySelectorAll("tr.overview-project-summary-row").forEach((row) => {
        result.rows += 1;
        const id = row.dataset.overviewProjectId;
        const cells = row.children;
        const heading = row.querySelector(".budget-project-heading strong, .overview-project-heading-static strong");
        if (heading) names.set(id, heading.textContent.trim());
        if (cells.length < 9) {
          if (row.querySelector(".overview-group-hint")) result.grouped = true;
          else result.skipped += 1;
          return;
        }
        const plan = parseAmount(cells[4].textContent);
        const fact = parseAmount(cells[5].textContent);
        const reserve = parseAmount(cells[6].textContent);
        if ([plan, fact, reserve].some((value) => value == null)) {
          result.skipped += 1;
          return;
        }
        result.projects.push({
          id,
          name: names.get(id) || row.querySelector(".overview-project-currency-continuation")?.textContent.trim() || t().project,
          code: cells[1].textContent.trim(),
          currency: cells[3].textContent.trim(),
          plan,
          fact,
          reserve
        });
      });
      return result;
    }

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function seg(className, left, width, isLast) {
      const node = el("span", `pf-seg ${className}${isLast ? " is-end" : ""}`);
      node.style.left = `${left}%`;
      node.style.width = isLast ? `${width}%` : `max(0px, calc(${width}% - 2px))`;
      return node;
    }

    function ensurePanel() {
      if (panel?.isConnected) return panel;
      const grid = document.querySelector("#page-overview .summary-grid");
      if (!grid) return null;
      panel = el("section", "panel pf-chart-panel");
      // Название области — заголовок графика: он создаётся заново на каждом языке, а атрибуты
      // постоянных элементов перевод страницы в app.js возвращает к запомненным значениям.
      panel.setAttribute("aria-labelledby", "pf-chart-title");
      panel.addEventListener("click", handleClick);
      panel.addEventListener("keydown", handleKey);
      panel.addEventListener("pointermove", handlePointer);
      panel.addEventListener("pointerleave", hideTooltip);
      panel.addEventListener("focusin", handleFocus);
      panel.addEventListener("focusout", hideTooltip);
      grid.after(panel);
      return panel;
    }

    function render() {
      const { projects, rows, grouped, skipped } = readProjects();
      // Бюджета нет совсем — таблица сама показывает пустое состояние, график не нужен.
      if (!rows) {
        panel?.remove();
        hideTooltip();
        return;
      }
      const host = ensurePanel();
      if (!host) return;
      const text = t();
      const currencies = [...new Set(projects.map((p) => p.currency))];
      const mixed = currencies.length > 1;
      const mode = mixed ? "percent" : scale;

      host.replaceChildren();
      const header = el("div", "panel-header pf-header");
      const titles = el("div");
      const heading = el("h2", null, text.title);
      heading.id = "pf-chart-title";
      titles.append(heading);
      titles.append(el("p", null, mode === "percent" ? text.leadPercent : text.leadMoney));
      const switcher = el("div", "pf-switch");
      switcher.setAttribute("role", "group");
      switcher.setAttribute("aria-label", text.scale);
      [["money", text.money], ["percent", text.percent]].forEach(([value, label]) => {
        const button = el("button", value === mode ? "is-active" : "", label);
        button.type = "button";
        button.dataset.pfScale = value;
        button.setAttribute("aria-pressed", String(value === mode));
        if (mixed && value === "money") {
          button.disabled = true;
          button.title = text.mixedMoney;
        }
        switcher.append(button);
      });
      header.append(titles, switcher);
      host.append(header);

      if (!projects.length) {
        host.append(el("div", "pf-empty", grouped ? text.grouped : text.noRate));
        return;
      }

      host.append(renderTotal(projects, mixed));
      host.append(renderPlot(projects, mode));
      host.append(el("p", "pf-note", skipped ? `${text.note} ${text.skipped(skipped)}` : text.note));
    }

    function renderTotal(projects, mixed) {
      const text = t();
      const wrap = el("div", "pf-total");
      if (mixed) {
        wrap.append(el("div", "pf-total-note", text.mixedTotal));
        wrap.append(renderLegend(projects));
        return wrap;
      }
      const currency = projects[0].currency;
      const totals = projects.reduce((acc, p) => ({ plan: acc.plan + p.plan, fact: acc.fact + p.fact, reserve: acc.reserve + p.reserve }), { plan: 0, fact: 0, reserve: 0 });
      const used = totals.fact + totals.reserve;
      const domain = Math.max(totals.plan, used) || 1;
      const factW = (Math.min(totals.fact, domain) / domain) * 100;
      const reserveW = (Math.min(totals.reserve, domain - Math.min(totals.fact, domain)) / domain) * 100;
      const freeW = Math.max(0, 100 - factW - reserveW - (Math.max(0, used - totals.plan) / domain) * 100);
      const overW = (Math.max(0, used - totals.plan) / domain) * 100;

      const head = el("div", "pf-total-head");
      head.append(el("strong", null, text.total));
      head.append(el("span", null, text.planOf(money(totals.plan, currency))));
      wrap.append(head);

      const plan = totals.plan || 1;
      const bar = el("div", "pf-meter");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", text.meter(
        percent((totals.fact / plan) * 100),
        percent((totals.reserve / plan) * 100),
        percent((Math.max(0, totals.plan - used) / plan) * 100)
      ));
      let left = 0;
      const parts = [["pf-fact", factW], ["pf-reserve", reserveW], ["pf-free", freeW], ["pf-over", overW]].filter(([, w]) => w > 0.05);
      parts.forEach(([cls, w], index) => {
        bar.append(seg(cls, left, w, index === parts.length - 1));
        left += w;
      });
      wrap.append(bar);

      const figures = el("div", "pf-figures");
      [
        ["pf-fact", text.fact, totals.fact, (totals.fact / plan) * 100],
        ["pf-reserve", text.reserve, totals.reserve, (totals.reserve / plan) * 100],
        used <= totals.plan
          ? ["pf-free", text.free, totals.plan - used, ((totals.plan - used) / plan) * 100]
          : ["pf-over", text.over, used - totals.plan, ((used - totals.plan) / plan) * 100]
      ].forEach(([cls, label, value, share]) => {
        const item = el("div", "pf-figure");
        const key = el("i", `pf-key ${cls}`);
        key.setAttribute("aria-hidden", "true");
        const caption = el("span");
        caption.append(el("b", null, percent(share)), el("small", null, label.toLowerCase()));
        item.title = money(value, currency);
        item.append(key, caption);
        figures.append(item);
      });
      const overCount = projects.filter((p) => metrics(p).over > 0).length;
      if (overCount && used <= totals.plan) {
        const item = el("div", "pf-figure");
        const key = el("i", "pf-key pf-over");
        key.setAttribute("aria-hidden", "true");
        const caption = el("span");
        caption.append(el("b", null, String(overCount)), el("small", null, text.overProjects(overCount)));
        item.append(key, caption);
        figures.append(item);
      }
      wrap.append(figures);
      return wrap;
    }

    function renderLegend(projects) {
      const text = t();
      const legend = el("div", "pf-figures");
      [["pf-fact", text.fact], ["pf-reserve", text.reserve], ["pf-free", text.freePlan]]
        .concat(projects.some((p) => metrics(p).over > 0) ? [["pf-over", text.over]] : [])
        .forEach(([cls, label]) => {
          const item = el("div", "pf-figure");
          const key = el("i", `pf-key ${cls}`);
          key.setAttribute("aria-hidden", "true");
          item.append(key, el("small", null, label));
          legend.append(item);
        });
      return legend;
    }

    function renderPlot(projects, mode) {
      const text = t();
      const rows = projects.map((p) => ({ ...p, ...metrics(p) }));
      rows.sort(mode === "percent"
        ? (a, b) => (b.ratio === a.ratio ? b.plan - a.plan : (b.ratio > a.ratio ? 1 : -1))
        : (a, b) => b.plan - a.plan || b.used - a.used);
      const currency = rows[0].currency;

      let domain;
      let step;
      if (mode === "percent") {
        const maxRatio = Math.max(100, ...rows.map((r) => (Number.isFinite(r.ratio) ? r.ratio : 100)));
        step = maxRatio > 150 ? 50 : 25;
        domain = Math.ceil(maxRatio / step) * step;
      } else {
        const max = Math.max(...rows.map((r) => Math.max(r.plan, r.used)), 1);
        step = niceStep(max, 4);
        domain = Math.ceil(max / step) * step;
      }
      const toPct = (value) => (Math.max(0, value) / domain) * 100;

      const plot = el("div", "pf-plot");
      plot.style.setProperty("--pf-step", `${(step / domain) * 100}%`);
      plot.dataset.scale = mode;

      const axis = el("div", "pf-axis");
      axis.append(el("span"));
      const ticks = el("div", "pf-ticks");
      for (let value = 0; value <= domain + 1e-9; value += step) {
        const tick = el("span", "pf-tick", mode === "percent" ? `${value}%` : (value === 0 ? "0" : compactNumber(value, lang())));
        tick.style.left = `${toPct(value)}%`;
        if (mode === "percent" && value === 100) tick.classList.add("is-plan");
        ticks.append(tick);
      }
      axis.append(ticks);
      plot.append(axis);

      const list = el("div", "pf-rows");
      list.setAttribute("role", "list");
      rows.forEach((r) => {
        const row = el("div", "pf-row");
        row.setAttribute("role", "listitem");
        row.tabIndex = 0;
        row.dataset.projectId = r.id;
        row.dataset.payload = JSON.stringify({ name: r.name, code: r.code, currency: r.currency, plan: r.plan, fact: r.fact, reserve: r.reserve });
        const status = r.over > 0 ? text.overAmount(money(r.over, r.currency)) : text.freeAmount(money(r.free, r.currency));
        row.setAttribute("aria-label", text.row(r.name, money(r.plan, r.currency), money(r.fact, r.currency), money(r.reserve, r.currency), status, percent(r.ratio)));
        if (r.over > 0) row.classList.add("is-over");

        row.append(el("span", "pf-name", r.name));
        const area = el("div", "pf-area");
        const base = mode === "percent" ? 100 : r.plan;
        const scaleValue = (value) => (mode === "percent" ? (r.plan > 0 ? (value / r.plan) * 100 : (value > 0 ? 100 : 0)) : value);
        const planEnd = toPct(scaleValue(r.plan));
        const track = el("span", "pf-track");
        track.style.width = `${mode === "percent" ? toPct(base) : planEnd}%`;
        area.append(track);

        const factIn = Math.min(r.fact, r.plan);
        const reserveIn = Math.min(r.reserve, Math.max(0, r.plan - factIn));
        const parts = [
          ["pf-fact", toPct(scaleValue(factIn))],
          ["pf-reserve", toPct(scaleValue(reserveIn))],
          ["pf-over", toPct(scaleValue(r.over))]
        ].filter(([, w]) => w > 0.05);
        let left = 0;
        parts.forEach(([cls, w], index) => {
          area.append(seg(cls, left, w, index === parts.length - 1));
          left += w;
        });

        if (mode === "percent") {
          const mark = el("span", "pf-plan-mark");
          mark.style.left = `${toPct(100)}%`;
          mark.setAttribute("aria-hidden", "true");
          area.append(mark);
        }

        const end = Math.max(left, mode === "percent" ? toPct(100) : planEnd);
        const label = el("span", "pf-value");
        label.style.left = `calc(${Math.min(end, 100)}% + 10px)`;
        label.append(el("b", null, percent(r.ratio)));
        if (r.over > 0) {
          const warn = el("small", "pf-over-text");
          const icon = el("i", "pf-warn-icon", "!");
          icon.setAttribute("aria-hidden", "true");
          warn.append(icon, document.createTextNode(` ${text.overAmount(compactMoney(r.over, r.currency, lang()))}`));
          label.append(warn);
        }
        area.append(label);
        row.append(area);
        list.append(row);
      });
      plot.append(list);
      if (mode === "money" && currency) plot.dataset.currency = currency;
      return plot;
    }

    // ---------- Подсказка ----------

    function showTooltip(row, x, y) {
      let data;
      try { data = JSON.parse(row.dataset.payload); } catch { return; }
      const text = t();
      if (!tooltip) {
        tooltip = el("div", "pf-tooltip");
        tooltip.setAttribute("role", "tooltip");
        document.body.append(tooltip);
      }
      const { free, ratio } = metrics(data);
      tooltip.replaceChildren();
      const title = el("div", "pf-tip-title");
      title.append(el("span", null, data.name));
      if (data.code) title.append(el("small", null, data.code));
      tooltip.append(title);
      [
        [null, text.plan, money(data.plan, data.currency)],
        ["pf-fact", text.fact, money(data.fact, data.currency)],
        ["pf-reserve", text.reserve, money(data.reserve, data.currency)],
        free >= 0 ? ["pf-free", text.free, money(free, data.currency)] : ["pf-over", text.over, money(-free, data.currency)],
        [null, text.expected, percent(ratio)]
      ].forEach(([cls, label, value]) => {
        const line = el("div", "pf-tip-row");
        const key = el("i", cls ? `pf-tip-key ${cls}` : "pf-tip-key is-blank");
        key.setAttribute("aria-hidden", "true");
        line.append(key, el("b", cls === "pf-over" ? "is-over" : null, value), el("span", null, label));
        tooltip.append(line);
      });
      tooltip.hidden = false;
      const rect = tooltip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - rect.width - 12, x + 16);
      const top = Math.min(window.innerHeight - rect.height - 12, y + 14);
      tooltip.style.left = `${Math.max(12, left)}px`;
      tooltip.style.top = `${Math.max(12, top)}px`;
    }

    function hideTooltip() {
      if (tooltip) tooltip.hidden = true;
    }

    function handlePointer(event) {
      const row = event.target.closest(".pf-row");
      if (!row) { hideTooltip(); return; }
      showTooltip(row, event.clientX, event.clientY);
    }

    function handleFocus(event) {
      const row = event.target.closest(".pf-row");
      if (!row) return;
      const rect = row.querySelector(".pf-area").getBoundingClientRect();
      showTooltip(row, rect.left + rect.width * 0.4, rect.bottom - 6);
    }

    // ---------- Действия ----------

    function revealInTable(projectId) {
      const selector = `#overview-table-body [data-overview-project-id="${CSS.escape(projectId)}"]`;
      let row = document.querySelector(selector);
      if (!row) return;
      if (!row.classList.contains("is-expanded")) {
        row.querySelector("[data-overview-project-toggle]")?.click();
        row = document.querySelector(selector);
      }
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.classList.add("pf-flash");
      setTimeout(() => row?.classList.remove("pf-flash"), 1600);
    }

    function handleClick(event) {
      const button = event.target.closest("[data-pf-scale]");
      if (button) {
        scale = button.dataset.pfScale === "percent" ? "percent" : "money";
        try { localStorage.setItem(SCALE_KEY, scale); } catch {}
        render();
        return;
      }
      const row = event.target.closest(".pf-row");
      if (row) { hideTooltip(); revealInTable(row.dataset.projectId); }
    }

    function handleKey(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest(".pf-row");
      if (!row) return;
      event.preventDefault();
      hideTooltip();
      revealInTable(row.dataset.projectId);
    }

    // ---------- Подписки ----------

    let scheduled = false;
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; render(); });
    }

    function subscribe() {
      const body = document.getElementById("overview-table-body");
      if (body) new MutationObserver(schedule).observe(body, { childList: true });
      new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["lang"] });
      window.addEventListener("scroll", hideTooltip, { passive: true });
      schedule();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", subscribe);
    else subscribe();
  }

  return { TEXT, compactMoney, formatMoney, metrics, parseAmount, percent, start };
});
