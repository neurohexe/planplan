/* DataLens adapter: explicit in-memory state, host export and ordinary DOM controls. */
(function (root) {
  'use strict';
  const FORMAT = 'plan-fact-datalens/v1';
  const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
  const byteLength = (value) => new TextEncoder().encode(value).length;

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Файл не содержит данные план-факта.');
    if (payload.format && payload.format !== FORMAT) throw Error('Версия рабочего файла не поддерживается.');
    const state = payload.state || payload;
    if (!state || !Array.isArray(state.locations) || !Array.isArray(state.articles) || !Array.isArray(state.expenses)) {
      throw Error('Это не рабочий файл план-факта: нет локаций, проектов или расходов.');
    }
    if (state.forecastTickets !== undefined && !Array.isArray(state.forecastTickets)) throw Error('Повреждён список прогнозов.');
    return { application: 'План · Факт', format: FORMAT, exportedAt: payload.exportedAt || '', state,
      view: payload.view && typeof payload.view === 'object' && !Array.isArray(payload.view) ? payload.view : {} };
  }

  function snapshotPayload(state, view = {}) {
    return validatePayload({ application: 'План · Факт', format: FORMAT, exportedAt: new Date().toISOString(), state, view });
  }

  function encodeSnapshot(payload) {
    const text = '\uFEFF' + FORMAT + '\r\n"' + JSON.stringify(validatePayload(payload)).replace(/"/g, '""') + '"\r\n';
    if (byteLength(text) > MAX_SNAPSHOT_BYTES) throw Error('Рабочий файл больше 5 МБ. Уменьшите объём истории перед сохранением.');
    return text;
  }

  function decodeSnapshot(input) {
    const text = String(input).replace(/^\uFEFF/, '').trim();
    if (byteLength(text) > MAX_SNAPSHOT_BYTES) throw Error('Рабочий файл больше 5 МБ.');
    if (!text.startsWith(FORMAT)) {
      try { return validatePayload(JSON.parse(text)); }
      catch (error) { throw Error('Не удалось прочитать рабочий CSV или JSON: ' + error.message); }
    }
    const marker = /^(plan-fact-datalens\/v1)\r?\n/.exec(text);
    if (!marker) throw Error('Повреждён заголовок рабочего CSV.');
    const field = text.slice(marker[0].length);
    if (!field.startsWith('"') || !field.endsWith('"')) throw Error('Повреждена строка рабочего CSV.');
    let json = '';
    for (let i = 1; i < field.length - 1; i++) {
      if (field[i] === '"') {
        if (field[i + 1] !== '"' || i + 1 === field.length - 1) throw Error('Повреждены кавычки рабочего CSV.');
        i++;
      }
      json += field[i];
    }
    try { return validatePayload(JSON.parse(json)); }
    catch (error) { throw Error('Не удалось прочитать данные рабочего CSV: ' + error.message); }
  }

  const helpers = { FORMAT, MAX_SNAPSHOT_BYTES, snapshotPayload, encodeSnapshot, decodeSnapshot };
  if (typeof module === 'object' && module.exports) module.exports = helpers;
  if (typeof document === 'undefined') return;
  const framed = window.parent !== window;

  const values = new Map();
  const storage = { getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)), clear: () => values.clear() };
  const readEmbedded = (id) => JSON.parse(document.getElementById(id)?.textContent || 'null');
  const initialState = readEmbedded('planfact-state');
  const initialView = readEmbedded('planfact-view') || {};
  const initialMeta = readEmbedded('planfact-meta') || {};
  const query = new URLSearchParams(location.search);
  const queryTheme = query.get('theme') || 'system';
  const dark = queryTheme.startsWith('dark') || (queryTheme === 'system' && root.matchMedia?.('(prefers-color-scheme: dark)').matches);
  storage.setItem('plan-fact-budget-theme-v1', dark ? 'dark' : 'light');
  storage.setItem('plan-fact-budget-language-v1', query.get('lang') === 'en' ? 'en' : 'ru');
  storage.setItem('plan-fact-budget-profile-v1', JSON.stringify({ name: 'Пользователь страницы' }));
  storage.setItem('plan-fact-budget-ui-v1', JSON.stringify(initialView));
  let hooks = null;
  let dirty = false;
  let questionBusy = false;
  let baseline = initialState ? JSON.stringify(initialState) : '';

  function status(message, error = false) {
    const node = document.getElementById('pf-dl-status');
    if (node) { node.textContent = message; node.classList.toggle('is-error', error); }
  }

  function changed(nextState) {
    if (!hooks) return;
    dirty = JSON.stringify(nextState) !== baseline;
    status(dirty ? 'Есть изменения. Сохраните рабочий файл перед закрытием.' : 'Открыт снимок данных из страницы.');
  }

  function exportFile(name, content, mime) {
    const cleanMime = String(mime).split(';')[0];
    let text = String(content);
    if (cleanMime === 'application/json') {
      const parsed = decodeSnapshot(text);
      parsed.view = hooks?.getView() || parsed.view;
      text = encodeSnapshot(parsed);
      name = String(name).replace(/\.json$/i, '') + '.csv';
    } else if (cleanMime !== 'text/csv') {
      throw Error('Для этой версии поддерживается выгрузка CSV.');
    }
    if (byteLength(text) > MAX_SNAPSHOT_BYTES) throw Error('Файл больше 5 МБ.');
    const safeName = String(name).replace(/[\\/\u0000-\u001f]/g, '_');
    if (framed) {
      root.parent.postMessage({ code: 'EXPORT', data: { name: safeName, mime: 'text/csv', data: text } }, '*');
      status('Файл передан DataLens для скачивания. Проверьте, что он появился в загрузках.');
    } else {
      showCopyPanel(safeName, text);
      status('Локальный просмотр: скопируйте рабочий CSV или откройте страницу в DataLens.');
    }
    // EXPORT has no documented acknowledgement: never mark changes as durably saved here.
    return { name: safeName, mime: 'text/csv', data: text };
  }

  function exportSnapshot() {
    if (!hooks) throw Error('Страница ещё загружается.');
    return exportFile('План-факт-рабочий-' + new Date().toISOString().slice(0, 10) + '.csv',
      encodeSnapshot(snapshotPayload(hooks.getState(), hooks.getView())), 'text/csv');
  }

  async function restoreSnapshot(text) {
    if (!hooks) throw Error('Страница ещё загружается.');
    const payload = decodeSnapshot(text);
    if (!await ask('Заменить текущие данные содержимым рабочего файла? Несохранённые изменения в этой вкладке будут потеряны.')) return false;
    await hooks.importState(payload.state, payload.view);
    baseline = JSON.stringify(hooks.getState());
    dirty = false;
    status('Рабочий файл открыт. Данные опубликованной страницы не изменены.');
    return true;
  }

  function ask(message, defaultValue) {
    if (questionBusy) return Promise.reject(Error('Сначала закройте открытый вопрос.'));
    questionBusy = true;
    const dialog = document.createElement('dialog');
    dialog.id = 'pf-dl-question';
    dialog.className = 'pf-dl-question';
    dialog.setAttribute('aria-labelledby', 'pf-dl-question-title');
    const title = document.createElement('h2'); title.id = 'pf-dl-question-title'; title.textContent = 'Подтверждение';
    const detail = document.createElement('p'); detail.textContent = String(message);
    const input = document.createElement('input'); input.id = 'pf-dl-question-input';
    input.setAttribute('aria-label', 'Значение'); input.value = defaultValue === undefined ? '' : String(defaultValue);
    input.hidden = defaultValue === undefined;
    const buttons = document.createElement('div'); buttons.className = 'button-row';
    const no = document.createElement('button'); no.id = 'pf-dl-question-no'; no.type = 'button'; no.className = 'button button-secondary'; no.textContent = 'Отмена';
    const yes = document.createElement('button'); yes.id = 'pf-dl-question-yes'; yes.type = 'button'; yes.className = 'button button-primary'; yes.textContent = 'Продолжить';
    buttons.append(no, yes); dialog.append(title, detail, input, buttons); document.body.appendChild(dialog);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (accepted) => {
        if (settled) return;
        settled = true; questionBusy = false;
        dialog.close(); dialog.remove();
        resolve(defaultValue === undefined ? accepted : accepted ? input.value : null);
      };
      no.addEventListener('click', () => finish(false));
      yes.addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
      dialog.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } });
      dialog.showModal(); (defaultValue === undefined ? no : input).focus();
    });
  }

  function showCopyPanel(name, content) {
    document.getElementById('pf-dl-copy')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'pf-dl-copy'; dialog.className = 'pf-dl-question';
    const title = document.createElement('h2'); title.textContent = 'Рабочий файл: ' + name;
    const text = document.createElement('p'); text.textContent = 'В DataLens этот файл скачивается кнопкой. При локальном просмотре можно скопировать весь текст и сохранить в UTF-8 с расширением .csv.';
    const area = document.createElement('textarea'); area.value = content; area.readOnly = true; area.rows = 10; area.setAttribute('aria-label', 'Содержимое рабочего CSV');
    const select = document.createElement('button'); select.type = 'button'; select.className = 'button button-primary'; select.textContent = 'Выделить весь текст'; select.onclick = () => { area.focus(); area.select(); };
    const close = document.createElement('button'); close.type = 'button'; close.className = 'button button-secondary'; close.textContent = 'Закрыть'; close.onclick = () => { dialog.close(); dialog.remove(); };
    dialog.append(title, text, area, select, close); document.body.appendChild(dialog); dialog.showModal();
  }

  function installFormControls() {
    document.querySelectorAll('[data-pf-form]').forEach((form) => {
      form.reset = () => form.querySelectorAll('input, textarea, select').forEach((field) => {
        if (field.tagName === 'SELECT') {
          const selected = [...field.options].findIndex((option) => option.defaultSelected);
          field.selectedIndex = selected >= 0 ? selected : field.options.length ? 0 : -1;
        } else if (field.type === 'checkbox' || field.type === 'radio') field.checked = field.defaultChecked;
        else field.value = field.type === 'file' ? '' : field.defaultValue;
      });
    });
    const submit = (form) => {
      if (!form) return;
      for (const field of form.querySelectorAll('input, textarea, select')) {
        if (!field.disabled && field.checkValidity && !field.checkValidity()) { field.reportValidity(); return; }
      }
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    };
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-pf-submit]');
      if (button && !button.disabled) { event.preventDefault(); submit(button.closest('[data-pf-form]')); }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing || event.target.tagName !== 'INPUT' || event.target.type === 'file') return;
      const form = event.target.closest('[data-pf-form]');
      if (form && form.querySelector('[data-pf-submit]:not([disabled])')) { event.preventDefault(); submit(form); }
    });
  }

  function installToolbar() {
    const bar = document.createElement('section'); bar.id = 'pf-dl-toolbar'; bar.className = 'pf-dl-toolbar';
    bar.setAttribute('aria-label', 'Рабочий файл план-факта');
    const description = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = initialMeta.demo ? 'Пример · вымышленные данные' : 'План-факт · DataLens';
    const note = document.createElement('p'); note.id = 'pf-dl-status'; note.setAttribute('role', 'status'); note.textContent = 'Изменения в этой вкладке. Сохраните рабочий файл перед закрытием.';
    description.append(title, note);
    const controls = document.createElement('div'); controls.className = 'pf-dl-actions';
    const save = document.createElement('button'); save.type = 'button'; save.id = 'pf-dl-save'; save.className = 'button button-primary'; save.textContent = 'Сохранить рабочий файл';
    save.addEventListener('click', () => { try { exportSnapshot(); } catch (error) { status(error.message, true); } });
    const restore = document.createElement('button'); restore.type = 'button'; restore.id = 'pf-dl-restore'; restore.className = 'button button-secondary'; restore.textContent = 'Открыть рабочий файл';
    const file = document.createElement('input'); file.type = 'file'; file.id = 'pf-dl-file'; file.accept = '.csv,.json'; file.hidden = true;
    restore.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const selected = file.files?.[0]; file.value = ''; if (!selected) return;
      try { if (selected.size > MAX_SNAPSHOT_BYTES) throw Error('Файл больше 5 МБ.'); await restoreSnapshot(await selected.text()); }
      catch (error) { status(error.message, true); }
    });
    controls.append(restore, save, file); bar.append(description, controls);
    document.querySelector('.main-area')?.prepend(bar);
  }

  function attach(api) {
    hooks = api; baseline = JSON.stringify(api.getState());
    installToolbar();
    const exportButton = document.getElementById('export-json-btn');
    if (exportButton) exportButton.textContent = 'Сохранить рабочий файл';
  }

  function networkDisabled() { return Promise.reject(Error('Эта функция недоступна в HTML-странице DataLens.')); }
  root.PlanFactDL = Object.assign(helpers, { storage, initialState, attach, changed, exportFile, exportSnapshot,
    restoreSnapshot, askConfirmation: (message) => ask(message), askValue: (message, initial = '') => ask(message, initial),
    networkDisabled, getState: () => hooks?.getState(), isDirty: () => dirty });
  document.addEventListener('DOMContentLoaded', installFormControls);
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link || !framed || link.getAttribute('href').startsWith('#')) return;
    event.preventDefault();
    const url = new URL(link.href);
    if (url.protocol !== 'https:') { status('В DataLens поддерживаются внешние ссылки HTTPS.', true); return; }
    root.parent.postMessage({ code: 'OPEN_URL', data: { url: url.href } }, '*');
  });
})(typeof globalThis === 'undefined' ? this : globalThis);
