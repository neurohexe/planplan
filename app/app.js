(() => {
  "use strict";

  const BudgetImport = globalThis.BudgetImport
    || (typeof require === "function" ? require("./budget-import.js") : null);
  const ExpenseImport = globalThis.ExpenseImport
    || (typeof require === "function" ? require("./expense-import.js") : null);
  const PeriodLocks = globalThis.PeriodLocks
    || (typeof require === "function" ? require("./period-locks.js") : null);
  const TrackerSync = globalThis.TrackerSync
    || (typeof require === "function" ? require("./tracker-sync.js") : null);

  const STORAGE_KEY = "plan-fact-budget-state-v1";
  const STORAGE_KEY_BACKUP = "plan-fact-budget-state-backup-v1";
  const PROFILE_KEY = "plan-fact-budget-profile-v1";
  const UI_KEY = "plan-fact-budget-ui-v1";
  const THEME_KEY = "plan-fact-budget-theme-v1";
  const LANGUAGE_KEY = "plan-fact-budget-language-v1";
  const CURRENCY_DISPLAY_KEY = "plan-fact-budget-currency-display-v1";
  const TRACKER_AUTO_PAUSE_KEY = "plan-fact-tracker-auto-pause-v1";
  const TRACKER_PERIOD_KEY = "plan-fact-tracker-period-v1";
  const TRACKER_SCOPE_KEY = "plan-fact-tracker-scope-v1";
  const SCHEMA_VERSION = PeriodLocks.SCHEMA_VERSION;
  // Локальный файл runtime-config.js оставляет автономный режим. Backend
  // перехватывает тот же URL и включает общий сервер без второй копии frontend.
  const LOCAL_ONLY_BUILD = globalThis.PLAN_FACT_RUNTIME?.mode !== "server";
  const ALL_LOCATIONS = "__all__";
  const UNASSIGNED_RESPONSIBLE = "__unassigned__";
  // Гриф по правилам https://wiki.yandex-team.ru/security/nda/ и https://wiki.yandex-team.ru/security/nda-en/.
  const NDA_NOTICE_URLS = {
    ru: "https://wiki.yandex-team.ru/security/nda/",
    en: "https://wiki.yandex-team.ru/security/nda-en/"
  };
  const EN = {
    "Вход по коду": "Access code sign-in", "Доступ к приложению": "Application access",
    "Логин": "Login", "Логин *": "Login *", "Код доступа": "Access code", "Войти": "Sign in", "Выйти": "Sign out",
    "Введите логин и личный код доступа.": "Enter your login and personal access code.",
    "Не удалось проверить вход": "Could not check sign-in", "Не удалось войти": "Could not sign in",
    "Не удалось выйти": "Could not sign out", "Вход выполнен": "Signed in",
    "Неверный логин или код. После 5 ошибок подряд вход блокируется на 15 минут.": "Incorrect login or code. After 5 consecutive errors, sign-in is blocked for 15 minutes.",
    "Вход подтверждён личным кодом доступа. Роль и права по локациям управляются внутри приложения.": "Sign-in is verified by a personal access code. Roles and location permissions are managed in the application.",
    "Добавляйте пользователей по логину и назначайте роли и права на локации.": "Add users by login and assign roles and location access.",
    "План · Факт": "Plan · Actual", "Бюджет офиса": "Office budget", "Конфиденциально": "Confidential",
    "Обзор": "Overview", "Расходы": "Expenses", "Прогнозы": "Forecasts", "Бюджет и статьи": "Budget and items", "Данные": "Data",
    "Локации": "Locations", "Управление локациями": "Manage locations", "Все локации": "All locations",
    "Локальный режим": "Local mode", "Данные сохраняются в браузере": "Data is saved in the browser",
    "Имя не задано": "Name not set", "Изменить профиль": "Edit profile", "Период": "Period",
    "Все изменения сохранены": "All changes saved", "Добавить расход": "Add expense",
    "Текущая картина": "Current picture", "Бюджет за": "Budget for", "Открыть реестр": "View register",
    "План": "Plan", "Факт": "Actual", "Прогноз": "Forecast", "Зарезервировано": "Reserved", "Свободно": "Available", "Ожидается": "Expected", "Потрачено": "Spent", "Овербюджет": "Over budget",
    "План минус факт и резерв": "Plan minus actual and reserved",
    "Добавить прогноз": "Add forecast", "Импортировать отчёт по ЗП": "Import PR report",
    "Текущие прогнозы": "Current forecasts", "Единая загрузка": "Unified upload", "Импорт отчёта по ЗП": "PR report import",
    "Ожидаемая дата": "Expected date", "Состояние": "Status", "Статус": "Status", "Описание": "Description",
    "Прогнозов в этом квартале нет": "No forecasts in this quarter",
    "Добавьте прогноз вручную или импортируйте отчёт по ЗП.": "Add a forecast manually or import the PR report.",
    "Статья": "Item", "Код проекта": "Project code", "Итого за квартал": "Quarter total", "Действия": "Actions",
    "Управление проектами": "Manage projects", "Скопировать прошлый квартал": "Copy previous quarter",
    "Сохранить изменения": "Save changes", "Итого план": "Total plan",
    "Проекты": "Projects", "Проект / статья бюджета": "Project / budget item", "Название проекта": "Project name",
    "Добавить проект": "Add project", "Сохранить": "Save", "Закрыть": "Close", "Отмена": "Cancel",
    "Новая запись": "New entry", "Редактировать расход": "Edit expense",
    "Дата расхода": "Expense date", "Ссылка на тикет": "Ticket link", "Комментарий": "Comment", "Описание расхода": "Expense description", "Сохранить расход": "Save expense",
    "Профиль и данные": "Profile and data", "Настройки": "Settings", "Выгрузить CSV": "Export CSV",
    "Код не задан": "No code",
    "Все сервисы": "All services", "Все юр лица": "All legal entities",
    "Фильтр по сервису": "Filter by service", "Фильтр по юр лицу": "Filter by legal entity", "Фильтр по локации": "Filter by location",
    "Фильтр по ответственному": "Filter by owner", "Фильтр по типу бюджета": "Filter by budget type",
    "Проект добавлен": "Project added", "Проект обновлён": "Project updated", "Бюджет сохранён": "Budget saved",
    "Сохраняю…": "Saving…", "Изменения не сохранены": "Changes not saved", "Нет связи с общим сервером": "Shared server unavailable"
    , "1 квартал": "Q1", "2 квартал": "Q2", "3 квартал": "Q3", "4 квартал": "Q4", "Год": "Year",
    "План, потраченные и зарезервированные деньги, а также доступный остаток по всем проектам.": "Plan, spent and reserved money, and the available balance across all projects.",
    "Выделено на квартал": "Allocated for the quarter", "План минус факт": "Plan minus actual",
    "План-факт по статьям": "Plan vs actual by item", "Нажмите на проект, чтобы увидеть статьи и суммы по ним.": "Click a project to see its items and amounts.",
    "Последние расходы": "Recent expenses", "Новые записи выбранного квартала.": "Latest entries for the selected quarter.", "Реестр": "Register", "Расходы за": "Expenses for",
    "Расход попадает в квартал по дате его добавления.": "The expense quarter is determined by its date.", "Фильтр по статье": "Filter by item", "Фильтр по статусу": "Filter by status",
    "Только действующие": "Active only", "Все записи": "All entries", "Только аннулированные": "Canceled only", "Дата": "Date", "Сумма": "Amount", "Сумма без НДС": "Amount excl. VAT", "Тикет": "Ticket", "Добавил": "Created by",
    "Расходов пока нет": "No expenses yet", "Добавьте первую запись — остатки пересчитаются автоматически.": "Add the first entry and balances will update automatically.",
    "Настройки кварта": "Quarter settings",
    "Код проекта меняется через «Управление проектами».": "Project codes are changed in Manage projects.",
    "Укажите имя автора расходов и управляйте резервными копиями.": "Set the expense author name and manage backups.", "Профиль пользователя": "User profile", "Ваше имя": "Your name", "Сохранить имя": "Save name",
    "Выгрузка данных": "Data export", "Скачать JSON": "Download JSON", "Скачать CSV": "Download CSV", "Восстановление": "Restore",
    "Название": "Name", "Код": "Code", "Валюта": "Currency", "Локация": "Location", "Добавить": "Add", "Расходов": "Expenses", "Дата расхода определяет квартал": "The expense date determines the quarter",
    "Добавить валюту к статье": "Add currency to item",
    "Поиск локаций": "Search locations", "Поиск по названию или коду": "Search by name or code", "Локации не найдены": "No locations found",
    "Операционные расходы": "Operating expenses", "Капитальные расходы": "Capital expenses", "Другие проекты": "Other projects",
    "Проекты пока не добавлены.": "No projects yet.",
    "Редактировать бюджет": "Edit budget", "Отменить": "Cancel",
    "Сначала сохраните или отмените изменения бюджета": "Save or cancel the budget changes first",
    "Импортировать": "Import", "Импорт бюджета": "Budget import", "Применить импорт": "Apply import",
    "Импорт обновляет только план выбранного квартала. Расходы, прогнозы и комментарии сохраняются.": "The import updates only the selected quarter's plan. Expenses, forecasts, and comments are preserved.",
    "Повторный импорт обновит плановые суммы из файла. Записанные расходы, прогнозы и комментарии сохранятся.": "Re-importing updates planned amounts from the file. Recorded expenses, forecasts, and comments will be preserved.",
    "Импорт отменён: он может изменить или удалить записанные расходы, прогнозы или комментарии. Данные не сохранены.": "The import was canceled because it could change or delete recorded expenses, forecasts, or comments. No data was saved.",
    "Дата резервирования": "Reservation date", "Статус ЗП": "PR status", "№ ЗП": "PR No.",
    "OPEX и CAPEX": "OPEX and CAPEX", "Файл Excel": "Excel file", "Выбрать файл": "Choose file",
    "Файл не выбран": "No file selected", "Отчётный период": "Reporting period",
    "Сначала выберите файл": "Choose a file first", "Выберите период": "Choose a period",
    "Период выбирается отдельно для каждого импорта.": "Choose the period separately for each import.",
    "Валюта проекта": "Project currency", "Добавить валюту": "Add currency", "Тип": "Type",
    "Нет помесячной разбивки": "No monthly breakdown", "Проекты и помесячные плановые суммы": "Projects and monthly planned amounts",
    "Месяц 1": "Month 1", "Месяц 2": "Month 2", "Месяц 3": "Month 3", "Итого": "Total",
    "Исходный Excel не изменяется. Валюты не конвертируются и не складываются между собой.": "The source Excel file is not changed. Currencies are neither converted nor mixed.",
    "Пользователи и доступы": "Users and access", "Управлять пользователями": "Manage users",
    "Добавляйте сотрудников по Staff login и назначайте роли и права на локации.": "Add employees by Staff login and assign roles and location access.",
    "Администратор": "Administrator", "Пользователь": "User",
    "Корпоративный вход": "Corporate sign-in", "Корпоративный доступ": "Corporate access",
    "Вход через Staff": "Sign in with Staff",
    "Обсуждение расхода": "Expense discussion", "Комментарии": "Comments", "Новый комментарий": "New comment",
    "Отправить": "Send", "Комментариев пока нет.": "No comments yet.", "Комментарий добавлен": "Comment added",
    "Администрирование": "Administration", "Имя пользователя": "User name", "Роль": "Role",
    "Новые и неназначенные локации": "New and unassigned locations", "Скрывать": "Hide",
    "Показывать для просмотра": "Show as read-only", "Права по локациям": "Location access",
    "Индивидуальное правило важнее настройки выше": "Per-location access overrides the default",
    "По общему правилу": "Use default", "Скрыта": "Hidden", "Просмотр + комментарии": "View + comments",
    "Редактирование": "Edit", "Новый пользователь": "New user", "Пользователь добавлен": "User added",
    "Пользователь обновлён": "User updated",
    "Вход не выполнен": "Not signed in"
    , "Проект / статья": "Project / item", "Проект и статья": "Project and item", "Статьи проекта": "Project items",
    "Статья проекта": "Project item", "Название статьи": "Item name", "Код статьи": "Item code",
    "Добавить статью": "Add item", "Все проекты": "All projects", "Статей": "Items",
    "Бюджет и расходы распределяются между статьями этого проекта.": "Budget and expenses are allocated among this project's items.",
    "Статью с расходами или ненулевым бюджетом удалить нельзя. У проекта всегда должна оставаться хотя бы одна статья.": "An item with expenses or a non-zero budget cannot be deleted. Every project must keep at least one item.",
    "Нажмите на проект, чтобы раскрыть его статьи и суммы.": "Select a project to expand its items and amounts.",
    "Поиск проектов": "Search projects", "Название или код проекта": "Project name or code",
    "Все ответственные": "All owners", "Без ответственного": "Unassigned", "Ответственный": "Owner",
    "Сервис": "Service", "Юр лицо": "Legal entity", "ЦФО": "Cost center",
    "Тип бюджета": "Budget type", "Все": "All",
    "Проекты по запросу не найдены.": "No projects match your search.",
    "Текущий бюджет был загружен старой версией без статей проектов. Администратору нужно повторно импортировать исходный Excel и выбрать квартал.": "This budget was imported by an older version without project items. An administrator must import the source Excel file again and select the quarter.",
    "План задаётся по статьям и месяцам, а строка проекта показывает их общий итог. Валюты не конвертируются и не складываются.": "Plans are entered by item and month, while the project row shows their combined total. Currencies are neither converted nor mixed.",
    "Код проекта / статьи": "Project / item code",
    "Автономный HTML": "Standalone HTML",
    "Данные сохраняются локально в этом браузере. Для переноса на другой компьютер используйте JSON.": "Data is saved locally in this browser. Use JSON export to move it to another computer.",
    "План Факт для Windows.html": "Plan Fact for Windows.html",
    "Интерфейс и расчёты совпадают с версией для Mac. Сервер и установка не требуются.": "The interface and calculations match the Mac version. No server or installation is required.",

    "План · Факт — бюджет офиса": "Plan · Actual — office budget",
    "Будущие даты загружаются как прогноз. Наступление даты не создаёт факт автоматически.": "Future dates are loaded as a forecast. Reaching the date does not automatically create an actual expense.",
    "Квартал": "Quarter", "Проект": "Project", "Найти": "Search", "Легенда": "Legend", "Действие": "Action",
    "Позже": "Later", "Подтвердить": "Confirm", "Не указано": "Not specified", "Необязательно": "Optional",
    "Выбранный период": "Selected period", "Отображаемое имя": "Display name", "Юридическое лицо": "Legal entity",
    "В рублях": "In RUB", "Валюта оригинала": "Original currency", "Все состояния": "All states",
    "Включить тёмную тему": "Enable dark theme", "Включить светлую тему": "Enable light theme", "Основная навигация": "Main navigation",
    "Результаты поиска": "Search results", "Открыт": "Open", "Ожидаемые расходы": "Expected expenses",
    "Зарезервированные": "Reserved", "На проверке": "Under review", "Освобождённые": "Released", "Оплаченные": "Paid",
    "Прогнозы за": "Forecasts for", "Дата прогноза": "Forecast date", "Сохранить прогноз": "Save forecast",
    "Резерв бюджета": "Budget reserve", "По всем периодам и локациям": "Across all periods and locations",
    "Прогноз резервирует деньги до оплаты или освобождения": "A forecast reserves money until it's paid or released",
    "Прогноз резервирует деньги до оплаты или освобождения.": "A forecast reserves money until it's paid or released.",
    "Необязательно: без статьи прогноз учитывается в общем итоге проекта.": "Optional: without an item, the forecast is counted in the project's overall total.",
    "Необязательно: без статьи расход учитывается в общем факте проекта.": "Optional: without an item, the expense is counted in the project's overall total.",
    "Кратко опишите расход": "Briefly describe the expense", "Напишите комментарий…": "Write a comment…",
    "Название или код": "Name or code", "Например, Анна": "E.g., Anna",
    "Например, Дезинсекция и дератизация": "E.g., Pest and rodent control", "Например, Уборка помещений": "E.g., Cleaning services",
    "Например: найдена ошибка в расходе, нужно исправить": "E.g.: an error was found in the expense, needs fixing",
    "Москва, Казань, Склад №2…": "Moscow, Kazan, Warehouse #2…", "Добавить локацию": "Add location",
    "Локацию нельзя удалить, если по ней есть расходы — сначала удалите или перенесите их. Архивация скрывает локацию из меню, данные сохраняются.": "A location can't be deleted if it has expenses — remove or move them first. Archiving hides the location from menus; its data is kept.",
    "Что планируется оплатить": "Planned payment", "Куда попадёт": "Destination",
    "Причина (обязательна для переоткрытия)": "Reason (required to reopen)",
    "Фильтры обзора": "Overview filters", "Фильтр обзора по проекту": "Overview filter by project",
    "Фильтр обзора по локации проекта": "Overview filter by project location",
    "Фильтр обзора по ответственному": "Overview filter by owner", "Фильтр обзора по сервису": "Overview filter by service",
    "Фильтр обзора по типу бюджета": "Overview filter by budget type", "Фильтр обзора по юр лицу": "Overview filter by legal entity",
    "Фильтр прогнозов по проекту": "Forecasts filter by project", "Фильтр прогнозов по состоянию": "Forecasts filter by state",
    "Поиск по проекту, тикету или описанию": "Search by project, ticket, or description",
    "Поиск по статье, коду, тикету или комментарию": "Search by item, code, ticket, or comment",
    "Для этого бюджета ответственные ещё не загружены. Администратору нужно один раз повторно импортировать исходный Excel — приложение прочитает столбец «Группа» или «Ответственный».": "Owners haven't been loaded for this budget yet. An administrator needs to re-import the source Excel file once — the app will read the \"Group\" or \"Owner\" column.",

    "Закрытие периода": "Close period", "Закрытие периодов": "Period closing",
    "Закрытый период защищает план и расходы от изменений для всех локаций. Квартал закрывается после трёх месяцев и фиксирует итоговый снимок.": "A closed period protects the plan and expenses from changes across all locations. A quarter closes after three months and locks in a final snapshot.",
    "Настройки квартала": "Quarter settings",

    "Tracker ещё не проверялся": "Tracker hasn't been checked yet",
    "Автоматическая проверка выполняется каждые 30 минут, пока приложение открыто.": "Automatic checks run every 30 minutes while the app is open.",
    "Повторить проверку": "Check again", "Обновить токен": "Update token",
    "Корпоративный аккаунт проверяется автоматически.": "Your corporate account is verified automatically.",
    "Персональный OAuth-токен": "Personal OAuth token", "Токен Yandex Tracker": "Yandex Tracker token",
    "Токен сохраняется только на этом компьютере: в Keychain на macOS или в пользовательском хранилище Windows. Он не попадает в данные приложения и резервные копии.": "The token is stored only on this computer: in Keychain on macOS or in per-user storage on Windows. It is never included in app data or backups.",
    "Подключение к Tracker": "Tracker connection", "Синхронизация с Tracker": "Tracker sync",
    "Синхронизация с Tracker…": "Tracker sync…", "Синхронизировать с Tracker": "Sync with Tracker",
    "Идёт синхронизация с Tracker. Подождите, действия в приложении временно недоступны…": "Syncing with Tracker. Please wait, actions in the app are temporarily unavailable…",
    "Настройки поиска и периода Tracker": "Tracker search and period settings",
    "Область поиска": "Search scope", "Область поиска в Tracker": "Tracker search scope",
    "Мои тикеты": "My issues", "Вся очередь TAXIASSIST": "Entire TAXIASSIST queue",
    "мои тикеты TAXIASSIST": "my TAXIASSIST issues", "вся очередь TAXIASSIST": "the entire TAXIASSIST queue",
    "Год импорта из Tracker": "Tracker import year", "Квартал импорта": "Import quarter",
    "Квартал импорта из Tracker": "Tracker import quarter", "Найти тикет": "Find ticket",
    "Новые финансовые тикеты TAXIASSIST создают расходы и резервы по периоду оказания услуги. Изменения суммы, валюты, проекта или офиса требуют ручной проверки.": "New TAXIASSIST finance tickets create expenses and reserves based on the service period. Changes to the amount, currency, project, or office require manual review.",
    "Поиск по очереди проверяет финансовые тикеты всех авторов. Квартал определяется по дате окончания периода оказания услуги; если период не указан — по дате создания тикета. Уже добавленные расходы продолжают контролироваться при любом режиме.": "Queue search checks finance tickets from all authors. The quarter is determined by the end date of the service period; if no period is set, by the ticket's creation date. Expenses that were already added continue to be tracked in either mode.",
    "Исходный Excel не изменяется. Прогнозы попадут на экран «Прогнозы», а фактический расход появится на экране «Расходы» после подтверждения оплаты.": "The source Excel file is not changed. Forecasts will appear on the Forecasts screen, and the actual expense will appear on the Expenses screen once payment is confirmed.",
    "Данные проекта и валюты взяты из прогноза. После сохранения резерв будет снят, а расход появится в факте.": "Project and currency data are taken from the forecast. After saving, the reserve will be released and the expense will appear as actual.",
    "Ручное сопоставление Tracker": "Manual Tracker matching", "Разнести тикет": "Allocate ticket",
    "Сопоставление сохраняется для этого тикета; при необходимости его можно применить и к похожим тикетам.": "The mapping is saved for this ticket; if needed, it can also be applied to similar tickets.",
    "Удалить сопоставление": "Remove mapping", "Запомнить код Tracker как этот проект": "Remember this Tracker code as this project",
    "Запомнить код Tracker как эту локацию": "Remember this Tracker code as this location",
    "Сохранить и повторить": "Save and retry", "Сохранить и синхронизировать": "Save and sync",

    "Режим отображения валют": "Currency display mode", "Курсы валют к RUB": "RUB exchange rates",
    "Значения доступны только для просмотра. Кнопка ⇄ меняет только направление отображения. Чтобы обновить курсы, повторно импортируйте бюджет за нужный квартал.": "Values are read-only. The ⇄ button only changes the display direction. To update the rates, re-import the budget for the needed quarter.",
    "Курсы загружаются из листа «курс» бюджетного файла и хранятся отдельно для каждого квартала.": "Rates are loaded from the exchange-rate sheet of the budget file and stored separately for each quarter.",

    "Выбрать JSON": "Choose JSON",
    "JSON — полная резервная копия. CSV — расходы и прогнозы выбранного квартала с учётом фильтров экрана «Расходы».": "JSON is a full backup. CSV contains expenses and forecasts for the selected quarter, filtered as on the Expenses screen.",
    "Выгрузка CSV учитывает выбранные фильтры.": "The CSV export respects the selected filters.",
    "Загрузите JSON, ранее выгруженный из этого приложения. Текущие данные будут заменены.": "Upload a JSON file previously exported from this app. Current data will be replaced.",
    "Это имя будет записываться в графу «Добавил».": "This name will be recorded in the \"Created by\" field.",

    "Основная локация": "Primary location", "АЯ": "Aa",
    "0 расходов": "0 expenses", "0 активных распределений": "0 active allocations",
    "Для этой локации и квартала бюджет пока не заполнен.": "No budget has been entered for this location and quarter.",
    "В выбранном квартале расходов пока нет.": "There are no expenses in the selected quarter.",
    "Редактировать": "Edit", "Архивировать": "Archive", "Удалить": "Delete",
    "Аннулировать": "Cancel expense", "Вернуть": "Restore", "Вернуть из аннулированных": "Restore canceled expense",
    "Создано": "Created", "Аннулирован": "Canceled", "Действует": "Active",
    "Редактировать прогноз": "Edit forecast",
    "Ручной прогноз": "Manual forecast", "Зарезервирован": "Reserved", "Частично оплачен": "Partially paid",
    "Освобождён": "Released", "Оплачен": "Paid", "Просрочен": "Overdue", "Нет в свежем отчёте": "Missing from latest report",
    "Редактировать или перенести": "Edit or move", "Записать фактический расход": "Record actual expense",
    "Освободить весь тикет": "Release entire ticket", "Вернуть резерв": "Restore reserve",
    "Период закрыт": "Period closed", "Месяц расхода закрыт — финансовые изменения заблокированы": "The expense month is closed — financial changes are locked",
    "Удалить валюту": "Remove currency",
    "Выберите Excel-отчёт по ЗП.": "Choose a PR Excel report.",
    "Выберите Excel-файл, затем укажите отчётный период.": "Choose an Excel file, then select the reporting period.",
    "Tracker-адаптер не запущен. На Windows проверьте Python 3.8+ и снова откройте START-WINDOWS.vbs; на macOS откройте START-MACOS.app. Остальные функции работают без Tracker.": "The Tracker adapter is not running. On Windows, check that Python 3.8+ is installed and reopen START-WINDOWS.vbs; on macOS, open START-MACOS.app. The rest of the app works without Tracker.",
    "Причина (необязательна)": "Reason (optional)",
    "Проверьте номер или найдите тикет в Tracker.": "Check the issue key or find the issue in Tracker.",
    "На уровне проекта": "Project level", "На уровне проекта (без статьи)": "Project level (no item)",
    "Код проекта не задан": "Project code not set", "Неизвестный проект": "Unknown project", "Без ссылки": "No link",

    "Есть несохранённые изменения": "There are unsaved changes",
    "Не удалось получить общие данные": "Could not load shared data",
    "Общий сервер недоступен.": "The shared server is unavailable.",
    "Хранилище переполнено — данные не сохранены": "Browser storage is full — data was not saved",
    "Нет доступа к приложению": "No access to the application",
    "Не удалось проверить доступ. Попробуйте позже": "Could not verify access. Please try again later",
    "Войти через Staff": "Sign in via Staff",
    "Запросить доступ в IDM": "Request access in IDM",
    "Участник": "Member",
    "Подтвердите корпоративный аккаунт. Доступ определяется вашей ролью в IDM.": "Confirm your corporate account. Access is determined by your IDM role.",
    "Все локации доступны автоматически. Доступ выдаётся и отзывается только в IDM.": "All locations are available automatically. Access is granted and revoked only in IDM.",
    "Права доступа изменились": "Access permissions have changed",
    "Сессия завершена. Войдите снова": "Your session has ended. Sign in again",
    "Не удалось заблокировать запись": "Could not lock the record",
    "Данные сохранены после повторной проверки состояния сервера": "Data was saved after verifying the server state",
    "Данные сохранены; расчётные листы могут обновиться позже": "Data was saved; calculated views may update later",
    "Корпоративный вход не выполнен": "Corporate sign-in failed",
    "Проверьте корпоративную сессию или обратитесь к администратору приложения.": "Check your corporate session or contact the application administrator.",
    "Корпоративный аккаунт проверен автоматически.": "Your corporate account was verified automatically.",
    "Корпоративный вход выполнен": "Corporate sign-in succeeded",
    "Не удалось восстановить корпоративную сессию": "Could not restore the corporate session",
    "Требуется корпоративный вход": "Corporate sign-in required",
    "Не удалось проверить корпоративный вход": "Could not verify the corporate sign-in",
    "Вашему Staff-логину ещё не открыт доступ к приложению. Обратитесь к суперадминистратору «План Факт».": "Your Staff login has not been granted access to the application yet. Contact a Plan Fact superadmin.",
    "Ваш доступ к приложению отключён. Обратитесь к суперадминистратору «План Факт».": "Your access to the application is disabled. Contact a Plan Fact superadmin.",
    "Этот Staff-логин уже привязан к другому сотруднику. Обратитесь к суперадминистратору «План Факт».": "This Staff login is already linked to another employee. Contact a Plan Fact superadmin.",
    "Корпоративный вход временно недоступен. Повторите попытку через минуту.": "Corporate sign-in is temporarily unavailable. Try again in a minute.",
    "Не удалось подтвердить корпоративный вход. Нажмите «Повторить проверку» — страница обновится и при необходимости откроет вход Яндекса.": "Could not confirm the corporate sign-in. Click “Check again” — the page will reload and open the Yandex sign-in if needed.",
    "Данные обновлены другим пользователем": "Data was updated by another user",
    "Главный администратор": "Super administrator", "Профиль Staff": "Staff profile",
    "Корпоративная identity подтверждается WebAuth. Роль и права по локациям управляются внутри приложения.": "Corporate identity is verified by WebAuth. Roles and location permissions are managed in the application.",

    "Предупреждение не найдено": "Warning not found", "Некорректный ключ тикета Tracker": "Invalid Tracker issue key",
    "Выберите активный проект с кодом": "Select an active project with a code",
    "Выберите активную локацию с кодом": "Select an active location with a code",
    "Не удалось определить исходный код проекта Tracker": "Could not determine the original Tracker project code",
    "Не удалось определить исходный код офиса Tracker": "Could not determine the original Tracker office code",
    "Прогнозное распределение не найдено": "Forecast allocation not found",
    "Этот прогноз уже освобождён или оплачен": "This forecast has already been released or paid",
    "Перенос прогноза разрешён только между месяцами одного квартала": "A forecast can only be moved between months in the same quarter",
    "Прогноз можно переносить только внутри той же локации, статьи и валюты. Для перераспределения освободите его и создайте новый тикет.": "A forecast can only be moved within the same location, item, and currency. To reallocate it, release it and create a new issue.",
    "Прогнозный тикет не найден": "Forecast issue not found", "Укажите причину освобождения резерва": "Enter a reason for releasing the reserve",
    "В тикете нет активного резерва": "The issue has no active reserve", "В тикете нет освобождённого резерва": "The issue has no released reserve",
    "Фактическая оплата должна относиться к тому же кварталу; для другого квартала сначала измените бюджет": "The actual payment must be in the same quarter; update the budget first to use another quarter",
    "Введите фактическую сумму больше нуля": "Enter an actual amount greater than zero",
    "Укажите ссылку на тикет фактического расхода": "Enter the actual expense issue URL",
    "Расход не найден": "Expense not found", "Расход уже аннулирован": "The expense is already canceled", "Расход не аннулирован": "The expense is not canceled",
    "Связанный с прогнозом факт нельзя переносить в другой квартал": "An actual expense linked to a forecast cannot be moved to another quarter",
    "Локация, статья и валюта связанного факта должны совпадать с прогнозом": "The location, item, and currency of the linked actual expense must match the forecast",
    "Введите комментарий": "Enter a comment",

    "Некорректный квартал": "Invalid quarter", "Выберите локацию": "Select a location",
    "Проверьте валюты и суммы бюджета": "Check the budget currencies and amounts",
    "Введите название локации": "Enter a location name", "Локация с таким кодом уже существует": "A location with this code already exists",
    "Локация не найдена": "Location not found", "Локация не найдена или архивирована": "Location not found or archived",
    "Введите название проекта": "Enter a project name", "Проект с таким кодом уже существует": "A project with this code already exists",
    "Проект не найден": "Project not found", "Статья не найдена": "Item not found",
    "Введите название статьи проекта": "Enter an item name", "Статья с таким кодом уже существует в этом проекте": "An item with this code already exists in the project",
    "Статья проекта не найдена": "Project item not found", "У проекта должна остаться хотя бы одна статья": "The project must retain at least one item",
    "Невозможно удалить статью: сначала обнулите её бюджет во всех периодах": "The item cannot be deleted until its budget is set to zero in every period",
    "Неизвестный уровень периода": "Unknown period level", "Неизвестная операция": "Unknown operation",
    "Выберите проект": "Select a project", "Введите сумму больше нуля": "Enter an amount greater than zero",
    "Выберите валюту расхода": "Select the expense currency", "Укажите корректную ссылку на тикет": "Enter a valid issue URL",
    "Укажите корректную дату расхода": "Enter a valid expense date",
    "Введите сумму прогноза больше нуля": "Enter a forecast amount greater than zero",
    "Выберите валюту прогноза": "Select the forecast currency", "Укажите корректную ожидаемую дату": "Enter a valid expected date",
    "Выберите статью проекта": "Select a project item",
    "Помесячный план не соответствует выбранному кварталу": "The monthly plan does not match the selected quarter",
    "Проверьте помесячные суммы бюджета": "Check the monthly budget amounts",

    "Введите номер тикета": "Enter an issue key", "Выберите ожидаемую дату": "Select an expected date",
    "Выберите дату — по ней расход попадёт в нужный квартал": "Select a date — it determines the expense quarter",
    "Подтвердите дату фактической оплаты": "Confirm the actual payment date", "Записать в факт": "Record as actual",
    "Прогноз недоступен для подтверждения": "The forecast cannot be confirmed", "Для этой локации доступен только просмотр": "This location is read-only",
    "Прогноз обновлён": "Forecast updated", "Прогноз добавлен и зарезервировал бюджет": "Forecast added and budget reserved",
    "Резерв освобождён и снова доступен в квартале": "The reserve was released and is available in the quarter again",
    "Резерв восстановлен": "Reserve restored", "Фактический расход создан, прогнозный резерв снят": "Actual expense created and forecast reserve released",
    "Расход обновлён, кварталы пересчитаны": "Expense updated and quarters recalculated",
    "Расход добавлен и учтён в факте": "Expense added to actuals",
    "Расход сохранён; обновите страницу, если он не отображается": "Expense saved; refresh the page if it is not displayed",
    "Расход аннулирован, остаток пересчитан": "Expense canceled and balance recalculated",
    "Расход возвращён, остаток пересчитан": "Expense restored and balance recalculated",
    "В предыдущем квартале нет плановых сумм": "The previous quarter has no planned amounts", "План прошлого квартала скопирован": "Previous-quarter plan copied",
    "Имя пользователя сохранено": "User name saved", "Имя очищено": "Name cleared", "Резервная копия подготовлена": "Backup prepared",
    "Данные восстановлены из резервной копии": "Data restored from backup",

    "Отменить несохранённые изменения бюджета?": "Discard unsaved budget changes?",
    "Есть несохранённые суммы бюджета. Перейти к проектам без сохранения?": "There are unsaved budget amounts. Open projects without saving?",
    "Есть несохранённые изменения бюджета. Сменить локацию?": "There are unsaved budget changes. Change location?",
    "Есть несохранённые изменения бюджета. Перейти без сохранения?": "There are unsaved budget changes. Continue without saving?",
    "Есть несохранённые изменения бюджета. Сменить период без сохранения?": "There are unsaved budget changes. Change period without saving?",
    "Вернуть резерв по этому прогнозному тикету?": "Restore the reserve for this forecast issue?",
    "В текущем квартале уже есть план. Заменить его данными прошлого квартала?": "The current quarter already has a plan. Replace it with the previous quarter's data?",
    "Почему тикет стал неактуальным? Причина сохранится в истории.": "Why is the issue no longer relevant? The reason will be saved in history.",
    "Тикет больше не актуален": "The issue is no longer relevant",

    "Статья проекта обновлена": "Project item updated", "Статья проекта добавлена": "Project item added", "Статья проекта удалена": "Project item deleted",
    "Локация обновлена": "Location updated", "Локация добавлена": "Location added", "Локация архивирована": "Location archived",
    "Локация восстановлена": "Location restored", "Локация удалена": "Location deleted",
    "Пользователь отключён": "User disabled", "Пользователь включён": "User enabled",
    "Администратор видит и редактирует все локации.": "Administrators can view and edit every location.",
    "Не удалось загрузить пользователей": "Could not load users",
    "Укажите причину переоткрытия": "Enter a reason for reopening", "Период переоткрыт": "Period reopened",
    "Квартал закрыт": "Quarter closed", "Все месяцы закрыты. Квартал можно закрыть — это зафиксирует итоговый снимок и заблокирует переоткрытие месяцев до переоткрытия квартала.": "All months are closed. You can close the quarter to lock the final snapshot; months cannot be reopened until the quarter is reopened.",
    "Квартал закрыт — план, прогнозы, расходы и итоговый снимок зафиксированы. Чтобы изменить данные, сначала переоткройте квартал (месяцы останутся закрытыми), затем нужный месяц.": "The quarter is closed — its plan, forecasts, expenses, and final snapshot are locked. To change data, reopen the quarter first (the months will remain closed), then reopen the required month.",
    "Переоткрыть квартал": "Reopen quarter", "Закрыть квартал": "Close quarter",
    "Готов к закрытию": "Ready to close", "Закрыт": "Closed",
    "Причина переоткрытия (обязательна)": "Reason for reopening (required)",
    "общие данные всех пользователей": "all users' shared data", "текущие локальные данные": "current local data",
    "Общий режим активен: вход подтверждён, данные и права проверяются сервером.": "Shared mode is active: sign-in is verified, and the server enforces data access and permissions.",
    "Общий режим активен: требуется вход.": "Shared mode is active: sign-in is required.",

    "Для синхронизации настройте токен Tracker.": "Configure a Tracker token to enable synchronization.",
    "Локальный Tracker-адаптер вернул неполный ответ": "The local Tracker adapter returned an incomplete response",
    "Запущена старая версия Tracker-адаптера. Закройте приложение и снова откройте START-WINDOWS.vbs или START-MACOS.app.": "An outdated Tracker adapter is running. Close the app and reopen START-WINDOWS.vbs or START-MACOS.app.",
    "Локальный Tracker-адаптер устарел. Закройте приложение и снова откройте START-WINDOWS.vbs или START-MACOS.app.": "The local Tracker adapter is outdated. Close the app and reopen START-WINDOWS.vbs or START-MACOS.app.",
    "Tracker-адаптер не ответил за 120 секунд": "The Tracker adapter did not respond within 120 seconds",
    "Не удалось проверить Tracker": "Could not check Tracker", "В общем режиме персональные токены Tracker отключены": "Personal Tracker tokens are disabled in shared mode",
    "Не удалось сохранить токен": "Could not save the token", "Токен Tracker сохранён. Запускаю синхронизацию…": "Tracker token saved. Starting synchronization…",
    "Синхронизация…": "Synchronizing…", "Автосинхронизация приостановлена после очистки данных": "Automatic synchronization is paused after data was cleared",
    "Чтобы заново загрузить расходы, нажмите «Синхронизировать с Tracker».": "To load expenses again, select Sync with Tracker.",
    "Новые расходы и предупреждения появятся после полной проверки.": "New expenses and warnings will appear after the full check.",
    "область поиска": "search scope", "просмотрено": "scanned", "финансовых": "financial", "в периоде": "in period",
    "создано": "created", "связанных без изменений": "linked and unchanged", "вне периода": "outside the period",
    "связанных проконтролировано": "linked and monitored", "прогнозных тикетов": "forecast issues", "резервов создано": "reserves created",
    "событий оплаты найдено": "payment events found", "оплат записано в факт": "payments recorded as actuals",
    "ошибочных полных расходов аннулировано": "incorrect full expenses canceled", "оплат пересчитано без НДС": "payments recalculated excluding VAT",
    "тикетов чужих бюджетов исключено": "issues from other budgets excluded", "месячных резервов перераспределено": "monthly reserves reallocated",
    "месячных расходов перераспределено": "monthly expenses reallocated", "без периода услуги — использована дата создания": "without a service period — creation date used",
    "периодов пересекают кварталы": "service periods cross quarters", "распознано по старой форме": "recognized from the legacy form",
    "проектов добавлено": "projects added", "офисов добавлено": "offices added",
    "Не удалось определить ключ тикета": "Could not determine the issue key", "В тикете не указана корректная сумма": "The issue does not contain a valid amount",
    "В тикете не указана корректная валюта": "The issue does not contain a valid currency", "В описании не найден код проекта": "No project code was found in the description",
    "В описании не найден код офиса": "No office code was found in the description", "Не удалось определить дату создания тикета": "Could not determine the issue creation date",
    "Проект с таким кодом отсутствует в приложении": "No project with this code exists in the application", "Офис с таким кодом отсутствует в приложении": "No office with this code exists in the application",
    "Тикет больше не попадает в контрольную выборку. Расход не изменён.": "The issue is no longer in the monitored set. The expense was not changed.",
    "Исходные данные изменились": "Source data changed", "Тикет не найден в выборке": "Issue not found in the selected set",
    "Прогноз требует проверки": "Forecast needs review", "Оплата не разнесена": "Payment not allocated", "Период услуги требует проверки": "Service period needs review",
    "Расход не создан": "Expense not created", "Открыть тикет": "Open issue", "Открыть расход": "Open expense", "Указать параметры": "Set details", "Скрыть": "Dismiss",
    "Не указан": "Not specified", "без кода": "no code", "В тикете не найден исходный код проекта.": "No original project code was found in the issue.",
    "В тикете не найден исходный код офиса.": "No original office code was found in the issue.",
    "Сопоставление сохранено. Повторяю синхронизацию…": "Mapping saved. Running synchronization again…", "Не удалось сохранить сопоставление": "Could not save the mapping",
    "Связь с сервером прервалась, и результат сохранения не удалось проверить. Обновите страницу перед повтором.": "The server connection was interrupted, so the save result could not be verified. Refresh the page before trying again.",
    "Сервер не вернул сохранённое состояние. Обновите страницу перед повтором.": "The server did not return the saved state. Refresh the page before trying again.",
    "Восстановление из JSON заблокировано: есть закрытые периоды. Сначала переоткройте их, затем повторите восстановление.": "JSON restore is blocked because some periods are closed. Reopen them before restoring.",
    "Отчёт уже импортирован. Открыты существующие прогнозы": "The report has already been imported. Existing forecasts were opened",
    "Редактировать проект": "Edit project", "Редактировать статью": "Edit item", "Удалить статью": "Delete item",
    "Сначала выберите Excel-файл.": "Choose an Excel file first.", "Сохраняю прогнозные тикеты…": "Saving forecast issues…",
    "Выбранного периода нет одновременно на листах OPEX и CAPEX.": "The selected period is not present on both the OPEX and CAPEX sheets.",
    "Сохраняю бюджет…": "Saving budget…", "Обратный перевод": "Reverse conversion",

    "Новый прогноз": "New forecast", "Обновить": "Update", "Без изменений": "No changes", "Нужен выбор": "Selection required",
    "Нет в бюджете": "Not in budget", "Пропуск: выбран": "Skipped: selected", "Пропуск: ноль": "Skipped: zero", "Ошибка строки": "Row error",
    "Открыть прогнозы": "Open forecasts", "Нет строк для импорта": "Nothing to import",
    "тикетов": "issues", "новых": "new", "будут добавлены в прогноз": "will be added to forecasts",
    "изменённых": "changed", "обновят сумму, статус или дату": "will update the amount, status, or date",
    "без изменений": "unchanged", "дубли не создаются": "no duplicates will be created",
    "без статьи": "without an item", "учтены на уровне проекта": "recorded at project level", "все статьи определены": "all items matched",
    "валютных предупреждений": "currency warnings", "сохранены в валюте отчёта": "kept in the report currency",
    "пропущено": "skipped", "остальные строки можно применить": "the remaining rows can be applied",
    "на проверке": "need review", "освобождённых": "released",
    "Импорт затрагивает закрытый период": "The import affects a closed period",
    "Некоторые строки будут пропущены, остальные можно применить": "Some rows will be skipped; the rest can be applied",
    "Локации, проекты и технические ключи проверены.": "Locations, projects, and technical keys were verified.",
    "Необязательное сопоставление статей": "Optional item mapping", "Без выбора прогноз будет учтён на уровне проекта.": "Without a selection, the forecast will be recorded at project level.",
    "На проект без статьи (по умолчанию)": "Project level, no item (default)", "Не импортировать эту группу": "Do not import this group",
    "Пропуск": "Skipped", "Новых или изменённых прогнозов нет.": "There are no new or changed forecasts.",
    "Этот файл уже импортирован — можно открыть существующие прогнозы.": "This file has already been imported — you can open the existing forecasts.",
    "Проверяю периоды…": "Checking periods…", "Выберите отчётный период.": "Select a reporting period.",
    "Читаю": "Reading", "локаций": "locations", "проектов": "projects", "статей": "items", "ответственных": "owners",
    "валют": "currencies", "курсов": "exchange rates", "сумм": "amounts", "с суммами": "with amounts",
    "из Excel": "from Excel", "столбец не заполнен": "column is empty", "из листа «курс»": "from the exchange-rate sheet", "лист не найден": "sheet not found",
    "будут заменены": "will be replaced", "Конфликтов кодов и названий не найдено.": "No code or name conflicts found.",
    "Другое": "Other", "Общий режим": "Shared mode", "Единые данные команды": "Shared team data",
    "Локации ещё не созданы.": "No locations have been created yet.", "Все локации · редактирование": "All locations · edit access",
    "Отключён": "Disabled", "не привязан": "not linked", "identity подтверждена": "identity verified", "ожидает первый вход": "awaiting first sign-in",
    "ред.": "edit", "просмотр": "view", "остальные видны": "all others visible", "остальные скрыты": "all others hidden",
    "Включить": "Enable", "Отключить": "Disable", "Пользователей пока нет.": "No users yet."
  };
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"];
  let languageObserver = null;

  const CURRENCY_CODES = [
    "AED", "AMD", "AOA", "AZN", "BDT", "BOB", "BRL", "CDF", "CHF", "CLP", "CNY", "COP",
    "ETB", "EUR", "GEL", "GHS", "ILS", "KGS", "KZT", "MAD", "MZN", "NAD", "NPR", "OMR",
    "PEN", "PKR", "QAR", "RUB", "TRY", "USD", "UZS", "XAF", "XOF", "ZAR", "ZMW"
  ];
  const CURRENCY_SYMBOLS = { RUB: "₽", UZS: "сум", KGS: "сом", KZT: "₸", AMD: "драм" };
  const DEFAULT_CURRENCY = "RUB";
  const moneyFormatters = new Map();
  function moneyFormatterFor(currencyCode) {
    const code = normalizeCurrencyCode(currencyCode) || DEFAULT_CURRENCY;
    const locale = language === "en" ? "en-US" : "ru-RU";
    const key = `${locale}:${code}`;
    if (!moneyFormatters.has(key)) {
      moneyFormatters.set(key, new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }));
    }
    return moneyFormatters.get(key);
  }

  let state = createInitialState();
  let sharedMode = false;
  let currentUser = null;
  let authConnectionError = "";
  let authMode = "";
  let authRequestPending = false;
  let idmRequestUrl = "";
  let authStateEpoch = 0;
  let corporateEvents = null;
  let corporateAccessTimer = null;
  let corporateAccessChecking = false;
  let corporateAccessReloadPending = false;
  const CORPORATE_LOGIN_REDIRECT_KEY = "plan-fact-corporate-login-redirect-at";
  const CORPORATE_LOGIN_REDIRECT_WINDOW_MS = 2 * 60 * 1000;
  const CORPORATE_AUTH_MESSAGES = {
    no_access: "Нет доступа к приложению",
    access_check_failed: "Не удалось проверить доступ. Попробуйте позже",
    staff_access_not_provisioned: "Вашему Staff-логину ещё не открыт доступ к приложению. Обратитесь к суперадминистратору «План Факт».",
    staff_access_disabled: "Ваш доступ к приложению отключён. Обратитесь к суперадминистратору «План Факт».",
    staff_identity_mismatch: "Этот Staff-логин уже привязан к другому сотруднику. Обратитесь к суперадминистратору «План Факт».",
    staff_identity_conflict: "Этот Staff-логин уже привязан к другому сотруднику. Обратитесь к суперадминистратору «План Факт».",
    webauth_unavailable: "Корпоративный вход временно недоступен. Повторите попытку через минуту."
  };
  let activeEditLock = null;
  let editLockHeartbeatTimer = null;
  let managedUsers = [];
  let selectedPage = "overview";
  let budgetDirty = false;
  let budgetEditMode = false;
  let profile = loadProfile();
  const initialPeriod = loadInitialPeriod();
  let selectedYear = initialPeriod.year;
  let selectedQuarter = initialPeriod.quarter;
  let trackerPeriod = loadTrackerPeriod(initialPeriod);
  let trackerSearchScope = loadTrackerSearchScope();
  let exchangeRateYear = selectedYear;
  let exchangeRateQuarter = selectedQuarter;
  let selectedLocation = ALL_LOCATIONS;
  let topbarLocationMarkup = "";
  let theme = loadTheme();
  let language = loadLanguage();
  let currencyDisplayMode = loadCurrencyDisplayMode();
  let pendingBudgetWorkbookFile = null;
  let pendingBudgetWorkbookInfo = null;
  let pendingBudgetImport = null;
  let pendingExpenseWorkbook = null;
  let pendingExpenseMappings = {};
  let pendingExpenseImport = null;
  let recentlyCreatedExpenseId = null;
  let trackerSyncInProgress = false;
  let trackerSyncManual = false;
  let trackerTokenPrompted = false;
  let trackerSyncTimer = null;
  let selectedProjectForArticles = null;
  const expandedBudgetProjects = new Set();
  const expandedOverviewProjects = new Set();

  applyTheme(theme);
  if (typeof document !== "undefined") document.documentElement.lang = language;

  const dom = {};

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  async function init() {
    cacheDom();
    applyLanguage(language);
    bindEvents();
    populateYearOptions();
    setPeriodControls();
    state = await loadState();
    populateYearOptions();
    setPeriodControls();
    populateTrackerPeriodControls();
    populateTrackerScopeControl();
    renderAll();
    updateStorageMode();

    if (sharedMode) {
      if (canManageUsersClient()) await loadManagedUsers();
      if (!currentUser) openAuthDialog();
      startCorporateAccessMonitor();
      window.setInterval(refreshSharedState, 60000);
      window.addEventListener("focus", refreshSharedState);
    } else if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorageEvent);
      startTrackerSyncScheduler();
    }
  }

  function handleStorageEvent(event) {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    let incoming;
    try { incoming = JSON.parse(event.newValue); } catch { return; }
    if (!incoming || typeof incoming !== "object") return;
    const incomingRevision = Number.isInteger(incoming.revision) ? incoming.revision : -1;
    if (incomingRevision <= state.revision) return;
    try {
      state = normalizeState(incoming);
      populateYearOptions();
      setPeriodControls();
      renderAll();
    } catch (error) {
      console.warn("Не удалось применить изменения из другой вкладки.", error);
    }
  }

  function cacheDom() {
    const ids = [
      "quarter-select", "year-select", "save-status", "add-expense-btn",
      "global-ticket-search-form", "global-ticket-search", "global-ticket-search-dialog",
      "global-ticket-search-summary", "global-ticket-search-results", "close-global-ticket-search",
      "expenses-nav-count", "forecast-nav-count", "storage-badge", "user-avatar", "sidebar-user-name",
      "open-profile-btn", "overview-period-label", "summary-plan", "summary-fact",
      "summary-forecast", "summary-forecast-count", "summary-balance", "summary-progress", "summary-expense-count",
      "summary-progress-bar", "overview-table-body", "recent-expenses",
      "overview-search", "overview-article-filter", "overview-responsible-filter", "overview-budget-type-filter",
      "overview-service-filter", "overview-legal-filter", "overview-location-filter",
      "exchange-rates-grid", "exchange-rate-status", "exchange-rate-year", "exchange-rate-quarter",
      "currency-display-mode",
      "expenses-period-label", "expense-search", "expense-article-filter",
      "expense-status-filter", "expense-responsible-filter", "expense-budget-type-filter",
      "expense-service-filter", "expense-legal-filter",
      "expense-location-filter", "expense-export-filter-hint", "expenses-table-body", "expenses-empty", "forecast-table", "forecast-table-body", "forecasts-empty",
      "forecast-period-label", "forecast-search", "forecast-article-filter", "forecast-lifecycle-filter",
      "add-forecast-btn", "forecast-dialog", "forecast-form", "forecast-modal-title",
      "close-forecast-modal", "cancel-forecast-modal", "forecast-auto-date", "forecast-ticket-id", "forecast-allocation-id", "forecast-location-id",
      "forecast-article", "forecast-subarticle", "forecast-currency", "forecast-date", "forecast-amount",
      "forecast-ticket", "forecast-comment", "forecast-form-error",
      "open-expense-import-btn", "export-csv-top-btn", "copy-budget-btn", "save-budget-btn",
      "edit-budget-btn", "cancel-budget-edit-btn", "open-excel-import-btn", "import-excel-input",
      "excel-import-period", "excel-import-file-name", "apply-excel-import-btn",
      "budget-editor-period", "budget-editor-total", "budget-editor-body", "budget-project-search",
      "budget-responsible-filter", "budget-type-filter", "budget-service-filter", "budget-legal-filter",
      "budget-reimport-warning", "budget-responsible-reimport-warning",
      "profile-form", "profile-name", "profile-description",
      "shared-profile", "shared-profile-name", "shared-profile-role", "shared-profile-login",
      "admin-users-card", "manage-users-btn", "restore-card", "export-json-btn",
      "export-csv-btn", "import-json-input", "shared-mode-description",
      "shared-mode-command", "expense-dialog", "expense-form", "expense-modal-title",
      "close-expense-modal", "cancel-expense-modal", "expense-auto-date",
      "expense-id", "expense-article", "expense-subarticle", "expense-currency", "expense-currency-field", "expense-date", "expense-amount",
      "expense-ticket", "expense-comment", "expense-form-error", "expense-forecast-ticket-id", "expense-forecast-allocation-id",
      "expense-forecast-source-note", "expense-date-caption", "expense-submit-btn", "toast-region",
      "add-location-btn", "sidebar-location-search", "location-list", "manage-locations-btn",
      "topbar-location", "topbar-location-code", "topbar-location-value",
      "location-dialog", "location-modal-title",
      "close-location-modal", "cancel-location-modal", "location-name-input",
      "location-code-input", "location-edit-id", "location-save-btn",
      "location-form-error", "location-search", "location-table-body",
      "manage-projects-btn", "project-dialog", "project-form",
      "close-project-modal", "cancel-project-modal",
      "project-name-input", "project-code-input", "project-edit-id",
      "project-save-btn", "project-form-error", "project-table-body",
      "project-article-manager", "project-article-project-name", "project-article-name-input",
      "project-article-edit-id", "project-article-save-btn",
      "project-article-cancel-btn", "project-article-form-error", "project-article-table-body",
      "excel-import-dialog", "close-excel-import-modal", "cancel-excel-import-modal",
      "excel-import-status", "excel-import-summary", "excel-import-conflicts",
      "excel-import-preview-wrap", "excel-import-preview-body", "excel-import-preview-note",
      "excel-import-month-1", "excel-import-month-2", "excel-import-month-3",
      "excel-import-quarter-total", "theme-toggle", "language-toggle",
      "expense-import-dialog", "close-expense-import-modal", "cancel-expense-import-modal",
      "expense-import-input", "expense-import-file-name", "expense-import-date-field",
      "expense-import-status", "expense-import-summary", "expense-import-conflicts", "expense-import-mappings",
      "expense-import-preview-wrap", "expense-import-preview-body", "expense-import-preview-note", "apply-expense-import-btn",
      "auth-dialog", "auth-form", "auth-title", "auth-description", "auth-brand-caption", "auth-eyebrow",
      "auth-code-fields", "auth-login", "auth-code", "auth-idm-request", "logout-btn", "admin-users-description", "user-login-label",
      "auth-error", "auth-submit-btn", "comment-dialog", "comment-form",
      "comment-modal-title", "close-comment-modal", "cancel-comment-modal", "comment-expense-id",
      "comment-expense-summary", "comment-list", "comment-text", "comment-form-error",
      "user-admin-dialog", "user-admin-form", "close-user-admin-modal", "user-edit-id",
      "user-staff-login-input", "user-display-name-input", "user-role-select",
      "user-default-access", "user-location-access", "user-admin-error", "reset-user-form-btn",
      "managed-user-list",
      "overview-quarter-status", "expenses-quarter-status", "forecast-quarter-status", "period-close-quarter-label", "period-close-quarter-status",
      "period-close-months", "period-close-actions", "period-close-hint",
      "period-close-dialog", "period-close-form", "period-close-dialog-title",
      "period-close-dialog-summary", "period-close-reason", "period-close-error",
      "cancel-period-close", "close-period-close-modal",
      "tracker-sync-card", "tracker-sync-btn", "update-tracker-token-btn", "tracker-sync-status", "tracker-sync-meta",
      "tracker-sync-results", "tracker-sync-warnings", "tracker-warning-count",
      "tracker-warning-button", "tracker-topbar-warning-count", "tracker-sync-indicator",
      "sync-block-overlay", "app-shell", "tracker-sync-quarter", "tracker-sync-year",
      "tracker-sync-scope", "tracker-mapping-dialog", "tracker-mapping-form", "tracker-mapping-title",
      "tracker-mapping-issue-key", "tracker-mapping-project", "tracker-mapping-location",
      "tracker-mapping-service", "tracker-mapping-cfo", "tracker-mapping-legal-entity",
      "tracker-mapping-remember-project", "tracker-mapping-project-hint",
      "tracker-mapping-remember-location", "tracker-mapping-location-hint", "tracker-mapping-error",
      "close-tracker-mapping-modal", "cancel-tracker-mapping-modal",
      "delete-tracker-mapping", "tracker-token-dialog", "tracker-token-form", "tracker-token-input",
      "tracker-token-error", "close-tracker-token-modal", "cancel-tracker-token-modal", "save-tracker-token"
    ];
    ids.forEach((id) => { dom[toCamel(id)] = document.getElementById(id); });
    dom.navItems = [...document.querySelectorAll(".nav-item")];
    dom.pages = [...document.querySelectorAll(".page")];
  }

  function bindEvents() {
    dom.navItems.forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.page));
    });
    dom.globalTicketSearchForm?.addEventListener("submit", handleGlobalTicketSearch);
    dom.closeGlobalTicketSearch?.addEventListener("click", closeGlobalTicketSearch);
    dom.globalTicketSearchDialog?.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeGlobalTicketSearch();
    });
    dom.globalTicketSearchResults?.addEventListener("click", handleGlobalTicketSearchResult);

    document.querySelectorAll(".go-to-expenses").forEach((button) => {
      button.addEventListener("click", () => navigate("expenses"));
    });
    document.querySelectorAll(".open-expense-modal").forEach((button) => {
      button.addEventListener("click", () => openExpenseDialog());
    });

    dom.quarterSelect.addEventListener("change", handlePeriodChange);
    dom.yearSelect.addEventListener("change", handlePeriodChange);
    dom.themeToggle.addEventListener("click", toggleTheme);
    dom.languageToggle.addEventListener("click", toggleLanguage);
    dom.currencyDisplayMode.addEventListener("change", handleCurrencyDisplayModeChange);
    dom.addExpenseBtn.addEventListener("click", () => openExpenseDialog());
    if (dom.locationList) dom.locationList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-location-id]");
      if (button) selectLocation(button.dataset.locationId);
    });
    if (dom.sidebarLocationSearch) dom.sidebarLocationSearch.addEventListener("input", renderLocations);
    if (dom.addLocationBtn) dom.addLocationBtn.addEventListener("click", () => openLocationDialog());
    if (dom.manageLocationsBtn) dom.manageLocationsBtn.addEventListener("click", () => openLocationDialog());
    if (dom.closeLocationModal) dom.closeLocationModal.addEventListener("click", closeLocationDialog);
    if (dom.cancelLocationModal) dom.cancelLocationModal.addEventListener("click", closeLocationDialog);
    if (dom.locationDialog) dom.locationDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeLocationDialog();
    });
    if (dom.locationSaveBtn) dom.locationSaveBtn.addEventListener("click", saveLocationFromDialog);
    if (dom.locationSearch) dom.locationSearch.addEventListener("input", renderLocationTable);
    if (dom.locationTableBody) dom.locationTableBody.addEventListener("click", handleLocationTableAction);
    if (dom.manageProjectsBtn) dom.manageProjectsBtn.addEventListener("click", openProjectDialog);
    if (dom.closeProjectModal) dom.closeProjectModal.addEventListener("click", closeProjectDialog);
    if (dom.cancelProjectModal) dom.cancelProjectModal.addEventListener("click", closeProjectDialog);
    if (dom.projectDialog) dom.projectDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeProjectDialog();
    });
    if (dom.projectForm) dom.projectForm.addEventListener("submit", saveProjectFromDialog);
    if (dom.projectTableBody) dom.projectTableBody.addEventListener("click", handleProjectTableAction);
    if (dom.projectArticleSaveBtn) dom.projectArticleSaveBtn.addEventListener("click", saveProjectArticleFromDialog);
    if (dom.projectArticleCancelBtn) dom.projectArticleCancelBtn.addEventListener("click", resetProjectArticleForm);
    if (dom.projectArticleTableBody) dom.projectArticleTableBody.addEventListener("click", handleProjectArticleTableAction);
    dom.openProfileBtn.addEventListener("click", () => {
      navigate("data");
      if (!sharedMode) dom.profileName.focus();
    });

    dom.expenseSearch.addEventListener("input", renderExpenses);
    dom.expenseArticleFilter.addEventListener("change", renderExpenses);
    dom.expenseStatusFilter.addEventListener("change", renderExpenses);
    dom.expenseResponsibleFilter.addEventListener("change", renderExpenses);
    dom.expenseBudgetTypeFilter.addEventListener("change", renderExpenses);
    dom.expenseServiceFilter.addEventListener("change", renderExpenses);
    dom.expenseLegalFilter.addEventListener("change", renderExpenses);
    dom.expenseLocationFilter.addEventListener("change", renderExpenses);
    dom.expensesTableBody.addEventListener("click", handleExpenseTableAction);
    dom.forecastSearch.addEventListener("input", renderForecasts);
    dom.forecastArticleFilter.addEventListener("change", renderForecasts);
    dom.forecastLifecycleFilter.addEventListener("change", renderForecasts);
    dom.forecastTableBody.addEventListener("click", handleForecastTableAction);
    dom.addForecastBtn.addEventListener("click", () => openForecastDialog());
    dom.closeForecastModal.addEventListener("click", closeForecastDialog);
    dom.cancelForecastModal.addEventListener("click", closeForecastDialog);
    dom.forecastDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeForecastDialog();
    });
    dom.forecastForm.addEventListener("submit", saveForecast);
    dom.forecastArticle.addEventListener("change", () => {
      populateForecastProjectArticles();
      populateForecastCurrencyOptions(dom.forecastCurrency.value);
    });
    dom.forecastSubarticle.addEventListener("change", () => populateForecastCurrencyOptions(dom.forecastCurrency.value));
    dom.forecastDate.addEventListener("change", () => {
      updateForecastDateNotice();
      populateForecastCurrencyOptions(dom.forecastCurrency.value);
    });
    dom.forecastAmount.addEventListener("input", () => formatAmountInput(dom.forecastAmount));
    dom.overviewTableBody.addEventListener("click", handleOverviewProjectToggle);
    [dom.overviewSearch, dom.overviewArticleFilter, dom.overviewResponsibleFilter, dom.overviewBudgetTypeFilter,
      dom.overviewServiceFilter, dom.overviewLegalFilter, dom.overviewLocationFilter].forEach((control) => {
      control.addEventListener(control.tagName === "INPUT" ? "input" : "change", renderOverview);
    });
    dom.exchangeRateYear.addEventListener("change", () => { exchangeRateYear = Number(dom.exchangeRateYear.value); renderExchangeRates(); });
    dom.exchangeRateQuarter.addEventListener("change", () => { exchangeRateQuarter = Number(dom.exchangeRateQuarter.value); renderExchangeRates(); });
    dom.exchangeRatesGrid.addEventListener("click", handleExchangeRateSwap);
    dom.openExpenseImportBtn.addEventListener("click", openExpenseImportDialog);
    dom.expenseImportInput.addEventListener("change", inspectSelectedExpenseWorkbook);
    dom.expenseImportDateField.addEventListener("change", prepareExpenseImportPreview);
    dom.expenseImportMappings.addEventListener("change", handleExpenseImportMapping);
    dom.applyExpenseImportBtn.addEventListener("click", applyPendingExpenseImport);
    dom.closeExpenseImportModal.addEventListener("click", closeExpenseImportDialog);
    dom.cancelExpenseImportModal.addEventListener("click", closeExpenseImportDialog);
    dom.expenseImportDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeExpenseImportDialog();
    });

    dom.closeExpenseModal.addEventListener("click", closeExpenseDialog);
    dom.cancelExpenseModal.addEventListener("click", closeExpenseDialog);
    dom.expenseDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeExpenseDialog();
    });
    dom.expenseForm.addEventListener("submit", saveExpense);
    dom.expenseDate.addEventListener("change", updateExpenseDateNotice);
    dom.expenseArticle.addEventListener("change", () => {
      populateExpenseProjectArticles();
      populateExpenseCurrencyOptions();
    });
    dom.expenseSubarticle.addEventListener("change", populateExpenseCurrencyOptions);
    dom.expenseAmount.addEventListener("blur", () => formatAmountInput(dom.expenseAmount));

    dom.budgetEditorBody.addEventListener("input", (event) => {
      if (event.target.classList.contains("budget-month-input")) {
        const row = event.target.closest(".budget-currency-row");
        if (row) {
          row.dataset.monthlyDetailed = "true";
          row.querySelector(".budget-legacy-note")?.remove();
        }
      }
      budgetDirty = true;
      setSaveStatus("Есть несохранённые изменения");
      updateBudgetEditorTotal();
    });
    dom.budgetEditorBody.addEventListener("focusout", (event) => {
      if (event.target.classList.contains("amount-input")) formatAmountInput(event.target);
    });
    dom.saveBudgetBtn.addEventListener("click", saveBudget);
    dom.copyBudgetBtn.addEventListener("click", copyPreviousBudget);
    dom.editBudgetBtn.addEventListener("click", startBudgetEdit);
    dom.cancelBudgetEditBtn.addEventListener("click", cancelBudgetEdit);
    dom.budgetEditorBody.addEventListener("click", handleBudgetEditorAction);
    dom.budgetProjectSearch.addEventListener("input", renderBudgetEditor);
    dom.budgetResponsibleFilter.addEventListener("change", renderBudgetEditor);
    dom.budgetTypeFilter.addEventListener("change", renderBudgetEditor);
    dom.budgetServiceFilter.addEventListener("change", renderBudgetEditor);
    dom.budgetLegalFilter.addEventListener("change", renderBudgetEditor);
    dom.openExcelImportBtn.addEventListener("click", openExcelImportDialog);
    dom.importExcelInput.addEventListener("change", inspectSelectedBudgetWorkbook);
    dom.excelImportPeriod.addEventListener("change", prepareBudgetImportPreview);
    dom.applyExcelImportBtn.addEventListener("click", applyPendingBudgetImport);
    dom.closeExcelImportModal.addEventListener("click", closeExcelImportDialog);
    dom.cancelExcelImportModal.addEventListener("click", closeExcelImportDialog);
    dom.excelImportDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeExcelImportDialog();
    });

    dom.profileForm.addEventListener("submit", saveProfile);
    dom.authForm.addEventListener("submit", retryCorporateLogin);
    dom.logoutBtn.addEventListener("click", logoutWithAccessCode);
    dom.authDialog.addEventListener("cancel", (event) => event.preventDefault());
    dom.manageUsersBtn.addEventListener("click", openUserAdminDialog);
    dom.closeUserAdminModal.addEventListener("click", closeUserAdminDialog);
    dom.userAdminDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeUserAdminDialog();
    });
    dom.userAdminForm.addEventListener("submit", saveManagedUser);
    dom.resetUserFormBtn.addEventListener("click", resetManagedUserForm);
    dom.managedUserList.addEventListener("click", handleManagedUserAction);
    dom.userRoleSelect.addEventListener("change", renderUserLocationAccess);
    dom.closeCommentModal.addEventListener("click", closeCommentDialog);
    dom.cancelCommentModal.addEventListener("click", closeCommentDialog);
    dom.commentDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeCommentDialog();
    });
    dom.commentForm.addEventListener("submit", saveExpenseComment);
    dom.exportJsonBtn.addEventListener("click", exportJson);
    dom.exportCsvBtn.addEventListener("click", exportCsv);
    dom.exportCsvTopBtn.addEventListener("click", exportCsv);
    dom.importJsonInput.addEventListener("change", importJson);
    dom.trackerSyncBtn.addEventListener("click", () => syncTrackerExpenses(true));
    dom.updateTrackerTokenBtn.addEventListener("click", openTrackerTokenDialog);
    dom.trackerTokenForm.addEventListener("submit", saveTrackerToken);
    dom.closeTrackerTokenModal.addEventListener("click", closeTrackerTokenDialog);
    dom.cancelTrackerTokenModal.addEventListener("click", closeTrackerTokenDialog);
    dom.trackerTokenDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeTrackerTokenDialog();
    });
    dom.trackerSyncQuarter.addEventListener("change", handleTrackerPeriodChange);
    dom.trackerSyncYear.addEventListener("change", handleTrackerPeriodChange);
    dom.trackerSyncScope.addEventListener("change", handleTrackerScopeChange);
    dom.trackerSyncWarnings.addEventListener("click", handleTrackerWarningAction);
    dom.trackerMappingForm.addEventListener("submit", saveTrackerManualMapping);
    dom.closeTrackerMappingModal.addEventListener("click", closeTrackerMappingDialog);
    dom.cancelTrackerMappingModal.addEventListener("click", closeTrackerMappingDialog);
    dom.deleteTrackerMapping.addEventListener("click", deleteTrackerManualMapping);
    dom.trackerMappingDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closeTrackerMappingDialog();
    });
    dom.trackerWarningButton.addEventListener("click", () => {
      navigate("data");
      dom.trackerSyncCard.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    dom.cancelPeriodClose.addEventListener("click", closePeriodCloseDialog);
    if (dom.closePeriodCloseModal) dom.closePeriodCloseModal.addEventListener("click", closePeriodCloseDialog);
    dom.periodCloseDialog.addEventListener("click", (event) => {
      if (isBackdropClick(event)) closePeriodCloseDialog();
    });
    dom.periodCloseForm.addEventListener("submit", submitPeriodClose);
  }

  function createInitialState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      locations: [{ id: "default", name: "Основная локация", code: "", archived: false }],
      articles: [],
      budgets: {},
      monthlyBudgets: {},
      responsibleGroups: {},
      projectAttributes: {},
      currencyCatalog: CURRENCY_CODES.map((code) => ({ code })),
      exchangeRatesByQuarter: {},
      legacyExchangeRates: null,
      expenses: [],
      forecastTickets: [],
      imports: [],
      expenseImports: [],
      comments: [],
      closedPeriods: { months: {}, quarters: {} },
      periodCloseHistory: [],
      trackerSync: {
        lastAttemptAt: null,
        lastSuccessfulSyncAt: null,
        nextRetryAt: null,
        lastError: "",
        lastResult: null,
        warnings: [],
        manualMappings: {},
        projectMappings: {},
        locationMappings: {},
        mappingRules: {}
      },
      permissions: null
    };
  }

  function normalizeState(input) {
    const clean = createInitialState();
    if (!input || typeof input !== "object") return clean;

    const suppliedLocations = Array.isArray(input.locations) ? input.locations : [];
    const legacyCurrencyByLocation = new Map();
    suppliedLocations.forEach((loc) => {
      if (loc?.id) legacyCurrencyByLocation.set(loc.id, normalizeCurrencyCode(loc.currency) || DEFAULT_CURRENCY);
    });
    legacyCurrencyByLocation.set("default", legacyCurrencyByLocation.get("default") || DEFAULT_CURRENCY);
    if (Array.isArray(input.locations)) {
      clean.locations = suppliedLocations
        .filter((loc) => loc && typeof loc.id === "string" && loc.id && loc.id !== ALL_LOCATIONS)
        .map((loc) => ({
          id: loc.id,
          name: cleanText(loc.name, 120) || `Локация ${loc.id}`,
          code: cleanText(loc.code, 80),
          archived: loc.archived === true
        }));
    }
    if (!clean.locations.length && !input.permissions) {
      clean.locations = [{ id: "default", name: "Основная локация", code: "", archived: false }];
    }

    const suppliedArticles = Array.isArray(input.articles) ? input.articles : [];
    const knownSubarticleIds = new Map();
    function normalizedArticle(supplied, fallback) {
      const source = supplied || fallback;
      const suppliedSubs = Array.isArray(source?.subarticles) ? source.subarticles : [];
      const projectCode = cleanText(source?.code, 80);
      const subIds = new Set();
      const subarticles = suppliedSubs
        .filter((sub) => sub && typeof sub.id === "string" && sub.id)
        .map((sub) => {
          subIds.add(sub.id);
          return {
            id: sub.id,
            name: cleanText(sub.name, 120) || "Статья проекта",
            code: projectCode,
            archived: sub.archived === true
          };
        });
      const id = cleanText(source?.id, 120) || fallback.id;
      knownSubarticleIds.set(id, subIds);
      return {
        id,
        name: cleanText(source?.name, 120) || fallback.name || "Проект",
        code: projectCode,
        budgetType: normalizeBudgetType(source?.budgetType) || "manual",
        imported: source?.imported === true,
        archived: source?.archived === true,
        subarticles
      };
    }
    clean.articles = [];
    const knownIds = new Set(clean.articles.map((article) => article.id));
    suppliedArticles.forEach((supplied) => {
      if (!supplied || typeof supplied.id !== "string" || !supplied.id || knownIds.has(supplied.id)) return;
      clean.articles.push(normalizedArticle(supplied, { id: supplied.id, name: "Статья", code: "" }));
      knownIds.add(supplied.id);
    });

    const locationIds = new Set(clean.locations.map((l) => l.id));
    const articleIds = new Set(clean.articles.map((a) => a.id));

    clean.budgets = {};
    if (input.budgets && typeof input.budgets === "object") {
      Object.entries(input.budgets).forEach(([key, budget]) => {
        if (!budget || typeof budget !== "object") return;
        const newMatch = key.match(/^([^|]+)\|(\d{4}-Q[1-4])$/);
        const oldMatch = !newMatch && /^\d{4}-Q[1-4]$/.test(key) ? key : null;
        const locationId = newMatch?.[1] || (oldMatch ? "default" : "");
        const quarter = newMatch?.[2] || oldMatch;
        if (!locationId || locationId === ALL_LOCATIONS || !locationIds.has(locationId) || !quarter) return;
        const storeKey = `${locationId}|${quarter}`;
        const legacyCurrency = legacyCurrencyByLocation.get(locationId) || DEFAULT_CURRENCY;
        const normalizedStore = {};
        Object.entries(budget).forEach(([itemKey, value]) => {
          const [articleId, subarticleId] = itemKey.split("|");
          if (!articleIds.has(articleId)) return;
          if (subarticleId && !(knownSubarticleIds.get(articleId) || new Set()).has(subarticleId)) return;
          const amounts = normalizeCurrencyAmounts(value, legacyCurrency);
          if (Object.keys(amounts).length) normalizedStore[itemKey] = amounts;
        });
        if (Object.keys(normalizedStore).length) clean.budgets[storeKey] = normalizedStore;
      });
    }

    clean.monthlyBudgets = {};
    if (input.monthlyBudgets && typeof input.monthlyBudgets === "object") {
      Object.entries(input.monthlyBudgets).forEach(([key, budget]) => {
        if (!budget || typeof budget !== "object") return;
        const match = key.match(/^([^|]+)\|(\d{4}-Q[1-4])$/);
        const locationId = match?.[1];
        const quarter = match?.[2];
        if (!locationId || locationId === ALL_LOCATIONS || !locationIds.has(locationId) || !quarter) return;
        const storeKey = `${locationId}|${quarter}`;
        const normalizedStore = {};
        Object.entries(budget).forEach(([itemKey, value]) => {
          const [articleId, subarticleId] = itemKey.split("|");
          if (!articleIds.has(articleId)) return;
          if (subarticleId && !(knownSubarticleIds.get(articleId) || new Set()).has(subarticleId)) return;
          const amounts = normalizeMonthlyCurrencyAmounts(value, quarter);
          if (!Object.keys(amounts).length) return;
          normalizedStore[itemKey] = amounts;
          clean.budgets[storeKey] ||= {};
          clean.budgets[storeKey][itemKey] ||= {};
          Object.entries(amounts).forEach(([currency, months]) => {
            clean.budgets[storeKey][itemKey][currency] = sumMonthAmounts(months, quarter);
          });
        });
        if (Object.keys(normalizedStore).length) clean.monthlyBudgets[storeKey] = normalizedStore;
      });
    }

    clean.responsibleGroups = {};
    if (input.responsibleGroups && typeof input.responsibleGroups === "object") {
      Object.entries(input.responsibleGroups).forEach(([key, assignments]) => {
        const match = key.match(/^([^|]+)\|(\d{4}-Q[1-4])$/);
        const locationId = match?.[1];
        if (!locationId || !locationIds.has(locationId) || !assignments || typeof assignments !== "object") return;
        const normalizedAssignments = {};
        Object.entries(assignments).forEach(([articleId, names]) => {
          if (!articleIds.has(articleId)) return;
          const normalizedNames = [...new Set((Array.isArray(names) ? names : [names])
            .map(BudgetImport.normalizeResponsibleName)
            .filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, "ru"));
          if (normalizedNames.length) normalizedAssignments[articleId] = normalizedNames;
        });
        if (Object.keys(normalizedAssignments).length) clean.responsibleGroups[key] = normalizedAssignments;
      });
    }

    clean.projectAttributes = {};
    if (input.projectAttributes && typeof input.projectAttributes === "object") {
      Object.entries(input.projectAttributes).forEach(([key, attributes]) => {
        const match = key.match(/^([^|]+)\|(\d{4}-Q[1-4])$/);
        const locationId = match?.[1];
        if (!locationId || !locationIds.has(locationId) || !attributes || typeof attributes !== "object") return;
        const normalizedAttributes = {};
        Object.entries(attributes).forEach(([articleId, entry]) => {
          if (!articleIds.has(articleId) || !entry || typeof entry !== "object") return;
          const service = cleanText(entry.service, 120);
          const serviceCode = normalizeCode(entry.serviceCode);
          const legalEntity = cleanText(entry.legalEntity, 160);
          const cfo = cleanText(entry.cfo, 160);
          const cfoCode = normalizeCode(entry.cfoCode);
          const location = cleanText(entry.location, 120);
          if (service || serviceCode || legalEntity || cfo || cfoCode || location) {
            normalizedAttributes[articleId] = {
              service,
              ...(serviceCode ? { serviceCode } : {}),
              legalEntity,
              cfo,
              ...(cfoCode ? { cfoCode } : {}),
              location
            };
          }
        });
        if (Object.keys(normalizedAttributes).length) clean.projectAttributes[key] = normalizedAttributes;
      });
    }

    clean.expenses = (Array.isArray(input.expenses) ? input.expenses : [])
      .filter((expense) => expense && articleIds.has(expense.articleId))
      .map((expense) => {
        const createdAt = validIsoDateTime(expense.createdAt) ? expense.createdAt : new Date().toISOString();
        const fallbackDate = toDateInputValue(new Date(createdAt));
        const expenseDate = validDateInput(expense.expenseDate) ? expense.expenseDate : fallbackDate;
        const article = clean.articles.find((a) => a.id === expense.articleId);
        // locationId: из записи или миграция v1 → default
        let locationId = typeof expense.locationId === "string" && locationIds.has(expense.locationId) ? expense.locationId : "default";
        if (!locationIds.has(locationId)) locationId = clean.locations[0]?.id || "default";
        // subarticleId: только если принадлежит статье
        const subId = typeof expense.subarticleId === "string"
          && article
          && (knownSubarticleIds.get(article.id) || new Set()).has(expense.subarticleId)
            ? expense.subarticleId : null;
        return {
          id: typeof expense.id === "string" && expense.id ? expense.id : createId(),
          locationId,
          articleId: expense.articleId,
          subarticleId: subId,
          currency: normalizeCurrencyCode(expense.currency)
            || legacyCurrencyByLocation.get(locationId)
            || DEFAULT_CURRENCY,
          amount: positiveNumber(expense.amount),
          ticketUrl: safeHttpUrl(expense.ticketUrl) || "",
          comment: typeof expense.comment === "string" ? expense.comment.slice(0, 500) : "",
          expenseDate,
          quarterKey: quarterKeyFromDateInput(expenseDate),
          createdAt,
          createdBy: cleanText(expense.createdBy, 80) || "Не указано",
          createdById: cleanText(expense.createdById, 120) || null,
          updatedAt: validIsoDateTime(expense.updatedAt) ? expense.updatedAt : null,
          updatedBy: cleanText(expense.updatedBy, 80) || null,
          updatedById: cleanText(expense.updatedById, 120) || null,
          status: expense.status === "canceled" ? "canceled" : "active",
          history: Array.isArray(expense.history) ? expense.history.slice(-50) : [],
          sourceType: [ExpenseImport.SOURCE_TYPE, TrackerSync.SOURCE_TYPE].includes(expense.sourceType)
            ? expense.sourceType : null,
          sourceExpenseKey: cleanText(expense.sourceExpenseKey, 4000) || null,
          sourceRequestNumber: cleanText(expense.sourceRequestNumber, 80) || null,
          sourceFile: cleanText(expense.sourceFile, 200) || null,
          sourceStatus: cleanText(expense.sourceStatus, 80) || null,
          sourceReservationDate: validDateInput(expense.sourceReservationDate) ? expense.sourceReservationDate : null,
          sourceExpectedDate: validDateInput(expense.sourceExpectedDate) ? expense.sourceExpectedDate : null,
          sourceRow: Math.max(0, Number(expense.sourceRow) || 0) || null,
          lastImportedAt: validIsoDateTime(expense.lastImportedAt) ? expense.lastImportedAt : null,
          sourceKey: cleanText(expense.sourceKey, 120) || null,
          sourceAllocationKey: cleanText(expense.sourceAllocationKey, 4000) || null,
          sourceServicePeriodStart: validDateInput(expense.sourceServicePeriodStart)
            ? expense.sourceServicePeriodStart : null,
          sourceServicePeriodEnd: validDateInput(expense.sourceServicePeriodEnd)
            ? expense.sourceServicePeriodEnd : null,
          sourceBusinessKey: cleanText(expense.sourceBusinessKey, 120) || null,
          sourceOrderId: cleanText(expense.sourceOrderId, 120) || null,
          sourceUpdatedAt: validIsoDateTime(expense.sourceUpdatedAt) ? expense.sourceUpdatedAt : null,
          sourceSnapshot: expense.sourceSnapshot && typeof expense.sourceSnapshot === "object"
            ? TrackerSync.sourceSnapshot(expense.sourceSnapshot) : null,
          sourceEventKey: cleanText(expense.sourceEventKey, 300) || null,
          sourceDocumentNumber: cleanText(expense.sourceDocumentNumber, 120) || null,
          sourceDocumentDate: validDateInput(expense.sourceDocumentDate) ? expense.sourceDocumentDate : null,
          sourcePaymentDate: validDateInput(expense.sourcePaymentDate) ? expense.sourcePaymentDate : null,
          sourceGrossAmount: positiveNumber(expense.sourceGrossAmount) || null,
          sourceTaxRatePercent: Math.max(0, Number(expense.sourceTaxRatePercent) || 0),
          forecastTicketId: cleanText(expense.forecastTicketId, 160) || null,
          forecastAllocationId: cleanText(expense.forecastAllocationId, 160) || null
        };
      })
      .filter((expense) => expense.amount > 0 && expense.ticketUrl);

    clean.forecastTickets = (Array.isArray(input.forecastTickets) ? input.forecastTickets : [])
      .map((ticket) => {
        if (!ticket || typeof ticket !== "object") return null;
        const createdAt = validIsoDateTime(ticket.createdAt) ? ticket.createdAt : new Date().toISOString();
        const allocations = (Array.isArray(ticket.allocations) ? ticket.allocations : []).map((allocation) => {
          if (!allocation || typeof allocation !== "object") return null;
          const article = clean.articles.find((candidate) => candidate.id === allocation.articleId);
          if (!article || !articleIds.has(allocation.articleId)) return null;
          let locationId = typeof allocation.locationId === "string" && locationIds.has(allocation.locationId)
            ? allocation.locationId : "default";
          if (!locationIds.has(locationId)) locationId = clean.locations[0]?.id || "default";
          if (!locationIds.has(locationId)) return null;
          const subarticleId = typeof allocation.subarticleId === "string"
            && (knownSubarticleIds.get(article.id) || new Set()).has(allocation.subarticleId)
              ? allocation.subarticleId : null;
          const expectedDate = validDateInput(allocation.expectedDate) ? allocation.expectedDate : "";
          if (!expectedDate) return null;
          const lifecycle = ["active", "released", "converted", "review"].includes(allocation.lifecycle)
            ? allocation.lifecycle : "review";
          const lifecycleSource = ["source", "manual", "conversion"].includes(allocation.lifecycleSource)
            ? allocation.lifecycleSource : "source";
          return {
            id: cleanText(allocation.id, 160) || createId(),
            sourceAllocationKey: cleanText(allocation.sourceAllocationKey, 4000) || null,
            locationId,
            articleId: article.id,
            subarticleId,
            currency: normalizeCurrencyCode(allocation.currency)
              || legacyCurrencyByLocation.get(locationId)
              || DEFAULT_CURRENCY,
            amount: Math.max(0, Number(allocation.amount) || 0),
            expectedDate,
            quarterKey: quarterKeyFromDateInput(expectedDate),
            lifecycle,
            lifecycleSource,
            stale: allocation.stale === true,
            comment: cleanText(allocation.comment, 500),
            sourceFile: cleanText(allocation.sourceFile, 200) || null,
            sourceStatus: cleanText(allocation.sourceStatus, 80) || null,
            sourceReservationDate: validDateInput(allocation.sourceReservationDate) ? allocation.sourceReservationDate : null,
            sourceExpectedDate: validDateInput(allocation.sourceExpectedDate) ? allocation.sourceExpectedDate : null,
            sourceRow: Math.max(0, Number(allocation.sourceRow) || 0) || null,
            convertedExpenseId: cleanText(allocation.convertedExpenseId, 160) || null,
            convertedExpenseIds: (Array.isArray(allocation.convertedExpenseIds)
              ? allocation.convertedExpenseIds : [allocation.convertedExpenseId])
              .map((item) => cleanText(item, 160)).filter(Boolean).slice(-100),
            convertedAmount: Number.isFinite(Number(allocation.convertedAmount)) ? Number(allocation.convertedAmount) : null,
            releaseReason: cleanText(allocation.releaseReason, 500)
          };
        }).filter(Boolean);
        if (!allocations.length) return null;
        return {
          id: cleanText(ticket.id, 160) || createId(),
          sourceType: [ExpenseImport.SOURCE_TYPE, TrackerSync.SOURCE_TYPE].includes(ticket.sourceType)
            ? ticket.sourceType : null,
          sourceTicketKey: cleanText(ticket.sourceTicketKey, 4000) || null,
          trackerIssueKey: cleanText(ticket.trackerIssueKey, 120) || null,
          sourceRequestNumber: cleanText(ticket.sourceRequestNumber, 80) || null,
          ticketUrl: safeHttpUrl(ticket.ticketUrl) || "",
          description: cleanText(ticket.description, 500),
          supplier: cleanText(ticket.supplier, 180),
          sourceFile: cleanText(ticket.sourceFile, 200) || null,
          sourceStatus: cleanText(ticket.sourceStatus, 80) || null,
          sourceService: cleanText(ticket.sourceService, 160) || null,
          sourceCostCenter: cleanText(ticket.sourceCostCenter, 200) || null,
          sourceLegalEntity: cleanText(ticket.sourceLegalEntity, 160) || null,
          sourceUpdatedAt: validIsoDateTime(ticket.sourceUpdatedAt) ? ticket.sourceUpdatedAt : null,
          sourceSnapshot: ticket.sourceSnapshot && typeof ticket.sourceSnapshot === "object"
            ? TrackerSync.sourceSnapshot(ticket.sourceSnapshot) : null,
          lifecycle: ExpenseImport.ticketLifecycle(allocations),
          createdAt,
          createdBy: cleanText(ticket.createdBy, 80) || "Не указано",
          createdById: cleanText(ticket.createdById, 120) || null,
          updatedAt: validIsoDateTime(ticket.updatedAt) ? ticket.updatedAt : null,
          updatedBy: cleanText(ticket.updatedBy, 80) || null,
          updatedById: cleanText(ticket.updatedById, 120) || null,
          lastImportedAt: validIsoDateTime(ticket.lastImportedAt) ? ticket.lastImportedAt : null,
          history: Array.isArray(ticket.history) ? ticket.history.slice(-50) : [],
          allocations
        };
      })
      .filter((ticket) => ticket && (ticket.ticketUrl || [ExpenseImport.SOURCE_TYPE, TrackerSync.SOURCE_TYPE].includes(ticket.sourceType)));

    clean.imports = (Array.isArray(input.imports) ? input.imports : []).slice(-20).map((item) => ({
      id: cleanText(item?.id, 120) || createId(),
      importedAt: validIsoDateTime(item?.importedAt) ? item.importedAt : new Date().toISOString(),
      sourceFile: cleanText(item?.sourceFile, 200),
      quarterKey: /^\d{4}-Q[1-4]$/.test(item?.quarterKey) ? item.quarterKey : BudgetImport.LEGACY_IMPORT_QUARTER,
      rows: Math.max(0, Number(item?.rows) || 0),
      groups: Math.max(0, Number(item?.groups) || 0),
      locations: Math.max(0, Number(item?.locations) || 0),
      projects: Math.max(0, Number(item?.projects) || 0),
      projectArticles: Math.max(0, Number(item?.projectArticles) || 0),
      responsibles: Math.max(0, Number(item?.responsibles) || 0),
      services: Math.max(0, Number(item?.services) || 0),
      legalEntities: Math.max(0, Number(item?.legalEntities) || 0),
      recoveredProjectCodes: Math.max(0, Number(item?.recoveredProjectCodes) || 0),
      exchangeRates: Math.max(0, Number(item?.exchangeRates) || 0),
      currencies: Array.isArray(item?.currencies) ? item.currencies.map(normalizeCurrencyCode).filter(Boolean) : []
    }));

    clean.expenseImports = (Array.isArray(input.expenseImports) ? input.expenseImports : []).slice(-20).map((item) => ({
      id: cleanText(item?.id, 120) || createId(),
      importedAt: validIsoDateTime(item?.importedAt) ? item.importedAt : new Date().toISOString(),
      sourceFile: cleanText(item?.sourceFile, 200),
      rows: Math.max(0, Number(item?.rows) || 0),
      added: Math.max(0, Number(item?.added) || 0),
      updated: Math.max(0, Number(item?.updated) || 0),
      unchanged: Math.max(0, Number(item?.unchanged) || 0),
      skipped: Math.max(0, Number(item?.skipped) || 0),
      statusMode: ["forecast", "closed", "approved", "active"].includes(item?.statusMode) ? item.statusMode : "forecast",
      dateField: item?.dateField === "reservation" ? "reservation" : "expected",
      tickets: Math.max(0, Number(item?.tickets) || 0),
      active: Math.max(0, Number(item?.active) || 0),
      released: Math.max(0, Number(item?.released) || 0),
      review: Math.max(0, Number(item?.review) || 0),
      currencies: Array.isArray(item?.currencies) ? item.currencies.map(normalizeCurrencyCode).filter(Boolean) : []
    }));

    const expenseById = new Map(clean.expenses.map((expense) => [expense.id, expense]));
    clean.comments = (Array.isArray(input.comments) ? input.comments : [])
      .filter((comment) => comment && expenseById.has(comment.expenseId))
      .map((comment) => ({
        id: cleanText(comment.id, 120) || createId(),
        expenseId: comment.expenseId,
        locationId: expenseById.get(comment.expenseId).locationId,
        text: cleanText(comment.text, 1000),
        createdAt: validIsoDateTime(comment.createdAt) ? comment.createdAt : new Date().toISOString(),
        createdById: cleanText(comment.createdById, 120) || null,
        createdBy: cleanText(comment.createdBy, 80) || "Не указано"
      }))
      .filter((comment) => comment.text);
    clean.permissions = input.permissions && typeof input.permissions === "object"
      ? {
          role: input.permissions.role === "admin" ? "admin" : "user",
          locations: input.permissions.locations && typeof input.permissions.locations === "object"
            ? { ...input.permissions.locations }
            : {},
          canManageUsers: input.permissions.canManageUsers === true,
          canManageBudget: input.permissions.canManageBudget === true
        }
      : null;

    const suppliedTrackerSync = input.trackerSync && typeof input.trackerSync === "object"
      ? input.trackerSync : {};
    const legacyMappingRules = normalizeTrackerMappingRules(suppliedTrackerSync.mappingRules, clean);
    const migratedMappings = independentMappingsFromLegacyRules(legacyMappingRules);
    clean.trackerSync = {
      lastAttemptAt: validIsoDateTime(suppliedTrackerSync.lastAttemptAt) ? suppliedTrackerSync.lastAttemptAt : null,
      lastSuccessfulSyncAt: validIsoDateTime(suppliedTrackerSync.lastSuccessfulSyncAt)
        ? suppliedTrackerSync.lastSuccessfulSyncAt : null,
      nextRetryAt: validIsoDateTime(suppliedTrackerSync.nextRetryAt) ? suppliedTrackerSync.nextRetryAt : null,
      lastError: cleanText(suppliedTrackerSync.lastError, 1000),
      lastResult: suppliedTrackerSync.lastResult && typeof suppliedTrackerSync.lastResult === "object"
        ? {
            created: Math.max(0, Number(suppliedTrackerSync.lastResult.created) || 0),
            unchanged: Math.max(0, Number(suppliedTrackerSync.lastResult.unchanged) || 0),
            warnings: Math.max(0, Number(suppliedTrackerSync.lastResult.warnings) || 0),
            checked: Math.max(0, Number(suppliedTrackerSync.lastResult.checked) || 0),
            scanned: Math.max(0, Number(suppliedTrackerSync.lastResult.scanned) || 0),
            financial: Math.max(0, Number(suppliedTrackerSync.lastResult.financial) || 0),
            inPeriod: Math.max(0, Number(suppliedTrackerSync.lastResult.inPeriod) || 0),
            outOfPeriod: Math.max(0, Number(suppliedTrackerSync.lastResult.outOfPeriod) || 0),
            inferredIssues: Math.max(0, Number(suppliedTrackerSync.lastResult.inferredIssues) || 0),
            createdProjects: Math.max(0, Number(suppliedTrackerSync.lastResult.createdProjects) || 0),
            createdLocations: Math.max(0, Number(suppliedTrackerSync.lastResult.createdLocations) || 0),
            knownIssues: Math.max(0, Number(suppliedTrackerSync.lastResult.knownIssues) || 0),
            forecastIssues: Math.max(0, Number(suppliedTrackerSync.lastResult.forecastIssues) || 0),
            forecastsCreated: Math.max(0, Number(suppliedTrackerSync.lastResult.forecastsCreated) || 0),
            paymentEvents: Math.max(0, Number(suppliedTrackerSync.lastResult.paymentEvents) || 0),
            factsCreated: Math.max(0, Number(suppliedTrackerSync.lastResult.factsCreated) || 0),
            vatAdjustedFacts: Math.max(0, Number(suppliedTrackerSync.lastResult.vatAdjustedFacts) || 0),
            foreignIssuesExcluded: Math.max(0, Number(suppliedTrackerSync.lastResult.foreignIssuesExcluded) || 0),
            foreignExpensesRemoved: Math.max(0, Number(suppliedTrackerSync.lastResult.foreignExpensesRemoved) || 0),
            foreignForecastsRemoved: Math.max(0, Number(suppliedTrackerSync.lastResult.foreignForecastsRemoved) || 0),
            migratedForecastExpenses: Math.max(0, Number(suppliedTrackerSync.lastResult.migratedForecastExpenses) || 0),
            forecastAllocationsAdjusted: Math.max(0, Number(suppliedTrackerSync.lastResult.forecastAllocationsAdjusted) || 0),
            trackerExpensesAdjusted: Math.max(0, Number(suppliedTrackerSync.lastResult.trackerExpensesAdjusted) || 0),
            trackerExpenseRowsCreated: Math.max(0, Number(suppliedTrackerSync.lastResult.trackerExpenseRowsCreated) || 0),
            servicePeriodFallbacks: Math.max(0, Number(suppliedTrackerSync.lastResult.servicePeriodFallbacks) || 0),
            servicePeriodsCrossingQuarters: Math.max(0, Number(suppliedTrackerSync.lastResult.servicePeriodsCrossingQuarters) || 0),
            searchScope: suppliedTrackerSync.lastResult.searchScope === "queue" ? "queue" : "mine",
            periodKey: /^\d{4}-Q[1-4]$/.test(String(suppliedTrackerSync.lastResult.periodKey || ""))
              ? String(suppliedTrackerSync.lastResult.periodKey) : ""
          }
        : null,
      warnings: (Array.isArray(suppliedTrackerSync.warnings) ? suppliedTrackerSync.warnings : [])
        .filter((warning) => warning && typeof warning === "object")
        .map((warning) => ({
          id: cleanText(warning.id, 240) || createId(),
          type: ["source_changed", "source_missing", "source_unmapped", "source_period_review", "forecast_attention", "payment_attention"].includes(warning.type)
            ? warning.type : "source_unmapped",
          issueKey: cleanText(warning.issueKey, 120),
          expenseId: cleanText(warning.expenseId, 160) || null,
          issueUrl: safeHttpUrl(warning.issueUrl) || "",
          changes: Array.isArray(warning.changes) ? warning.changes.slice(0, 10).map((change) => ({
            field: cleanText(change?.field, 80),
            previous: typeof change?.previous === "number" ? change.previous : cleanText(String(change?.previous ?? ""), 160),
            current: typeof change?.current === "number" ? change.current : cleanText(String(change?.current ?? ""), 160)
          })).filter((change) => change.field) : [],
          validationErrors: Array.isArray(warning.validationErrors)
            ? warning.validationErrors.map((item) => cleanText(String(item), 300)).filter(Boolean).slice(0, 20) : [],
          currentSnapshot: warning.currentSnapshot && typeof warning.currentSnapshot === "object"
            ? TrackerSync.sourceSnapshot(warning.currentSnapshot) : null,
          fingerprint: cleanText(warning.fingerprint, 1000),
          detectedAt: validIsoDateTime(warning.detectedAt) ? warning.detectedAt : new Date().toISOString(),
          status: warning.status === "dismissed" ? "dismissed" : "open",
          dismissedAt: validIsoDateTime(warning.dismissedAt) ? warning.dismissedAt : null
        }))
        .filter((warning) => warning.issueKey)
        .slice(-500),
      manualMappings: normalizeTrackerManualMappings(suppliedTrackerSync.manualMappings, clean),
      projectMappings: {
        ...migratedMappings.projectMappings,
        ...normalizeTrackerProjectMappings(suppliedTrackerSync.projectMappings, clean)
      },
      locationMappings: {
        ...migratedMappings.locationMappings,
        ...normalizeTrackerLocationMappings(suppliedTrackerSync.locationMappings, clean)
      },
      mappingRules: legacyMappingRules
    };

    BudgetImport.cleanupLegacySampleProjects(clean);
    BudgetImport.ensureProjectArticleHierarchy(clean, {
      migrateRootTransactions: Number(input.schemaVersion || 0) < 13
    });

    normalizeClosedPeriods(clean, input);

    const dataCurrencies = collectStateCurrencyCodes(clean);
    clean.currencyCatalog = normalizeCurrencyCatalog(input.currencyCatalog, dataCurrencies);
    clean.exchangeRatesByQuarter = normalizeExchangeRatePeriods(input.exchangeRatesByQuarter);
    clean.legacyExchangeRates = input.legacyExchangeRates && typeof input.legacyExchangeRates === "object"
      ? deepClone(input.legacyExchangeRates)
      : (input.exchangeRates && typeof input.exchangeRates === "object" ? deepClone(input.exchangeRates) : null);

    clean.revision = Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0;
    clean.schemaVersion = SCHEMA_VERSION;
    return clean;
  }

  function normalizeClosedPeriods(clean, input) {
    const source = (input && input.closedPeriods && typeof input.closedPeriods === "object") ? input.closedPeriods : {};
    const months = {};
    if (source.months && typeof source.months === "object") {
      Object.entries(source.months).forEach(([key, entry]) => {
        if (!PeriodLocks.MONTH_KEY_RE.test(key)) return;
        if (!entry || typeof entry !== "object") return;
        const closedAt = validIsoDateTime(entry.closedAt) ? entry.closedAt : null;
        if (!closedAt) return;
        months[key] = { closedAt, closedBy: cleanText(entry.closedBy, 80) || "Не указано" };
      });
    }
    const quarters = {};
    if (source.quarters && typeof source.quarters === "object") {
      Object.entries(source.quarters).forEach(([key, entry]) => {
        if (!PeriodLocks.QUARTER_KEY_RE.test(key)) return;
        if (!entry || typeof entry !== "object") return;
        const closedAt = validIsoDateTime(entry.closedAt) ? entry.closedAt : null;
        if (!closedAt) return;
        const record = { closedAt, closedBy: cleanText(entry.closedBy, 80) || "Не указано" };
        if (entry.snapshot && typeof entry.snapshot === "object") record.snapshot = deepClone(entry.snapshot);
        quarters[key] = record;
      });
    }
    clean.closedPeriods = { months, quarters };
    const history = Array.isArray(input?.periodCloseHistory) ? input.periodCloseHistory : [];
    clean.periodCloseHistory = history
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        action: item.action === "reopen" ? "reopen" : "close",
        level: item.level === "quarter" ? "quarter" : "month",
        periodKey: PeriodLocks.MONTH_KEY_RE.test(item.periodKey) || PeriodLocks.QUARTER_KEY_RE.test(item.periodKey)
          ? item.periodKey : "",
        at: validIsoDateTime(item.at) ? item.at : new Date().toISOString(),
        actor: cleanText(item.actor, 80) || "Не указано",
        reason: cleanText(item.reason, 500)
      }))
      .filter((item) => item.periodKey)
      .slice(-200);
  }

  function trackerMappingRuleKey(value) {
    const projectCode = normalizeCode(value?.projectCode);
    const locationCode = normalizeCode(value?.locationCode);
    return projectCode && locationCode ? `${projectCode}|${locationCode}` : "";
  }

  function normalizeTrackerMappingEntry(entry, source) {
    if (!entry || typeof entry !== "object") return null;
    const articleIds = new Set((source?.articles || []).filter((item) => !item.archived).map((item) => item.id));
    const locationIds = new Set((source?.locations || []).filter((item) => !item.archived).map((item) => item.id));
    const articleId = cleanText(entry.articleId, 160);
    const locationId = cleanText(entry.locationId, 160);
    if (!articleIds.has(articleId) || !locationIds.has(locationId)) return null;
    return {
      articleId,
      locationId,
      service: cleanText(entry.service, 120),
      cfo: cleanText(entry.cfo, 160),
      legalEntity: cleanText(entry.legalEntity, 160),
      updatedAt: validIsoDateTime(entry.updatedAt) ? entry.updatedAt : null
    };
  }

  function normalizeTrackerManualMappings(value, source) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    Object.entries(value).forEach(([issueKey, entry]) => {
      const key = normalizeCode(issueKey);
      const mapping = normalizeTrackerMappingEntry(entry, source);
      if (!/^TAXIASSIST-\d+$/.test(key) || !mapping) return;
      normalized[key] = mapping;
    });
    return normalized;
  }

  function normalizeTrackerMappingRules(value, source) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    Object.entries(value).forEach(([sourceKey, entry]) => {
      const [projectCode, locationCode, ...rest] = String(sourceKey || "").split("|");
      const key = trackerMappingRuleKey({ projectCode, locationCode });
      const mapping = normalizeTrackerMappingEntry(entry, source);
      if (!key || rest.length || !mapping) return;
      normalized[key] = mapping;
    });
    return normalized;
  }

  function normalizeTrackerProjectMappings(value, source) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    const articleIds = new Set((source?.articles || []).filter((item) => !item.archived).map((item) => item.id));
    Object.entries(value).forEach(([sourceCode, entry]) => {
      const code = normalizeCode(sourceCode);
      const articleId = cleanText(entry?.articleId, 160);
      if (!code || !articleIds.has(articleId)) return;
      normalized[code] = { articleId, updatedAt: validIsoDateTime(entry?.updatedAt) ? entry.updatedAt : null };
    });
    return normalized;
  }

  function normalizeTrackerLocationMappings(value, source) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    const locationIds = new Set((source?.locations || []).filter((item) => !item.archived).map((item) => item.id));
    Object.entries(value).forEach(([sourceCode, entry]) => {
      const code = normalizeCode(sourceCode);
      const locationId = cleanText(entry?.locationId, 160);
      if (!code || !locationIds.has(locationId)) return;
      normalized[code] = { locationId, updatedAt: validIsoDateTime(entry?.updatedAt) ? entry.updatedAt : null };
    });
    return normalized;
  }

  function independentMappingsFromLegacyRules(rules) {
    const projectCandidates = new Map();
    const locationCandidates = new Map();
    Object.entries(rules || {}).forEach(([key, entry]) => {
      const [projectCode, locationCode] = key.split("|");
      if (projectCode && entry?.articleId) {
        const values = projectCandidates.get(projectCode) || new Set();
        values.add(entry.articleId);
        projectCandidates.set(projectCode, values);
      }
      if (locationCode && entry?.locationId) {
        const values = locationCandidates.get(locationCode) || new Set();
        values.add(entry.locationId);
        locationCandidates.set(locationCode, values);
      }
    });
    const projectMappings = {};
    const locationMappings = {};
    projectCandidates.forEach((values, code) => {
      if (values.size === 1) projectMappings[code] = { articleId: [...values][0], updatedAt: null };
    });
    locationCandidates.forEach((values, code) => {
      if (values.size === 1) locationMappings[code] = { locationId: [...values][0], updatedAt: null };
    });
    return { projectMappings, locationMappings };
  }

  function applyTrackerManualMappings(source, issues) {
    const mappings = source?.trackerSync?.manualMappings || {};
    const rules = source?.trackerSync?.mappingRules || {};
    const projectMappings = source?.trackerSync?.projectMappings || {};
    const locationMappings = source?.trackerSync?.locationMappings || {};
    return (issues || []).map((issue) => {
      const individualMapping = mappings[normalizeCode(issue?.issueKey)];
      const ruleMapping = rules[trackerMappingRuleKey(issue)];
      const projectMapping = projectMappings[normalizeCode(issue?.projectCode)];
      const locationMapping = locationMappings[normalizeCode(issue?.locationCode)];
      const articleId = individualMapping?.articleId || projectMapping?.articleId || ruleMapping?.articleId;
      const locationId = individualMapping?.locationId || locationMapping?.locationId || ruleMapping?.locationId;
      const article = source.articles.find((item) => item.id === articleId && !item.archived);
      const location = source.locations.find((item) => item.id === locationId && !item.archived);
      if (!article && !location) return issue;
      return {
        ...issue,
        sourceProjectCode: normalizeCode(issue.projectCode),
        sourceLocationCode: normalizeCode(issue.locationCode),
        projectCode: article?.code || issue.projectCode,
        projectName: article?.name || issue.projectName,
        locationCode: location?.code || issue.locationCode,
        locationName: location?.name || issue.locationName,
        service: individualMapping?.service || issue.service,
        costCenter: individualMapping?.cfo || issue.costCenter,
        legalEntity: individualMapping?.legalEntity || issue.legalEntity,
        manualMappingApplied: Boolean(individualMapping),
        projectMappingApplied: Boolean(!individualMapping && projectMapping && article),
        locationMappingApplied: Boolean(!individualMapping && locationMapping && location),
        mappingRuleApplied: Boolean(!individualMapping && ruleMapping)
      };
    });
  }

  async function loadState() {
    if (!LOCAL_ONLY_BUILD && (location.protocol === "http:" || location.protocol === "https:")) {
      sharedMode = true;
      try {
        await refreshAuthSummary();
        if (!currentUser) return emptySharedState();
        const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
        if (response.status === 401 && ["access-code", "corporate-idm"].includes(authMode)) {
          currentUser = null;
          return emptySharedState();
        }
        if (!response.ok) throw new Error("Не удалось получить общие данные");
        const payload = await response.json();
        acceptServerUser(payload.user);
        return normalizeState(payload.state);
      } catch (error) {
        console.error("Общий сервер недоступен.", error);
        currentUser = null;
        if (error.code === "corporate_login_required") {
          startCorporateLogin();
        } else {
          authConnectionError = error.message || (authMode === "access-code"
            ? "Не удалось проверить вход" : "Не удалось проверить корпоративный вход");
        }
        return emptySharedState();
      }
    }

    sharedMode = false;
    return loadLocalState();
  }

  function readStoredJson(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.warn(`Не удалось разобрать сохранённое состояние (${key}).`, error);
      return null;
    }
  }

  function loadLocalState() {
    // Локальная база теперь хранится постоянно: данные переживают перезагрузку
    // страницы, закрытие браузера и перезагрузку компьютера — в том же
    // браузерном профиле. Для переноса на другой компьютер остаётся JSON.
    const parsed = readStoredJson(STORAGE_KEY);
    if (parsed && typeof parsed === "object") {
      try {
        return normalizeState(parsed);
      } catch (error) {
        console.warn("Сохранённое состояние повреждено, пробую резервную копию.", error);
      }
    }
    const backup = readStoredJson(STORAGE_KEY_BACKUP);
    if (backup && typeof backup === "object") {
      try {
        return normalizeState(backup);
      } catch (error) {
        console.warn("Резервная копия состояния тоже повреждена, стартую с пустой базы.", error);
      }
    }
    return createInitialState();
  }

  function saveState(nextState) {
    if (sharedMode) return true;
    try {
      const previous = localStorage.getItem(STORAGE_KEY);
      if (previous) {
        try { localStorage.setItem(STORAGE_KEY_BACKUP, previous); } catch {}
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return true;
    } catch (error) {
      console.error("Не удалось сохранить состояние в хранилище браузера.", error);
      setSaveStatus("Хранилище переполнено — данные не сохранены", true);
      return false;
    }
  }

  function emptySharedState() {
    return normalizeState({
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      locations: [], articles: [], budgets: {}, monthlyBudgets: {}, responsibleGroups: {}, projectAttributes: {}, expenses: [], forecastTickets: [], comments: [], imports: [], expenseImports: [],
      permissions: { role: "user", locations: {}, canManageUsers: false, canManageBudget: false }
    });
  }

  function mutationLockResource(type, payload) {
    if (["updateExpense", "cancelExpense", "restoreExpense"].includes(type) && payload?.id) {
      return { resourceType: "expense", resourceId: String(payload.id) };
    }
    if (["updateForecastAllocation", "releaseForecastTicket", "restoreForecastTicket", "convertForecastAllocation"].includes(type)
        && payload?.ticketId) {
      return { resourceType: "forecast", resourceId: String(payload.ticketId) };
    }
    if (type === "saveBudget" && payload?.locationId && payload?.quarterKey) {
      return { resourceType: "budget", resourceId: `${payload.locationId}|${payload.quarterKey}` };
    }
    return null;
  }

  function sameEditLock(resource) {
    return Boolean(activeEditLock
      && activeEditLock.resourceType === resource?.resourceType
      && activeEditLock.resourceId === resource?.resourceId);
  }

  async function lockRequest(path, body) {
    const epoch = authStateEpoch;
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    assertCurrentAuthEpoch(epoch);
    if (accessResponseEndsSession(response, payload)) {
      handleSessionExpired(CORPORATE_AUTH_MESSAGES[payload.code]);
      throw new Error(payload.error || "Сессия завершена. Войдите снова");
    }
    if (!response.ok) throw new Error(payload.error || "Не удалось заблокировать запись");
    return payload;
  }

  function scheduleEditLockHeartbeat() {
    if (editLockHeartbeatTimer) window.clearTimeout(editLockHeartbeatTimer);
    if (!activeEditLock || !sharedMode) return;
    editLockHeartbeatTimer = window.setTimeout(async () => {
      const lock = activeEditLock;
      try {
        const payload = await lockRequest("/api/locks/heartbeat", lock);
        if (sameEditLock(lock)) {
          activeEditLock.expiresAt = payload.expiresAt;
          scheduleEditLockHeartbeat();
        }
      } catch (error) {
        if (sameEditLock(lock)) {
          activeEditLock = null;
          editLockHeartbeatTimer = null;
          showToast(`${error.message}. Закройте форму и откройте её снова.`, true);
        }
      }
    }, 40_000);
  }

  async function acquireEditLock(resource) {
    if (!sharedMode || !resource) return null;
    if (sameEditLock(resource)) return activeEditLock;
    await releaseActiveEditLock();
    const lock = await lockRequest("/api/locks/acquire", resource);
    activeEditLock = lock;
    scheduleEditLockHeartbeat();
    return lock;
  }

  async function releaseActiveEditLock(expected = null) {
    const lock = activeEditLock;
    if (!lock || (expected && !sameEditLock(expected))) return;
    activeEditLock = null;
    if (editLockHeartbeatTimer) window.clearTimeout(editLockHeartbeatTimer);
    editLockHeartbeatTimer = null;
    if (!sharedMode) return;
    await lockRequest("/api/locks/release", lock).catch(() => undefined);
  }

  function budgetImportMatchesPayload(record, payload) {
    if (!record || !payload) return false;
    return record.quarterKey === payload.quarterKey
      && cleanText(record.sourceFile, 200) === cleanText(payload.sourceFile, 200)
      && Number(record.rows) === Math.max(0, Number(payload.sourceRows) || 0);
  }

  function expenseMatchesPayload(record, payload) {
    if (!record || !payload || String(record.id || "") !== String(payload.id || "")) return false;
    return String(record.locationId || "") === String(payload.locationId || "")
      && String(record.articleId || "") === String(payload.articleId || "")
      && String(record.subarticleId || "") === String(payload.subarticleId || "")
      && normalizeCurrencyCode(record.currency) === normalizeCurrencyCode(payload.currency)
      && Number(record.amount) === Number(payload.amount)
      && String(record.expenseDate || "") === String(payload.expenseDate || "")
      && String(record.ticketUrl || "") === safeHttpUrl(payload.ticketUrl)
      && String(record.comment || "") === cleanText(payload.comment, 500);
  }

  function serverMutationWasApplied(type, payload, previousState, candidateState) {
    if (!previousState || !candidateState) return false;
    const previousRevision = Number(previousState.revision) || 0;
    const candidateRevision = Number(candidateState.revision) || 0;
    if (candidateRevision <= previousRevision) return false;

    if (type === "importBudget") {
      const previousImportIds = new Set((previousState.imports || []).map((item) => item.id));
      return (candidateState.imports || []).some((item) =>
        !previousImportIds.has(item.id) && budgetImportMatchesPayload(item, payload));
    }

    if (type === "addExpense" || type === "updateExpense") {
      const previousExpense = (previousState.expenses || []).find((item) => item.id === payload?.id);
      const candidateExpense = (candidateState.expenses || []).find((item) => item.id === payload?.id);
      if (!expenseMatchesPayload(candidateExpense, payload)) return false;
      if (type === "addExpense") return !previousExpense;
      return Boolean(previousExpense && JSON.stringify(previousExpense) !== JSON.stringify(candidateExpense));
    }

    return false;
  }

  async function recoverCommittedServerMutation(type, payload, previousState, responseBody = null) {
    const confirmedState = (candidatePayload) => {
      if (!candidatePayload?.state) return null;
      try {
        const candidateState = normalizeState(candidatePayload.state);
        if (!serverMutationWasApplied(type, payload, previousState, candidateState)) return null;
        return { state: candidateState, user: candidatePayload.user || null };
      } catch {
        return null;
      }
    };

    const responseState = confirmedState(responseBody);
    if (responseState) return responseState;

    try {
      const response = await fetch("/api/state", {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) return null;
      return confirmedState(await response.json());
    } catch {
      return null;
    }
  }

  function mutationRequestError(message, outcome, status = null, cause = null) {
    const error = new Error(message);
    error.mutationOutcome = outcome;
    error.httpStatus = status;
    if (cause) error.cause = cause;
    return error;
  }

  async function mutate(type, payload) {
    setSaveStatus("Сохраняю…");
    if (sharedMode) {
      const epoch = authStateEpoch;
      const previousState = state;
      const resource = mutationLockResource(type, payload);
      const alreadyHeld = sameEditLock(resource);
      if (resource) {
        const lock = await acquireEditLock(resource);
        payload = { ...payload, lockToken: lock.lockToken };
      }
      const mutationId = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        let response;
        try {
          response = await fetch("/api/mutate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-Plan-Fact-Mutation-Id": mutationId
            },
            body: JSON.stringify({ type, payload, baseRevision: previousState.revision, mutationId })
          });
        } catch (cause) {
          const recovered = await recoverCommittedServerMutation(type, payload, previousState);
          if (!recovered) {
            throw mutationRequestError(
              "Связь с сервером прервалась, и результат сохранения не удалось проверить. Обновите страницу перед повтором.",
              "unknown",
              null,
              cause
            );
          }
          assertCurrentAuthEpoch(epoch);
          state = recovered.state;
          acceptServerUser(recovered.user);
          console.warn("Сервер сохранил изменение, но соединение прервалось до подтверждения.", cause);
          window.setTimeout(() => showToast("Данные сохранены после повторной проверки состояния сервера"), 0);
          setSaveStatus("Все изменения сохранены");
          renderAll();
          return state;
        }
        const body = await response.json().catch(() => ({}));
        assertCurrentAuthEpoch(epoch);
        if (accessResponseEndsSession(response, body)) {
          handleSessionExpired(CORPORATE_AUTH_MESSAGES[body.code]);
          throw new Error(body.error || "Сессия завершена. Войдите снова");
        }
        if (response.status === 409 && body.state) {
          state = normalizeState(body.state);
          renderAll();
        }
        if (!response.ok) {
          const outcome = response.status >= 500 ? "unknown" : "rejected";
          if (outcome === "unknown") {
            const recovered = await recoverCommittedServerMutation(type, payload, previousState, body);
            if (recovered) {
              assertCurrentAuthEpoch(epoch);
              state = recovered.state;
              acceptServerUser(recovered.user);
              console.warn(`Сервер сохранил изменение, но вернул HTTP ${response.status}.`);
              window.setTimeout(() => showToast("Данные сохранены; расчётные листы могут обновиться позже", true), 0);
              setSaveStatus("Все изменения сохранены");
              renderAll();
              return state;
            }
          }
          const fallback = outcome === "unknown"
            ? `Сервер не подтвердил сохранение (HTTP ${response.status}). Обновите страницу перед повтором.`
            : `Сервер отклонил сохранение (HTTP ${response.status})`;
          throw mutationRequestError(body.error || fallback, outcome, response.status);
        }
        if (!body.state) {
          const recovered = await recoverCommittedServerMutation(type, payload, previousState);
          if (!recovered) {
            throw mutationRequestError(
              "Сервер не вернул сохранённое состояние. Обновите страницу перед повтором.",
              "unknown",
              response.status
            );
          }
          assertCurrentAuthEpoch(epoch);
          state = recovered.state;
          acceptServerUser(recovered.user);
          setSaveStatus("Все изменения сохранены");
          renderAll();
          return state;
        }
        state = normalizeState(body.state);
        acceptServerUser(body.user);
      } finally {
        if (resource && !alreadyHeld) await releaseActiveEditLock(resource);
      }
    } else {
      const nextState = applyLocalMutation(state, type, payload);
      state = nextState;
      saveState(state);
    }
    setSaveStatus("Все изменения сохранены");
    renderAll();
    return state;
  }

  function isAdminClient() {
    if (authMode === "corporate-idm") return currentUser?.accessSource === "tirole" && currentUser.role === "admin";
    return !sharedMode || currentUser?.role === "admin" || currentUser?.role === "superadmin";
  }

  function canManageUsersClient() {
    if (authMode === "corporate-idm") return false;
    return !sharedMode || state.permissions?.canManageUsers === true;
  }

  function locationPermissionClient(locationId) {
    if (authMode === "corporate-idm") {
      return currentUser?.accessSource === "tirole" && ["member", "admin"].includes(currentUser.role) ? "edit" : "hidden";
    }
    if (isAdminClient()) return "edit";
    return state.permissions?.locations?.[locationId] || "hidden";
  }

  function canImportExpensesClient() {
    return isAdminClient() || (authMode === "corporate-idm" && currentUser?.accessSource === "tirole" && currentUser.role === "member");
  }

  function canEditSelectedLocation() {
    return Boolean(selectedLocation && selectedLocation !== ALL_LOCATIONS && locationPermissionClient(selectedLocation) === "edit");
  }

  function canEditExpense(expense) {
    if (!expense) return false;
    if (isAdminClient()) return true;
    return expense.createdById === currentUser?.id && locationPermissionClient(expense.locationId) === "edit";
  }

  function canEditForecastAllocation(ticket, allocation) {
    if (!ticket || !allocation) return false;
    if (isAdminClient()) return true;
    return ticket.createdById === currentUser?.id && locationPermissionClient(allocation.locationId) === "edit";
  }

  function canCommentExpense(expense) {
    return Boolean(expense && (!sharedMode || locationPermissionClient(expense.locationId) !== "hidden"));
  }

  function currentActorName() {
    return currentUser?.name || profile.name || "Не указано";
  }

  // Ответ /api/auth → дальнейшее действие. За WebAuth-балансером истёкшая корпоративная
  // сессия приходит редиректом на Паспорт; с redirect: "manual" это opaqueredirect.
  function classifyCorporateAuth(response, payload = {}) {
    if (!response || response.type === "opaqueredirect" || response.status === 401) return { kind: "login_required" };
    if (response.ok) return { kind: "ok" };
    const message = CORPORATE_AUTH_MESSAGES[payload.code];
    if (response.status === 403) {
      return { kind: "forbidden", message: message || payload.error || "Не удалось проверить корпоративный вход" };
    }
    if (["webauth_unavailable", "access_check_failed"].includes(payload.code)) return { kind: "unavailable", message };
    return { kind: "error", message: payload.error || "Не удалось проверить корпоративный вход" };
  }

  // Не чаще одного автоматического ухода на вход за окно: иначе при сбое WebAuth
  // страница перезагружалась бы бесконечно.
  function corporateLoginRedirectAllowed(storage, now = Date.now()) {
    try {
      const last = Number(storage.getItem(CORPORATE_LOGIN_REDIRECT_KEY) || 0);
      if (now - last < CORPORATE_LOGIN_REDIRECT_WINDOW_MS) return false;
      storage.setItem(CORPORATE_LOGIN_REDIRECT_KEY, String(now));
      return true;
    } catch {
      return false;
    }
  }

  // Новый режим начинает одноразовую попытку на сервере; прежний WebAuth остаётся за балансером.
  function startCorporateLogin() {
    if (authMode === "corporate-idm") {
      location.assign("/api/corporate/login");
      return;
    }
    if (authMode === "access-code") {
      openAuthDialog();
      return;
    }
    if (corporateLoginRedirectAllowed(globalThis.sessionStorage)) {
      location.reload();
      return;
    }
    authConnectionError = "Не удалось подтвердить корпоративный вход. Нажмите «Повторить проверку» — страница обновится и при необходимости откроет вход Яндекса.";
    openAuthDialog();
  }

  async function refreshAuthSummary() {
    if (!sharedMode) return;
    const response = await fetch("/api/auth", {
      headers: { Accept: "application/json" },
      redirect: "manual",
      cache: "no-store"
    });
    const payload = response.type === "opaqueredirect" ? {} : await response.json().catch(() => ({}));
    if (payload.authMode) authMode = payload.authMode;
    if (authMode === "corporate-idm") {
      idmRequestUrl = safeIdmRequestUrl(payload.idmRequestUrl);
      const callbackError = consumeCorporateLoginError();
      if (response.status === 401) {
        currentUser = null;
        authConnectionError = callbackError || CORPORATE_AUTH_MESSAGES[payload.code] || "";
        return;
      }
      if (!response.ok) {
        currentUser = null;
        const error = new Error(CORPORATE_AUTH_MESSAGES[payload.code] || CORPORATE_AUTH_MESSAGES.access_check_failed);
        error.code = payload.code;
        throw error;
      }
      currentUser = payload.user || null;
      authConnectionError = currentUser ? "" : callbackError;
      return;
    }
    if (authMode === "access-code") {
      if (response.status === 401) {
        currentUser = null;
        authConnectionError = "";
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Не удалось проверить вход");
      authConnectionError = "";
      currentUser = payload.user || null;
      return;
    }
    const outcome = classifyCorporateAuth(response, payload);
    if (outcome.kind === "login_required") {
      const error = new Error("Требуется корпоративный вход");
      error.code = "corporate_login_required";
      throw error;
    }
    if (outcome.kind !== "ok") throw new Error(outcome.message);
    try { globalThis.sessionStorage?.removeItem(CORPORATE_LOGIN_REDIRECT_KEY); } catch {}
    authConnectionError = "";
    currentUser = payload.user || null;
  }

  function safeIdmRequestUrl(value) {
    try {
      const url = new URL(value);
      return url.origin === "https://idm.yandex-team.ru" && !url.username && !url.password
        ? url.href : "";
    } catch { return ""; }
  }

  function consumeCorporateLoginError() {
    if (!location.search) return "";
    const params = new URLSearchParams(location.search);
    if (!params.has("login_error")) return "";
    const message = CORPORATE_AUTH_MESSAGES[params.get("login_error")] || CORPORATE_AUTH_MESSAGES.access_check_failed;
    params.delete("login_error");
    const query = params.toString();
    globalThis.history?.replaceState(null, "", `${location.pathname || "/"}${query ? `?${query}` : ""}${location.hash || ""}`);
    return message;
  }

  function renderAuthDialog() {
    const corporateIdm = authMode === "corporate-idm";
    const accessCode = authMode === "access-code";
    const unavailable = Boolean(authConnectionError);
    dom.authBrandCaption.textContent = accessCode ? "Вход по коду" : "Корпоративный вход";
    dom.authEyebrow.textContent = accessCode ? "Доступ к приложению" : "Корпоративный доступ";
    dom.authCodeFields.hidden = !accessCode;
    dom.authLogin.disabled = !accessCode || authRequestPending;
    dom.authCode.disabled = !accessCode || authRequestPending;
    if (dom.authIdmRequest) {
      dom.authIdmRequest.hidden = !corporateIdm || !idmRequestUrl;
      dom.authIdmRequest.href = corporateIdm ? idmRequestUrl : "";
    }
    dom.authTitle.textContent = corporateIdm ? "Вход через Staff" : accessCode ? "Вход по коду"
      : (unavailable ? "Корпоративный вход не выполнен" : "Вход через Staff");
    dom.authDescription.textContent = corporateIdm ? "Подтвердите корпоративный аккаунт. Доступ определяется вашей ролью в IDM." : accessCode ? "Введите логин и личный код доступа." : (unavailable
      ? "Проверьте корпоративную сессию или обратитесь к администратору приложения."
      : "Корпоративный аккаунт проверен автоматически.");
    dom.authSubmitBtn.textContent = corporateIdm ? "Войти через Staff" : accessCode ? "Войти" : "Повторить проверку";
    dom.authError.textContent = authConnectionError;
    dom.authSubmitBtn.disabled = authRequestPending;
    translatePage();
  }

  function openAuthDialog() {
    renderAuthDialog();
    if (!dom.authDialog.open) dom.authDialog.showModal();
    if (authMode === "access-code" && !authRequestPending) {
      (dom.authLogin.value ? dom.authCode : dom.authLogin).focus();
    }
  }

  async function loadAuthenticatedState() {
    const epoch = authStateEpoch;
    const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    assertCurrentAuthEpoch(epoch);
    if (accessResponseEndsSession(response, payload)) {
      handleSessionExpired(CORPORATE_AUTH_MESSAGES[payload.code]);
      throw new Error(CORPORATE_AUTH_MESSAGES[payload.code] || "Сессия завершена. Войдите снова");
    }
    if (!response.ok) throw new Error(payload.error || "Не удалось получить общие данные");
    acceptServerUser(payload.user);
    state = normalizeState(payload.state);
    selectedLocation = loadSelectedLocation();
    if (canManageUsersClient()) await loadManagedUsers();
    if (!currentUser) throw new Error("Сессия завершена. Войдите снова");
    dom.authDialog.close();
    renderAll();
    updateStorageMode();
    startCorporateAccessMonitor();
  }

  async function submitAccessCodeLogin(event) {
    event.preventDefault();
    if (authRequestPending) return;
    const body = JSON.stringify({ login: dom.authLogin.value.trim(), code: dom.authCode.value });
    dom.authCode.value = "";
    authConnectionError = "";
    authRequestPending = true;
    renderAuthDialog();
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Не удалось войти");
      currentUser = payload.user || null;
      await loadAuthenticatedState();
      showToast("Вход выполнен");
    } catch (error) {
      authConnectionError = error.message || "Не удалось войти";
    } finally {
      authRequestPending = false;
      dom.authCode.value = "";
      renderAuthDialog();
      if (dom.authDialog.open) dom.authCode.focus();
    }
  }

  async function logoutWithAccessCode() {
    if (!["access-code", "corporate-idm"].includes(authMode) || !currentUser || dom.logoutBtn.disabled) return;
    dom.logoutBtn.disabled = true;
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 401) throw new Error(payload.error || "Не удалось выйти");
      handleSessionExpired("");
    } catch (error) {
      showToast(error.message || "Не удалось выйти", true);
    } finally {
      dom.logoutBtn.disabled = false;
    }
  }

  async function retryCorporateLogin(event) {
    if (authMode === "access-code") return submitAccessCodeLogin(event);
    event.preventDefault();
    if (authMode === "corporate-idm") {
      startCorporateLogin();
      return;
    }
    dom.authError.textContent = "";
    dom.authSubmitBtn.disabled = true;
    try {
      await refreshAuthSummary();
      await loadAuthenticatedState();
      showToast("Корпоративный вход выполнен");
    } catch (error) {
      if (error.code === "corporate_login_required") {
        location.reload();
        return;
      }
      authConnectionError = error.message;
      dom.authError.textContent = error.message;
    } finally {
      dom.authSubmitBtn.disabled = false;
    }
  }

  function handleSessionExpired(message = "Сессия завершена. Войдите снова") {
    authStateEpoch += 1;
    stopCorporateAccessMonitor();
    if (authMode === "corporate-idm") clearProtectedDrafts();
    activeEditLock = null;
    if (editLockHeartbeatTimer) window.clearTimeout(editLockHeartbeatTimer);
    editLockHeartbeatTimer = null;
    currentUser = null;
    managedUsers = [];
    state = emptySharedState();
    renderAll();
    if (["access-code", "corporate-idm"].includes(authMode)) {
      authConnectionError = message;
      dom.authCode.value = "";
      openAuthDialog();
      return;
    }
    refreshAuthSummary()
      .then(async () => {
        const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Не удалось восстановить корпоративную сессию");
        acceptServerUser(payload.user);
        state = normalizeState(payload.state);
        selectedLocation = loadSelectedLocation();
        if (canManageUsersClient()) await loadManagedUsers();
        if (dom.authDialog.open) dom.authDialog.close();
        renderAll();
      })
      .catch((error) => {
        if (error.code === "corporate_login_required") {
          startCorporateLogin();
          return;
        }
        authConnectionError = error.message;
        openAuthDialog();
      });
  }

  function stopCorporateAccessMonitor() {
    corporateAccessReloadPending = false;
    corporateEvents?.close();
    corporateEvents = null;
    if (corporateAccessTimer) window.clearInterval(corporateAccessTimer);
    corporateAccessTimer = null;
  }

  function clearProtectedDrafts() {
    budgetDirty = false;
    budgetEditMode = false;
    pendingBudgetWorkbookFile = null;
    pendingBudgetWorkbookInfo = null;
    pendingBudgetImport = null;
    pendingExpenseWorkbook = null;
    pendingExpenseMappings = {};
    pendingExpenseImport = null;
    selectedProjectForArticles = null;
    recentlyCreatedExpenseId = null;
    expandedBudgetProjects.clear();
    expandedOverviewProjects.clear();
    // Закрываем и очищаем открытые редакторы, включая ещё не сохранённый импорт.
    document.querySelectorAll("dialog").forEach((dialog) => {
      if (dialog === dom.authDialog) return;
      if (dialog.open) dialog.close();
      dialog.querySelectorAll("input, textarea, select").forEach((field) => { field.value = ""; });
      dialog.querySelectorAll("tbody, [id$='-summary'], [id$='-results'], [id$='-preview'], [id$='-conflicts'], [id$='-mappings']")
        .forEach((element) => { element.textContent = ""; });
    });
  }

  function startCorporateAccessMonitor() {
    if (authMode !== "corporate-idm" || !currentUser) return;
    if (!corporateAccessTimer) corporateAccessTimer = window.setInterval(checkCorporateAccess, 30_000);
    if (corporateEvents || typeof globalThis.EventSource !== "function") return;
    const events = new EventSource("/api/events");
    corporateEvents = events;
    events.addEventListener("session-ended", (event) => {
      if (corporateEvents !== events) return;
      let reason = "";
      try { reason = JSON.parse(event.data).reason; } catch {}
      const changed = reason === "corporate_role_changed";
      const message = reason === "corporate_role_revoked" ? CORPORATE_AUTH_MESSAGES.no_access
        : reason === "corporate_roles_unavailable" ? CORPORATE_AUTH_MESSAGES.access_check_failed
        : "Сессия завершена. Войдите снова";
      handleSessionExpired(changed ? "Права доступа изменились" : message);
      if (changed) checkCorporateAccess(true);
    });
    events.addEventListener("error", () => {
      if (corporateEvents === events) checkCorporateAccess();
    });
  }

  async function checkCorporateAccess(reloadState = false) {
    if (authMode !== "corporate-idm" || (!currentUser && !reloadState)) return;
    if (corporateAccessChecking) {
      if (reloadState) corporateAccessReloadPending = true;
      return;
    }
    corporateAccessChecking = true;
    const previousRole = currentUser?.role;
    const epoch = authStateEpoch;
    try {
      const response = await fetch("/api/auth", { headers: { Accept: "application/json" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) });
      const payload = await response.json().catch(() => ({}));
      if (epoch !== authStateEpoch) return;
      if (!response.ok || !payload.user) {
        handleSessionExpired(CORPORATE_AUTH_MESSAGES[payload.code] || CORPORATE_AUTH_MESSAGES.access_check_failed);
        return;
      }
      if (previousRole && previousRole !== payload.user.role) {
        handleSessionExpired("Права доступа изменились");
        reloadState = true;
      }
      currentUser = payload.user;
      if (reloadState) await loadAuthenticatedState();
      else renderAccessControls();
      startCorporateAccessMonitor();
    } catch {
      if (epoch === authStateEpoch || reloadState) handleSessionExpired(CORPORATE_AUTH_MESSAGES.access_check_failed);
    } finally {
      corporateAccessChecking = false;
      if (corporateAccessReloadPending) {
        corporateAccessReloadPending = false;
        checkCorporateAccess(true);
      }
    }
  }

  // Роль может первой обновиться в ответе /state или /mutate, до очередного /auth.
  // Смена прав требует сбросить старые редакторы даже при неизменной ревизии данных.
  function acceptServerUser(user) {
    if (!user) return false;
    const previousRole = currentUser?.role;
    currentUser = user;
    if (authMode !== "corporate-idm" || !previousRole || previousRole === user.role) return false;
    authStateEpoch += 1;
    stopCorporateAccessMonitor();
    activeEditLock = null;
    if (editLockHeartbeatTimer) window.clearTimeout(editLockHeartbeatTimer);
    editLockHeartbeatTimer = null;
    clearProtectedDrafts();
    renderAll();
    startCorporateAccessMonitor();
    return true;
  }

  function accessResponseEndsSession(response, payload = {}) {
    return response.status === 401 || (authMode === "corporate-idm"
      && (["no_access", "access_check_failed", "corporate_roles_unavailable"].includes(payload.code)
        || response.status === 503));
  }

  function assertCurrentAuthEpoch(epoch) {
    if (authMode === "corporate-idm" && epoch !== authStateEpoch) {
      throw new Error("Сессия завершена. Войдите снова");
    }
  }

  function unusedInitialTrackerLocation(current) {
    const location = (current.locations || []).find((item) => item.id === "default"
      && !item.archived
      && !normalizeCode(item.code)
      && cleanText(item.name, 120) === "Основная локация");
    if (!location) return null;
    if ((current.expenses || []).some((item) => item.locationId === location.id)) return null;
    if ((current.forecastTickets || []).some((ticket) =>
      (ticket.allocations || []).some((allocation) => allocation.locationId === location.id))) return null;
    const locationKeyPrefix = `${location.id}|`;
    if ([current.budgets, current.monthlyBudgets, current.responsibleGroups, current.projectAttributes]
      .some((collection) => Object.keys(collection || {}).some((key) => key.startsWith(locationKeyPrefix)))) return null;
    if (current.permissions?.locations?.[location.id]) return null;
    return location;
  }

  function applyTrackerReferencePlan(current, referencePlan) {
    let createdProjects = 0;
    let createdLocations = 0;
    (referencePlan?.projects || []).forEach((project) => {
      const code = normalizeCode(project.code);
      if (!code || current.articles.some((item) => normalizeCode(item.code) === code)) return;
      const article = {
        id: createId(),
        name: cleanText(project.name, 120) || code,
        code,
        budgetType: "manual",
        imported: false,
        archived: false,
        subarticles: []
      };
      BudgetImport.createDefaultProjectArticle(article);
      current.articles.push(article);
      createdProjects += 1;
    });
    (referencePlan?.locations || []).forEach((plannedLocation) => {
      const code = normalizeCode(plannedLocation.code);
      if (!code || current.locations.some((item) => normalizeCode(item.code) === code)) return;
      const name = cleanText(plannedLocation.name, 120) || code;
      const initialLocation = unusedInitialTrackerLocation(current);
      if (initialLocation) {
        initialLocation.name = name;
        initialLocation.code = code;
      } else {
        current.locations.push({ id: createId(), name, code, archived: false });
      }
      createdLocations += 1;
    });
    return { createdProjects, createdLocations };
  }

  function trackerIssueKeyFromTicket(ticket) {
    const explicit = normalizeCode(ticket?.trackerIssueKey
      || (ticket?.sourceType === TrackerSync.SOURCE_TYPE ? ticket.sourceTicketKey : ""));
    if (/^TAXIASSIST-\d+$/.test(explicit)) return explicit;
    return normalizeCode(String(ticket?.ticketUrl || "").match(/TAXIASSIST-\d+/iu)?.[0]);
  }

  function trackerForecastTicket(current, issueKey) {
    const key = normalizeCode(issueKey);
    return (current.forecastTickets || []).find((ticket) => trackerIssueKeyFromTicket(ticket) === key) || null;
  }

  function trackerServiceAllocations(issue) {
    const supplied = Array.isArray(issue?.serviceAllocations) ? issue.serviceAllocations : [];
    const allocations = supplied.map((allocation) => ({
      monthKey: /^\d{4}-\d{2}$/.test(String(allocation?.monthKey || ""))
        ? String(allocation.monthKey) : String(allocation?.expenseDate || "").slice(0, 7),
      expenseDate: validDateInput(String(allocation?.expenseDate || ""))
        ? String(allocation.expenseDate) : "",
      amount: positiveNumber(allocation?.amount),
      days: Math.max(0, Number(allocation?.days) || 0)
    })).filter((allocation) => allocation.monthKey && allocation.expenseDate && allocation.amount > 0);
    const total = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const expected = positiveNumber(issue?.amount);
    const epsilon = Math.max(0.01, expected * 1e-9);
    if (allocations.length && Math.abs(total - expected) <= epsilon) return allocations;
    return [{
      monthKey: String(issue?.expenseDate || "").slice(0, 7),
      expenseDate: issue?.expenseDate,
      amount: expected,
      days: 0
    }];
  }

  function migrateLegacyTrackerServiceExpenses(current, issues, options = {}) {
    const creationQuarterKey = /^\d{4}-Q[1-4]$/.test(String(options.creationQuarterKey || ""))
      ? String(options.creationQuarterKey) : "";
    const nowIso = options.nowIso || new Date().toISOString();
    const author = cleanText(options.author, 80) || "Tracker";
    const warnings = [];
    let adjustedExpenses = 0;
    let createdRows = 0;
    (issues || []).filter((issue) => issue?.kind !== "forecast"
      && issue.servicePeriodSource !== "createdAt"
      && (!creationQuarterKey || quarterKeyFromDateInput(issue.expenseDate) === creationQuarterKey)).forEach((issue) => {
      const rows = current.expenses.filter((expense) => expense.sourceType === TrackerSync.SOURCE_TYPE
        && normalizeCode(expense.sourceKey) === issue.issueKey
        && !expense.sourceEventKey && !expense.forecastTicketId && expense.status !== "canceled");
      if (rows.length > 1 && rows.every((row) => row.sourceAllocationKey)) {
        const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const epsilon = Math.max(0.01, issue.amount * 1e-9);
        if (rows.every((row) => row.currency === issue.currency) && Math.abs(total - issue.amount) <= epsilon) {
          try {
            rows.forEach((row) => PeriodLocks.assertExpenseEditable(current, row));
            PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(issue.expenseDate));
            const primary = rows[0];
            primary.amount = issue.amount;
            primary.expenseDate = issue.expenseDate;
            primary.quarterKey = quarterKeyFromDateInput(issue.expenseDate);
            primary.sourceAllocationKey = `tracker:${issue.issueKey}:${issue.expenseDate.slice(0, 7)}`;
            primary.history = Array.isArray(primary.history) ? primary.history.slice(-49) : [];
            primary.history.push({ changedAt: nowIso, changedBy: author, action: "tracker-expense-period-consolidated" });
            rows.slice(1).forEach((row) => {
              row.status = "canceled";
              row.updatedAt = nowIso;
              row.updatedBy = author;
              row.history = Array.isArray(row.history) ? row.history.slice(-49) : [];
              row.history.push({ changedAt: nowIso, changedBy: author, action: "tracker-expense-period-consolidated" });
            });
            adjustedExpenses += rows.length;
            return;
          } catch (error) {
            warnings.push({
              id: TrackerSync.warningId("service_period_locked_expense", issue.issueKey),
              type: "source_period_review",
              issueKey: issue.issueKey,
              expenseId: rows[0].id,
              issueUrl: issue.issueUrl,
              validationErrors: [cleanText(error.message, 300)],
              fingerprint: `service-period-consolidation-locked:${issue.expenseDate}`
            });
            return;
          }
        }
      }
      if (rows.length !== 1 || rows[0].sourceAllocationKey || rows[0].status === "canceled") return;
      const legacy = rows[0];
      const epsilon = Math.max(0.01, issue.amount * 1e-9);
      if (legacy.currency !== issue.currency || Math.abs(Number(legacy.amount) - issue.amount) > epsilon) {
        warnings.push({
          id: TrackerSync.warningId("service_period_manual_expense", issue.issueKey),
          type: "source_period_review",
          issueKey: issue.issueKey,
          expenseId: legacy.id,
          issueUrl: issue.issueUrl,
          validationErrors: ["Старый расход уже отличается от исходной суммы или валюты. Автоматическое помесячное распределение не применено"],
          fingerprint: `service-period-manual:${issue.servicePeriodStart}:${issue.servicePeriodEnd}`
        });
        return;
      }
      const serviceAllocations = trackerServiceAllocations(issue);
      try {
        PeriodLocks.assertExpenseEditable(current, legacy);
        serviceAllocations.forEach((allocation) =>
          PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(allocation.expenseDate)));
      } catch (error) {
        warnings.push({
          id: TrackerSync.warningId("service_period_locked_expense", issue.issueKey),
          type: "source_period_review",
          issueKey: issue.issueKey,
          expenseId: legacy.id,
          issueUrl: issue.issueUrl,
          validationErrors: [cleanText(error.message, 300)],
          fingerprint: `service-period-locked:${issue.servicePeriodStart}:${issue.servicePeriodEnd}`
        });
        return;
      }
      const baseComment = legacy.comment.replace(/\s+·\s+\d{4}-\d{2}$/u, "");
      serviceAllocations.forEach((allocation, index) => {
        const row = index === 0 ? legacy : deepClone(legacy);
        if (index > 0) {
          row.id = createId();
          current.expenses.push(row);
          createdRows += 1;
        }
        row.amount = allocation.amount;
        row.expenseDate = allocation.expenseDate;
        row.quarterKey = quarterKeyFromDateInput(allocation.expenseDate);
        row.comment = `${baseComment}${serviceAllocations.length > 1 ? ` · ${allocation.monthKey}` : ""}`;
        row.sourceAllocationKey = `tracker:${issue.issueKey}:${allocation.monthKey}`;
        row.sourceServicePeriodStart = issue.servicePeriodStart || null;
        row.sourceServicePeriodEnd = issue.servicePeriodEnd || null;
        row.updatedAt = nowIso;
        row.updatedBy = author;
        row.history = Array.isArray(row.history) ? row.history.slice(-49) : [];
        row.history.push({ changedAt: nowIso, changedBy: author, action: "tracker-service-period-reallocated" });
      });
      adjustedExpenses += serviceAllocations.length;
    });
    return { warnings, adjustedExpenses, createdRows };
  }

  function linkedForecastExpenses(current, ticketId, allocationId) {
    return (current.expenses || []).filter((expense) => expense.status !== "canceled"
      && expense.forecastTicketId === ticketId
      && expense.forecastAllocationId === allocationId);
  }

  function forecastAllocationSpentAmount(current, ticketId, allocationId) {
    return linkedForecastExpenses(current, ticketId, allocationId)
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  }

  function forecastAllocationRemainingAmount(current, ticketId, allocation) {
    return Math.max(0, (Number(allocation?.amount) || 0)
      - forecastAllocationSpentAmount(current, ticketId, allocation?.id));
  }

  function refreshForecastConversionState(current, ticket, allocation) {
    const linked = linkedForecastExpenses(current, ticket.id, allocation.id);
    const spent = linked.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const epsilon = Math.max(0.01, Math.abs(Number(allocation.amount) || 0) * 1e-9);
    allocation.convertedExpenseIds = linked.map((expense) => expense.id).slice(-100);
    allocation.convertedExpenseId = linked.at(-1)?.id || null;
    allocation.convertedAmount = spent;
    if (!(allocation.lifecycle === "released" && allocation.lifecycleSource === "manual")) {
      if (spent + epsilon >= Number(allocation.amount || 0)) {
        allocation.lifecycle = "converted";
        allocation.lifecycleSource = "conversion";
        allocation.releaseReason = spent > Number(allocation.amount || 0) + epsilon
          ? `Оплата превысила резерв на ${spent - Number(allocation.amount || 0)}` : "";
      } else if (spent > epsilon) {
        allocation.lifecycle = "active";
        allocation.lifecycleSource = "conversion";
        allocation.releaseReason = `Частично оплачено: ${spent}; осталось в резерве: ${Number(allocation.amount || 0) - spent}`;
      } else {
        allocation.lifecycle = ticket.sourceType === ExpenseImport.SOURCE_TYPE
          ? ExpenseImport.forecastStatusLifecycle(allocation.sourceStatus, allocation.amount)
          : "active";
        allocation.lifecycleSource = ticket.sourceType === ExpenseImport.SOURCE_TYPE ? "source" : "source";
        allocation.releaseReason = "";
      }
    }
    ticket.lifecycle = ExpenseImport.ticketLifecycle(ticket.allocations);
  }

  function trackerForecastWarning(type, issue, validationErrors, fingerprintSuffix, extra = {}) {
    return {
      id: TrackerSync.warningId(type, `${issue.issueKey}${extra.eventKey ? `-${extra.eventKey}` : ""}`),
      type: type === "forecast_changed"
        ? "source_changed"
        : (type === "payment_unmapped" || type === "payment_locked") ? "payment_attention" : "forecast_attention",
      issueKey: issue.issueKey,
      expenseId: extra.expenseId || null,
      issueUrl: issue.issueUrl,
      validationErrors: (validationErrors || []).filter(Boolean),
      changes: extra.changes || [],
      currentSnapshot: TrackerSync.sourceSnapshot(issue),
      fingerprint: `${TrackerSync.snapshotFingerprint(issue)}|${fingerprintSuffix || type}`
    };
  }

  function trackerBudgetRowExists(current, references, expenseDate) {
    if (!references?.article || !references?.location) return false;
    const quarterKey = quarterKeyFromDateInput(expenseDate);
    if (!quarterKey) return false;
    const storeKey = `${references.location.id}|${quarterKey}`;
    const itemBelongsToProject = (itemKey) => String(itemKey || "").split("|")[0] === references.article.id;
    return [current?.budgets?.[storeKey], current?.monthlyBudgets?.[storeKey]]
      .some((store) => store && Object.keys(store).some(itemBelongsToProject));
  }

  function restoreTrackerProjectAttributes(current, references, issue, expenseDate) {
    if (!trackerBudgetRowExists(current, references, expenseDate)) return false;
    const quarterKey = quarterKeyFromDateInput(expenseDate);
    const attributesKey = `${references.location.id}|${quarterKey}`;
    current.projectAttributes ||= {};
    current.projectAttributes[attributesKey] ||= {};
    const existing = current.projectAttributes[attributesKey][references.article.id] || {};
    current.projectAttributes[attributesKey][references.article.id] = {
      service: existing.service || issue.service || "",
      ...((existing.serviceCode || issue.serviceCode) ? { serviceCode: existing.serviceCode || issue.serviceCode } : {}),
      legalEntity: existing.legalEntity || issue.legalEntity || "",
      cfo: existing.cfo || issue.costCenter || "",
      ...((existing.cfoCode || issue.cfoCode) ? { cfoCode: existing.cfoCode || issue.cfoCode } : {}),
      location: existing.location || issue.locationName || ""
    };
    return true;
  }

  function trackerDirectPaymentMappingError(current, references, issue, paymentDate) {
    if (!trackerBudgetRowExists(current, references, paymentDate)) {
      return "На исходной локации нет бюджетной строки выбранного квартала";
    }
    const attributesKey = `${references.location.id}|${quarterKeyFromDateInput(paymentDate)}`;
    const expected = current.projectAttributes?.[attributesKey]?.[references.article.id];
    if (!expected) return "Не удалось восстановить аналитику проекта для бюджетной строки";
    if (!TrackerSync.issueBelongsToLoadedBudget(current, issue, paymentDate)) {
      return "Сервис или ЦФО тикета не совпадает с аналитикой бюджетной строки";
    }
    return "Расход не прошёл проверку соответствия бюджету";
  }

  function applyTrackerForecastIssues(current, issues, options = {}) {
    const creationQuarterKey = /^\d{4}-Q[1-4]$/.test(String(options.creationQuarterKey || ""))
      ? String(options.creationQuarterKey) : "";
    const nowIso = options.nowIso || new Date().toISOString();
    const author = cleanText(options.author, 80) || "Tracker";
    const warnings = [];
    const stats = {
      forecastIssues: 0,
      forecastsCreated: 0,
      paymentEvents: 0,
      factsCreated: 0,
      vatAdjustedFacts: 0,
      migratedForecastExpenses: 0,
      forecastAllocationsAdjusted: 0
    };
    const existingEventKeys = new Set((current.expenses || [])
      .map((expense) => cleanText(expense.sourceEventKey, 300)).filter(Boolean));
    const seenForecastIssueKeys = new Set();

    (issues || []).filter((issue) => issue?.kind === "forecast").forEach((issue) => {
      stats.forecastIssues += 1;
      seenForecastIssueKeys.add(issue.issueKey);
      const issueQuarterKey = quarterKeyFromDateInput(issue.expenseDate);
      let ticket = trackerForecastTicket(current, issue.issueKey);
      if (!ticket && creationQuarterKey && issueQuarterKey !== creationQuarterKey) return;
      const references = TrackerSync.matchStateReferences(current, issue);
      if (!ticket && (!references.article || !references.location)) {
        const errors = [];
        if (!references.article) errors.push("Не найден проект для прогноза");
        if (!references.location) errors.push("Не найден офис для прогноза");
        warnings.push(trackerForecastWarning("forecast_unmapped", issue, errors, errors.join("|")));
        return;
      }

      if (!ticket) {
        const serviceAllocations = trackerServiceAllocations(issue);
        try {
          serviceAllocations.forEach((allocation) =>
            PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(allocation.expenseDate)));
        } catch (error) {
          warnings.push(trackerForecastWarning("forecast_locked", issue,
            [cleanText(error.message, 300)], `locked:${issue.expenseDate}`));
          return;
        }
        ticket = {
          id: createId(),
          sourceType: TrackerSync.SOURCE_TYPE,
          sourceTicketKey: issue.issueKey,
          trackerIssueKey: issue.issueKey,
          sourceRequestNumber: issue.poNumber || issue.orderId || issue.issueKey,
          ticketUrl: issue.issueUrl,
          description: issue.summary || issue.issueKey,
          supplier: "",
          sourceFile: null,
          sourceStatus: issue.sourceStatus || null,
          sourceService: issue.service || null,
          sourceCostCenter: issue.costCenter || null,
          sourceLegalEntity: issue.legalEntity || null,
          sourceUpdatedAt: issue.updatedAt || null,
          sourceSnapshot: TrackerSync.sourceSnapshot(issue),
          lifecycle: "active",
          createdAt: issue.createdAt || nowIso,
          createdBy: author,
          createdById: null,
          updatedAt: null,
          updatedBy: null,
          updatedById: null,
          lastImportedAt: nowIso,
          history: [{ changedAt: nowIso, changedBy: author, action: "tracker-forecast-created" }],
          allocations: serviceAllocations.map((serviceAllocation) => ({
            id: createId(),
            sourceAllocationKey: `tracker:${issue.issueKey}:${serviceAllocation.monthKey}`,
            locationId: references.location.id,
            articleId: references.article.id,
            subarticleId: null,
            currency: issue.currency,
            amount: serviceAllocation.amount,
            expectedDate: serviceAllocation.expenseDate,
            quarterKey: quarterKeyFromDateInput(serviceAllocation.expenseDate),
            lifecycle: "active",
            lifecycleSource: "source",
            stale: false,
            comment: `${issue.summary || issue.issueKey} · ${serviceAllocation.monthKey}`,
            sourceFile: null,
            sourceStatus: issue.sourceStatus || null,
            sourceReservationDate: issue.servicePeriodStart || issue.expenseDate,
            sourceExpectedDate: serviceAllocation.expenseDate,
            sourceRow: null,
            convertedExpenseId: null,
            convertedExpenseIds: [],
            convertedAmount: 0,
            releaseReason: ""
          }))
        };
        current.forecastTickets.push(ticket);
        stats.forecastsCreated += 1;
      } else {
        (ticket.allocations || []).forEach((allocation) => { allocation.subarticleId = null; });
        if (!TrackerSync.isTrackerForecastIssue(issue)) {
          warnings.push(trackerForecastWarning("forecast_marker_removed", issue,
            ["В тикете больше нет подгруппы «Прогноз». Резерв и расходы не изменены"],
            `marker:${issue.orderGroup || "missing"}`));
        }
        ticket.trackerIssueKey = issue.issueKey;
        ticket.sourceStatus = issue.sourceStatus || ticket.sourceStatus;
        ticket.sourceService = issue.service || ticket.sourceService;
        ticket.sourceCostCenter = issue.costCenter || ticket.sourceCostCenter;
        ticket.sourceLegalEntity = issue.legalEntity || ticket.sourceLegalEntity;
        ticket.lastImportedAt = nowIso;
        if (!ticket.sourceSnapshot) {
          ticket.sourceSnapshot = TrackerSync.sourceSnapshot(issue);
        } else {
          const changes = TrackerSync.snapshotChanges(ticket.sourceSnapshot, issue);
          if (changes.length) {
            warnings.push(trackerForecastWarning("forecast_changed", issue, [], "changed", { changes }));
          }
        }
        const legacyAllocation = ticket.allocations.length === 1
          && String(ticket.allocations[0].sourceAllocationKey || "").startsWith(`tracker:${issue.issueKey}`)
          && ticket.allocations[0].lifecycleSource === "source"
          ? ticket.allocations[0] : null;
        const serviceAllocations = trackerServiceAllocations(issue);
        const hasLinkedFacts = legacyAllocation
          && linkedForecastExpenses(current, ticket.id, legacyAllocation.id).length > 0;
        if (legacyAllocation && serviceAllocations.length > 1 && !hasLinkedFacts) {
          try {
            PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(legacyAllocation.expectedDate));
            serviceAllocations.forEach((serviceAllocation) =>
              PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(serviceAllocation.expenseDate)));
            ticket.allocations = serviceAllocations.map((serviceAllocation, index) => ({
              ...deepClone(legacyAllocation),
              id: index === 0 ? legacyAllocation.id : createId(),
              sourceAllocationKey: `tracker:${issue.issueKey}:${serviceAllocation.monthKey}`,
              amount: serviceAllocation.amount,
              expectedDate: serviceAllocation.expenseDate,
              quarterKey: quarterKeyFromDateInput(serviceAllocation.expenseDate),
              comment: `${issue.summary || issue.issueKey} · ${serviceAllocation.monthKey}`,
              sourceReservationDate: issue.servicePeriodStart || issue.expenseDate,
              sourceExpectedDate: serviceAllocation.expenseDate,
              convertedExpenseId: null,
              convertedExpenseIds: [],
              convertedAmount: 0,
              releaseReason: "",
              lifecycle: "active",
              lifecycleSource: "source"
            }));
            ticket.lifecycle = "active";
            ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
            ticket.history.push({ changedAt: nowIso, changedBy: author, action: "tracker-service-period-reallocated" });
            stats.forecastAllocationsAdjusted += serviceAllocations.length;
          } catch (error) {
            warnings.push(trackerForecastWarning("forecast_period_locked", issue,
              [cleanText(error.message, 300)], `service-period-locked:${issue.servicePeriodStart}:${issue.servicePeriodEnd}`));
          }
        } else if (legacyAllocation && serviceAllocations.length > 1 && hasLinkedFacts) {
          warnings.push(trackerForecastWarning("forecast_period_has_facts", issue,
            ["Период услуги включает несколько месяцев, но по старому одиночному резерву уже есть оплаты. Распределение оставлено без изменений"],
            `service-period-has-facts:${issue.servicePeriodStart}:${issue.servicePeriodEnd}`));
        }
      }

      const allocation = ticket.allocations.find((candidate) => candidate.currency === issue.currency
        && candidate.lifecycle !== "released") || ticket.allocations[0];
      const legacyExpenses = current.expenses.filter((expense) => expense.sourceType === TrackerSync.SOURCE_TYPE
        && normalizeCode(expense.sourceKey) === issue.issueKey
        && !expense.sourceEventKey && !expense.forecastTicketId);
      legacyExpenses.forEach((expense) => {
        const exact = expense.currency === issue.currency
          && Math.abs(Number(expense.amount) - Number(issue.amount)) <= Math.max(0.01, issue.amount * 1e-9);
        if (!exact || expense.status === "canceled") return;
        try {
          PeriodLocks.assertExpenseEditable(current, expense);
        } catch (error) {
          warnings.push(trackerForecastWarning("forecast_legacy_locked", issue,
            ["Ранее созданный полный расход относится к закрытому периоду и не был аннулирован"],
            `legacy-locked:${expense.id}`, { expenseId: expense.id }));
          return;
        }
        expense.status = "canceled";
        expense.updatedAt = nowIso;
        expense.updatedBy = author;
        expense.history = Array.isArray(expense.history) ? expense.history.slice(-49) : [];
        expense.history.push({ changedAt: nowIso, changedBy: author, action: "tracker-forecast-migration" });
        stats.migratedForecastExpenses += 1;
      });

      restoreTrackerProjectAttributes(current, references, issue, issue.expenseDate);

      (issue.paymentEvents || []).forEach((event) => {
        stats.paymentEvents += 1;
        if (existingEventKeys.has(event.eventKey)) {
          const existingExpense = current.expenses.find((expense) => expense.sourceEventKey === event.eventKey);
          const epsilon = Math.max(0.01, Math.abs(Number(event.grossAmount) || 0) * 1e-9);
          if (existingExpense && event.taxRatePercent > 0
            && Math.abs(Number(existingExpense.amount) - Number(event.grossAmount)) <= epsilon
            && Math.abs(Number(event.amount) - Number(event.grossAmount)) > epsilon) {
            try {
              PeriodLocks.assertExpenseEditable(current, existingExpense);
              existingExpense.amount = event.amount;
              existingExpense.sourceGrossAmount = event.grossAmount;
              existingExpense.sourceTaxRatePercent = event.taxRatePercent;
              existingExpense.updatedAt = nowIso;
              existingExpense.updatedBy = author;
              existingExpense.history = Array.isArray(existingExpense.history) ? existingExpense.history.slice(-49) : [];
              existingExpense.history.push({ changedAt: nowIso, changedBy: author, action: "tracker-payment-vat-excluded" });
              const linkedAllocation = ticket.allocations.find((candidate) => candidate.id === existingExpense.forecastAllocationId);
              if (linkedAllocation) refreshForecastConversionState(current, ticket, linkedAllocation);
              stats.vatAdjustedFacts += 1;
            } catch (error) {
              warnings.push(trackerForecastWarning("forecast_payment_vat_locked", issue,
                [cleanText(error.message, 300)], `payment-vat-locked:${event.eventKey}`,
                { eventKey: event.eventKey, expenseId: existingExpense.id }));
            }
          }
          return;
        }
        const candidates = ticket.allocations.filter((candidate) => candidate.currency === event.currency
          && candidate.lifecycle !== "released");
        if (!candidates.length) {
          warnings.push(trackerForecastWarning("forecast_currency", issue,
            [`Оплата ${event.currency}, а резерв создан в другой валюте`],
            `currency:${event.eventKey}`, { eventKey: event.eventKey }));
          return;
        }
        const target = [...candidates].sort((left, right) =>
          forecastAllocationRemainingAmount(current, ticket.id, right)
          - forecastAllocationRemainingAmount(current, ticket.id, left))[0];
        try {
          PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(target.expectedDate));
          PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(event.paymentDate));
        } catch (error) {
          warnings.push(trackerForecastWarning("forecast_payment_locked", issue,
            [cleanText(error.message, 300)], `payment-locked:${event.eventKey}`, { eventKey: event.eventKey }));
          return;
        }
        const remainingBefore = forecastAllocationRemainingAmount(current, ticket.id, target);
        const expenseId = createId();
        current.expenses.push({
          id: expenseId,
          locationId: target.locationId,
          articleId: target.articleId,
          subarticleId: target.subarticleId,
          currency: event.currency,
          amount: event.amount,
          ticketUrl: issue.issueUrl,
          comment: `TAXIASSIST · Документ ${event.documentNumber} · оплата ${event.paymentDate}`,
          expenseDate: event.paymentDate,
          quarterKey: quarterKeyFromDateInput(event.paymentDate),
          createdAt: nowIso,
          createdBy: `${author} · robot-planer-oebs`,
          createdById: null,
          updatedAt: null,
          updatedBy: null,
          updatedById: null,
          status: "active",
          history: [{ changedAt: nowIso, changedBy: author, action: "tracker-payment-created" }],
          sourceType: TrackerSync.SOURCE_TYPE,
          sourceKey: issue.issueKey,
          sourceEventKey: event.eventKey,
          sourceBusinessKey: event.documentNumber,
          sourceDocumentNumber: event.documentNumber,
          sourceDocumentDate: event.documentDate || null,
          sourcePaymentDate: event.paymentDate,
          sourceGrossAmount: event.grossAmount,
          sourceTaxRatePercent: event.taxRatePercent,
          sourceOrderId: issue.orderId || null,
          sourceUpdatedAt: issue.updatedAt || null,
          sourceSnapshot: TrackerSync.sourceSnapshot(issue),
          forecastTicketId: ticket.id,
          forecastAllocationId: target.id
        });
        existingEventKeys.add(event.eventKey);
        stats.factsCreated += 1;
        refreshForecastConversionState(current, ticket, target);
        if (event.amount > remainingBefore + Math.max(0.01, remainingBefore * 1e-9)) {
          warnings.push(trackerForecastWarning("forecast_overrun", issue,
            [`Оплата превысила остаток резерва на ${event.amount - remainingBefore} ${event.currency}`],
            `overrun:${event.eventKey}`, { eventKey: event.eventKey, expenseId }));
        }
      });
    });
    if (options.selectionComplete === true) {
      (current.forecastTickets || []).forEach((ticket) => {
        const issueKey = trackerIssueKeyFromTicket(ticket);
        if (!issueKey || seenForecastIssueKeys.has(issueKey)) return;
        warnings.push({
          id: TrackerSync.warningId("forecast_missing", issueKey),
          type: "forecast_attention",
          issueKey,
          expenseId: null,
          issueUrl: ticket.ticketUrl || `https://st.yandex-team.ru/${issueKey}`,
          validationErrors: ["Тикет больше не попадает в выборку. Резерв и расходы не изменены"],
          changes: [],
          fingerprint: "forecast-missing"
        });
      });
    }
    return { warnings, ...stats };
  }

  function applyTrackerDirectPaymentIssues(current, issues, options = {}) {
    const creationQuarterKey = /^\d{4}-Q[1-4]$/.test(String(options.creationQuarterKey || ""))
      ? String(options.creationQuarterKey) : "";
    const nowIso = options.nowIso || new Date().toISOString();
    const author = cleanText(options.author, 80) || "Tracker";
    const warnings = [];
    const stats = { paymentEvents: 0, factsCreated: 0 };
    const existingEventKeys = new Set((current.expenses || [])
      .map((expense) => cleanText(expense.sourceEventKey, 300)).filter(Boolean));

    (issues || []).filter((issue) => issue?.kind !== "forecast").forEach((issue) => {
      const references = TrackerSync.matchStateReferences(current, issue);
      (issue.paymentEvents || []).forEach((event) => {
        if (creationQuarterKey && quarterKeyFromDateInput(event.paymentDate) !== creationQuarterKey) return;
        stats.paymentEvents += 1;
        if (existingEventKeys.has(event.eventKey)) return;
        restoreTrackerProjectAttributes(current, references, issue, event.paymentDate);
        if (!references.article || !references.location
          || !TrackerSync.issueBelongsToLoadedBudget(current, issue, event.paymentDate)) {
          const errors = [
            `Документ ${event.documentNumber}: найдена оплата ${event.amount} ${event.currency} от ${event.paymentDate}, но расход не создан`
          ];
          if (!references.article) errors.push("Не найден проект для оплаты");
          if (!references.location) errors.push("Не найдена однозначная локация для оплаты");
          if (references.article && references.location) {
            errors.push(trackerDirectPaymentMappingError(current, references, issue, event.paymentDate));
          }
          warnings.push(trackerForecastWarning("payment_unmapped", issue, errors,
            `payment-unmapped:${event.eventKey}`, { eventKey: event.eventKey }));
          return;
        }
        try {
          PeriodLocks.assertMonthEditable(current, monthKeyFromDateInput(event.paymentDate));
        } catch (error) {
          warnings.push(trackerForecastWarning("payment_locked", issue,
            [cleanText(error.message, 300)], `payment-locked:${event.eventKey}`, { eventKey: event.eventKey }));
          return;
        }
        current.expenses.push({
          id: createId(), locationId: references.location.id, articleId: references.article.id,
          subarticleId: null, currency: event.currency, amount: event.amount, ticketUrl: issue.issueUrl,
          comment: `TAXIASSIST · Документ ${event.documentNumber} · оплата ${event.paymentDate}`,
          expenseDate: event.paymentDate, quarterKey: quarterKeyFromDateInput(event.paymentDate),
          createdAt: nowIso, createdBy: `${author} · robot-planer-oebs`, createdById: null,
          updatedAt: null, updatedBy: null, updatedById: null, status: "active",
          history: [{ changedAt: nowIso, changedBy: author, action: "tracker-payment-created" }],
          sourceType: TrackerSync.SOURCE_TYPE, sourceKey: issue.issueKey, sourceEventKey: event.eventKey,
          sourceBusinessKey: event.documentNumber, sourceDocumentNumber: event.documentNumber,
          sourceDocumentDate: event.documentDate || null, sourcePaymentDate: event.paymentDate,
          sourceGrossAmount: event.grossAmount, sourceTaxRatePercent: event.taxRatePercent,
          sourceOrderId: issue.orderId || null, sourceUpdatedAt: issue.updatedAt || null,
          sourceSnapshot: TrackerSync.sourceSnapshot(issue), forecastTicketId: null, forecastAllocationId: null
        });
        existingEventKeys.add(event.eventKey);
        stats.factsCreated += 1;
      });
    });
    return { ...stats, warnings };
  }

  function removeForeignTrackerRecords(current, foreignIssueKeys) {
    const keys = new Set([...foreignIssueKeys].map((key) => normalizeCode(key)).filter(Boolean));
    if (!keys.size) return { expensesRemoved: 0, forecastsRemoved: 0 };
    const foreignForecastIds = new Set((current.forecastTickets || [])
      .filter((ticket) => keys.has(trackerIssueKeyFromTicket(ticket)))
      .map((ticket) => ticket.id));
    const removedExpenseIds = new Set((current.expenses || [])
      .filter((expense) => expense.sourceType === TrackerSync.SOURCE_TYPE
        && (keys.has(normalizeCode(expense.sourceKey)) || foreignForecastIds.has(expense.forecastTicketId)))
      .map((expense) => expense.id));
    current.expenses = (current.expenses || []).filter((expense) => !removedExpenseIds.has(expense.id));
    current.comments = (current.comments || []).filter((comment) => !removedExpenseIds.has(comment.expenseId));
    const forecastCountBefore = (current.forecastTickets || []).length;
    current.forecastTickets = (current.forecastTickets || [])
      .filter((ticket) => !foreignForecastIds.has(ticket.id));
    return {
      expensesRemoved: removedExpenseIds.size,
      forecastsRemoved: forecastCountBefore - current.forecastTickets.length
    };
  }

  function budgetImportRecords(current) {
    return Object.fromEntries(["expenses", "forecastTickets", "comments"]
      .map((key) => [key, deepClone(current[key] || [])]));
  }

  function preserveBudgetImportRecords(original, normalizedRecords, imported) {
    const fail = () => {
      throw Object.assign(new Error("Импорт отменён: он может изменить или удалить записанные расходы, прогнозы или комментарии. Данные не сохранены."), {
        statusCode: 400, code: "budget_import_changes_records"
      });
    };
    // Проверка идёт после полной нормализации: она тоже может убрать запись с потерянным проектом.
    // Сравниваем нормализованные копии, а сохраняем исходные записи без изменения служебных полей.
    for (const key of ["expenses", "forecastTickets", "comments"]) {
      const before = original[key] || [];
      const after = imported[key] || [];
      if (JSON.stringify(normalizedRecords[key]) !== JSON.stringify(after)
        || before.length !== after.length) fail();
      const byId = new Map(after.map((item) => [item.id, item]));
      if (byId.size !== after.length || new Set(before.map((item) => item.id)).size !== before.length
        || before.some((item) => !byId.has(item.id))) fail();
      const sameFields = (left, right, fields) => fields.every((field) =>
        !Object.prototype.hasOwnProperty.call(left, field) || left[field] === right[field]);
      if (key === "expenses" && before.some((item) => !sameFields(item, byId.get(item.id), [
        "locationId", "articleId", "subarticleId", "amount", "currency", "expenseDate", "quarterKey", "status"
      ]))) fail();
      if (key === "forecastTickets") {
        for (const ticket of before) {
          const allocations = ticket.allocations || [];
          const importedAllocations = byId.get(ticket.id).allocations || [];
          const allocationsById = new Map(importedAllocations.map((item) => [item.id, item]));
          if (allocations.length !== importedAllocations.length || allocationsById.size !== allocations.length
            || new Set(allocations.map((item) => item.id)).size !== allocations.length) fail();
          if (allocations.some((item) => !allocationsById.has(item.id)
            || !sameFields(item, allocationsById.get(item.id), [
              "locationId", "articleId", "subarticleId", "amount", "currency", "expectedDate", "quarterKey", "lifecycle"
            ]))) fail();
        }
      }
    }
    Object.assign(imported, budgetImportRecords(original));
  }

  function applyLocalMutation(current, type, payload) {
    if (type === "importState") {
      const hasClosedMonths = Object.keys(current?.closedPeriods?.months || {}).length > 0;
      const hasClosedQuarters = Object.keys(current?.closedPeriods?.quarters || {}).length > 0;
      if (hasClosedMonths || hasClosedQuarters) {
        throw new Error("Восстановление из JSON заблокировано: есть закрытые периоды. Сначала переоткройте их, затем повторите восстановление.");
      }
      const imported = normalizeState(payload.state);
      imported.revision = current.revision + 1;
      return imported;
    }

    const next = normalizeState(deepClone(current));
    const nowIso = new Date().toISOString();

    if (type === "importBudget") {
      const protectedRecords = budgetImportRecords(next);
      const imported = normalizeState(BudgetImport.applyBudgetImport(next, payload));
      preserveBudgetImportRecords(current, protectedRecords, imported);
      imported.revision = next.revision + 1;
      return imported;
    }

    if (type === "importExpenses") {
      const imported = normalizeState(ExpenseImport.applyExpenseImport(next, payload));
      imported.revision = next.revision + 1;
      return imported;
    }

    if (type === "syncTrackerExpenses") {
      const batch = TrackerSync.normalizeTrackerIssues(Array.isArray(payload?.issues) ? payload.issues : []);
      const cfoScopedIssues = batch.issues.filter((issue) => TrackerSync.issueBelongsToOwnedCostCenters(next, issue));
      const mappedBatchIssues = applyTrackerManualMappings(next, cfoScopedIssues);
      const ownedIssues = mappedBatchIssues.filter((issue) => {
        const references = TrackerSync.matchStateReferences(next, issue);
        return (issue.paymentEvents || []).length > 0
          || !references.article || !references.location
          ? true
          : TrackerSync.issueBelongsToLoadedBudget(next, issue)
            || (issue.paymentEvents || []).some((event) =>
              TrackerSync.issueBelongsToLoadedBudget(next, issue, event.paymentDate));
      });
      const ownedIssueKeys = new Set(ownedIssues.map((issue) => issue.issueKey));
      const foreignIssueKeys = new Set(batch.issues
        .filter((issue) => !ownedIssueKeys.has(issue.issueKey))
        .map((issue) => issue.issueKey));
      const foreignCleanup = removeForeignTrackerRecords(next, foreignIssueKeys);
      const normalizedIssues = ownedIssues.map((issue) => trackerForecastTicket(next, issue.issueKey)
        ? { ...issue, kind: "forecast" }
        : issue);
      const creationQuarterKey = /^\d{4}-Q[1-4]$/.test(String(payload?.creationQuarterKey || ""))
        ? String(payload.creationQuarterKey) : "";
      const migratedServiceExpenses = migrateLegacyTrackerServiceExpenses(next, normalizedIssues, {
        creationQuarterKey,
        nowIso,
        author: payload?.author
      });
      const referencePlan = TrackerSync.buildReferencePlan(next, normalizedIssues, { creationQuarterKey });
      const createdReferences = applyTrackerReferencePlan(next, referencePlan);
      const inferredIssueKeySet = new Set(batch.inferredIssueKeys || []);
      const inferredIssuesInPeriod = normalizedIssues.filter((issue) =>
        inferredIssueKeySet.has(issue.issueKey)
        && (!creationQuarterKey || quarterKeyFromDateInput(issue.expenseDate) === creationQuarterKey)).length;
      const plan = TrackerSync.buildSyncPlan(next, normalizedIssues, {
        selectionComplete: payload?.selectionComplete === true,
        creationQuarterKey
      });
      const warnings = [...plan.warnings, ...migratedServiceExpenses.warnings];
      const servicePeriodIssuesInPeriod = normalizedIssues.filter((issue) =>
        !creationQuarterKey || quarterKeyFromDateInput(issue.expenseDate) === creationQuarterKey);
      const servicePeriodFallbacks = servicePeriodIssuesInPeriod.filter((issue) =>
        issue.servicePeriodSource === "createdAt").length;
      const servicePeriodsCrossingQuarters = servicePeriodIssuesInPeriod.filter((issue) =>
        issue.servicePeriodSpansQuarters === true).length;
      servicePeriodIssuesInPeriod.filter((issue) => trackerServiceAllocations(issue).length > 1).forEach((issue) => {
        const allocationCount = trackerServiceAllocations(issue).length;
        const crossingNote = issue.servicePeriodSpansQuarters
          ? " Период пересекает кварталы."
          : "";
        warnings.push({
          id: TrackerSync.warningId("service_period_allocation", issue.issueKey),
          type: "source_period_review",
          issueKey: issue.issueKey,
          expenseId: null,
          issueUrl: issue.issueUrl,
          validationErrors: [`Период услуги ${issue.servicePeriodStart} — ${issue.servicePeriodEnd}: сумма распределена пропорционально календарным дням на ${allocationCount} месяца.${crossingNote} При необходимости измените месячные строки на экране «${issue.kind === "forecast" ? "Прогнозы" : "Расходы"}».`],
          currentSnapshot: TrackerSync.sourceSnapshot(issue),
          fingerprint: `service-period:${issue.servicePeriodStart}:${issue.servicePeriodEnd}:${issue.amount}`
        });
      });
      let created = 0;
      plan.creates.forEach(({ issue, articleId, locationId }) => {
        const serviceAllocations = trackerServiceAllocations(issue);
        const expensePayloads = serviceAllocations.map((serviceAllocation) => ({
          locationId,
          articleId,
          subarticleId: null,
          currency: issue.currency,
          amount: serviceAllocation.amount,
          ticketUrl: issue.issueUrl,
          comment: `${issue.poNumber
            ? `TAXIASSIST · ЗП ${issue.poNumber}${issue.summary ? ` · ${issue.summary}` : ""}`
            : (issue.summary || issue.issueKey)}${serviceAllocations.length > 1 ? ` · ${serviceAllocation.monthKey}` : ""}`,
          expenseDate: serviceAllocation.expenseDate,
          sourceAllocationKey: `tracker:${issue.issueKey}:${serviceAllocation.monthKey}`
        }));
        try {
          expensePayloads.forEach((expensePayload) => {
            validateExpensePayload(next, expensePayload);
            PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(expensePayload.expenseDate));
          });
        } catch (error) {
          const validationErrors = [cleanText(error.message, 300) || "Не удалось создать расход"];
          warnings.push({
            id: TrackerSync.warningId("source_unmapped", issue.issueKey),
            type: "source_unmapped",
            issueKey: issue.issueKey,
            expenseId: null,
            issueUrl: issue.issueUrl,
            validationErrors,
            fingerprint: `${TrackerSync.snapshotFingerprint(issue)}|errors:${validationErrors.join(",")}`
          });
          return;
        }
        expensePayloads.forEach((expensePayload) => {
          next.expenses.push({
            id: createId(),
            locationId,
            articleId,
            subarticleId: null,
            currency: issue.currency,
            amount: expensePayload.amount,
            ticketUrl: issue.issueUrl,
            comment: cleanText(expensePayload.comment, 500),
            expenseDate: expensePayload.expenseDate,
            quarterKey: quarterKeyFromDateInput(expensePayload.expenseDate),
            createdAt: nowIso,
            createdBy: cleanText(payload.author, 80) || "Tracker",
            createdById: null,
            updatedAt: null,
            updatedBy: null,
            updatedById: null,
            status: "active",
            history: [],
            sourceType: TrackerSync.SOURCE_TYPE,
            sourceKey: issue.issueKey,
            sourceAllocationKey: expensePayload.sourceAllocationKey,
            sourceServicePeriodStart: issue.servicePeriodStart || null,
            sourceServicePeriodEnd: issue.servicePeriodEnd || null,
            sourceBusinessKey: issue.poNumber || null,
            sourceOrderId: issue.orderId || null,
            sourceUpdatedAt: issue.updatedAt || null,
            sourceSnapshot: TrackerSync.sourceSnapshot(issue),
            forecastTicketId: null,
            forecastAllocationId: null
          });
          created += 1;
        });
        const attributesKey = `${locationId}|${quarterKeyFromDateInput(issue.expenseDate)}`;
        next.projectAttributes[attributesKey] ||= {};
        const existingAttributes = next.projectAttributes[attributesKey][articleId] || {};
        next.projectAttributes[attributesKey][articleId] = {
          service: existingAttributes.service || issue.service || "",
          ...((existingAttributes.serviceCode || issue.serviceCode) ? { serviceCode: existingAttributes.serviceCode || issue.serviceCode } : {}),
          legalEntity: existingAttributes.legalEntity || issue.legalEntity || "",
          cfo: existingAttributes.cfo || issue.costCenter || "",
          ...((existingAttributes.cfoCode || issue.cfoCode) ? { cfoCode: existingAttributes.cfoCode || issue.cfoCode } : {}),
          location: existingAttributes.location || issue.locationName || ""
        };
      });

      const forecastResult = applyTrackerForecastIssues(next, normalizedIssues, {
        creationQuarterKey,
        nowIso,
        author: payload?.author,
        selectionComplete: payload?.selectionComplete === true
      });
      warnings.push(...forecastResult.warnings);
      const directPaymentResult = applyTrackerDirectPaymentIssues(next, normalizedIssues, {
        creationQuarterKey, nowIso, author: payload?.author
      });
      warnings.push(...directPaymentResult.warnings);

      const previousWarnings = new Map((next.trackerSync?.warnings || [])
        .map((warning) => [warning.id, warning]));
      const mergedWarnings = warnings.map((warning) => {
        const previous = previousWarnings.get(warning.id);
        const sameFingerprint = previous?.fingerprint === warning.fingerprint;
        return {
          ...warning,
          detectedAt: sameFingerprint && previous.detectedAt ? previous.detectedAt : nowIso,
          status: sameFingerprint && previous.status === "dismissed" ? "dismissed" : "open",
          dismissedAt: sameFingerprint && previous.status === "dismissed" ? previous.dismissedAt : null
        };
      });
      next.trackerSync = {
        lastAttemptAt: nowIso,
        lastSuccessfulSyncAt: nowIso,
        nextRetryAt: null,
        lastError: "",
        lastResult: {
          created,
          unchanged: plan.unchanged,
          warnings: mergedWarnings.filter((warning) => warning.status === "open").length,
          checked: normalizedIssues.length,
          scanned: Math.max(0, Number(payload?.scannedIssueCount) || 0),
          financial: Math.max(0, Number(payload?.financialIssueCount) || normalizedIssues.length),
          inPeriod: plan.inPeriod,
          outOfPeriod: plan.outOfPeriod,
          inferredIssues: inferredIssuesInPeriod,
          createdProjects: createdReferences.createdProjects,
          createdLocations: createdReferences.createdLocations,
          knownIssues: Math.max(0, Number(payload?.knownIssueCount) || 0),
          forecastIssues: forecastResult.forecastIssues,
          forecastsCreated: forecastResult.forecastsCreated,
          paymentEvents: forecastResult.paymentEvents + directPaymentResult.paymentEvents,
          factsCreated: forecastResult.factsCreated + directPaymentResult.factsCreated,
          vatAdjustedFacts: forecastResult.vatAdjustedFacts,
          foreignIssuesExcluded: foreignIssueKeys.size,
          foreignExpensesRemoved: foreignCleanup.expensesRemoved,
          foreignForecastsRemoved: foreignCleanup.forecastsRemoved,
          migratedForecastExpenses: forecastResult.migratedForecastExpenses,
          forecastAllocationsAdjusted: forecastResult.forecastAllocationsAdjusted,
          trackerExpensesAdjusted: migratedServiceExpenses.adjustedExpenses,
          trackerExpenseRowsCreated: migratedServiceExpenses.createdRows,
          servicePeriodFallbacks,
          servicePeriodsCrossingQuarters,
          searchScope: payload?.searchScope === "queue" ? "queue" : "mine",
          periodKey: creationQuarterKey
        },
        warnings: mergedWarnings,
        manualMappings: deepClone(next.trackerSync?.manualMappings || {}),
        projectMappings: deepClone(next.trackerSync?.projectMappings || {}),
        locationMappings: deepClone(next.trackerSync?.locationMappings || {}),
        mappingRules: deepClone(next.trackerSync?.mappingRules || {})
      };
      next.revision += 1;
      return next;
    }

    if (type === "recordTrackerSyncFailure") {
      next.trackerSync ||= createInitialState().trackerSync;
      next.trackerSync.lastAttemptAt = nowIso;
      next.trackerSync.nextRetryAt = new Date(Date.now() + TrackerSync.RETRY_INTERVAL_MS).toISOString();
      next.trackerSync.lastError = cleanText(payload?.error, 1000) || "Не удалось проверить Tracker";
      next.revision += 1;
      return next;
    }

    if (type === "clearTrackerSyncFailure") {
      next.trackerSync ||= createInitialState().trackerSync;
      next.trackerSync.lastError = "";
      next.trackerSync.nextRetryAt = "";
      next.revision += 1;
      return next;
    }

    if (type === "dismissTrackerWarning") {
      const warning = next.trackerSync?.warnings?.find((item) => item.id === payload?.id);
      if (!warning) throw new Error("Предупреждение не найдено");
      warning.status = "dismissed";
      warning.dismissedAt = nowIso;
      next.revision += 1;
      return next;
    }

    if (type === "saveTrackerManualMapping") {
      const issueKey = normalizeCode(payload?.issueKey);
      const article = next.articles.find((item) => item.id === payload?.articleId && !item.archived);
      const location = next.locations.find((item) => item.id === payload?.locationId && !item.archived);
      if (!/^TAXIASSIST-\d+$/.test(issueKey)) throw new Error("Некорректный ключ тикета Tracker");
      if (!article || !normalizeCode(article.code)) throw new Error("Выберите активный проект с кодом");
      if (!location || !normalizeCode(location.code)) throw new Error("Выберите активную локацию с кодом");
      next.trackerSync ||= createInitialState().trackerSync;
      next.trackerSync.manualMappings ||= {};
      next.trackerSync.manualMappings[issueKey] = {
        articleId: article.id,
        locationId: location.id,
        service: cleanText(payload?.service, 120),
        cfo: cleanText(payload?.cfo, 160),
        legalEntity: cleanText(payload?.legalEntity, 160),
        updatedAt: nowIso
      };
      const rememberBothLegacy = payload?.applyToSimilar === true;
      if (payload?.rememberProject === true || rememberBothLegacy) {
        const sourceProjectCode = normalizeCode(payload?.sourceProjectCode);
        if (!sourceProjectCode) throw new Error("Не удалось определить исходный код проекта Tracker");
        next.trackerSync.projectMappings ||= {};
        next.trackerSync.projectMappings[sourceProjectCode] = { articleId: article.id, updatedAt: nowIso };
      }
      if (payload?.rememberLocation === true || rememberBothLegacy) {
        const sourceLocationCode = normalizeCode(payload?.sourceLocationCode);
        if (!sourceLocationCode) throw new Error("Не удалось определить исходный код офиса Tracker");
        next.trackerSync.locationMappings ||= {};
        next.trackerSync.locationMappings[sourceLocationCode] = { locationId: location.id, updatedAt: nowIso };
      }
      const linkedExpenses = next.expenses.filter((expense) =>
        expense.sourceType === TrackerSync.SOURCE_TYPE
        && normalizeCode(expense.sourceKey) === issueKey);
      linkedExpenses.forEach((expense) => PeriodLocks.assertExpenseEditable(next, expense));
      const linkedForecasts = next.forecastTickets.filter((ticket) =>
        normalizeCode(trackerIssueKeyFromTicket(ticket)) === issueKey);
      linkedForecasts.flatMap((ticket) => ticket.allocations || []).forEach((allocation) =>
        PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(allocation.expectedDate)));
      linkedExpenses.forEach((expense) => {
        expense.articleId = article.id;
        expense.subarticleId = null;
        expense.locationId = location.id;
        // Ручное сопоставление — это подтверждённый пересмотр тикета: обновляем
        // снимок источника, иначе следующая синхронизация снова сочтёт код
        // "изменившимся" и предупреждение никогда не снимется.
        if (expense.sourceSnapshot && typeof expense.sourceSnapshot === "object") {
          expense.sourceSnapshot = {
            ...expense.sourceSnapshot,
            projectCode: normalizeCode(article.code),
            locationCode: normalizeCode(location.code)
          };
        }
        expense.updatedAt = nowIso;
        expense.updatedBy = cleanText(payload?.author, 80) || currentActorName();
        expense.history = Array.isArray(expense.history) ? expense.history.slice(-49) : [];
        expense.history.push({ changedAt: nowIso, changedBy: expense.updatedBy, action: "tracker-manual-mapping" });
      });
      linkedForecasts.forEach((ticket) => {
        (ticket.allocations || []).forEach((allocation) => {
          allocation.articleId = article.id;
          allocation.subarticleId = null;
          allocation.locationId = location.id;
        });
        ticket.sourceService = cleanText(payload?.service, 120) || ticket.sourceService;
        ticket.sourceCostCenter = cleanText(payload?.cfo, 160) || ticket.sourceCostCenter;
        ticket.sourceLegalEntity = cleanText(payload?.legalEntity, 160) || ticket.sourceLegalEntity;
        ticket.updatedAt = nowIso;
        ticket.updatedBy = cleanText(payload?.author, 80) || currentActorName();
        ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
        ticket.history.push({ changedAt: nowIso, changedBy: ticket.updatedBy, action: "tracker-manual-mapping" });
      });
      const affectedQuarters = new Set([
        ...linkedExpenses.map((expense) => expense.quarterKey),
        ...linkedForecasts.flatMap((ticket) => (ticket.allocations || []).map((allocation) => allocation.quarterKey))
      ].filter((key) => /^\d{4}-Q[1-4]$/.test(key)));
      affectedQuarters.forEach((quarterKey) => {
        const attributesKey = `${location.id}|${quarterKey}`;
        next.projectAttributes[attributesKey] ||= {};
        const existing = next.projectAttributes[attributesKey][article.id] || {};
        next.projectAttributes[attributesKey][article.id] = {
          service: cleanText(payload?.service, 120) || existing.service || "",
          legalEntity: cleanText(payload?.legalEntity, 160) || existing.legalEntity || "",
          cfo: cleanText(payload?.cfo, 160) || existing.cfo || "",
          location: location.name
        };
      });
      next.revision += 1;
      return next;
    }

    if (type === "deleteTrackerManualMapping") {
      const issueKey = normalizeCode(payload?.issueKey);
      if (next.trackerSync?.manualMappings) delete next.trackerSync.manualMappings[issueKey];
      next.revision += 1;
      return next;
    }

    if (type === "addForecast") {
      validateForecastPayload(next, payload);
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(payload.expectedDate));
      const article = next.articles.find((candidate) => candidate.id === payload.articleId);
      const ticketId = payload.id || createId();
      const allocationId = payload.allocationId || createId();
      next.forecastTickets.push({
        id: ticketId,
        sourceType: null,
        sourceTicketKey: null,
        sourceRequestNumber: cleanText(payload.requestNumber, 80) || ticketLabel(payload.ticketUrl),
        ticketUrl: safeHttpUrl(payload.ticketUrl),
        description: cleanText(payload.comment, 500),
        supplier: "",
        sourceFile: null,
        sourceStatus: null,
        lifecycle: "active",
        createdAt: nowIso,
        createdBy: cleanText(payload.author, 80) || "Не указано",
        createdById: null,
        updatedAt: null,
        updatedBy: null,
        updatedById: null,
        lastImportedAt: null,
        history: [],
        allocations: [{
          id: allocationId,
          sourceAllocationKey: null,
          locationId: payload.locationId,
          articleId: payload.articleId,
          subarticleId: resolveOptionalSubarticleClient(article, payload.subarticleId),
          currency: normalizeCurrencyCode(payload.currency),
          amount: Number(payload.amount),
          expectedDate: payload.expectedDate,
          quarterKey: quarterKeyFromDateInput(payload.expectedDate),
          lifecycle: "active",
          lifecycleSource: "manual",
          stale: false,
          comment: cleanText(payload.comment, 500),
          sourceFile: null,
          sourceStatus: null,
          sourceReservationDate: null,
          sourceExpectedDate: null,
          sourceRow: null,
          convertedExpenseId: null,
          convertedAmount: null,
          releaseReason: ""
        }]
      });
    } else if (type === "updateForecastAllocation") {
      validateForecastPayload(next, payload);
      const ticket = next.forecastTickets.find((candidate) => candidate.id === payload.ticketId);
      const allocation = ticket?.allocations.find((candidate) => candidate.id === payload.allocationId);
      if (!ticket || !allocation) throw new Error("Прогнозное распределение не найдено");
      if (!["active", "review"].includes(allocation.lifecycle)) throw new Error("Этот прогноз уже освобождён или оплачен");
      const oldQuarter = allocation.quarterKey;
      const newQuarter = quarterKeyFromDateInput(payload.expectedDate);
      if (oldQuarter !== newQuarter) {
        throw new Error("Перенос прогноза разрешён только между месяцами одного квартала");
      }
      const article = next.articles.find((candidate) => candidate.id === payload.articleId);
      const resolvedSubarticleId = resolveOptionalSubarticleClient(article, payload.subarticleId);
      if (allocation.locationId !== payload.locationId
        || allocation.articleId !== payload.articleId
        || allocation.subarticleId !== resolvedSubarticleId
        || allocation.currency !== normalizeCurrencyCode(payload.currency)) {
        throw new Error("Прогноз можно переносить только внутри той же локации, статьи и валюты. Для перераспределения освободите его и создайте новый тикет.");
      }
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(allocation.expectedDate));
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(payload.expectedDate));
      const previous = {
        locationId: allocation.locationId,
        articleId: allocation.articleId,
        subarticleId: allocation.subarticleId,
        currency: allocation.currency,
        amount: allocation.amount,
        expectedDate: allocation.expectedDate,
        ticketUrl: ticket.ticketUrl,
        description: ticket.description
      };
      allocation.locationId = payload.locationId;
      allocation.articleId = payload.articleId;
      allocation.subarticleId = resolvedSubarticleId;
      allocation.currency = normalizeCurrencyCode(payload.currency);
      allocation.amount = Number(payload.amount);
      allocation.expectedDate = payload.expectedDate;
      allocation.quarterKey = newQuarter;
      allocation.comment = cleanText(payload.comment, 500);
      if (ticket.sourceType !== ExpenseImport.SOURCE_TYPE) allocation.lifecycleSource = "manual";
      allocation.stale = false;
      ticket.ticketUrl = safeHttpUrl(payload.ticketUrl);
      ticket.description = cleanText(payload.comment, 500);
      ticket.updatedAt = nowIso;
      ticket.updatedBy = cleanText(payload.author, 80) || "Не указано";
      ticket.lifecycle = ExpenseImport.ticketLifecycle(ticket.allocations);
      ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
      ticket.history.push({ changedAt: nowIso, changedBy: ticket.updatedBy, action: "forecast-update", previous });
    } else if (type === "releaseForecastTicket") {
      const ticket = next.forecastTickets.find((candidate) => candidate.id === payload.ticketId);
      if (!ticket) throw new Error("Прогнозный тикет не найден");
      const reason = cleanText(payload.reason, 500);
      if (!reason) throw new Error("Укажите причину освобождения резерва");
      const releasable = ticket.allocations.filter((allocation) => ["active", "review"].includes(allocation.lifecycle));
      if (!releasable.length) throw new Error("В тикете нет активного резерва");
      releasable.forEach((allocation) => {
        PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(allocation.expectedDate));
        allocation.lifecycle = "released";
        allocation.lifecycleSource = "manual";
        allocation.releaseReason = reason;
      });
      ticket.lifecycle = ExpenseImport.ticketLifecycle(ticket.allocations);
      ticket.updatedAt = nowIso;
      ticket.updatedBy = cleanText(payload.author, 80) || "Не указано";
      ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
      ticket.history.push({ changedAt: nowIso, changedBy: ticket.updatedBy, action: "forecast-release", reason });
    } else if (type === "restoreForecastTicket") {
      const ticket = next.forecastTickets.find((candidate) => candidate.id === payload.ticketId);
      if (!ticket) throw new Error("Прогнозный тикет не найден");
      const released = ticket.allocations.filter((allocation) =>
        allocation.lifecycle === "released" && allocation.lifecycleSource === "manual");
      if (!released.length) throw new Error("В тикете нет освобождённого резерва");
      released.forEach((allocation) => {
        PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(allocation.expectedDate));
        allocation.lifecycle = ticket.sourceType === ExpenseImport.SOURCE_TYPE
          ? ExpenseImport.forecastStatusLifecycle(allocation.sourceStatus, allocation.amount)
          : "active";
        allocation.lifecycleSource = ticket.sourceType === ExpenseImport.SOURCE_TYPE ? "source" : "manual";
        allocation.releaseReason = "";
      });
      ticket.lifecycle = ExpenseImport.ticketLifecycle(ticket.allocations);
      ticket.updatedAt = nowIso;
      ticket.updatedBy = cleanText(payload.author, 80) || "Не указано";
      ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
      ticket.history.push({ changedAt: nowIso, changedBy: ticket.updatedBy, action: "forecast-restore" });
    } else if (type === "convertForecastAllocation") {
      const ticket = next.forecastTickets.find((candidate) => candidate.id === payload.ticketId);
      const allocation = ticket?.allocations.find((candidate) => candidate.id === payload.allocationId);
      if (!ticket || !allocation) throw new Error("Прогнозное распределение не найдено");
      if (!["active", "review"].includes(allocation.lifecycle)) throw new Error("Этот прогноз уже освобождён или оплачен");
      const expenseDate = payload.expenseDate;
      const amount = Number(payload.amount);
      if (!validDateInput(expenseDate)) {
        throw new Error("Укажите корректную дату расхода");
      }
      if (quarterKeyFromDateInput(expenseDate) !== allocation.quarterKey) {
        throw new Error("Фактическая оплата должна относиться к тому же кварталу; для другого квартала сначала измените бюджет");
      }
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Введите фактическую сумму больше нуля");
      const expenseTicketUrl = safeHttpUrl(payload.ticketUrl) || ticket.ticketUrl;
      if (!expenseTicketUrl) throw new Error("Укажите ссылку на тикет фактического расхода");
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(allocation.expectedDate));
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(expenseDate));
      const expenseId = payload.expenseId || createId();
      next.expenses.push({
        id: expenseId,
        locationId: allocation.locationId,
        articleId: allocation.articleId,
        subarticleId: allocation.subarticleId,
        currency: allocation.currency,
        amount,
        ticketUrl: expenseTicketUrl,
        comment: cleanText(payload.comment, 500) || allocation.comment || ticket.description,
        expenseDate,
        quarterKey: quarterKeyFromDateInput(expenseDate),
        createdAt: nowIso,
        createdBy: cleanText(payload.author, 80) || "Не указано",
        createdById: null,
        updatedAt: null,
        updatedBy: null,
        updatedById: null,
        status: "active",
        history: [],
        forecastTicketId: ticket.id,
        forecastAllocationId: allocation.id
      });
      refreshForecastConversionState(next, ticket, allocation);
      if (!ticket.ticketUrl) ticket.ticketUrl = expenseTicketUrl;
      ticket.updatedAt = nowIso;
      ticket.updatedBy = cleanText(payload.author, 80) || "Не указано";
      ticket.history = Array.isArray(ticket.history) ? ticket.history.slice(-49) : [];
      ticket.history.push({
        changedAt: nowIso,
        changedBy: ticket.updatedBy,
        action: "forecast-convert",
        allocationId: allocation.id,
        expenseId,
        forecastAmount: allocation.amount,
        actualAmount: amount
      });
    } else if (type === "addExpense") {
      validateExpensePayload(next, payload);
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(payload.expenseDate));
      const article = next.articles.find((a) => a.id === payload.articleId);
      next.expenses.push({
        id: payload.id || createId(),
        locationId: payload.locationId,
        articleId: payload.articleId,
        subarticleId: resolveOptionalSubarticleClient(article, payload.subarticleId),
        currency: normalizeCurrencyCode(payload.currency),
        amount: Number(payload.amount),
        ticketUrl: safeHttpUrl(payload.ticketUrl),
        comment: cleanText(payload.comment, 500),
        expenseDate: payload.expenseDate,
        quarterKey: quarterKeyFromDateInput(payload.expenseDate),
        createdAt: nowIso,
        createdBy: cleanText(payload.author, 80) || "Не указано",
        createdById: null,
        updatedAt: null,
        updatedBy: null,
        updatedById: null,
        status: "active",
        history: []
      });
    } else if (type === "updateExpense") {
      const expense = next.expenses.find((item) => item.id === payload.id);
      if (!expense || expense.status === "canceled") throw new Error("Расход не найден");
      validateExpensePayload(next, payload);
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(expense.expenseDate));
      PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(payload.expenseDate));
      const article = next.articles.find((a) => a.id === payload.articleId);
      const resolvedSubarticleId = resolveOptionalSubarticleClient(article, payload.subarticleId);
      const linkedTicket = expense.forecastTicketId
        ? next.forecastTickets.find((candidate) => candidate.id === expense.forecastTicketId) : null;
      const linkedAllocation = linkedTicket?.allocations.find((candidate) => candidate.id === expense.forecastAllocationId);
      if (linkedAllocation) {
        if (quarterKeyFromDateInput(payload.expenseDate) !== linkedAllocation.quarterKey) {
          throw new Error("Связанный с прогнозом факт нельзя переносить в другой квартал");
        }
        if (payload.locationId !== linkedAllocation.locationId
          || payload.articleId !== linkedAllocation.articleId
          || resolvedSubarticleId !== linkedAllocation.subarticleId
          || normalizeCurrencyCode(payload.currency) !== linkedAllocation.currency) {
          throw new Error("Локация, статья и валюта связанного факта должны совпадать с прогнозом");
        }
      }
      const previous = {
        locationId: expense.locationId,
        articleId: expense.articleId,
        subarticleId: expense.subarticleId,
        currency: expense.currency,
        amount: expense.amount,
        ticketUrl: expense.ticketUrl,
        comment: expense.comment,
        expenseDate: expense.expenseDate
      };
      expense.locationId = payload.locationId;
      expense.articleId = payload.articleId;
      expense.subarticleId = resolvedSubarticleId;
      expense.currency = normalizeCurrencyCode(payload.currency);
      expense.amount = Number(payload.amount);
      expense.ticketUrl = safeHttpUrl(payload.ticketUrl);
      expense.comment = cleanText(payload.comment, 500);
      expense.expenseDate = payload.expenseDate;
      expense.quarterKey = quarterKeyFromDateInput(payload.expenseDate);
      expense.updatedAt = nowIso;
      expense.updatedBy = cleanText(payload.author, 80) || "Не указано";
      expense.history.push({ changedAt: nowIso, changedBy: expense.updatedBy, previous });
      if (linkedTicket && linkedAllocation) refreshForecastConversionState(next, linkedTicket, linkedAllocation);
    } else if (type === "cancelExpense") {
      const expense = next.expenses.find((item) => item.id === payload.id);
      if (!expense) throw new Error("Расход не найден");
      if (expense.status === "canceled") throw new Error("Расход уже аннулирован");
      PeriodLocks.assertExpenseEditable(next, expense);
      const linkedTicket = expense.forecastTicketId
        ? next.forecastTickets.find((candidate) => candidate.id === expense.forecastTicketId) : null;
      const linkedAllocation = linkedTicket?.allocations.find((candidate) => candidate.id === expense.forecastAllocationId);
      if (linkedAllocation) {
        PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(linkedAllocation.expectedDate));
      }
      expense.status = "canceled";
      expense.updatedAt = nowIso;
      expense.updatedBy = cleanText(payload.author, 80) || "Не указано";
      expense.history.push({ changedAt: nowIso, changedBy: expense.updatedBy, action: "canceled" });
      if (expense.forecastTicketId && expense.forecastAllocationId) {
        if (linkedTicket && linkedAllocation) {
          refreshForecastConversionState(next, linkedTicket, linkedAllocation);
          linkedTicket.updatedAt = nowIso;
          linkedTicket.updatedBy = expense.updatedBy;
          linkedTicket.history.push({ changedAt: nowIso, changedBy: expense.updatedBy, action: "forecast-fact-canceled", expenseId: expense.id });
        }
      }
    } else if (type === "restoreExpense") {
      const expense = next.expenses.find((item) => item.id === payload.id);
      if (!expense) throw new Error("Расход не найден");
      if (expense.status !== "canceled") throw new Error("Расход не аннулирован");
      PeriodLocks.assertExpenseEditable(next, expense);
      const linkedTicket = expense.forecastTicketId
        ? next.forecastTickets.find((candidate) => candidate.id === expense.forecastTicketId) : null;
      const linkedAllocation = linkedTicket?.allocations.find((candidate) => candidate.id === expense.forecastAllocationId);
      if (linkedAllocation) {
        PeriodLocks.assertMonthEditable(next, monthKeyFromDateInput(linkedAllocation.expectedDate));
      }
      expense.status = "active";
      expense.updatedAt = nowIso;
      expense.updatedBy = cleanText(payload.author, 80) || "Не указано";
      expense.history.push({ changedAt: nowIso, changedBy: expense.updatedBy, action: "restored" });
      if (expense.forecastTicketId && expense.forecastAllocationId) {
        if (linkedTicket && linkedAllocation) {
          refreshForecastConversionState(next, linkedTicket, linkedAllocation);
          linkedTicket.updatedAt = nowIso;
          linkedTicket.updatedBy = expense.updatedBy;
          linkedTicket.history.push({ changedAt: nowIso, changedBy: expense.updatedBy, action: "forecast-fact-restored", expenseId: expense.id });
        }
      }
    } else if (type === "addComment") {
      const expense = next.expenses.find((item) => item.id === payload.expenseId);
      if (!expense) throw new Error("Расход не найден");
      const text = cleanText(payload.text, 1000);
      if (!text) throw new Error("Введите комментарий");
      next.comments.push({
        id: payload.id || createId(),
        expenseId: expense.id,
        locationId: expense.locationId,
        text,
        createdAt: nowIso,
        createdById: null,
        createdBy: cleanText(payload.author, 80) || "Не указано"
      });
    } else if (type === "saveBudget") {
      if (!/^\d{4}-Q[1-4]$/.test(payload.quarterKey)) throw new Error("Некорректный квартал");
      PeriodLocks.assertQuarterEditable(next, payload.quarterKey);
      const locationId = payload.locationId;
      if (!locationId || locationId === ALL_LOCATIONS) throw new Error("Выберите локацию");
      const storeKey = `${locationId}|${payload.quarterKey}`;
      next.budgets[storeKey] ||= {};
      next.monthlyBudgets ||= {};
      next.monthlyBudgets[storeKey] ||= {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      const touched = new Set(Array.isArray(payload.itemKeys)
        ? payload.itemKeys
        : items.map((item) => {
          const article = next.articles.find((candidate) => candidate.id === item.articleId);
          return budgetItemKey(item.articleId, resolveSubarticleClient(article, item.subarticleId));
        }));
      touched.forEach((itemKey) => {
        delete next.budgets[storeKey][itemKey];
        delete next.monthlyBudgets[storeKey][itemKey];
      });
      items.forEach((item) => {
        const article = next.articles.find((candidate) => candidate.id === item.articleId);
        if (!article || article.archived) return;
        const subarticleId = resolveSubarticleClient(article, item.subarticleId);
        const itemKey = budgetItemKey(article.id, subarticleId);
        const currency = normalizeCurrencyCode(item.currency);
        if (!currency) throw new Error("Проверьте валюты и суммы бюджета");
        next.budgets[storeKey][itemKey] ||= {};
        if (Object.prototype.hasOwnProperty.call(next.budgets[storeKey][itemKey], currency)) {
          throw new Error(`Валюта ${currency} повторяется у статьи проекта ${article.code || article.name}`);
        }
        if (item.months && typeof item.months === "object" && !Array.isArray(item.months)) {
          const closedMonth = quarterMonthKeysFromQuarterKey(payload.quarterKey)
            .find((monthKey) => PeriodLocks.isMonthClosed(next, monthKey));
          if (closedMonth) {
            throw new Error(`Нельзя менять помесячный план: месяц ${closedMonth} закрыт. Сначала переоткройте его.`);
          }
          const months = validateMonthAmounts(item.months, payload.quarterKey);
          next.monthlyBudgets[storeKey][itemKey] ||= {};
          next.monthlyBudgets[storeKey][itemKey][currency] = months;
          next.budgets[storeKey][itemKey][currency] = sumMonthAmounts(months, payload.quarterKey);
        } else {
          const amount = Number(item.amount);
          if (!Number.isFinite(amount) || amount < 0) throw new Error("Проверьте валюты и суммы бюджета");
          next.budgets[storeKey][itemKey][currency] = amount;
        }
      });
      if (!Object.keys(next.monthlyBudgets[storeKey]).length) delete next.monthlyBudgets[storeKey];
    } else if (type === "copyBudget") {
      if (!/^\d{4}-Q[1-4]$/.test(payload.from) || !/^\d{4}-Q[1-4]$/.test(payload.to)) {
        throw new Error("Некорректный квартал");
      }
      PeriodLocks.assertQuarterEditable(next, payload.to);
      const closedMonthInTarget = quarterMonthKeysFromQuarterKey(payload.to)
        .find((monthKey) => PeriodLocks.isMonthClosed(next, monthKey));
      if (closedMonthInTarget) {
        throw new Error(`Нельзя копировать бюджет: месяц ${closedMonthInTarget} закрыт. Сначала переоткройте его.`);
      }
      const locationId = payload.locationId;
      if (!locationId || locationId === ALL_LOCATIONS) throw new Error("Выберите локацию");
      const toKey = `${locationId}|${payload.to}`;
      const fromKey = `${locationId}|${payload.from}`;
      next.budgets[toKey] = deepClone(next.budgets[fromKey] || {});
      next.monthlyBudgets ||= {};
      const copiedMonthly = remapMonthlyBudgetStore(next.monthlyBudgets[fromKey], payload.from, payload.to);
      if (Object.keys(copiedMonthly).length) next.monthlyBudgets[toKey] = copiedMonthly;
      else delete next.monthlyBudgets[toKey];
      next.responsibleGroups ||= {};
      const copiedResponsibles = deepClone(next.responsibleGroups[fromKey] || {});
      if (Object.keys(copiedResponsibles).length) next.responsibleGroups[toKey] = copiedResponsibles;
      else delete next.responsibleGroups[toKey];
      next.projectAttributes ||= {};
      const copiedAttributes = deepClone(next.projectAttributes[fromKey] || {});
      if (Object.keys(copiedAttributes).length) next.projectAttributes[toKey] = copiedAttributes;
      else delete next.projectAttributes[toKey];
    } else if (type === "addLocation") {
      const name = cleanText(payload.name, 120);
      if (!name) throw new Error("Введите название локации");
      const id = cleanText(payload.id, 80) || createId();
      if (id === ALL_LOCATIONS || next.locations.some((l) => l.id === id)) throw new Error("Локация с таким кодом уже существует");
      next.locations.push({ id, name, code: cleanText(payload.code, 80), archived: false });
    } else if (type === "updateLocation") {
      const loc = next.locations.find((l) => l.id === payload.id);
      if (!loc) throw new Error("Локация не найдена");
      const name = cleanText(payload.name, 120);
      if (!name) throw new Error("Введите название локации");
      loc.name = name;
      loc.code = cleanText(payload.code, 80);
    } else if (type === "archiveLocation") {
      const loc = next.locations.find((l) => l.id === payload.id);
      if (!loc) throw new Error("Локация не найдена");
      loc.archived = payload.archived !== false;
    } else if (type === "deleteLocation") {
      const count = next.expenses.filter((e) => e.locationId === payload.id).length;
      if (count > 0) throw new Error(`Невозможно удалить: есть ${count} ${pluralExpensesClient(count)}. Сначала удалите или перенесите их.`);
      const forecastCount = next.forecastTickets.flatMap((ticket) => ticket.allocations || [])
        .filter((allocation) => allocation.locationId === payload.id).length;
      if (forecastCount > 0) throw new Error(`Невозможно удалить: есть ${forecastCount} прогнозных распределений.`);
      next.locations = next.locations.filter((l) => l.id !== payload.id);
      Object.keys(next.budgets).forEach((key) => { if (key.startsWith(`${payload.id}|`)) delete next.budgets[key]; });
      Object.keys(next.monthlyBudgets || {}).forEach((key) => { if (key.startsWith(`${payload.id}|`)) delete next.monthlyBudgets[key]; });
      Object.keys(next.responsibleGroups || {}).forEach((key) => { if (key.startsWith(`${payload.id}|`)) delete next.responsibleGroups[key]; });
      Object.keys(next.projectAttributes || {}).forEach((key) => { if (key.startsWith(`${payload.id}|`)) delete next.projectAttributes[key]; });
    } else if (type === "addArticle") {
      const name = cleanText(payload.name, 120);
      if (!name) throw new Error("Введите название проекта");
      const id = cleanText(payload.id, 80) || createId();
      if (next.articles.some((a) => a.id === id)) throw new Error("Проект с таким кодом уже существует");
      const article = { id, name, code: cleanText(payload.code, 80), budgetType: "manual", imported: false, archived: false, subarticles: [] };
      BudgetImport.createDefaultProjectArticle(article);
      next.articles.push(article);
    } else if (type === "updateArticle") {
      const article = next.articles.find((a) => a.id === payload.id);
      if (!article) throw new Error("Проект не найден");
      const name = cleanText(payload.name, 120);
      if (!name) throw new Error("Введите название проекта");
      article.name = name;
      article.code = cleanText(payload.code, 80);
      (article.subarticles || []).forEach((subarticle) => { subarticle.code = article.code; });
    } else if (type === "archiveArticle") {
      const article = next.articles.find((a) => a.id === payload.id);
      if (!article) throw new Error("Статья не найдена");
      article.archived = payload.archived !== false;
    } else if (type === "deleteArticle") {
      const count = next.expenses.filter((e) => e.articleId === payload.id).length;
      if (count > 0) throw new Error(`Невозможно удалить: есть ${count} ${pluralExpensesClient(count)}.`);
      const forecastCount = next.forecastTickets.flatMap((ticket) => ticket.allocations || [])
        .filter((allocation) => allocation.articleId === payload.id).length;
      if (forecastCount > 0) throw new Error(`Невозможно удалить: есть ${forecastCount} прогнозных распределений.`);
      next.articles = next.articles.filter((a) => a.id !== payload.id);
      Object.keys(next.budgets).forEach((key) => {
        const b = next.budgets[key];
        Object.keys(b).forEach((bk) => { if (bk === payload.id || bk.startsWith(`${payload.id}|`)) delete b[bk]; });
      });
      Object.keys(next.monthlyBudgets || {}).forEach((key) => {
        const b = next.monthlyBudgets[key];
        Object.keys(b).forEach((bk) => { if (bk === payload.id || bk.startsWith(`${payload.id}|`)) delete b[bk]; });
      });
      Object.values(next.responsibleGroups || {}).forEach((assignments) => { delete assignments[payload.id]; });
      Object.values(next.projectAttributes || {}).forEach((attributes) => { delete attributes[payload.id]; });
    } else if (type === "addSubarticle") {
      const article = next.articles.find((a) => a.id === payload.articleId);
      if (!article) throw new Error("Проект не найден");
      const name = cleanText(payload.name, 120);
      if (!name) throw new Error("Введите название статьи проекта");
      const id = cleanText(payload.id, 80) || createId();
      article.subarticles ||= [];
      if (article.subarticles.some((s) => s.id === id)) throw new Error("Статья с таким кодом уже существует в этом проекте");
      article.subarticles.push({ id, name, code: article.code, archived: false });
    } else if (type === "updateSubarticle") {
      const article = next.articles.find((a) => a.id === payload.articleId);
      if (!article) throw new Error("Проект не найден");
      const sub = (article.subarticles || []).find((s) => s.id === payload.subarticleId);
      if (!sub) throw new Error("Статья проекта не найдена");
      const name = cleanText(payload.name, 120);
      if (!name) throw new Error("Введите название статьи проекта");
      sub.name = name;
      sub.code = article.code;
    } else if (type === "deleteSubarticle") {
      const article = next.articles.find((a) => a.id === payload.articleId);
      if (!article) throw new Error("Проект не найден");
      const activeCount = (article.subarticles || []).filter((item) => !item.archived).length;
      if (activeCount <= 1) throw new Error("У проекта должна остаться хотя бы одна статья");
      const count = next.expenses.filter((e) => e.articleId === payload.articleId && e.subarticleId === payload.subarticleId).length;
      if (count > 0) throw new Error(`Невозможно удалить: есть ${count} ${pluralExpensesClient(count)}.`);
      const forecastCount = next.forecastTickets.flatMap((ticket) => ticket.allocations || [])
        .filter((allocation) => allocation.articleId === payload.articleId && allocation.subarticleId === payload.subarticleId).length;
      if (forecastCount > 0) throw new Error(`Невозможно удалить: есть ${forecastCount} прогнозных распределений.`);
      const itemKey = budgetItemKey(payload.articleId, payload.subarticleId);
      if (budgetItemHasValuesClient(next, itemKey)) {
        throw new Error("Невозможно удалить статью: сначала обнулите её бюджет во всех периодах");
      }
      article.subarticles = (article.subarticles || []).filter((s) => s.id !== payload.subarticleId);
      Object.keys(next.budgets).forEach((key) => { delete next.budgets[key][itemKey]; });
      Object.keys(next.monthlyBudgets || {}).forEach((key) => { delete next.monthlyBudgets[key][itemKey]; });
    } else if (type === "closePeriod") {
      const { level, periodKey } = payload || {};
      const actor = cleanText(payload.actor, 80) || currentActorName();
      if (level === "month") {
        PeriodLocks.closeMonth(next, periodKey, { actor, reason: cleanText(payload.reason, 500) });
      } else if (level === "quarter") {
        PeriodLocks.closeQuarter(next, periodKey, { actor, reason: cleanText(payload.reason, 500) });
      } else {
        throw new Error("Неизвестный уровень периода");
      }
    } else if (type === "reopenPeriod") {
      const { level, periodKey } = payload || {};
      const actor = cleanText(payload.actor, 80) || currentActorName();
      const reason = cleanText(payload.reason, 500);
      if (level === "month") {
        PeriodLocks.reopenMonth(next, periodKey, { actor, reason });
      } else if (level === "quarter") {
        PeriodLocks.reopenQuarter(next, periodKey, { actor, reason });
      } else {
        throw new Error("Неизвестный уровень периода");
      }
    } else {
      throw new Error("Неизвестная операция");
    }

    next.revision += 1;
    return next;
  }

  function validateExpensePayload(current, payload) {
    if (!payload.locationId || payload.locationId === ALL_LOCATIONS) {
      throw new Error("Выберите локацию");
    }
    const loc = current.locations.find((l) => l.id === payload.locationId);
    if (!loc || loc.archived) throw new Error("Локация не найдена или архивирована");
    const article = current.articles.find((a) => a.id === payload.articleId && !a.archived);
    if (!article) {
      throw new Error("Выберите проект");
    }
    const subarticleId = resolveOptionalSubarticleClient(article, payload.subarticleId);
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
      throw new Error("Введите сумму больше нуля");
    }
    const currency = normalizeCurrencyCode(payload.currency);
    if (!currency) throw new Error("Выберите валюту расхода");
    const expenseQuarter = validDateInput(payload.expenseDate)
      ? quarterKeyFromDateInput(payload.expenseDate)
      : selectedQuarterKey();
    const plannedCurrencies = plannedCurrenciesForSelection(
      current, payload.locationId, expenseQuarter, payload.articleId, subarticleId
    );
    if (plannedCurrencies.length && !plannedCurrencies.includes(currency)) {
      const scope = subarticleId ? "выбранной статьи проекта" : "проекта";
      throw new Error(`Для ${scope} в этом квартале нет бюджета в ${currency}`);
    }
    if (!safeHttpUrl(payload.ticketUrl)) {
      throw new Error("Укажите корректную ссылку на тикет");
    }
    if (!validDateInput(payload.expenseDate)) {
      throw new Error("Укажите корректную дату расхода");
    }
  }

  function validateForecastPayload(current, payload) {
    if (!payload.locationId || payload.locationId === ALL_LOCATIONS) throw new Error("Выберите локацию");
    const location = current.locations.find((candidate) => candidate.id === payload.locationId);
    if (!location || location.archived) throw new Error("Локация не найдена или архивирована");
    const article = current.articles.find((candidate) => candidate.id === payload.articleId && !candidate.archived);
    if (!article) throw new Error("Выберите проект");
    const subarticleId = resolveOptionalSubarticleClient(article, payload.subarticleId);
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) {
      throw new Error("Введите сумму прогноза больше нуля");
    }
    const currency = normalizeCurrencyCode(payload.currency);
    if (!currency) throw new Error("Выберите валюту прогноза");
    if (!validDateInput(payload.expectedDate)) throw new Error("Укажите корректную ожидаемую дату");
    const quarterKey = quarterKeyFromDateInput(payload.expectedDate);
    const plannedCurrencies = plannedCurrenciesForSelection(
      current, payload.locationId, quarterKey, payload.articleId, subarticleId
    );
    if (plannedCurrencies.length && !plannedCurrencies.includes(currency)) {
      const scope = subarticleId ? "выбранной статьи проекта" : "проекта";
      throw new Error(`Для ${scope} в этом квартале нет бюджета в ${currency}`);
    }
    if (!safeHttpUrl(payload.ticketUrl)) throw new Error("Укажите корректную ссылку на тикет");
  }

  function resolveSubarticleClient(article, subarticleId) {
    const activeSubs = (article?.subarticles || []).filter((s) => !s.archived);
    if (!activeSubs.length) return null;
    if (!subarticleId && activeSubs.length === 1) return activeSubs[0].id;
    if (!subarticleId) throw new Error("Выберите статью проекта");
    const sub = activeSubs.find((s) => s.id === subarticleId);
    if (!sub) throw new Error("Статья проекта не найдена");
    return sub.id;
  }

  function resolveOptionalSubarticleClient(article, subarticleId) {
    if (!subarticleId) return null;
    return resolveSubarticleClient(article, subarticleId);
  }

  function plannedCurrenciesForSelection(current, locationId, quarterKey, articleId, subarticleId) {
    const store = current.budgets?.[budgetStoreKey(locationId, quarterKey)] || {};
    if (subarticleId) {
      return Object.keys(normalizeCurrencyAmounts(store[budgetItemKey(articleId, subarticleId)], DEFAULT_CURRENCY)).sort();
    }
    const currencies = new Set(Object.keys(normalizeCurrencyAmounts(store[articleId], DEFAULT_CURRENCY)));
    Object.entries(store).forEach(([itemKey, amounts]) => {
      if (!itemKey.startsWith(`${articleId}|`)) return;
      Object.keys(normalizeCurrencyAmounts(amounts, DEFAULT_CURRENCY)).forEach((currency) => currencies.add(currency));
    });
    return [...currencies].sort();
  }

  function pluralExpensesClient(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return "расходов";
    if (mod10 === 1) return "расход";
    if (mod10 >= 2 && mod10 <= 4) return "расхода";
    return "расходов";
  }

  async function refreshSharedState() {
    if (authMode === "corporate-idm") await checkCorporateAccess();
    if (!sharedMode || !currentUser || budgetDirty || budgetEditMode || dom.expenseDialog.open
        || dom.forecastDialog.open || dom.userAdminDialog.open) return;
    const epoch = authStateEpoch;
    try {
      const response = await fetch("/api/state", { headers: { Accept: "application/json" }, redirect: "manual" });
      if (response.status === 401 || response.type === "opaqueredirect") {
        handleSessionExpired();
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (epoch !== authStateEpoch) return;
      if (accessResponseEndsSession(response, payload)) {
        handleSessionExpired(CORPORATE_AUTH_MESSAGES[payload.code]);
        return;
      }
      if (!response.ok) return;
      const roleChanged = acceptServerUser(payload.user);
      const fresh = normalizeState(payload.state);
      if (roleChanged || fresh.revision !== state.revision) {
        state = fresh;
        renderAll();
        showToast("Данные обновлены другим пользователем");
      }
    } catch (error) {
      setSaveStatus("Нет связи с общим сервером", true);
    }
  }

  function renderAll() {
    if (!selectedLocation || selectedLocation === ALL_LOCATIONS || !state.locations.some((l) => l.id === selectedLocation)) {
      selectedLocation = loadSelectedLocation();
    }
    populateArticleControls();
    renderLocations();
    renderUser();
    renderOverview();
    renderExpenses();
    renderForecasts();
    renderBudgetEditor();
    renderDataPage();
    renderAccessControls();
    translatePage();
  }

  function renderAccessControls() {
    const admin = isAdminClient();
    const canAddExpense = canEditSelectedLocation();
    dom.addExpenseBtn.hidden = !canAddExpense;
    dom.addForecastBtn.hidden = !canAddExpense;
    document.querySelectorAll(".open-expense-modal").forEach((button) => { button.hidden = !canAddExpense; });
    dom.addLocationBtn.hidden = !admin;
    dom.manageLocationsBtn.hidden = !admin;
    dom.manageProjectsBtn.hidden = !admin;
    dom.openExcelImportBtn.hidden = !admin;
    dom.openExpenseImportBtn.hidden = !canImportExpensesClient();
    dom.restoreCard.hidden = authMode === "corporate-idm" || (sharedMode && !admin);
    dom.adminUsersCard.hidden = !(sharedMode && canManageUsersClient());
    dom.profileForm.hidden = sharedMode;
    dom.sharedProfile.hidden = !sharedMode || !currentUser;
    if (sharedMode && currentUser) {
      dom.sharedProfileName.textContent = currentUser.name;
      dom.sharedProfileRole.textContent = currentUser.role === "superadmin"
        ? "Главный администратор"
        : currentUser.role === "admin" ? "Администратор" : currentUser.role === "member" ? "Участник" : "Пользователь";
      dom.sharedProfileLogin.textContent = authMode === "access-code"
        ? `@${currentUser.staffLogin || ""}` : `@${currentUser.staffLogin || "staff"} · корпоративный SSO`;
      dom.profileDescription.textContent = authMode === "corporate-idm"
        ? "Все локации доступны автоматически. Доступ выдаётся и отзывается только в IDM."
        : authMode === "access-code"
        ? "Вход подтверждён личным кодом доступа. Роль и права по локациям управляются внутри приложения."
        : "Корпоративная identity подтверждается WebAuth. Роль и права по локациям управляются внутри приложения.";
    } else {
      dom.profileDescription.textContent = "Это имя будет записываться в графу «Добавил».";
    }
    dom.adminUsersDescription.textContent = authMode === "access-code"
      ? "Добавляйте пользователей по логину и назначайте роли и права на локации."
      : "Добавляйте сотрудников по Staff login и назначайте роли и права на локации.";
    dom.userLoginLabel.textContent = authMode === "access-code" ? "Логин *" : "Staff login *";
  }

  function renderOverview() {
    const key = selectedQuarterKey();
    const activeProjects = state.articles.filter((article) => !article.archived);
    populateOverviewFilters(activeProjects, key);
    const scope = overviewFilterScope(activeProjects, key);
    const allPeriodExpenses = activeExpensesForQuarter(key);
    const allPeriodForecasts = activeForecastAllocationsForQuarter(key);
    const periodExpenses = allPeriodExpenses
      .filter((expense) => scope.locationIdsByArticle.get(expense.articleId)?.includes(expense.locationId));
    const periodForecasts = allPeriodForecasts
      .filter((allocation) => scope.locationIdsByArticle.get(allocation.articleId)?.includes(allocation.locationId));
    const currentForecastCount = state.forecastTickets
      .flatMap((ticket) => ticket.allocations || [])
      .filter((allocation) => allocation.quarterKey === key
        && scope.locationIdsByArticle.get(allocation.articleId)?.includes(allocation.locationId)
        && ["active", "review"].includes(allocation.lifecycle)).length;
    const metricsByArticle = new Map(scope.articles.map((article) => [article.id,
      overviewMetricsForScope(key, article, null, scope.locationIdsByArticle.get(article.id), periodExpenses, periodForecasts)]));
    const totals = overviewTotalsForScope(metricsByArticle);
    const currencies = Object.keys(totals).sort();
    const rubTotals = convertTotalsToRub(totals, key, state.exchangeRatesByQuarter);
    const convertedTotals = currencyDisplayMode === "original" ? null : rubTotals;

    renderExchangeRates(currencies, totals);
    dom.currencyDisplayMode.value = currencyDisplayMode;

    dom.overviewPeriodLabel.textContent = periodLabel(selectedYear, selectedQuarter);
    renderQuarterStatusBadge(dom.overviewQuarterStatus);
    dom.summaryPlan.innerHTML = displaySummaryMoney(totals, convertedTotals, "plan");
    dom.summaryFact.innerHTML = displaySummaryMoney(totals, convertedTotals, "fact");
    dom.summaryForecast.innerHTML = displaySummaryMoney(totals, convertedTotals, "forecast");
    dom.summaryBalance.innerHTML = displaySummaryMoney(totals, convertedTotals, "free", true);
    dom.summaryBalance.style.color = "";
    dom.summaryProgress.innerHTML = currencies.length ? displayConvertedUtilization(rubTotals) : "0%";
    dom.summaryExpenseCount.textContent = pluralizeExpenses(periodExpenses.length);
    dom.summaryForecastCount.textContent = `${periodForecasts.length} активных распределений`;
    const single = rubTotals.missing.length ? null : rubTotals;
    dom.summaryProgressBar.parentElement.hidden = !single;
    if (single) {
      const ratio = utilization(single.plan, single.expected);
      dom.summaryProgressBar.style.width = `${Math.min(Number.isFinite(ratio) ? ratio : 100, 100)}%`;
      dom.summaryProgressBar.style.background = utilizationColor(ratio);
    }
    const allCurrentForecastCount = state.forecastTickets.flatMap((ticket) => ticket.allocations || [])
      .filter((allocation) => allocation.quarterKey === key
        && effectiveLocationSet().has(allocation.locationId)
        && ["active", "review"].includes(allocation.lifecycle)).length;
    dom.expensesNavCount.textContent = String(allPeriodExpenses.length);
    dom.expensesNavCount.hidden = allPeriodExpenses.length === 0;
    dom.forecastNavCount.textContent = String(allCurrentForecastCount);
    dom.forecastNavCount.hidden = allCurrentForecastCount === 0;
    dom.overviewTableBody.closest("table")?.classList.toggle("is-all-locations", isAllLocationsMode());

    const rows = scope.articles.flatMap((article) => {
      const expanded = expandedOverviewProjects.has(article.id);
      const projectMetrics = metricsByArticle.get(article.id);
      const projectCurrencies = Object.keys(projectMetrics).sort();
      const locationMetrics = isAllLocationsMode()
        ? scope.locationIdsByArticle.get(article.id).map((locationId) => {
            const locationExpenses = periodExpenses.filter((item) => item.locationId === locationId);
            const locationForecasts = periodForecasts.filter((item) => item.locationId === locationId);
            return {
              locationId,
              metrics: overviewMetricsForScope(key, article, null, [locationId], locationExpenses, locationForecasts)
            };
          }).filter((item) => Object.keys(item.metrics).length)
        : [];
      const articleDetails = (locationId) => overviewArticleDetails(key, article, [locationId],
        periodExpenses.filter((item) => item.locationId === locationId),
        periodForecasts.filter((item) => item.locationId === locationId));
      const selectedDetails = isAllLocationsMode() ? [] : articleDetails(selectedLocation);
      const childCount = isAllLocationsMode() ? locationMetrics.length : selectedDetails.length;
      const projectRows = isAllLocationsMode() && currencyDisplayMode === "original"
        ? [overviewProjectGroupRowHtml(article, childCount, expanded)]
        : currencyDisplayMode === "original"
        ? projectCurrencies.map((currency, index) => overviewProjectRowHtml(article, childCount, currency,
            projectMetrics[currency].plan, projectMetrics[currency].fact,
            projectMetrics[currency].forecast, expanded, index === 0))
        : projectCurrencies.length ? [overviewProjectRowHtml(article, childCount, currencyDisplayMode,
            ...convertedMetricsToRub(projectMetrics, key), expanded, true)] : [];
      const locationRows = isAllLocationsMode() ? locationMetrics.flatMap(({ locationId, metrics }) => {
        const detailCurrencies = Object.keys(metrics).sort();
        const summaryRows = currencyDisplayMode === "original"
          ? detailCurrencies.map((currency, index) => overviewProjectLocationRowHtml(article, locationId, currency,
              metrics[currency].plan, metrics[currency].fact, metrics[currency].forecast, expanded, index === 0))
          : detailCurrencies.length ? [overviewProjectLocationRowHtml(article, locationId, currencyDisplayMode,
              ...convertedMetricsToRub(metrics, key), expanded, true)] : [];
        return [...summaryRows, ...overviewArticleRows(article, locationId, articleDetails(locationId), key, expanded)];
      }) : [];
      return [...projectRows, ...locationRows,
        ...overviewArticleRows(article, selectedLocation, selectedDetails, key, expanded)];
    });
    dom.overviewTableBody.innerHTML = rows.join("")
      || '<tr><td colspan="9" class="table-empty">Для этой локации и квартала бюджет пока не заполнен.</td></tr>';

    renderRecentExpenses(periodExpenses);
  }

  function populateOverviewFilters(projects, quarterKey) {
    const currentProject = dom.overviewArticleFilter.value || "all";
    dom.overviewArticleFilter.innerHTML = '<option value="all">Все проекты</option>'
      + projects.map((article) => `<option value="${escapeAttribute(article.id)}">${escapeHtml(article.name)}</option>`).join("");
    dom.overviewArticleFilter.value = projects.some((article) => article.id === currentProject) ? currentProject : "all";
    const responsibles = new Set();
    const services = new Set();
    const legals = new Set();
    const offices = new Set();
    let hasUnassigned = false;
    projects.forEach((article) => effectiveLocationIds().forEach((locationId) => {
      const names = projectResponsibleGroups(article.id, locationId, quarterKey);
      if (names.length) names.forEach((name) => responsibles.add(name)); else hasUnassigned = true;
      const attrs = projectAttributesFor(article.id, locationId, quarterKey);
      if (attrs.service) services.add(attrs.service);
      if (attrs.legalEntity) legals.add(attrs.legalEntity);
      if (attrs.location) offices.add(attrs.location);
    }));
    populateAttributeFilter(dom.overviewResponsibleFilter, dom.overviewResponsibleFilter.value || "all", "Все ответственные", responsibles,
      hasUnassigned ? { unassignedLabel: "Без ответственного" } : {});
    populateAttributeFilter(dom.overviewServiceFilter, dom.overviewServiceFilter.value || "all", "Все сервисы", services);
    populateAttributeFilter(dom.overviewLegalFilter, dom.overviewLegalFilter.value || "all", "Все юр лица", legals);
    populateAttributeFilter(dom.overviewLocationFilter, dom.overviewLocationFilter.value || "all", "Все локации", offices);
  }

  function overviewFilterScope(projects, quarterKey) {
    const query = dom.overviewSearch.value.trim().toLocaleLowerCase("ru");
    const projectFilter = dom.overviewArticleFilter.value;
    const typeFilter = dom.overviewBudgetTypeFilter.value;
    const responsibleFilter = dom.overviewResponsibleFilter.value;
    const serviceFilter = dom.overviewServiceFilter.value;
    const legalFilter = dom.overviewLegalFilter.value;
    const officeFilter = dom.overviewLocationFilter.value;
    const locationIdsByArticle = new Map();
    const matching = projects.filter((article) => {
      if (projectFilter !== "all" && article.id !== projectFilter) return false;
      if (typeFilter !== "all" && normalizeBudgetType(article.budgetType) !== typeFilter) return false;
      if (query) {
        const haystack = [article.name, article.code, ...(article.subarticles || []).flatMap((item) => [item.name, item.code])]
          .join(" ").toLocaleLowerCase("ru");
        if (!haystack.includes(query)) return false;
      }
      const matchingLocations = effectiveLocationIds().filter((locationId) => {
        const names = projectResponsibleGroups(article.id, locationId, quarterKey);
        if (responsibleFilter === UNASSIGNED_RESPONSIBLE && names.length) return false;
        if (responsibleFilter !== "all" && responsibleFilter !== UNASSIGNED_RESPONSIBLE && !names.includes(responsibleFilter)) return false;
        const attrs = projectAttributesFor(article.id, locationId, quarterKey);
        return (serviceFilter === "all" || attrs.service === serviceFilter)
          && (legalFilter === "all" || attrs.legalEntity === legalFilter)
          && (officeFilter === "all" || attrs.location === officeFilter);
      });
      if (!matchingLocations.length) return false;
      locationIdsByArticle.set(article.id, matchingLocations);
      return true;
    });
    return { articles: matching, locationIdsByArticle };
  }

  function overviewMetricsForScope(quarterKey, article, subarticleId, locationIds, expenses, forecasts) {
    const metrics = {};
    const activeItems = activeProjectArticles(article);
    const projectTotal = subarticleId == null;
    const itemKeys = projectTotal
      ? (activeItems.length ? activeItems.map((item) => budgetItemKey(article.id, item.id)) : [article.id])
      : subarticleId
        ? (activeItems.some((item) => item.id === subarticleId) ? [budgetItemKey(article.id, subarticleId)] : [])
        : (activeItems.length ? [] : [article.id]);
    itemKeys.forEach((itemKey) => Object.entries(aggregateBudgetAmounts(state, locationIds, quarterKey, itemKey)).forEach(([currency, amount]) => {
      metrics[currency] ||= { plan: 0, fact: 0, forecast: 0 };
      metrics[currency].plan += amount;
    }));
    expenses.filter((item) => item.articleId === article.id && (projectTotal || (item.subarticleId || "") === subarticleId)).forEach((item) => {
      metrics[item.currency] ||= { plan: 0, fact: 0, forecast: 0 };
      metrics[item.currency].fact += Number(item.amount) || 0;
    });
    forecasts.filter((item) => item.articleId === article.id && (projectTotal || (item.subarticleId || "") === subarticleId)).forEach((item) => {
      metrics[item.currency] ||= { plan: 0, fact: 0, forecast: 0 };
      metrics[item.currency].forecast += Number(item.amount) || 0;
    });
    return metrics;
  }

  function overviewArticleDetails(quarterKey, article, locationIds, expenses, forecasts) {
    if (!(article.subarticles || []).length) return [];
    const items = [...article.subarticles, { id: "", name: translateString("На уровне проекта (без статьи)") }];
    return items.map((item) => ({
      item,
      metrics: overviewMetricsForScope(quarterKey, article, item.id, locationIds, expenses, forecasts)
    })).filter(({ metrics }) => Object.keys(metrics).length);
  }

  function overviewArticleRows(article, locationId, details, quarterKey, expanded) {
    return details.flatMap(({ item, metrics }) => {
      const amounts = currencyDisplayMode === "original"
        ? Object.keys(metrics).sort().map((currency) => [currency,
            metrics[currency].plan, metrics[currency].fact, metrics[currency].forecast])
        : [[currencyDisplayMode, ...convertedMetricsToRub(metrics, quarterKey)]];
      return amounts.map(([currency, plan, fact, forecast]) => `
        <tr class="overview-project-detail-row overview-project-article-row" data-overview-parent-project-id="${escapeAttribute(article.id)}" data-overview-subarticle-id="${escapeAttribute(item.id)}" data-overview-location-id="${escapeAttribute(locationId)}"${expanded ? "" : " hidden"}>
          <td class="budget-project-article-cell"><span class="budget-article-branch" aria-hidden="true">↳</span><strong>${escapeHtml(item.name)}</strong></td>
          <td>${projectCodeHtml(article.code)}</td>
          <td class="overview-location-cell">${escapeHtml(locationById(locationId)?.name || "")}</td>
          ${overviewMetricsCells(plan, fact, forecast, currency)}
        </tr>`);
    });
  }

  function overviewTotalsForScope(metricsByArticle) {
    const totals = {};
    metricsByArticle.forEach((metrics) => Object.entries(metrics).forEach(([currency, item]) => {
      totals[currency] ||= { plan: 0, fact: 0, forecast: 0, balance: 0, free: 0, expected: 0 };
      totals[currency].plan += item.plan;
      totals[currency].fact += item.fact;
      totals[currency].forecast += item.forecast;
    }));
    Object.values(totals).forEach((item) => {
      item.balance = item.plan - item.fact;
      item.free = item.plan - item.fact - item.forecast;
      item.expected = item.fact + item.forecast;
    });
    return totals;
  }

  function convertedMetricsToRub(metrics, quarterKey) {
    let plan = 0; let fact = 0; let forecast = 0;
    for (const [currency, item] of Object.entries(metrics)) {
      const rate = convertToRub(1, currency, quarterKey, state.exchangeRatesByQuarter);
      if (rate == null) return [null, null, null];
      plan += item.plan * rate;
      fact += item.fact * rate;
      forecast += item.forecast * rate;
    }
    return [plan, fact, forecast];
  }

  function overviewMetricsCells(plan, fact, forecast, currency) {
    if ([plan, fact, forecast].some((value) => value == null)) {
      return `<td><span class="currency-badge">${escapeHtml(currency)}</span></td><td colspan="5" class="table-empty">Нет курса для пересчёта</td>`;
    }
    const free = plan - fact - forecast;
    const expected = fact + forecast;
    const ratio = utilization(plan, expected);
    const indicator = utilizationClass(ratio);
    const width = Math.min(Number.isFinite(ratio) ? ratio : 100, 100);
    const ratioLabel = plan === 0 && expected > 0 ? ">100%" : `${formatPercent(ratio)}%`;
    return `<td><span class="currency-badge">${escapeHtml(currency)}</span></td>
      <td class="number-cell">${formatMoney(plan, currency)}</td>
      <td class="number-cell overview-fact-value">${formatMoney(fact, currency)}</td>
      <td class="number-cell overview-reserved-value">${formatMoney(forecast, currency)}</td>
      <td class="number-cell ${free < 0 ? "balance-negative" : "balance-positive"}">${formatMoney(free, currency)}</td>
      <td><div class="usage-cell ${indicator}"><div class="usage-track"><span style="width:${width}%"></span></div><b>${ratioLabel}</b></div></td>`;
  }

  function overviewProjectRowHtml(article, articleCount, currency, plan, fact, forecast, expanded, firstRow) {
    const childLabel = isAllLocationsMode() ? projectLocationCountLabel(articleCount) : projectArticleCountLabel(articleCount);
    const projectCell = firstRow
      ? (isAllLocationsMode() || articleCount > 0 ? `<button class="budget-project-heading" type="button" data-overview-project-toggle aria-expanded="${expanded}" aria-label="${escapeAttribute(`${article.name}: ${childLabel}`)}">
          <i class="budget-project-chevron" aria-hidden="true">›</i>
          <span><strong>${escapeHtml(article.name)}</strong><small>${escapeHtml(childLabel)}</small></span>${budgetTypeBadge(article)}
        </button>` : `<span class="overview-project-heading-static"><strong>${escapeHtml(article.name)}</strong>${budgetTypeBadge(article)}</span>`)
      : `<span class="overview-project-currency-continuation">${escapeHtml(article.name)}</span>`;
    return `<tr class="budget-project-summary-row overview-project-summary-row${expanded ? " is-expanded" : ""}" data-overview-project-id="${escapeAttribute(article.id)}">
      <td>${projectCell}</td><td>${projectCodeHtml(article.code)}</td><td class="overview-location-cell">${firstRow && isAllLocationsMode() ? "Все локации" : ""}</td>${overviewMetricsCells(plan, fact, forecast, currency)}</tr>`;
  }

  function overviewProjectGroupRowHtml(article, locationCount, expanded) {
    const childLabel = projectLocationCountLabel(locationCount);
    return `<tr class="budget-project-summary-row overview-project-summary-row${expanded ? " is-expanded" : ""}" data-overview-project-id="${escapeAttribute(article.id)}">
      <td><button class="budget-project-heading" type="button" data-overview-project-toggle aria-expanded="${expanded}" aria-label="${escapeAttribute(`${article.name}: ${childLabel}`)}">
        <i class="budget-project-chevron" aria-hidden="true">›</i>
        <span><strong>${escapeHtml(article.name)}</strong><small>${escapeHtml(childLabel)}</small></span>${budgetTypeBadge(article)}
      </button></td>
      <td>${projectCodeHtml(article.code)}</td>
      <td class="overview-location-cell">Все локации</td>
      <td><span class="currency-badge overview-mixed-currency">Разные</span></td>
      <td class="number-cell overview-group-hint" colspan="5">Раскройте проект для просмотра сумм по локациям</td>
    </tr>`;
  }

  function overviewProjectLocationRowHtml(article, locationId, currency, plan, fact, forecast, expanded, firstRow) {
    const locationName = locationById(locationId)?.name || "Локация не найдена";
    const projectCell = firstRow
      ? `<span class="budget-article-branch" aria-hidden="true">↳</span><strong>${escapeHtml(article.name)}</strong>`
      : `<span class="overview-project-currency-continuation">${escapeHtml(article.name)}</span>`;
    return `<tr class="overview-project-detail-row overview-project-location-row" data-overview-parent-project-id="${escapeAttribute(article.id)}"${expanded ? "" : " hidden"}>
      <td class="budget-project-article-cell">${projectCell}</td><td>${projectCodeHtml(article.code)}</td>
      <td class="overview-location-cell"><strong class="overview-location-name">${escapeHtml(locationName)}</strong></td>
      ${overviewMetricsCells(plan, fact, forecast, currency)}</tr>`;
  }

  function projectLocationCountLabel(count) {
    if (language === "en") return `${count} location${count === 1 ? "" : "s"}`;
    const word = count % 10 === 1 && count % 100 !== 11
      ? "локация"
      : ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "локации" : "локаций");
    return `${count} ${word}`;
  }

  function handleOverviewProjectToggle(event) {
    const button = event.target.closest("[data-overview-project-toggle]");
    const row = button?.closest("[data-overview-project-id]");
    const projectId = row?.dataset.overviewProjectId;
    if (!projectId) return;
    if (expandedOverviewProjects.has(projectId)) expandedOverviewProjects.delete(projectId);
    else expandedOverviewProjects.add(projectId);
    renderOverview();
  }

  function renderRecentExpenses(expenses) {
    const recent = [...expenses].sort(compareExpensesNewestFirst).slice(0, 5);
    if (!recent.length) {
      dom.recentExpenses.innerHTML = '<div class="empty-inline">В выбранном квартале расходов пока нет.</div>';
      return;
    }
    dom.recentExpenses.innerHTML = recent.map((expense) => {
      const article = articleById(expense.articleId);
      const projectArticle = subarticleById(expense.articleId, expense.subarticleId);
      return `
        <div class="recent-row">
          <time datetime="${escapeHtml(expense.expenseDate)}">${formatDate(expense.expenseDate)}</time>
          <div><strong>${escapeHtml(article?.name || "Неизвестный проект")}</strong><small>${escapeHtml(projectArticle?.name || "На уровне проекта")}</small></div>
          <a class="recent-ticket" href="${escapeAttribute(expense.ticketUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ticketLabel(expense.ticketUrl))}</a>
          <strong class="number-cell">${formatMoneyForDisplay(expense.amount, expense.currency, expense.quarterKey)}</strong>
        </div>`;
    }).join("");
  }

  function renderExpenses() {
    dom.expensesPeriodLabel.textContent = periodLabel(selectedYear, selectedQuarter);
    renderQuarterStatusBadge(dom.expensesQuarterStatus);
    const showLocationColumn = isAllLocationsMode();
    const expensesTable = dom.expensesTableBody?.parentElement;
    if (expensesTable) expensesTable.classList.toggle("is-all-locations", showLocationColumn);

    const expenses = filteredExpensesForCurrentView();
    if (dom.expenseExportFilterHint) {
      dom.expenseExportFilterHint.textContent = `Выгрузка CSV учитывает выбранные фильтры: ${pluralizeExpenses(expenses.length)}.`;
    }

    dom.expensesTableBody.innerHTML = expenses.map((expense) => {
      const article = articleById(expense.articleId);
      const projectArticle = subarticleById(expense.articleId, expense.subarticleId);
      const canceled = expense.status === "canceled";
      const editable = canEditExpense(expense);
      const periodClosed = PeriodLocks.isMonthClosed(state, monthKeyFromDateInput(expense.expenseDate));
      const commentCount = state.comments.filter((comment) => comment.expenseId === expense.id).length;
      const highlighted = expense.id === recentlyCreatedExpenseId;
      return `
        <tr class="${canceled ? "canceled-row" : ""}${highlighted ? " is-newly-created" : ""}" data-expense-id="${escapeAttribute(expense.id)}"${highlighted ? ' tabindex="-1"' : ""}>
          <td>
            <time datetime="${escapeHtml(expense.expenseDate)}">${formatDate(expense.expenseDate)}</time>
            ${canceled ? '<span class="status-label">Аннулирован</span>' : ""}
          </td>
          <td class="expense-article-cell">
            <strong>${escapeHtml(article?.name || "Неизвестный проект")}</strong>
            <small>${escapeHtml(projectArticle?.name || "На уровне проекта")}${projectArticle?.code ? ` · ${escapeHtml(projectArticle.code)}` : ""}</small>
            <small>${escapeHtml(article?.code || "Код проекта не задан")}</small>
          </td>
          <td class="expense-location-cell">${escapeHtml(locationById(expense.locationId)?.name || "—")}</td>
          <td class="number-cell"><strong>${formatMoneyForDisplay(expense.amount, expense.currency, expense.quarterKey)}</strong><small class="amount-currency">${escapeHtml(currencyDisplayMode === "original" ? expense.currency : "RUB")}</small></td>
          <td><a class="ticket-link" href="${escapeAttribute(expense.ticketUrl)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(ticketLabel(expense.ticketUrl))}</span> ↗</a></td>
          <td class="comment-cell" title="${escapeAttribute(expense.comment || "")}">${escapeHtml(expense.comment || "—")}</td>
          <td title="${escapeAttribute(`${translateString("Создано")} ${formatDateTime(expense.createdAt)}`)}">${escapeHtml(expense.createdBy)}</td>
          <td class="actions-cell">
            <div class="row-actions">
              ${canCommentExpense(expense) ? `<button class="row-action comment-action" type="button" data-action="comments" data-id="${escapeAttribute(expense.id)}" aria-label="Комментарии" title="Комментарии">◌${commentCount ? `<span>${commentCount}</span>` : ""}</button>` : ""}
              ${canceled && editable && !periodClosed ? `<button class="row-action success" type="button" data-action="restore" data-id="${escapeAttribute(expense.id)}" aria-label="Вернуть" title="Вернуть из аннулированных">↺</button>` : ""}
              ${!canceled && editable && !periodClosed ? `<button class="row-action" type="button" data-action="edit" data-id="${escapeAttribute(expense.id)}" aria-label="Редактировать" title="Редактировать">✎</button>
                <button class="row-action danger" type="button" data-action="cancel" data-id="${escapeAttribute(expense.id)}" aria-label="Аннулировать" title="Аннулировать">×</button>` : ""}
              ${periodClosed ? `<span class="period-close-status is-closed" title="Месяц расхода закрыт — финансовые изменения заблокированы">Период закрыт</span>` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");

    dom.expensesEmpty.hidden = expenses.length > 0;
    dom.expensesTableBody.parentElement.hidden = expenses.length === 0;
  }

  function currentExpenseFilters() {
    return {
      quarterKey: selectedQuarterKey(),
      search: dom.expenseSearch.value.trim().toLocaleLowerCase("ru"),
      articleId: dom.expenseArticleFilter.value,
      status: dom.expenseStatusFilter.value,
      responsible: dom.expenseResponsibleFilter?.value || "all",
      budgetType: dom.expenseBudgetTypeFilter?.value || "all",
      service: dom.expenseServiceFilter?.value || "all",
      legalEntity: dom.expenseLegalFilter?.value || "all",
      location: dom.expenseLocationFilter?.value || "all"
    };
  }

  function expenseMatchesCurrentView(expense, filters) {
    if (expense.quarterKey !== filters.quarterKey || !effectiveLocationSet().has(expense.locationId)) return false;
    if (filters.articleId !== "all" && expense.articleId !== filters.articleId) return false;
    if (filters.status === "active" && expense.status === "canceled") return false;
    if (filters.status === "canceled" && expense.status !== "canceled") return false;
    if (!expenseMatchesResponsible(expense, filters.responsible)) return false;
    if (!expenseMatchesBudgetType(expense, filters.budgetType)) return false;
    if (!expenseMatchesAttributeFilters(expense, filters)) return false;
    if (!filters.search) return true;
    const article = articleById(expense.articleId);
    const projectArticle = subarticleById(expense.articleId, expense.subarticleId);
    const discussion = state.comments.filter((comment) => comment.expenseId === expense.id).map((comment) => comment.text).join(" ");
    return [article?.name, article?.code, projectArticle?.name, projectArticle?.code, expense.ticketUrl, expense.comment,
      discussion, expense.createdBy, expense.currency, expense.amount].join(" ").toLocaleLowerCase("ru").includes(filters.search);
  }

  function filteredExpensesForCurrentView(filters = currentExpenseFilters()) {
    return state.expenses.filter((expense) => expenseMatchesCurrentView(expense, filters)).sort(compareExpensesNewestFirst);
  }

  function ticketSearchTerms(value) {
    const normalized = String(value || "").trim().toLocaleUpperCase("ru");
    if (!normalized) return [];
    const digits = normalized.match(/\d+/g)?.join("") || "";
    return [...new Set([normalized, digits].filter((term) => term.length >= 2))];
  }

  function ticketFieldsMatch(fields, query) {
    const terms = ticketSearchTerms(query);
    if (!terms.length) return false;
    const haystack = fields.filter(Boolean).join(" ").toLocaleUpperCase("ru");
    return terms.some((term) => haystack.includes(term));
  }

  function globalTicketSearchResults(current, query) {
    const results = [];
    (current.expenses || []).forEach((expense) => {
      if (!ticketFieldsMatch([expense.ticketUrl, expense.sourceKey], query)) return;
      results.push({
        kind: "expense", expenseId: expense.id, locationId: expense.locationId,
        quarterKey: expense.quarterKey, ticket: expense.sourceKey || ticketLabel(expense.ticketUrl),
        description: expense.comment || "Фактический расход", amount: expense.amount, currency: expense.currency
      });
    });
    (current.forecastTickets || []).forEach((ticket) => {
      const fields = [ticket.ticketUrl, ticket.trackerIssueKey, ticket.sourceTicketKey, ticket.sourceRequestNumber];
      if (!ticketFieldsMatch(fields, query)) return;
      (ticket.allocations || []).forEach((allocation) => results.push({
        kind: "forecast", ticketId: ticket.id, allocationId: allocation.id, locationId: allocation.locationId,
        quarterKey: allocation.quarterKey, ticket: ticket.trackerIssueKey || ticket.sourceTicketKey
          || ticket.sourceRequestNumber || ticketLabel(ticket.ticketUrl),
        description: allocation.comment || ticket.description || "Прогноз", amount: allocation.amount,
        currency: allocation.currency
      }));
    });
    return results.sort((left, right) => String(right.quarterKey).localeCompare(String(left.quarterKey)));
  }

  function handleGlobalTicketSearch(event) {
    event.preventDefault();
    const query = dom.globalTicketSearch.value.trim();
    if (query.length < 2) {
      showToast("Введите номер тикета", true);
      return;
    }
    const results = globalTicketSearchResults(state, query);
    dom.globalTicketSearchSummary.textContent = results.length
      ? `Найдено записей: ${results.length}` : `По запросу «${query}» ничего не найдено`;
    dom.globalTicketSearchResults.innerHTML = results.length ? results.map((result, index) => {
      const location = state.locations.find((item) => item.id === result.locationId);
      return `<button class="global-ticket-search-result" type="button" data-result-index="${index}">
        <strong>${escapeHtml(result.ticket || "Тикет")}</strong>
        <span>${escapeHtml(result.kind === "expense" ? "Расход" : "Прогноз")}</span>
        <small>${escapeHtml(result.description)} · ${escapeHtml(result.quarterKey || "Период не задан")} · ${escapeHtml(location?.name || "Локация не задана")} · ${escapeHtml(formatGroupedNumber(result.amount))} ${escapeHtml(result.currency || "")}</small>
      </button>`;
    }).join("") : '<div class="global-ticket-search-empty">Проверьте номер или найдите тикет в Tracker.</div>';
    dom.globalTicketSearchResults._results = results;
    dom.globalTicketSearchDialog.showModal();
  }

  function closeGlobalTicketSearch() {
    dom.globalTicketSearchDialog.close();
  }

  function handleGlobalTicketSearchResult(event) {
    const button = event.target.closest("[data-result-index]");
    if (!button) return;
    const result = dom.globalTicketSearchResults._results?.[Number(button.dataset.resultIndex)];
    const period = String(result?.quarterKey || "").match(/^(\d{4})-Q([1-4])$/);
    if (!result || !period) return;
    selectedYear = Number(period[1]);
    selectedQuarter = Number(period[2]);
    selectedLocation = result.locationId;
    populateYearOptions();
    setPeriodControls();
    saveSelectedLocation();
    closeGlobalTicketSearch();
    if (result.kind === "expense") {
      resetExpenseFiltersForCreatedExpense();
      dom.expenseSearch.value = result.ticket;
      navigate("expenses");
    } else {
      dom.forecastSearch.value = result.ticket;
      dom.forecastArticleFilter.value = "all";
      dom.forecastLifecycleFilter.value = "all";
      navigate("forecast");
    }
    renderAll();
  }

  function renderForecasts() {
    const key = selectedQuarterKey();
    dom.forecastPeriodLabel.textContent = periodLabel(selectedYear, selectedQuarter);
    renderQuarterStatusBadge(dom.forecastQuarterStatus);
    renderForecastRows(key, {
      search: dom.forecastSearch.value.trim().toLocaleLowerCase("ru"),
      articleFilter: dom.forecastArticleFilter.value,
      lifecycleFilter: dom.forecastLifecycleFilter.value,
      serviceFilter: "all",
      legalFilter: "all",
      locationFilter: "all",
      responsibleFilter: "all",
      budgetTypeFilter: "all"
    });
  }

  function forecastLifecycleMeta(allocation) {
    if (allocation.lifecycle === "active" && Number(allocation.convertedAmount) > 0) {
      return ["Частично оплачен", "is-active"];
    }
    if (allocation.lifecycle === "active") return ["Зарезервирован", "is-active"];
    if (allocation.lifecycle === "released") return ["Освобождён", "is-released"];
    if (allocation.lifecycle === "converted") return ["Оплачен", "is-converted"];
    return ["На проверке", "is-review"];
  }

  function renderForecastRows(key, filters) {
    const locationSet = effectiveLocationSet();
    const rows = state.forecastTickets.flatMap((ticket) => (ticket.allocations || []).map((allocation) => ({ ticket, allocation })))
      .filter(({ allocation }) => allocation.quarterKey === key && locationSet.has(allocation.locationId))
      .filter(({ allocation }) => filters.articleFilter === "all" || allocation.articleId === filters.articleFilter)
      .filter(({ allocation }) => filters.lifecycleFilter === "all"
        || (filters.lifecycleFilter === "current" && ["active", "review"].includes(allocation.lifecycle))
        || allocation.lifecycle === filters.lifecycleFilter)
      .filter(({ allocation }) => expenseMatchesResponsible(allocation, filters.responsibleFilter))
      .filter(({ allocation }) => expenseMatchesBudgetType(allocation, filters.budgetTypeFilter))
      .filter(({ allocation }) => expenseMatchesAttributeFilters(allocation, {
        service: filters.serviceFilter, legalEntity: filters.legalFilter, location: filters.locationFilter
      }))
      .filter(({ ticket, allocation }) => {
        if (!filters.search) return true;
        const article = articleById(allocation.articleId);
        const projectArticle = subarticleById(allocation.articleId, allocation.subarticleId);
        return [
          article?.name, article?.code, projectArticle?.name, projectArticle?.code,
          ticket.ticketUrl, ticket.sourceRequestNumber, ticket.description, ticket.supplier,
          allocation.comment, allocation.sourceStatus, allocation.currency, allocation.amount
        ].join(" ").toLocaleLowerCase("ru").includes(filters.search);
      })
      .sort((left, right) => right.allocation.expectedDate.localeCompare(left.allocation.expectedDate)
        || right.ticket.createdAt.localeCompare(left.ticket.createdAt));

    dom.forecastTable.classList.toggle("is-all-locations", isAllLocationsMode());
    const today = toDateInputValue(new Date());
    dom.forecastTableBody.innerHTML = rows.map(({ ticket, allocation }) => {
      const article = articleById(allocation.articleId);
      const projectArticle = subarticleById(allocation.articleId, allocation.subarticleId);
      const [statusLabel, statusClass] = forecastLifecycleMeta(allocation);
      const editable = canEditForecastAllocation(ticket, allocation);
      const periodClosed = PeriodLocks.isMonthClosed(state, monthKeyFromDateInput(allocation.expectedDate));
      const overdue = allocation.lifecycle === "active" && allocation.expectedDate < today;
      const canResolve = editable && !periodClosed && ["active", "review"].includes(allocation.lifecycle);
      const remainingAmount = forecastAllocationRemainingAmount(state, ticket.id, allocation);
      const rowClass = allocation.lifecycle === "released" ? "canceled-row" : allocation.lifecycle === "review" ? "forecast-review-row" : "";
      return `<tr class="${rowClass}">
        <td><time datetime="${escapeHtml(allocation.expectedDate)}">${formatDate(allocation.expectedDate)}</time>
          ${overdue ? '<span class="status-label is-overdue">Просрочен</span>' : ""}
          ${allocation.stale ? '<span class="status-label is-stale">Нет в свежем отчёте</span>' : ""}
        </td>
        <td class="expense-article-cell"><strong>${escapeHtml(article?.name || "Неизвестный проект")}</strong>
          <small>${escapeHtml(projectArticle?.name || "На уровне проекта")}</small><small>${escapeHtml(article?.code || "Код проекта не задан")}</small></td>
        <td class="expense-location-cell">${escapeHtml(locationById(allocation.locationId)?.name || "—")}</td>
        <td class="number-cell"><strong>${formatMoneyForDisplay(remainingAmount, allocation.currency, allocation.quarterKey)}</strong><small class="amount-currency">${escapeHtml(currencyDisplayMode === "original" ? allocation.currency : "RUB")}${remainingAmount < allocation.amount ? ` · из ${escapeHtml(formatGroupedNumber(allocation.amount))}` : ""}</small></td>
        <td>${ticket.ticketUrl
          ? `<a class="ticket-link" href="${escapeAttribute(ticket.ticketUrl)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(ticket.sourceRequestNumber || ticketLabel(ticket.ticketUrl))}</span> ↗</a>`
          : `<span>${escapeHtml(ticket.sourceRequestNumber || "Без ссылки")}</span>`}
          <small>${escapeHtml(allocation.sourceStatus || "Ручной прогноз")}</small></td>
        <td><span class="forecast-status ${statusClass}">${statusLabel}</span>${allocation.releaseReason ? `<small title="${escapeAttribute(allocation.releaseReason)}">${escapeHtml(allocation.releaseReason)}</small>` : ""}</td>
        <td class="comment-cell" title="${escapeAttribute(allocation.comment || ticket.description || "")}">${escapeHtml(allocation.comment || ticket.description || "—")}</td>
        <td class="actions-cell"><div class="row-actions">
          ${canResolve ? `<button class="row-action" type="button" data-forecast-action="edit" data-ticket-id="${escapeAttribute(ticket.id)}" data-allocation-id="${escapeAttribute(allocation.id)}" title="Редактировать или перенести">✎</button>
            <button class="row-action success" type="button" data-forecast-action="convert" data-ticket-id="${escapeAttribute(ticket.id)}" data-allocation-id="${escapeAttribute(allocation.id)}" title="Записать фактический расход">✓</button>
            <button class="row-action danger" type="button" data-forecast-action="release" data-ticket-id="${escapeAttribute(ticket.id)}" title="Освободить весь тикет">×</button>` : ""}
          ${editable && !periodClosed && allocation.lifecycle === "released" && allocation.lifecycleSource === "manual" ? `<button class="row-action success" type="button" data-forecast-action="restore" data-ticket-id="${escapeAttribute(ticket.id)}" title="Вернуть резерв">↺</button>` : ""}
          ${periodClosed ? '<span class="period-close-status is-closed">Период закрыт</span>' : ""}
        </div></td>
      </tr>`;
    }).join("");
    dom.forecastsEmpty.hidden = rows.length > 0;
    dom.forecastTable.hidden = rows.length === 0;
  }

  function renderBudgetEditor() {
    const key = selectedQuarterKey();
    const monthKeys = quarterMonthKeysFromQuarterKey(key);
    dom.budgetEditorPeriod.textContent = periodLabel(selectedYear, selectedQuarter);
    dom.budgetEditorBody.closest("table")?.querySelectorAll("[data-budget-month-header]").forEach((header, index) => {
      const monthKey = monthKeys[index];
      const closed = PeriodLocks.isMonthClosed(state, monthKey);
      header.textContent = formatMonthLabel(monthKey);
      header.classList.toggle("is-month-closed", closed);
      header.title = closed ? "Месяц закрыт — план этого месяца не редактируется" : "";
    });
    const selectedImport = [...(Array.isArray(state.imports) ? state.imports : [])]
      .reverse().find((item) => item.quarterKey === key) || null;
    dom.budgetReimportWarning.hidden = !(selectedImport
      && !Number(selectedImport.projectArticles)
      && state.articles.some((article) => article.imported === true));
    const currentAssignments = state.responsibleGroups?.[budgetStoreKey(selectedLocation, key)] || {};
    dom.budgetResponsibleReimportWarning.hidden = !(selectedImport
      && !Object.keys(currentAssignments).length
      && state.articles.some((article) => article.imported === true));
    const activeProjects = state.articles.filter((article) => !article.archived);
    populateBudgetResponsibleFilter(activeProjects, key);
    populateBudgetAttributeFilters(activeProjects, key);
    const responsibleLookup = (article) => projectResponsibleGroups(article.id, selectedLocation, key);
    const attrLookup = (article) => projectAttributesFor(article.id, selectedLocation, key);
    const locale = language === "en" ? "en" : "ru";
    const matchingProjects = filterProjectsByAttribute(
      filterProjectsByAttribute(
        filterProjectsByResponsible(
          filterProjectsByBudgetType(filterProjectsByQuery(activeProjects, dom.budgetProjectSearch?.value), dom.budgetTypeFilter.value),
          dom.budgetResponsibleFilter.value,
          responsibleLookup
        ),
        dom.budgetServiceFilter.value,
        (project) => attrLookup(project).service
      ),
      dom.budgetLegalFilter.value,
      (project) => attrLookup(project).legalEntity
    );
    const groups = groupArticlesByBudgetType(matchingProjects);
    let projectNumber = 0;
    dom.budgetEditorBody.innerHTML = groups.length ? groups.map((group) => {
      const section = budgetSectionMeta(group.type);
      const rows = group.articles.map((article, projectIndex) => {
        const projectArticles = projectArticlesForContext(article, selectedLocation, key);
        const expanded = expandedBudgetProjects.has(article.id);
        projectNumber += 1;
        const articleRows = projectArticles.map((projectArticle, projectArticleIndex) => {
          const itemKey = budgetItemKey(article.id, projectArticle.id);
          const amounts = isAllLocationsMode() ? budgetAmountsFor(key, itemKey) : budgetAmounts(selectedLocation, key, itemKey);
          const monthlyAmounts = isAllLocationsMode() ? budgetMonthlyAmountsFor(key, itemKey) : budgetMonthlyAmounts(selectedLocation, key, itemKey);
          const currencies = [...new Set([...Object.keys(amounts), ...Object.keys(monthlyAmounts)])].sort();
          const currencyRows = currencies.length ? currencies : [null];
          return currencyRows.map((currency, currencyIndex) => budgetCurrencyRowHtml(
            article, projectArticle, projectIndex, projectArticleIndex, currency,
            currency == null ? 0 : amounts[currency],
            currency == null ? null : monthlyAmounts[currency], currencyIndex === 0, expanded
          )).join("");
        }).join("");
        return `${budgetProjectSummaryRowHtml(article, projectArticles.length, projectNumber, expanded, key)}${articleRows}`;
      }).join("");
      return `${budgetSectionRowHtml(section, group.articles.length)}${rows}`;
    }).join("") : `<tr><td colspan="8" class="table-empty">${escapeHtml(translateString(
      dom.budgetProjectSearch?.value.trim() || dom.budgetTypeFilter.value !== "all" || dom.budgetResponsibleFilter.value !== "all"
        || dom.budgetServiceFilter.value !== "all" || dom.budgetLegalFilter.value !== "all"
        ? "Проекты по запросу не найдены."
        : "Проекты пока не добавлены."
    ))}</td></tr>`;
    budgetDirty = false;
    renderBudgetEditControls();
    updateBudgetEditorTotal();
  }

  function groupArticlesByBudgetType(articles, comparator = null) {
    const order = ["opex", "capex", "manual"];
    return order.map((type) => ({
      type,
      articles: (Array.isArray(articles) ? articles : [])
        .filter((article) => (normalizeBudgetType(article?.budgetType) || "manual") === type)
        .sort(comparator || ((left, right) => compareProjectsByName(left, right, language === "en" ? "en" : "ru")))
    })).filter((group) => group.articles.length);
  }

  function compareProjectsByName(left, right, locale = "ru") {
    return String(left?.name || "").localeCompare(String(right?.name || ""), locale)
      || String(left?.code || "").localeCompare(String(right?.code || ""), locale);
  }

  function filterProjectsByResponsible(projects, selectedResponsible, responsibleLookup = () => []) {
    const source = Array.isArray(projects) ? projects : [];
    if (!selectedResponsible || selectedResponsible === "all") return [...source];
    if (selectedResponsible === UNASSIGNED_RESPONSIBLE) {
      return source.filter((project) => !(responsibleLookup(project) || []).length);
    }
    return source.filter((project) => (responsibleLookup(project) || []).includes(selectedResponsible));
  }

  function populateBudgetResponsibleFilter(projects, quarterKey) {
    const current = dom.budgetResponsibleFilter.value || "all";
    const names = new Set((Array.isArray(projects) ? projects : [])
      .flatMap((project) => projectResponsibleGroups(project.id, selectedLocation, quarterKey)));
    const hasUnassigned = (Array.isArray(projects) ? projects : [])
      .some((project) => !projectResponsibleGroups(project.id, selectedLocation, quarterKey).length);
    populateAttributeFilter(
      dom.budgetResponsibleFilter, current, "Все ответственные", names,
      hasUnassigned ? { unassignedLabel: "Без ответственного" } : {}
    );
  }

  function populateBudgetAttributeFilters(projects, quarterKey) {
    const attrs = (Array.isArray(projects) ? projects : [])
      .map((project) => projectAttributesFor(project.id, selectedLocation, quarterKey));
    const services = new Set(attrs.map((attr) => attr.service).filter(Boolean));
    const legals = new Set(attrs.map((attr) => attr.legalEntity).filter(Boolean));
    populateAttributeFilter(dom.budgetServiceFilter, dom.budgetServiceFilter.value || "all", "Все сервисы", services);
    populateAttributeFilter(dom.budgetLegalFilter, dom.budgetLegalFilter.value || "all", "Все юр лица", legals);
  }

  function filterProjectsByQuery(projects, query) {
    const needle = String(query || "").trim().toLocaleLowerCase("ru");
    const source = Array.isArray(projects) ? projects : [];
    if (!needle) return [...source];
    return source.filter((project) => `${project?.name || ""} ${project?.code || ""}`
      .toLocaleLowerCase("ru").includes(needle));
  }

  function filterProjectsByBudgetType(projects, selectedType) {
    const source = Array.isArray(projects) ? projects : [];
    if (!selectedType || selectedType === "all") return [...source];
    return source.filter((project) => normalizeBudgetType(project?.budgetType) === selectedType);
  }

  function filterProjectsByAttribute(projects, selectedValue, attrSelector) {
    const source = Array.isArray(projects) ? projects : [];
    if (!selectedValue || selectedValue === "all") return [...source];
    return source.filter((project) => attrSelector(project) === selectedValue);
  }

  function budgetSectionMeta(type) {
    if (type === "opex") return { type, code: "OPEX", label: translateString("Операционные расходы") };
    if (type === "capex") return { type, code: "CAPEX", label: translateString("Капитальные расходы") };
    return { type: "manual", code: language === "en" ? "OTHER" : "ДРУГИЕ", label: translateString("Другие проекты") };
  }

  function budgetSectionRowHtml(section, count) {
    const countLabel = language === "en"
      ? `${count} project${count === 1 ? "" : "s"}`
      : `${count} ${count % 10 === 1 && count % 100 !== 11 ? "проект" : ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "проекта" : "проектов")}`;
    return `<tr class="budget-section-row is-${section.type}">
      <td colspan="8">
        <div class="budget-section-heading">
          <span class="budget-section-title"><i aria-hidden="true"></i><strong>${escapeHtml(section.code)}</strong><span>${escapeHtml(section.label)}</span></span>
          <small>${escapeHtml(countLabel)}</small>
        </div>
      </td>
    </tr>`;
  }

  function renderBudgetEditControls() {
    const canManage = canEditSelectedLocation();
    if (!canManage) budgetEditMode = false;
    dom.editBudgetBtn.hidden = !canManage || budgetEditMode;
    dom.copyBudgetBtn.hidden = !canManage || !budgetEditMode;
    dom.cancelBudgetEditBtn.hidden = !canManage || !budgetEditMode;
    dom.saveBudgetBtn.hidden = !canManage || !budgetEditMode;
    dom.budgetProjectSearch.disabled = budgetEditMode;
    dom.budgetResponsibleFilter.disabled = budgetEditMode;
    dom.budgetTypeFilter.disabled = budgetEditMode;
    dom.budgetProjectSearch.title = budgetEditMode ? "Сначала сохраните или отмените изменения бюджета" : "";
    dom.budgetResponsibleFilter.title = dom.budgetProjectSearch.title;
    dom.budgetTypeFilter.title = dom.budgetProjectSearch.title;
  }

  function projectArticleCountLabel(count) {
    if (language === "en") return `${count} item${count === 1 ? "" : "s"}`;
    const word = count % 10 === 1 && count % 100 !== 11
      ? "статья"
      : ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "статьи" : "статей");
    return `${count} ${word}`;
  }

  function budgetProjectSummaryRowHtml(article, articleCount, projectNumber, expanded, quarterKey) {
    return `<tr class="budget-project-summary-row${expanded ? " is-expanded" : ""}" data-budget-project-summary data-budget-project-id="${escapeAttribute(article.id)}">
      <td>${projectNumber}</td>
      <td>
        <button class="budget-project-heading" type="button" data-budget-project-toggle aria-expanded="${expanded}" aria-label="${escapeAttribute(`${article.name}: ${projectArticleCountLabel(articleCount)}`)}">
          <i class="budget-project-chevron" aria-hidden="true">›</i>
          <span><strong>${escapeHtml(article.name)}</strong><span class="budget-project-meta"><small>${escapeHtml(projectArticleCountLabel(articleCount))}</small></span></span>
          ${budgetTypeBadge(article)}
        </button>
      </td>
      <td>${projectCodeHtml(article.code)}</td>
      <td class="budget-project-currencies" data-project-currencies>—</td>
      <td class="number-cell budget-project-total-cell" data-project-month-total="0">—</td>
      <td class="number-cell budget-project-total-cell" data-project-month-total="1">—</td>
      <td class="number-cell budget-project-total-cell" data-project-month-total="2">—</td>
      <td class="number-cell budget-project-total-cell budget-project-quarter-total" data-project-quarter-total>—</td>
    </tr>`;
  }


  function budgetCurrencyRowHtml(article, projectArticle, projectIndex, projectArticleIndex, currency, amount, monthAmounts, firstRow, expanded = expandedBudgetProjects.has(article.id)) {
    const hasCurrency = Boolean(currency);
    const monthKeys = quarterMonthKeysFromQuarterKey(selectedQuarterKey());
    const detailed = Boolean(monthAmounts && typeof monthAmounts === "object");
    const itemKey = budgetItemKey(article.id, projectArticle.id);
    const projectCell = firstRow ? `
      <td class="budget-project-article-cell"><span class="budget-article-branch" aria-hidden="true">↳</span><strong class="article-name">${escapeHtml(projectArticle.name)}</strong>
        ${budgetEditMode ? `<button class="inline-add" type="button" data-budget-action="add-currency" aria-label="${escapeAttribute(`${translateString("Добавить валюту к статье")} ${projectArticle.name}`)}">+ ${translateString("Добавить валюту")}</button>` : ""}
      </td>
      <td>${projectArticle.code ? `<span class="project-code">${escapeHtml(projectArticle.code)}</span>` : '<span class="missing-code">Не задан</span>'}</td>` : '<td class="project-continuation" colspan="2"></td>';
    const visibility = expanded ? "" : " hidden";
    if (!hasCurrency) {
      return `<tr data-article-id="${escapeAttribute(article.id)}" data-subarticle-id="${escapeAttribute(projectArticle.id)}" data-budget-item-key="${escapeAttribute(itemKey)}" data-budget-parent-project-id="${escapeAttribute(article.id)}" data-project-index="${projectIndex}" data-project-article-index="${projectArticleIndex}" class="budget-project-row budget-project-detail-row"${visibility}>
        <td></td>${projectCell}
        <td colspan="5" class="table-empty">${budgetEditMode ? "Добавьте валюту статьи" : "—"}</td>
      </tr>`;
    }
    const monthCells = monthKeys.map((monthKey) => {
      const monthClosed = PeriodLocks.isMonthClosed(state, monthKey);
      const monthDisabled = !budgetEditMode || monthClosed;
      return `<td class="budget-month-cell${monthClosed ? " is-month-closed" : ""}">
        <input class="budget-input amount-input budget-month-input" type="text" inputmode="decimal" autocomplete="off"
          value="${detailed ? escapeAttribute(formatGroupedNumber(monthAmounts[monthKey] || 0)) : ""}"
          placeholder="—" data-currency="${escapeAttribute(currency)}" data-month-key="${escapeAttribute(monthKey)}"
          aria-label="${escapeAttribute(`${translateString("План")} ${article.name} / ${projectArticle.name} ${currency} ${formatMonthLabel(monthKey)}`)}" ${monthDisabled ? "disabled" : ""}>
      </td>`;
    }).join("");
    return `<tr data-article-id="${escapeAttribute(article.id)}" data-subarticle-id="${escapeAttribute(projectArticle.id)}" data-budget-item-key="${escapeAttribute(itemKey)}" data-budget-parent-project-id="${escapeAttribute(article.id)}" data-project-index="${projectIndex}" data-project-article-index="${projectArticleIndex}" data-quarter-amount="${escapeAttribute(amount)}" data-monthly-detailed="${detailed}" class="budget-project-row budget-project-detail-row budget-currency-row"${visibility}>
      <td></td>${projectCell}
      <td>${budgetEditMode
        ? `<select class="budget-currency-input" aria-label="Валюта проекта">${currencyOptions(currency)}</select>`
        : `<span class="currency-badge">${escapeHtml(currency)}</span>`}</td>
      ${monthCells}
      <td class="budget-amount-cell budget-quarter-cell">
        <span class="budget-quarter-total">${escapeHtml(formatGroupedNumber(amount))}</span>
        ${!detailed && amount !== 0 ? `<small class="budget-legacy-note">${escapeHtml(translateString("Нет помесячной разбивки"))}</small>` : ""}
        ${budgetEditMode ? '<button class="row-action danger" type="button" data-budget-action="remove-currency" aria-label="Удалить валюту" title="Удалить валюту">×</button>' : ""}
      </td>
    </tr>`;
  }

  async function startBudgetEdit() {
    if (!canEditSelectedLocation()) return;
    try {
      await acquireEditLock({ resourceType: "budget", resourceId: `${selectedLocation}|${selectedQuarterKey()}` });
    } catch (error) {
      showToast(error.message, true);
      return;
    }
    const responsibleLookup = (article) => projectResponsibleGroups(article.id, selectedLocation, selectedQuarterKey());
    const visibleProjects = filterProjectsByResponsible(filterProjectsByBudgetType(filterProjectsByQuery(
      state.articles.filter((article) => !article.archived),
      dom.budgetProjectSearch?.value
    ), dom.budgetTypeFilter.value), dom.budgetResponsibleFilter.value, responsibleLookup)
      .filter((article) => projectArticlesForContext(article, selectedLocation, selectedQuarterKey()).length);
    if (!visibleProjects.some((article) => expandedBudgetProjects.has(article.id)) && visibleProjects[0]) {
      expandedBudgetProjects.add(visibleProjects[0].id);
    }
    budgetEditMode = true;
    renderBudgetEditor();
    dom.budgetEditorBody.querySelector(".budget-project-detail-row:not([hidden]) .budget-month-input")?.focus();
  }

  function cancelBudgetEdit() {
    if (budgetDirty && !confirmAction("Отменить несохранённые изменения бюджета?")) return;
    budgetEditMode = false;
    budgetDirty = false;
    releaseActiveEditLock({ resourceType: "budget", resourceId: `${selectedLocation}|${selectedQuarterKey()}` });
    renderBudgetEditor();
  }

  function handleBudgetEditorAction(event) {
    const projectRow = event.target.closest("tr[data-budget-project-summary]");
    if (projectRow) {
      toggleBudgetProjectRows(projectRow);
      return;
    }
    const button = event.target.closest("[data-budget-action]");
    if (!button || !budgetEditMode) return;
    const row = button.closest("tr");
    const article = articleById(row?.dataset.articleId);
    const projectArticle = subarticleById(row?.dataset.articleId, row?.dataset.subarticleId);
    if (!row || !article || !projectArticle) return;
    const rows = [...dom.budgetEditorBody.querySelectorAll("tr[data-budget-item-key]")]
      .filter((item) => item.dataset.budgetItemKey === row.dataset.budgetItemKey);
    const values = rows.filter((item) => item.classList.contains("budget-currency-row")).map((item) => {
      const months = Object.fromEntries([...item.querySelectorAll(".budget-month-input")]
        .map((input) => [input.dataset.monthKey, parseGroupedNumber(input.value) || 0]));
      return {
        currency: item.querySelector(".budget-currency-input")?.value,
        amount: Number(item.dataset.quarterAmount) || 0,
        months,
        detailed: item.dataset.monthlyDetailed === "true",
        element: item
      };
    });
    if (button.dataset.budgetAction === "remove-currency") {
      replaceBudgetArticleRows(article, projectArticle, rows, values.filter((item) => item.element !== row));
    } else if (button.dataset.budgetAction === "add-currency") {
      const used = new Set(values.map((item) => item.currency).filter(Boolean));
      const currency = availableCurrencyCodes().find((code) => !used.has(code)) || DEFAULT_CURRENCY;
      const months = Object.fromEntries(quarterMonthKeysFromQuarterKey(selectedQuarterKey()).map((monthKey) => [monthKey, 0]));
      replaceBudgetArticleRows(article, projectArticle, rows, [...values, { currency, amount: 0, months, detailed: true }]);
    }
    budgetDirty = true;
    setSaveStatus("Есть несохранённые изменения");
    updateBudgetEditorTotal();
  }

  function toggleBudgetProjectRows(projectRow) {
    const projectId = projectRow?.dataset.budgetProjectId;
    if (!projectId) return;
    const expanded = !expandedBudgetProjects.has(projectId);
    if (expanded) expandedBudgetProjects.add(projectId);
    else expandedBudgetProjects.delete(projectId);
    applyBudgetProjectExpansion(
      projectRow,
      [...dom.budgetEditorBody.querySelectorAll("tr[data-budget-parent-project-id]")],
      expanded
    );
  }

  function applyBudgetProjectExpansion(projectRow, detailRows, expanded) {
    const projectId = projectRow?.dataset.budgetProjectId;
    if (!projectId) return;
    projectRow.classList.toggle("is-expanded", expanded);
    projectRow.querySelector("[data-budget-project-toggle]")?.setAttribute("aria-expanded", String(expanded));
    (Array.isArray(detailRows) ? detailRows : [])
      .filter((row) => row.dataset.budgetParentProjectId === projectId)
      .forEach((row) => { row.hidden = !expanded; });
  }

  function replaceBudgetArticleRows(article, projectArticle, currentRows, values) {
    const projectIndex = Number(currentRows[0]?.dataset.projectIndex) || 0;
    const projectArticleIndex = Number(currentRows[0]?.dataset.projectArticleIndex) || 0;
    const normalizedValues = values.length ? values : [{ currency: null, amount: 0, months: null, detailed: false }];
    const template = document.createElement("tbody");
    template.innerHTML = normalizedValues.map((item, position) =>
      budgetCurrencyRowHtml(article, projectArticle, projectIndex, projectArticleIndex, item.currency, item.amount, item.detailed ? item.months : null, position === 0, expandedBudgetProjects.has(article.id))).join("");
    currentRows[0].before(...template.children);
    currentRows.forEach((item) => item.remove());
  }

  function renderProjectTable() {
    if (!dom.projectTableBody) return;
    dom.projectTableBody.innerHTML = state.articles.map((article, index) => `
      <tr class="${selectedProjectForArticles === article.id ? "is-selected" : ""}">
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(article.name)}</strong></td>
        <td>${projectCodeHtml(article.code)}</td>
        <td>${budgetTypeBadge(article, true)}</td>
        <td>${activeProjectArticles(article).length}</td>
        <td class="actions-cell">
          <div class="project-action-buttons">
            <button class="row-action row-action-text" type="button" data-project-action="articles" data-project-id="${escapeAttribute(article.id)}">Статьи · ${activeProjectArticles(article).length}</button>
            <button class="row-action" type="button" data-project-action="edit" data-project-id="${escapeAttribute(article.id)}" aria-label="Редактировать проект" title="Редактировать проект">✎</button>
          </div>
        </td>
      </tr>`).join("");
  }

  function renderProjectArticleManager() {
    const project = articleById(selectedProjectForArticles);
    dom.projectArticleManager.hidden = !project;
    if (!project) {
      dom.projectArticleTableBody.innerHTML = "";
      return;
    }
    dom.projectArticleProjectName.textContent = project.name;
    const projectArticles = activeProjectArticles(project);
    dom.projectArticleTableBody.innerHTML = projectArticles.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(item.name)}</strong>${isExcelProjectArticle(item) ? '<small class="imported-project-article">Excel</small>' : ""}</td>
        <td>${projectCodeHtml(item.code)}</td>
        <td class="actions-cell">
          <div class="project-article-actions">
            <button class="row-action" type="button" data-project-article-action="edit" data-project-article-id="${escapeAttribute(item.id)}" aria-label="Редактировать статью" title="Редактировать статью">✎</button>
            <button class="row-action danger" type="button" data-project-article-action="delete" data-project-article-id="${escapeAttribute(item.id)}" aria-label="Удалить статью" title="Удалить статью">×</button>
          </div>
        </td>
      </tr>`).join("");
  }

  function resetProjectForm() {
    dom.projectEditId.value = "";
    dom.projectNameInput.value = "";
    dom.projectCodeInput.value = "";
    dom.projectSaveBtn.textContent = "Добавить проект";
    dom.projectFormError.textContent = "";
  }

  function openProjectDialog() {
    if (!isAdminClient()) return;
    if (budgetDirty && !confirmAction("Есть несохранённые суммы бюджета. Перейти к проектам без сохранения?")) return;
    if (budgetDirty) {
      budgetDirty = false;
      renderBudgetEditor();
    }
    selectedProjectForArticles = null;
    resetProjectForm();
    resetProjectArticleForm();
    renderProjectTable();
    renderProjectArticleManager();
    dom.projectDialog.showModal();
    dom.projectNameInput.focus();
  }

  function closeProjectDialog() {
    dom.projectDialog.close();
    selectedProjectForArticles = null;
    resetProjectForm();
    resetProjectArticleForm();
  }

  async function saveProjectFromDialog(event) {
    event.preventDefault();
    if (!isAdminClient()) return;
    dom.projectFormError.textContent = "";
    const id = dom.projectEditId.value;
    const name = dom.projectNameInput.value.trim();
    const code = dom.projectCodeInput.value.trim();
    if (!name) {
      dom.projectFormError.textContent = "Введите название проекта";
      return;
    }
    try {
      await mutate(id ? "updateArticle" : "addArticle", { id: id || undefined, name, code });
      resetProjectForm();
      renderProjectTable();
      renderProjectArticleManager();
      showToast(id ? "Проект обновлён" : "Проект добавлен");
      dom.projectNameInput.focus();
    } catch (error) {
      dom.projectFormError.textContent = error.message;
    }
  }

  function handleProjectTableAction(event) {
    if (!isAdminClient()) return;
    const button = event.target.closest("[data-project-action]");
    if (!button) return;
    const article = state.articles.find((item) => item.id === button.dataset.projectId);
    if (!article) return;
    if (button.dataset.projectAction === "articles") {
      selectedProjectForArticles = article.id;
      resetProjectArticleForm();
      renderProjectTable();
      renderProjectArticleManager();
      dom.projectArticleNameInput.focus();
      return;
    }
    if (button.dataset.projectAction !== "edit") return;
    dom.projectEditId.value = article.id;
    dom.projectNameInput.value = article.name;
    dom.projectCodeInput.value = article.code || "";
    dom.projectSaveBtn.textContent = "Сохранить";
    dom.projectFormError.textContent = "";
    dom.projectNameInput.focus();
  }

  function resetProjectArticleForm() {
    if (!dom.projectArticleEditId) return;
    dom.projectArticleEditId.value = "";
    dom.projectArticleNameInput.value = "";
    dom.projectArticleSaveBtn.textContent = "Добавить статью";
    dom.projectArticleCancelBtn.hidden = true;
    dom.projectArticleFormError.textContent = "";
  }

  async function saveProjectArticleFromDialog() {
    if (!isAdminClient()) return;
    const project = articleById(selectedProjectForArticles);
    if (!project) return;
    const subarticleId = dom.projectArticleEditId.value;
    const name = dom.projectArticleNameInput.value.trim();
    dom.projectArticleFormError.textContent = "";
    if (!name) {
      dom.projectArticleFormError.textContent = "Введите название статьи проекта";
      return;
    }
    try {
      await mutate(subarticleId ? "updateSubarticle" : "addSubarticle", {
        articleId: project.id,
        subarticleId: subarticleId || undefined,
        name
      });
      resetProjectArticleForm();
      renderProjectTable();
      renderProjectArticleManager();
      showToast(subarticleId ? "Статья проекта обновлена" : "Статья проекта добавлена");
      dom.projectArticleNameInput.focus();
    } catch (error) {
      dom.projectArticleFormError.textContent = error.message;
    }
  }

  async function handleProjectArticleTableAction(event) {
    if (!isAdminClient()) return;
    const button = event.target.closest("[data-project-article-action]");
    const project = articleById(selectedProjectForArticles);
    if (!button || !project) return;
    const projectArticle = (project.subarticles || []).find((item) => item.id === button.dataset.projectArticleId);
    if (!projectArticle) return;

    if (button.dataset.projectArticleAction === "edit") {
      dom.projectArticleEditId.value = projectArticle.id;
      dom.projectArticleNameInput.value = projectArticle.name;
      dom.projectArticleSaveBtn.textContent = "Сохранить";
      dom.projectArticleCancelBtn.hidden = false;
      dom.projectArticleFormError.textContent = "";
      dom.projectArticleNameInput.focus();
      return;
    }

    if (button.dataset.projectArticleAction === "delete") {
      if (!confirmAction(`Удалить статью «${projectArticle.name}» из проекта «${project.name}»?`)) return;
      try {
        await mutate("deleteSubarticle", { articleId: project.id, subarticleId: projectArticle.id });
        resetProjectArticleForm();
        renderProjectTable();
        renderProjectArticleManager();
        showToast("Статья проекта удалена");
      } catch (error) {
        dom.projectArticleFormError.textContent = error.message;
      }
    }
  }

  function renderDataPage() {
    dom.profileName.value = profile.name;
    if (sharedMode) {
      dom.sharedModeDescription.textContent = currentUser
        ? "Общий режим активен: вход подтверждён, данные и права проверяются сервером."
        : "Общий режим активен: требуется вход.";
      dom.sharedModeCommand.textContent = location.origin;
    } else {
      dom.sharedModeDescription.textContent = "Данные сохраняются локально в этом браузере. Для переноса на другой компьютер используйте JSON.";
      dom.sharedModeCommand.textContent = "План Факт для Windows.html";
    }
    renderTrackerSyncCard();
    renderPeriodCloseCard();
  }

  function startTrackerSyncScheduler() {
    if (typeof window === "undefined" || sharedMode || trackerSyncTimer) return;
    trackerSyncTimer = window.setInterval(() => {
      renderTrackerSyncCard();
      syncTrackerExpenses(false);
    }, 60000);
    window.addEventListener("focus", () => syncTrackerExpenses(false));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncTrackerExpenses(false);
    });
    window.setTimeout(() => syncTrackerExpenses(false), 2500);
  }

  function trackerAutoSyncPaused() {
    try {
      return sessionStorage.getItem(TRACKER_AUTO_PAUSE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function trackerSyncIsDue(now = Date.now()) {
    const sync = state.trackerSync || {};
    if (sync.lastError && sync.nextRetryAt) {
      return now >= new Date(sync.nextRetryAt).getTime();
    }
    if (!sync.lastSuccessfulSyncAt) return true;
    return now - new Date(sync.lastSuccessfulSyncAt).getTime() >= TrackerSync.CHECK_INTERVAL_MS;
  }

  async function syncTrackerExpenses(manual) {
    if (sharedMode || trackerSyncInProgress || (!manual && (trackerAutoSyncPaused() || !trackerSyncIsDue()))) return;
    if (manual) {
      try { sessionStorage.removeItem(TRACKER_AUTO_PAUSE_KEY); } catch {}
    }
    trackerSyncInProgress = true;
    trackerSyncManual = Boolean(manual);
    renderTrackerSyncCard();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    let tokenDialogOpened = false;
    try {
      const response = await fetch(`${TrackerSync.BRIDGE_URL}/tracker/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          searchScope: trackerSearchScope,
          periodKey: trackerQuarterKey(),
          knownIssueKeys: [...new Set([
            ...state.expenses
              .filter((expense) => expense.sourceType === TrackerSync.SOURCE_TYPE)
              .map((expense) => expense.sourceKey),
            ...state.forecastTickets.map((ticket) => trackerIssueKeyFromTicket(ticket))
          ].filter(Boolean))],
          knownForecastIssueKeys: [...new Set(state.forecastTickets
            .map((ticket) => trackerIssueKeyFromTicket(ticket)).filter(Boolean))]
        }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 428 && body.code === "token_required") {
        if ((manual || !trackerTokenPrompted) && !dom.trackerTokenDialog.open) {
          trackerTokenPrompted = true;
          tokenDialogOpened = true;
          openTrackerTokenDialog();
        }
        throw new Error(body.error || "Для синхронизации настройте токен Tracker.");
      }
      if (!response.ok) throw new Error(body.error || `Tracker bridge: HTTP ${response.status}`);
      if (!Array.isArray(body.issues) || body.selectionComplete !== true) {
        throw new Error("Локальный Tracker-адаптер вернул неполный ответ");
      }
      if (body.bridgeSchemaVersion !== TrackerSync.BRIDGE_SCHEMA_VERSION) {
        throw new Error("Запущена старая версия Tracker-адаптера. Закройте приложение и снова откройте START-WINDOWS.vbs или START-MACOS.app.");
      }
      if (body.searchScope !== trackerSearchScope) {
        throw new Error("Локальный Tracker-адаптер устарел. Закройте приложение и снова откройте START-WINDOWS.vbs или START-MACOS.app.");
      }
      await mutate("syncTrackerExpenses", {
        issues: body.issues,
        selectionComplete: true,
        creationQuarterKey: trackerQuarterKey(),
        searchScope: body.searchScope,
        scannedIssueCount: body.scannedIssueCount,
        financialIssueCount: body.issueCount,
        forecastIssueCount: body.forecastIssueCount,
        paymentEventCount: body.paymentEventCount,
        knownIssueCount: body.knownIssueCount,
        author: currentActorName()
      });
      const result = state.trackerSync.lastResult || {};
      if (manual || result.created || result.forecastsCreated || result.factsCreated || result.warnings) {
        showToast(`Tracker · ${importQuarterLabel(result.periodKey || trackerQuarterKey())}: расходов ${result.created || 0} · резервов ${result.forecastsCreated || 0} · оплат ${result.factsCreated || 0} · предупреждений ${result.warnings || 0}`);
      }
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "Tracker-адаптер не ответил за 120 секунд"
        : (error instanceof TypeError
            ? "Tracker-адаптер не запущен. На Windows проверьте Python 3.8+ и снова откройте START-WINDOWS.vbs; на macOS откройте START-MACOS.app. Остальные функции работают без Tracker."
            : (error?.message || "Не удалось проверить Tracker"));
      await mutate("recordTrackerSyncFailure", { error: message });
      if (manual && !tokenDialogOpened) showToast(message, true);
    } finally {
      window.clearTimeout(timeout);
      trackerSyncInProgress = false;
      trackerSyncManual = false;
      renderTrackerSyncCard();
    }
  }

  function openTrackerTokenDialog() {
    if (!trackerPersonalTokenAllowed(sharedMode)) {
      showToast("В общем режиме персональные токены Tracker отключены", true);
      return;
    }
    dom.trackerTokenError.textContent = "";
    dom.trackerTokenInput.value = "";
    dom.trackerTokenDialog.showModal();
    window.setTimeout(() => dom.trackerTokenInput.focus(), 0);
  }

  function closeTrackerTokenDialog() {
    dom.trackerTokenInput.value = "";
    dom.trackerTokenError.textContent = "";
    dom.trackerTokenDialog.close();
  }

  async function saveTrackerToken(event) {
    event.preventDefault();
    if (!trackerPersonalTokenAllowed(sharedMode)) {
      closeTrackerTokenDialog();
      showToast("В общем режиме персональные токены Tracker отключены", true);
      return;
    }
    const token = dom.trackerTokenInput.value.trim();
    dom.saveTrackerToken.disabled = true;
    dom.trackerTokenError.textContent = "";
    try {
      const response = await fetch(`${TrackerSync.BRIDGE_URL}/tracker/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.configured !== true) throw new Error(body.error || "Не удалось сохранить токен");
      closeTrackerTokenDialog();
      await mutate("clearTrackerSyncFailure", {});
      showToast("Токен Tracker сохранён. Запускаю синхронизацию…");
      await syncTrackerExpenses(true);
    } catch (error) {
      dom.trackerTokenError.textContent = error?.message || "Не удалось сохранить токен";
    } finally {
      dom.saveTrackerToken.disabled = false;
      dom.trackerTokenInput.value = "";
    }
  }

  function renderTrackerSyncCard() {
    if (!dom.trackerSyncCard) return;
    const sync = state.trackerSync || {};
    const warnings = (sync.warnings || []).filter((warning) => warning.status === "open");
    const selectedTrackerPeriodLabel = importQuarterLabel(trackerQuarterKey());
    const selectedTrackerScopeLabel = trackerSearchScopeLabel(trackerSearchScope);
    populateTrackerPeriodControls();
    populateTrackerScopeControl();
    dom.trackerSyncBtn.disabled = trackerSyncInProgress;
    dom.trackerSyncQuarter.disabled = trackerSyncInProgress;
    dom.trackerSyncYear.disabled = trackerSyncInProgress;
    dom.trackerSyncScope.disabled = trackerSyncInProgress;
    dom.trackerSyncBtn.textContent = trackerSyncInProgress
      ? "Синхронизация…"
      : `Синхронизировать за ${selectedTrackerPeriodLabel}`;
    dom.trackerWarningCount.hidden = warnings.length === 0;
    dom.trackerWarningCount.textContent = String(warnings.length);
    dom.trackerWarningButton.hidden = warnings.length === 0;
    dom.trackerTopbarWarningCount.textContent = String(warnings.length);
    if (dom.trackerSyncIndicator) dom.trackerSyncIndicator.hidden = !trackerSyncInProgress;
    const blockingSync = trackerSyncInProgress && trackerSyncManual;
    if (dom.syncBlockOverlay) dom.syncBlockOverlay.hidden = !blockingSync;
    if (dom.appShell) dom.appShell.toggleAttribute("inert", blockingSync);
    if (trackerSyncInProgress) {
      dom.trackerSyncStatus.textContent = `Проверяю ${trackerSearchScopeObjectLabel(trackerSearchScope)} за ${selectedTrackerPeriodLabel}…`;
      dom.trackerSyncStatus.className = "tracker-sync-status is-running";
    } else if (trackerAutoSyncPaused()) {
      dom.trackerSyncStatus.textContent = "Автосинхронизация приостановлена после очистки данных";
      dom.trackerSyncStatus.className = "tracker-sync-status";
    } else if (sync.lastError) {
      dom.trackerSyncStatus.textContent = sync.lastError;
      dom.trackerSyncStatus.className = "tracker-sync-status is-error";
    } else if (sync.lastSuccessfulSyncAt) {
      const lastPeriod = sync.lastResult?.periodKey ? ` · ${importQuarterLabel(sync.lastResult.periodKey)}` : "";
      const lastScope = sync.lastResult?.searchScope
        ? ` · ${trackerSearchScopeLabel(sync.lastResult.searchScope)}` : "";
      dom.trackerSyncStatus.textContent = `Последняя успешная синхронизация: ${formatDateTime(sync.lastSuccessfulSyncAt)}${lastPeriod}${lastScope}`;
      dom.trackerSyncStatus.className = "tracker-sync-status is-ok";
    } else {
      dom.trackerSyncStatus.textContent = "Tracker ещё не проверялся";
      dom.trackerSyncStatus.className = "tracker-sync-status";
    }
    const dueAt = sync.lastError && sync.nextRetryAt
      ? new Date(sync.nextRetryAt).getTime()
      : (sync.lastSuccessfulSyncAt
          ? new Date(sync.lastSuccessfulSyncAt).getTime() + TrackerSync.CHECK_INTERVAL_MS
          : Date.now());
    dom.trackerSyncMeta.textContent = trackerAutoSyncPaused()
      ? "Чтобы заново загрузить расходы, нажмите «Синхронизировать с Tracker»."
      : trackerSyncInProgress
      ? "Новые расходы и предупреждения появятся после полной проверки."
      : `Источник: ${selectedTrackerScopeLabel}. Новые расходы: ${selectedTrackerPeriodLabel}. Следующая автоматическая попытка: ${dueAt <= Date.now() ? "сейчас" : formatDateTime(new Date(dueAt).toISOString())}.`;

    const result = sync.lastResult;
    dom.trackerSyncResults.hidden = !result;
    if (result) {
      const financial = result.financial || result.checked || 0;
      const resultParts = [
        `<span><strong>${escapeHtml(trackerSearchScopeLabel(result.searchScope))}</strong> область поиска</span>`,
        `<span><strong>${result.scanned || financial}</strong> просмотрено</span>`,
        `<span><strong>${financial}</strong> финансовых</span>`,
        `<span><strong>${result.inPeriod}</strong> в периоде</span>`,
        `<span><strong>${result.created}</strong> создано</span>`,
        `<span><strong>${result.unchanged}</strong> связанных без изменений</span>`,
        `<span><strong>${result.outOfPeriod}</strong> вне периода</span>`
      ];
      if (result.knownIssues) resultParts.push(`<span><strong>${result.knownIssues}</strong> связанных проконтролировано</span>`);
      if (result.forecastIssues) resultParts.push(`<span><strong>${result.forecastIssues}</strong> прогнозных тикетов</span>`);
      if (result.forecastsCreated) resultParts.push(`<span><strong>${result.forecastsCreated}</strong> резервов создано</span>`);
      if (result.paymentEvents) resultParts.push(`<span><strong>${result.paymentEvents}</strong> событий оплаты найдено</span>`);
      if (result.factsCreated) resultParts.push(`<span><strong>${result.factsCreated}</strong> оплат записано в факт</span>`);
      if (result.migratedForecastExpenses) resultParts.push(`<span><strong>${result.migratedForecastExpenses}</strong> ошибочных полных расходов аннулировано</span>`);
      if (result.vatAdjustedFacts) resultParts.push(`<span><strong>${result.vatAdjustedFacts}</strong> оплат пересчитано без НДС</span>`);
      if (result.foreignIssuesExcluded) resultParts.push(`<span><strong>${result.foreignIssuesExcluded}</strong> тикетов чужих бюджетов исключено</span>`);
      if (result.forecastAllocationsAdjusted) resultParts.push(`<span><strong>${result.forecastAllocationsAdjusted}</strong> месячных резервов перераспределено</span>`);
      if (result.trackerExpensesAdjusted) resultParts.push(`<span><strong>${result.trackerExpensesAdjusted}</strong> месячных расходов перераспределено</span>`);
      if (result.servicePeriodFallbacks) resultParts.push(`<span><strong>${result.servicePeriodFallbacks}</strong> без периода услуги — использована дата создания</span>`);
      if (result.servicePeriodsCrossingQuarters) resultParts.push(`<span><strong>${result.servicePeriodsCrossingQuarters}</strong> периодов пересекают кварталы</span>`);
      if (result.inferredIssues) resultParts.push(`<span><strong>${result.inferredIssues}</strong> распознано по старой форме</span>`);
      if (result.createdProjects) resultParts.push(`<span><strong>${result.createdProjects}</strong> проектов добавлено</span>`);
      if (result.createdLocations) resultParts.push(`<span><strong>${result.createdLocations}</strong> офисов добавлено</span>`);
      dom.trackerSyncResults.innerHTML = resultParts.join("");
    } else {
      dom.trackerSyncResults.innerHTML = "";
    }
    dom.trackerSyncWarnings.innerHTML = warnings.map(trackerWarningHtml).join("");
  }

  const TRACKER_FIELD_LABELS = {
    amount: "Сумма", currency: "Валюта", projectCode: "Проект", locationCode: "Офис"
  };
  const TRACKER_VALIDATION_LABELS = {
    issueKey: "Не удалось определить ключ тикета",
    amount: "В тикете не указана корректная сумма",
    currency: "В тикете не указана корректная валюта",
    projectCode: "В описании не найден код проекта",
    locationCode: "В описании не найден код офиса",
    expenseDate: "Не удалось определить дату создания тикета",
    projectNotFound: "Проект с таким кодом отсутствует в приложении",
    locationNotFound: "Офис с таким кодом отсутствует в приложении"
  };

  function trackerWarningHtml(warning) {
    let details = "";
    if (warning.type === "source_changed") {
      details = warning.changes.map((change) =>
        `<li><strong>${escapeHtml(TRACKER_FIELD_LABELS[change.field] || change.field)}:</strong> ${escapeHtml(String(change.previous))} → ${escapeHtml(String(change.current))}</li>`).join("");
    } else if (warning.type === "source_missing") {
      details = "<li>Тикет больше не попадает в контрольную выборку. Расход не изменён.</li>";
    } else {
      details = (warning.validationErrors || []).map((item) =>
        `<li>${escapeHtml(TRACKER_VALIDATION_LABELS[item] || item)}</li>`).join("");
    }
    const warningTitle = warning.type === "source_changed"
      ? "Исходные данные изменились"
      : warning.type === "source_missing"
        ? "Тикет не найден в выборке"
        : warning.type === "forecast_attention"
          ? "Прогноз требует проверки"
          : warning.type === "payment_attention"
            ? "Оплата не разнесена"
            : warning.type === "source_period_review"
              ? "Период услуги требует проверки"
              : "Расход не создан";
    return `<article class="tracker-warning">
      <div><strong>${escapeHtml(warning.issueKey)}</strong><span>${warningTitle}</span><ul>${details}</ul></div>
      <div class="tracker-warning-actions">
        ${warning.issueUrl ? `<a class="button button-secondary" href="${escapeAttribute(warning.issueUrl)}" target="_blank" rel="noreferrer">Открыть тикет</a>` : ""}
        ${warning.expenseId ? `<button class="button button-secondary" type="button" data-tracker-warning-action="expense" data-expense-id="${escapeAttribute(warning.expenseId)}">Открыть расход</button>` : ""}
        <button class="button button-primary" type="button" data-tracker-warning-action="map" data-issue-key="${escapeAttribute(warning.issueKey)}">Указать параметры</button>
        <button class="button button-ghost" type="button" data-tracker-warning-action="dismiss" data-warning-id="${escapeAttribute(warning.id)}">Скрыть</button>
      </div>
    </article>`;
  }

  async function handleTrackerWarningAction(event) {
    const button = event.target.closest("[data-tracker-warning-action]");
    if (!button) return;
    if (button.dataset.trackerWarningAction === "dismiss") {
      await mutate("dismissTrackerWarning", { id: button.dataset.warningId });
      return;
    }
    if (button.dataset.trackerWarningAction === "map") {
      openTrackerMappingDialog(button.dataset.issueKey);
      return;
    }
    const expense = state.expenses.find((item) => item.id === button.dataset.expenseId);
    if (!expense) return;
    dom.expenseSearch.value = expense.sourceKey || "";
    navigate("expenses");
    renderExpenses();
  }

  function openTrackerMappingDialog(issueKey) {
    const key = normalizeCode(issueKey);
    const individualMapping = state.trackerSync?.manualMappings?.[key] || null;
    const warning = state.trackerSync?.warnings?.find((item) => item.issueKey === key);
    const snapshot = warning?.currentSnapshot || {};
    const ruleKey = trackerMappingRuleKey(snapshot);
    const ruleMapping = ruleKey ? state.trackerSync?.mappingRules?.[ruleKey] : null;
    const projectMapping = state.trackerSync?.projectMappings?.[normalizeCode(snapshot.projectCode)] || null;
    const locationMapping = state.trackerSync?.locationMappings?.[normalizeCode(snapshot.locationCode)] || null;
    const mapping = individualMapping || {
      articleId: projectMapping?.articleId || ruleMapping?.articleId,
      locationId: locationMapping?.locationId || ruleMapping?.locationId
    };
    const activeProjects = state.articles.filter((item) => !item.archived && normalizeCode(item.code))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
    const activeLocations = state.locations.filter((item) => !item.archived && normalizeCode(item.code))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
    const attributeEntries = Object.values(state.projectAttributes || {})
      .flatMap((entries) => Object.values(entries || {}));
    const knownServices = new Map();
    const knownCfoValues = new Map();
    const knownLegalEntities = new Set();
    attributeEntries.forEach((entry) => {
      const service = cleanText(entry?.service, 120);
      const cfo = cleanText(entry?.cfo, 160);
      const legalEntity = cleanText(entry?.legalEntity, 160);
      if (service && !knownServices.has(service)) knownServices.set(service, normalizeCode(entry?.serviceCode));
      if (cfo && !knownCfoValues.has(cfo)) knownCfoValues.set(cfo, normalizeCode(entry?.cfoCode));
      if (legalEntity) knownLegalEntities.add(legalEntity);
    });
    if (mapping.service && !knownServices.has(mapping.service)) knownServices.set(mapping.service, "");
    if (mapping.cfo && !knownCfoValues.has(mapping.cfo)) knownCfoValues.set(mapping.cfo, "");
    if (mapping.legalEntity) knownLegalEntities.add(mapping.legalEntity);
    const serviceOptions = [...knownServices.entries()].sort(([left], [right]) => left.localeCompare(right, "ru"));
    const cfoOptions = [...knownCfoValues.entries()].sort(([left], [right]) => left.localeCompare(right, "ru"));
    const legalEntityOptions = [...knownLegalEntities].sort((left, right) => left.localeCompare(right, "ru"));
    const suggestedProject = mapping.articleId || activeProjects.find((item) =>
      normalizeCode(item.code) === normalizeCode(snapshot.projectCode))?.id || "";
    const suggestedLocation = mapping.locationId || activeLocations.find((item) =>
      normalizeCode(item.code) === normalizeCode(snapshot.locationCode))?.id || "";
    const suggestedAttributes = Object.entries(state.projectAttributes || {})
      .filter(([attributesKey]) => attributesKey.startsWith(`${suggestedLocation}|`))
      .sort(([left], [right]) => right.localeCompare(left, "ru"))
      .map(([, entries]) => entries?.[suggestedProject])
      .find(Boolean) || {};
    dom.trackerMappingTitle.textContent = `Разнести ${key}`;
    dom.trackerMappingIssueKey.value = key;
    dom.trackerMappingProject.innerHTML = [
      '<option value="">Выберите проект</option>',
      ...activeProjects.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.code || "без кода")}</option>`)
    ].join("");
    dom.trackerMappingLocation.innerHTML = [
      '<option value="">Выберите локацию</option>',
      ...activeLocations.map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.code || "без кода")}</option>`)
    ].join("");
    dom.trackerMappingProject.value = suggestedProject;
    dom.trackerMappingLocation.value = suggestedLocation;
    dom.trackerMappingService.innerHTML = [
      '<option value="">Не указан</option>',
      ...serviceOptions.map(([value, code]) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}${code ? ` · ${escapeHtml(code)}` : ""}</option>`)
    ].join("");
    dom.trackerMappingCfo.innerHTML = [
      '<option value="">Не указан</option>',
      ...cfoOptions.map(([value, code]) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}${code ? ` · ${escapeHtml(code)}` : ""}</option>`)
    ].join("");
    dom.trackerMappingLegalEntity.innerHTML = [
      '<option value="">Не указано</option>',
      ...legalEntityOptions.map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`)
    ].join("");
    dom.trackerMappingService.value = mapping.service || suggestedAttributes.service || "";
    dom.trackerMappingCfo.value = mapping.cfo || suggestedAttributes.cfo || "";
    dom.trackerMappingLegalEntity.value = mapping.legalEntity || suggestedAttributes.legalEntity || "";
    const sourceProjectCode = normalizeCode(snapshot.projectCode);
    const sourceLocationCode = normalizeCode(snapshot.locationCode);
    dom.trackerMappingRememberProject.checked = Boolean(sourceProjectCode);
    dom.trackerMappingRememberProject.disabled = !sourceProjectCode;
    dom.trackerMappingProjectHint.textContent = sourceProjectCode
      ? `Все следующие тикеты с проектом ${sourceProjectCode} будут разнесены в выбранный проект.`
      : "В тикете не найден исходный код проекта.";
    dom.trackerMappingRememberLocation.checked = Boolean(sourceLocationCode);
    dom.trackerMappingRememberLocation.disabled = !sourceLocationCode;
    dom.trackerMappingLocationHint.textContent = sourceLocationCode
      ? `Офис ${sourceLocationCode} уникален и будет всегда разнесён в выбранную локацию.`
      : "В тикете не найден исходный код офиса.";
    dom.trackerMappingError.textContent = "";
    dom.deleteTrackerMapping.hidden = !individualMapping?.articleId;
    dom.trackerMappingDialog.showModal();
  }

  function closeTrackerMappingDialog() {
    dom.trackerMappingDialog.close();
    dom.trackerMappingForm.reset();
    dom.trackerMappingError.textContent = "";
  }

  async function saveTrackerManualMapping(event) {
    event.preventDefault();
    try {
      await mutate("saveTrackerManualMapping", {
        issueKey: dom.trackerMappingIssueKey.value,
        articleId: dom.trackerMappingProject.value,
        locationId: dom.trackerMappingLocation.value,
        service: dom.trackerMappingService.value,
        cfo: dom.trackerMappingCfo.value,
        legalEntity: dom.trackerMappingLegalEntity.value,
        rememberProject: dom.trackerMappingRememberProject.checked,
        rememberLocation: dom.trackerMappingRememberLocation.checked,
        sourceProjectCode: state.trackerSync?.warnings?.find((item) => item.issueKey === normalizeCode(dom.trackerMappingIssueKey.value))?.currentSnapshot?.projectCode,
        sourceLocationCode: state.trackerSync?.warnings?.find((item) => item.issueKey === normalizeCode(dom.trackerMappingIssueKey.value))?.currentSnapshot?.locationCode,
        author: currentActorName()
      });
      closeTrackerMappingDialog();
      showToast("Сопоставление сохранено. Повторяю синхронизацию…");
      await syncTrackerExpenses(true);
    } catch (error) {
      dom.trackerMappingError.textContent = error.message || "Не удалось сохранить сопоставление";
    }
  }

  async function deleteTrackerManualMapping() {
    const issueKey = dom.trackerMappingIssueKey.value;
    await mutate("deleteTrackerManualMapping", { issueKey });
    closeTrackerMappingDialog();
    showToast(`Сопоставление ${issueKey} удалено`);
  }

  const STATUS_TEXT = {
    open: "Открыт",
    ready_to_close: "Готов к закрытию",
    closed: "Закрыт"
  };

  function formatPeriodCloseMeta(entry) {
    if (!entry || !entry.closedAt) return "";
    const date = new Date(entry.closedAt);
    const dateLabel = validIsoDateTime(entry.closedAt)
      ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "ru-RU",
          { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
          .format(date)
      : "";
    return `${dateLabel} · ${entry.closedBy || "Не указано"}`;
  }

  function renderPeriodCloseCard() {
    const quarterKey = selectedQuarterKey();
    const months = quarterMonthKeysFromQuarterKey(quarterKey);
    const qStatus = PeriodLocks.quarterStatus(state, quarterKey);
    const qEntry = state.closedPeriods?.quarters?.[quarterKey];

    dom.periodCloseQuarterLabel.textContent = periodLabel(selectedYear, selectedQuarter);
    const statusEl = dom.periodCloseQuarterStatus;
    statusEl.textContent = STATUS_TEXT[qStatus];
    statusEl.className = "period-close-status"
      + (qStatus === "ready_to_close" ? " is-ready" : "")
      + (qStatus === "closed" ? " is-closed" : "");

    dom.periodCloseMonths.innerHTML = months.map((monthKey) => {
      const closed = PeriodLocks.isMonthClosed(state, monthKey);
      const entry = state.closedPeriods?.months?.[monthKey];
      const meta = closed ? `<span class="period-close-month-meta">${escapeHtml(formatPeriodCloseMeta(entry))}</span>` : "";
      const badge = closed
        ? `<span class="period-close-status is-closed">Закрыт</span>`
        : `<span class="period-close-status">Открыт</span>`;
      return `<div class="period-close-month-row"><strong>${escapeHtml(formatMonthLabel(monthKey))}</strong>${meta}${badge}</div>`;
    }).join("");

    const actions = [];
    if (qStatus === "closed") {
      actions.push(`<button type="button" data-period-action="reopen" data-level="quarter" data-key="${escapeAttribute(quarterKey)}" class="button button-secondary">Переоткрыть квартал</button>`);
    } else {
      months.forEach((monthKey) => {
        const closed = PeriodLocks.isMonthClosed(state, monthKey);
        if (closed) {
          actions.push(`<button type="button" data-period-action="reopen" data-level="month" data-key="${escapeAttribute(monthKey)}" class="button button-secondary">Переоткрыть ${escapeHtml(formatMonthLabel(monthKey))}</button>`);
        } else {
          actions.push(`<button type="button" data-period-action="close" data-level="month" data-key="${escapeAttribute(monthKey)}" class="button button-secondary">Закрыть ${escapeHtml(formatMonthLabel(monthKey))}</button>`);
        }
      });
      if (qStatus === "ready_to_close") {
        actions.push(`<button type="button" data-period-action="close" data-level="quarter" data-key="${escapeAttribute(quarterKey)}" class="button button-primary">Закрыть квартал</button>`);
      }
    }
    dom.periodCloseActions.innerHTML = actions.join("");
    dom.periodCloseActions.querySelectorAll("button[data-period-action]").forEach((button) => {
      button.addEventListener("click", () => requestPeriodAction(
        button.dataset.periodAction,
        button.dataset.level,
        button.dataset.key
      ));
    });

    const hint = dom.periodCloseHint;
    if (qStatus === "closed") {
      hint.textContent = "Квартал закрыт — план, прогнозы, расходы и итоговый снимок зафиксированы. Чтобы изменить данные, сначала переоткройте квартал (месяцы останутся закрытыми), затем нужный месяц.";
      hint.hidden = false;
    } else if (qStatus === "ready_to_close") {
      hint.textContent = "Все месяцы закрыты. Квартал можно закрыть — это зафиксирует итоговый снимок и заблокирует переоткрытие месяцев до переоткрытия квартала.";
      hint.hidden = false;
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }

  function renderQuarterStatusBadge(el) {
    if (!el) return;
    const quarterKey = selectedQuarterKey();
    const qStatus = PeriodLocks.quarterStatus(state, quarterKey);
    const closedMonths = quarterMonthKeysFromQuarterKey(quarterKey)
      .filter((month) => PeriodLocks.isMonthClosed(state, month));
    if (qStatus === "closed") {
      el.textContent = "Квартал закрыт";
      el.className = "period-close-status-badge is-closed";
      el.hidden = false;
    } else if (closedMonths.length) {
      el.textContent = `Закрыто месяцев: ${closedMonths.length} из 3`;
      el.className = "period-close-status-badge is-partial";
      el.hidden = false;
    } else {
      el.hidden = true;
      el.textContent = "";
      el.className = "period-close-status-badge";
    }
  }

  let pendingPeriodAction = null;

  function requestPeriodAction(action, level, periodKey) {
    pendingPeriodAction = { action, level, periodKey };
    const summary = PeriodLocks.periodSummary(state, periodKey, level);
    const isReopen = action === "reopen";
    const levelLabel = level === "quarter" ? "квартал" : "месяц";
    const periodText = level === "quarter"
      ? periodLabel(selectedYear, selectedQuarter)
      : formatMonthLabel(periodKey);

    dom.periodCloseDialogTitle.textContent = isReopen
      ? `Переоткрытие ${levelLabel}а`
      : `Закрытие ${levelLabel}а`;

    let summaryHtml = "";
    if (summary) {
      const parts = [];
      parts.push(`Расходов в периоде: ${summary.expenseCount}`);
      parts.push(`Активных прогнозов: ${summary.forecastCount}; требуют решения: ${summary.unresolvedForecastCount}`);
      const rateQuarterKey = level === "quarter"
        ? periodKey
        : `${periodKey.slice(0, 4)}-Q${Math.ceil(Number(periodKey.slice(5, 7)) / 3)}`;
      const periodTotals = Object.fromEntries(summary.currencies.map((currency) => {
        const plan = summary.planByCurrency[currency] || 0;
        const fact = summary.factByCurrency[currency] || 0;
        const forecast = summary.forecastByCurrency[currency] || 0;
        return [currency, { plan, fact, forecast, balance: plan - fact, free: plan - fact - forecast, expected: fact + forecast }];
      }));
      const rub = convertTotalsToRub(periodTotals, rateQuarterKey, state.exchangeRatesByQuarter);
      if (rub.missing.length) {
        parts.push(`<span class="conversion-missing">Не задан курс ${escapeHtml(rub.missing.join(", "))} для ${escapeHtml(rateQuarterKey)}</span>`);
      } else if (summary.currencies.length) {
        parts.push(`<b>RUB</b> план ${formatGroupedNumber(rub.plan)} / факт ${formatGroupedNumber(rub.fact)} / прогноз ${formatGroupedNumber(rub.forecast)} / свободно ${formatGroupedNumber(rub.free)}`);
      }
      summaryHtml = parts.join("<br>");
    }
    if (isReopen && level === "quarter") {
      summaryHtml = `Будут переоткрыты: квартал. Месяцы останутся закрытыми.${summaryHtml ? "<br>" + summaryHtml : ""}`;
    }
    dom.periodCloseDialogSummary.innerHTML = summaryHtml || "";
    dom.periodCloseReason.value = "";
    dom.periodCloseReason.required = isReopen;
    dom.periodCloseReason.parentElement.querySelector("span").textContent = isReopen
      ? "Причина переоткрытия (обязательна)"
      : "Причина (необязательна)";
    dom.periodCloseError.hidden = true;
    dom.periodCloseError.textContent = "";
    if (!dom.periodCloseDialog.open) dom.periodCloseDialog.showModal();
    window.setTimeout(() => dom.periodCloseReason.focus(), 0);
  }

  function closePeriodCloseDialog() {
    if (dom.periodCloseDialog.open) dom.periodCloseDialog.close();
    pendingPeriodAction = null;
  }

  async function submitPeriodClose(event) {
    event.preventDefault();
    if (!pendingPeriodAction) { closePeriodCloseDialog(); return; }
    const { action, level, periodKey } = pendingPeriodAction;
    const reason = dom.periodCloseReason.value.trim();
    if (action === "reopen" && !reason) {
      dom.periodCloseError.textContent = "Укажите причину переоткрытия";
      dom.periodCloseError.hidden = false;
      return;
    }
    dom.periodCloseError.hidden = true;
    try {
      const type = action === "reopen" ? "reopenPeriod" : "closePeriod";
      await mutate(type, { level, periodKey, reason, actor: currentActorName() });
      closePeriodCloseDialog();
      showToast(action === "reopen" ? "Период переоткрыт" : "Период закрыт");
    } catch (error) {
      dom.periodCloseError.textContent = error.message;
      dom.periodCloseError.hidden = false;
    }
  }

  async function loadManagedUsers() {
    if (!sharedMode || !canManageUsersClient()) {
      managedUsers = [];
      return;
    }
    const response = await fetch("/api/admin/users", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      handleSessionExpired();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Не удалось загрузить пользователей");
    managedUsers = Array.isArray(payload.users) ? payload.users : [];
  }

  async function openUserAdminDialog() {
    if (!canManageUsersClient()) return;
    try {
      await loadManagedUsers();
      resetManagedUserForm();
      renderManagedUserList();
      dom.userAdminDialog.showModal();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function closeUserAdminDialog() {
    dom.userAdminDialog.close();
    dom.userAdminError.textContent = "";
  }

  function resetManagedUserForm() {
    dom.userEditId.value = "";
    dom.userStaffLoginInput.value = "";
    dom.userDisplayNameInput.value = "";
    dom.userRoleSelect.value = "user";
    dom.userDefaultAccess.value = "hidden";
    dom.userAdminError.textContent = "";
    renderUserLocationAccess();
  }

  function renderUserLocationAccess() {
    if (dom.userRoleSelect.value === "admin") {
      dom.userLocationAccess.innerHTML = '<div class="access-admin-note">Администратор видит и редактирует все локации.</div>';
      return;
    }
    const account = managedUsers.find((item) => item.id === dom.userEditId.value);
    dom.userLocationAccess.innerHTML = state.locations.map((location) => {
      const selected = account?.locationAccess?.[location.id] || "inherit";
      return `<label class="location-access-row">
        <span><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml(location.code || "Код не задан")}</small></span>
        <select data-location-access="${escapeAttribute(location.id)}">
          <option value="inherit" ${selected === "inherit" ? "selected" : ""}>По общему правилу</option>
          <option value="hidden" ${selected === "hidden" ? "selected" : ""}>Скрыта</option>
          <option value="view" ${selected === "view" ? "selected" : ""}>Просмотр + комментарии</option>
          <option value="edit" ${selected === "edit" ? "selected" : ""}>Редактирование</option>
        </select>
      </label>`;
    }).join("") || '<div class="empty-inline">Локации ещё не созданы.</div>';
  }

  function renderManagedUserList() {
    dom.managedUserList.innerHTML = managedUsers.map((account) => {
      const accessValues = Object.values(account.locationAccess || {});
      const accessSummary = account.role === "admin"
        ? "Все локации · редактирование"
        : `${accessValues.filter((value) => value === "edit").length} ред. · ${accessValues.filter((value) => value === "view").length} просмотр · ${account.defaultLocationAccess === "view" ? "остальные видны" : "остальные скрыты"}`;
      return `<article class="managed-user ${account.archived ? "is-archived" : ""}">
        <div class="managed-user-avatar">${escapeHtml(initials(account.name))}</div>
        <div class="managed-user-body">
          <div><strong>${escapeHtml(account.name)}</strong><span class="role-badge">${account.role === "admin" ? "Администратор" : "Пользователь"}</span>${account.archived ? '<span class="status-label">Отключён</span>' : ""}</div>
          <small>@${escapeHtml(account.staffLogin || "не привязан")} · ${account.staffUidBound ? "identity подтверждена" : "ожидает первый вход"} · ${escapeHtml(accessSummary)}</small>
        </div>
        <div class="row-actions">
          <button class="row-action" type="button" data-user-action="edit" data-user-id="${escapeAttribute(account.id)}" title="Редактировать">✎</button>
          <button class="row-action ${account.archived ? "success" : "danger"}" type="button" data-user-action="archive" data-user-id="${escapeAttribute(account.id)}" title="${account.archived ? "Включить" : "Отключить"}">${account.archived ? "↺" : "×"}</button>
        </div>
      </article>`;
    }).join("") || '<div class="empty-inline">Пользователей пока нет.</div>';
  }

  async function saveManagedUser(event) {
    event.preventDefault();
    if (!canManageUsersClient()) return;
    dom.userAdminError.textContent = "";
    const id = dom.userEditId.value;
    const locationAccess = {};
    dom.userLocationAccess.querySelectorAll("[data-location-access]").forEach((select) => {
      if (select.value !== "inherit") locationAccess[select.dataset.locationAccess] = select.value;
    });
    try {
      await mutate("saveAccount", {
        id: id || undefined,
        staffLogin: dom.userStaffLoginInput.value.trim(),
        name: dom.userDisplayNameInput.value.trim(),
        role: dom.userRoleSelect.value,
        defaultLocationAccess: dom.userDefaultAccess.value,
        locationAccess
      });
      await refreshAuthSummary();
      await loadManagedUsers();
      renderAll();
      resetManagedUserForm();
      renderManagedUserList();
      showToast(id ? "Пользователь обновлён" : "Пользователь добавлен");
    } catch (error) {
      dom.userAdminError.textContent = error.message;
    }
  }

  async function handleManagedUserAction(event) {
    if (!canManageUsersClient()) return;
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const account = managedUsers.find((item) => item.id === button.dataset.userId);
    if (!account) return;
    if (button.dataset.userAction === "edit") {
      dom.userEditId.value = account.id;
      dom.userStaffLoginInput.value = account.staffLogin || "";
      dom.userDisplayNameInput.value = account.name;
      dom.userRoleSelect.value = account.role;
      dom.userDefaultAccess.value = account.defaultLocationAccess || "hidden";
      dom.userAdminError.textContent = "";
      renderUserLocationAccess();
      dom.userStaffLoginInput.focus();
      return;
    }
    const archived = !account.archived;
    if (!confirmAction(`${archived ? "Отключить" : "Включить"} пользователя «${account.name}»?`)) return;
    try {
      await mutate("archiveAccount", { id: account.id, archived });
      await refreshAuthSummary();
      await loadManagedUsers();
      renderAll();
      renderManagedUserList();
      showToast(archived ? "Пользователь отключён" : "Пользователь включён");
    } catch (error) {
      dom.userAdminError.textContent = error.message;
    }
  }

  function renderUser() {
    const name = sharedMode ? (currentUser?.name || "Вход не выполнен") : (profile.name || "Имя не задано");
    dom.sidebarUserName.textContent = name;
    dom.userAvatar.textContent = initials(translateString(name));
    dom.openProfileBtn.textContent = sharedMode
      ? (authMode === "access-code" ? "Профиль пользователя" : "Профиль Staff") : "Изменить профиль";
    dom.logoutBtn.hidden = !["access-code", "corporate-idm"].includes(authMode) || !currentUser;
  }

  function loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(nextTheme) {
    theme = nextTheme === "dark" ? "dark" : "light";
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      const nextLabel = theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
      button.setAttribute("aria-label", nextLabel);
      button.title = nextLabel;
      button.setAttribute("aria-pressed", String(theme === "dark"));
    }
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try { localStorage.setItem(THEME_KEY, nextTheme); } catch {}
  }

  function loadLanguage() {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved === "ru" || saved === "en") return saved;
    } catch {}
    return "ru";
  }

  function translateToEnglish(value) {
    if (typeof value !== "string") return value;
    if (EN[value]) return EN[value];
    if (value.endsWith(":") && EN[value.slice(0, -1)]) return `${EN[value.slice(0, -1)]}:`;
    const quarter = value.match(/^(\d) квартал (\d{4})$/);
    if (quarter) return `Q${quarter[1]} ${quarter[2]}`;
    const storedQuarter = value.match(/^(\d{4})-Q([1-4])$/);
    if (storedQuarter) return `Q${storedQuarter[2]} ${storedQuarter[1]}`;
    const expenses = value.match(/^(\d+) расход(?:а|ов)?$/);
    if (expenses) return `${expenses[1]} expense${expenses[1] === "1" ? "" : "s"}`;
    const forecasts = value.match(/^(\d+) активных распределений$/);
    if (forecasts) return `${forecasts[1]} active allocation${forecasts[1] === "1" ? "" : "s"}`;
    let match = value.match(/^Выгрузка CSV учитывает выбранные фильтры: (\d+) расход(?:а|ов)?\.$/);
    if (match) return `The CSV export respects the selected filters: ${match[1]} expense${match[1] === "1" ? "" : "s"}.`;
    match = value.match(/^Курсы (.+): (\d+) валют(?:а|ы)?$/);
    if (match) return `Rates for ${translateToEnglish(match[1])}: ${match[2]} currenc${match[2] === "1" ? "y" : "ies"}`;
    match = value.match(/^Источник: (мои тикеты TAXIASSIST|вся очередь TAXIASSIST)\. Новые расходы: (.+)\. Следующая автоматическая попытка: (.+)\.$/);
    if (match) {
      const source = match[1] === "мои тикеты TAXIASSIST" ? "my TAXIASSIST issues" : "the entire TAXIASSIST queue";
      const nextAttempt = match[3] === "сейчас" ? "now" : match[3];
      return `Source: ${source}. New expenses: ${translateToEnglish(match[2])}. Next automatic attempt: ${nextAttempt}.`;
    }
    match = value.match(/^Синхронизировать за (.+)$/);
    if (match) return `Sync ${match[1]}`;
    match = value.match(/^(Закрыть|Переоткрыть) (.+)$/);
    if (match) return `${match[1] === "Закрыть" ? "Close" : "Reopen"} ${match[2]}`;
    match = value.match(/^Расходов в периоде: (\d+)$/);
    if (match) return `Expenses in period: ${match[1]}`;
    match = value.match(/^Активных прогнозов: (\d+); требуют решения: (\d+)$/);
    if (match) return `Active forecasts: ${match[1]}; require action: ${match[2]}`;
    match = value.match(/^По запросу «(.+)» ничего не найдено$/);
    if (match) return `No results for “${match[1]}”`;
    match = value.match(/^Найдено записей: (\d+)$/);
    if (match) return `Results found: ${match[1]}`;
    match = value.match(/^Не задан курс (.+) для (.+)$/);
    if (match) return `No ${match[1]} exchange rate for ${match[2]}`;
    match = value.match(/^(.+)\. Закройте форму и откройте её снова\.$/);
    if (match) return `${translateToEnglish(match[1])}. Close and reopen the form.`;
    match = value.match(/^Валюта (.+) повторяется у статьи проекта (.+)$/);
    if (match) return `Currency ${match[1]} is duplicated for project item ${match[2]}`;
    match = value.match(/^Нельзя менять помесячный план: месяц (.+) закрыт\. Сначала переоткройте его\.$/);
    if (match) return `The monthly plan cannot be changed because ${match[1]} is closed. Reopen it first.`;
    match = value.match(/^Нельзя копировать бюджет: месяц (.+) закрыт\. Сначала переоткройте его\.$/);
    if (match) return `The budget cannot be copied because ${match[1]} is closed. Reopen it first.`;
    match = value.match(/^Для (.+) в этом квартале нет бюджета в (.+)$/);
    if (match) return `There is no ${match[2]} budget for ${match[1]} in this quarter`;
    match = value.match(/^Невозможно удалить: есть (\d+) (?:расход|расхода|расходов)\. Сначала удалите или перенесите их\.$/);
    if (match) return `Cannot delete: ${match[1]} expense${match[1] === "1" ? "" : "s"} exist. Remove or move them first.`;
    match = value.match(/^Невозможно удалить: есть (\d+) (?:расход|расхода|расходов)\.$/);
    if (match) return `Cannot delete: ${match[1]} expense${match[1] === "1" ? "" : "s"} exist.`;
    match = value.match(/^Невозможно удалить: есть (\d+) прогнозных распределений\.$/);
    if (match) return `Cannot delete: ${match[1]} forecast allocation${match[1] === "1" ? "" : "s"} exist.`;
    match = value.match(/^Удалить статью «(.+)» из проекта «(.+)»\?$/);
    if (match) return `Delete item “${match[1]}” from project “${match[2]}”?`;
    match = value.match(/^(Отключить|Включить) пользователя «(.+)»\?$/);
    if (match) return `${match[1] === "Отключить" ? "Disable" : "Enable"} user “${match[2]}”?`;
    match = value.match(/^(Архивировать|Восстановить) локацию «(.+)»\?$/);
    if (match) return `${match[1] === "Архивировать" ? "Archive" : "Restore"} location “${match[2]}”?`;
    match = value.match(/^Удалить локацию «(.+)»\? Это действие нельзя отменить\.$/);
    if (match) return `Delete location “${match[1]}”? This action cannot be undone.`;
    match = value.match(/^Аннулировать расход на (.+)\? Он перестанет учитываться в факте\.$/);
    if (match) return `Cancel the ${match[1]} expense? It will no longer be included in actuals.`;
    match = value.match(/^Вернуть аннулированный расход на (.+)\? Он снова будет учитываться в факте\.$/);
    if (match) return `Restore the canceled ${match[1]} expense? It will be included in actuals again.`;
    match = value.match(/^Импорт заменит (.+)\. Продолжить\?$/);
    if (match) return `The import will replace ${translateToEnglish(match[1])}. Continue?`;
    match = value.match(/^Бюджет за (.+) уже загружен\. Обновить план из выбранного файла\? Записанные расходы, прогнозы и комментарии сохранятся\.$/);
    if (match) return `Budget for ${translateToEnglish(match[1])} is already loaded. Update the plan from the selected file? Recorded expenses, forecasts, and comments will be preserved.`;
    match = value.match(/^Не удалось (импортировать файл|удалить локальные данные|прочитать Excel|подготовить импорт): (.+)$/);
    if (match) {
      const prefix = {
        "импортировать файл": "Could not import the file",
        "удалить локальные данные": "Could not delete local data",
        "прочитать Excel": "Could not read the Excel file",
        "подготовить импорт": "Could not prepare the import"
      }[match[1]];
      return `${prefix}: ${translateToEnglish(match[2])}`;
    }
    match = value.match(/^Импорт не применён: (.+)$/);
    if (match) return `Import was not applied: ${translateToEnglish(match[1])}`;
    match = value.match(/^Результат импорта не подтверждён: (.+)$/);
    if (match) return `The import result could not be confirmed: ${translateToEnglish(match[1])}`;
    match = value.match(/^Проверяю (.+) за (.+)…$/);
    if (match) return `Checking ${translateToEnglish(match[1])} for ${match[2]}…`;
    match = value.match(/^Последняя успешная синхронизация: (.+)$/);
    if (match) return `Last successful synchronization: ${match[1]
      .replace("мои тикеты TAXIASSIST", "my TAXIASSIST issues")
      .replace("вся очередь TAXIASSIST", "the entire TAXIASSIST queue")}`;
    match = value.match(/^Tracker · (.+): расходов (\d+) · резервов (\d+) · оплат (\d+) · предупреждений (\d+)$/);
    if (match) return `Tracker · ${match[1]}: expenses ${match[2]} · reserves ${match[3]} · payments ${match[4]} · warnings ${match[5]}`;
    match = value.match(/^Разнести (.+)$/);
    if (match) return `Allocate ${match[1]}`;
    match = value.match(/^Все следующие тикеты с проектом (.+) будут разнесены в выбранный проект\.$/);
    if (match) return `All future issues with project ${match[1]} will be allocated to the selected project.`;
    match = value.match(/^Офис (.+) уникален и будет всегда разнесён в выбранную локацию\.$/);
    if (match) return `Office ${match[1]} is unique and will always be allocated to the selected location.`;
    match = value.match(/^Сопоставление (.+) удалено$/);
    if (match) return `Mapping for ${match[1]} removed`;
    match = value.match(/^CSV подготовлен для Excel: расходов (\d+), прогнозов (\d+)$/);
    if (match) return `CSV prepared for Excel: ${match[1]} expenses, ${match[2]} forecasts`;
    match = value.match(/^Импорт отчёта завершён: (\d+) тикетов, (\d+) активных распределений(?: · пропущено строк: (\d+))?$/);
    if (match) return `Report import complete: ${match[1]} issues, ${match[2]} active allocations${match[3] ? ` · rows skipped: ${match[3]}` : ""}`;
    match = value.match(/^Бюджет за (.+) импортирован: (\d+) строк, (\d+) курсов$/);
    if (match) return `Budget for ${match[1]} imported: ${match[2]} rows, ${match[3]} exchange rates`;
    match = value.match(/^Проверяю структуру (.+)…$/);
    if (match) return `Checking ${match[1]}…`;
    match = value.match(/^(.+) · доступно периодов: (\d+)\. Выберите период импорта\.$/);
    if (match) return `${match[1]} · periods available: ${match[2]}. Select an import period.`;
    match = value.match(/^Читаю (.+) за (.+)…$/);
    if (match) return `Reading ${match[1]} for ${match[2]}…`;
    match = value.match(/^Показаны первые (\d+) строк из (\d+)\. Правила применятся ко всем строкам\.$/);
    if (match) return `Showing the first ${match[1]} of ${match[2]} rows. The rules will be applied to every row.`;
    match = value.match(/^Проверены все (\d+) строк\.$/);
    if (match) return `All ${match[1]} rows checked.`;
    match = value.match(/^Показаны первые (\d+) строк из (\d+)\. Все строки будут импортированы\.$/);
    if (match) return `Showing the first ${match[1]} of ${match[2]} rows. Every row will be imported.`;
    match = value.match(/^Будут импортированы все (\d+) ненулевых сумм\.$/);
    if (match) return `All ${match[1]} non-zero amounts will be imported.`;
    match = value.match(/^Найдены различия в названиях \((\d+)\)$/);
    if (match) return `Name differences found (${match[1]})`;
    match = value.match(/^(\d+) с суммами · \+(\d+) новых$/);
    if (match) return `${match[1]} with amounts · ${match[2]} new`;
    match = value.match(/^(\d+) будут заменены$/);
    if (match) return `${match[1]} will be replaced`;
    match = value.match(/^(\d+) конфликтов статуса и даты · (\d+) нулевых$/);
    if (match) return `${match[1]} status/date conflicts · ${match[2]} zero-value rows`;
    match = value.match(/^(\d+) активных просрочено$/);
    if (match) return `${match[1]} active and overdue`;
    match = value.match(/^Строка (\d+): (.+)$/);
    if (match) return `Row ${match[1]}: ${translateToEnglish(match[2])}`;
    match = value.match(/^И ещё (\d+)…$/);
    if (match) return `And ${match[1]} more…`;
    match = value.match(/^(.+) · (\d+) строк$/);
    if (match) return `${match[1]} · ${match[2]} rows`;
    match = value.match(/^(.+) Новых или изменённых прогнозов нет\.$/);
    if (match) return `${translateToEnglish(match[1])} There are no new or changed forecasts.`;
    match = value.match(/^(.+) Этот файл уже импортирован — можно открыть существующие прогнозы\.$/);
    if (match) return `${translateToEnglish(match[1])} This file has already been imported — you can open the existing forecasts.`;
    let withImportFragments = value;
    [
      ["прочитано строк:", "rows read:"],
      ["пропущено пустых/некорректных строк:", "empty/invalid rows skipped:"],
      ["нечисловых сумм:", "non-numeric amounts:"],
      ["восстановлено кодов проекта:", "project codes recovered:"],
      ["курсов валют:", "exchange rates:"],
      ["лист «курс» не найден", "exchange-rate sheet not found"]
    ].forEach(([source, target]) => { withImportFragments = withImportFragments.replace(source, target); });
    if (withImportFragments !== value) return withImportFragments;
    match = value.match(/^Закрыто месяцев: (\d+) из 3$/);
    if (match) return `Months closed: ${match[1]} of 3`;
    match = value.match(/^(Переоткрытие|Закрытие) (квартала|месяца)$/);
    if (match) return `${match[1] === "Переоткрытие" ? "Reopen" : "Close"} ${match[2] === "квартала" ? "quarter" : "month"}`;
    match = value.match(/^Будут переоткрыты: квартал\. Месяцы останутся закрытыми\.$/);
    if (match) return "The quarter will be reopened. Its months will remain closed.";
    match = value.match(/^RUB план (.+) \/ факт (.+) \/ прогноз (.+) \/ свободно (.+)$/);
    if (match) return `RUB plan ${match[1]} / actual ${match[2]} / forecast ${match[3]} / available ${match[4]}`;
    match = value.match(/^@(.+) · корпоративный SSO$/);
    if (match) return `@${match[1]} · corporate SSO`;
    match = value.match(/^(\d+) ред\. · (\d+) просмотр · (остальные видны|остальные скрыты)$/);
    if (match) return `${match[1]} edit · ${match[2]} view · ${match[3] === "остальные видны" ? "all others visible" : "all others hidden"}`;
    match = value.match(/^@(.+) · (identity подтверждена|ожидает первый вход) · (.+)$/);
    if (match) return `@${match[1]} · ${match[2] === "identity подтверждена" ? "identity verified" : "awaiting first sign-in"} · ${translateToEnglish(match[3])}`;
    match = value.match(/^Локация (.+)$/);
    if (match) return `Location ${match[1]}`;
    const withQuarter = value.replace(/(^|\s)([1-4]) квартал (\d{4})(?=$|\s)/g,
      (_, prefix, number, year) => `${prefix}Q${number} ${year}`);
    if (withQuarter !== value) return withQuarter;
    return value;
  }

  function translateString(value) {
    return language === "en" ? translateToEnglish(value) : value;
  }

  function replaceTrimmed(source, replacement) {
    const trimmed = source.trim();
    return trimmed ? source.replace(trimmed, replacement) : source;
  }

  function translateTextNode(node, restore = false) {
    if (!node?.nodeValue?.trim()) return;
    const current = node.nodeValue;
    if (language !== "en") {
      const source = originalText.get(node);
      if (restore && source && current !== source) node.nodeValue = source;
      else originalText.set(node, current);
      return;
    }
    let source = originalText.get(node);
    const expected = source ? replaceTrimmed(source, translateToEnglish(source.trim())) : null;
    if (!source || current !== expected) {
      source = current;
      originalText.set(node, source);
    }
    const translated = replaceTrimmed(source, translateToEnglish(source.trim()));
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }

  function translateElementAttributes(element, restore = false) {
    if (!element?.hasAttribute) return;
    if (!originalAttributes.has(element)) originalAttributes.set(element, new Map());
    const originals = originalAttributes.get(element);
    TRANSLATABLE_ATTRIBUTES.forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute);
      if (language !== "en") {
        const source = originals.get(attribute);
        if (restore && source != null && current !== source) element.setAttribute(attribute, source);
        else originals.set(attribute, current);
        return;
      }
      let source = originals.get(attribute);
      const expected = source == null ? null : translateToEnglish(source);
      if (source == null || current !== expected) {
        source = current;
        originals.set(attribute, source);
      }
      const translated = translateToEnglish(source);
      if (current !== translated) element.setAttribute(attribute, translated);
    });
  }

  function translateSubtree(root, restore = false) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root, restore);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root, restore);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, restore);
      else translateElementAttributes(node, restore);
    }
  }

  function startLanguageObserver() {
    if (languageObserver || typeof MutationObserver === "undefined" || !document.body) return;
    languageObserver = new MutationObserver((mutations) => {
      if (language !== "en") return;
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") translateTextNode(mutation.target);
        if (mutation.type === "attributes") translateElementAttributes(mutation.target);
        mutation.addedNodes?.forEach((node) => translateSubtree(node));
      });
    });
    languageObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES
    });
  }

  function translatePage() {
    if (typeof document === "undefined" || !document.body) return;
    translateSubtree(document.body, language === "ru");
    dom.languageToggle.textContent = language === "ru" ? "EN" : "RU";
    dom.languageToggle.title = language === "ru" ? "Switch to English" : "Switch to Russian";
    dom.languageToggle.setAttribute("aria-label", dom.languageToggle.title);
    startLanguageObserver();
  }

  function applyLanguage(nextLanguage) {
    language = nextLanguage === "en" ? "en" : "ru";
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.title = language === "en" ? "Plan · Actual — office budget" : "План · Факт — бюджет офиса";
    const applicationName = document.querySelector('meta[name="application-name"]');
    if (applicationName) applicationName.content = language === "en" ? "Plan vs Actual" : "План Факт";
    const ndaNoticeLink = document.getElementById("nda-notice-link");
    if (ndaNoticeLink) ndaNoticeLink.href = ndaNoticeUrl(language);
    translatePage();
  }

  function ndaNoticeUrl(nextLanguage) {
    return nextLanguage === "en" ? NDA_NOTICE_URLS.en : NDA_NOTICE_URLS.ru;
  }

  function toggleLanguage() {
    applyLanguage(language === "ru" ? "en" : "ru");
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch {}
    renderAll();
  }

  function populateArticleControls() {
    const currentFilter = dom.expenseArticleFilter.value || "all";
    const filterOptions = ['<option value="all">Все проекты</option>']
      .concat(state.articles.map((article) => `<option value="${escapeAttribute(article.id)}">${escapeHtml(articleOptionLabel(article))}</option>`));
    dom.expenseArticleFilter.innerHTML = filterOptions.join("");
    dom.expenseArticleFilter.value = state.articles.some((article) => article.id === currentFilter) ? currentFilter : "all";
    const currentForecastFilter = dom.forecastArticleFilter.value || "all";
    dom.forecastArticleFilter.innerHTML = filterOptions.join("");
    dom.forecastArticleFilter.value = state.articles.some((article) => article.id === currentForecastFilter)
      ? currentForecastFilter : "all";
    populateExpenseAttributeFilters();

    const currentArticle = dom.expenseArticle.value;
    dom.expenseArticle.innerHTML = state.articles.filter((article) => !article.archived)
      .map((article) => `<option value="${escapeAttribute(article.id)}">${escapeHtml(articleOptionLabel(article))}</option>`)
      .join("");
    if (state.articles.some((article) => article.id === currentArticle)) dom.expenseArticle.value = currentArticle;
    populateExpenseProjectArticles();

    const currentForecastArticle = dom.forecastArticle.value;
    dom.forecastArticle.innerHTML = state.articles.filter((article) => !article.archived)
      .map((article) => `<option value="${escapeAttribute(article.id)}">${escapeHtml(articleOptionLabel(article))}</option>`)
      .join("");
    if (state.articles.some((article) => article.id === currentForecastArticle)) dom.forecastArticle.value = currentForecastArticle;
    populateForecastProjectArticles();
  }

  function expenseMatchesResponsible(expense, selectedResponsible, responsibleLookup) {
    if (!selectedResponsible || selectedResponsible === "all") return true;
    const groups = responsibleLookup
      ? responsibleLookup(expense)
      : projectResponsibleGroups(expense.articleId, expense.locationId, expense.quarterKey);
    if (selectedResponsible === UNASSIGNED_RESPONSIBLE) return !groups.length;
    return groups.includes(selectedResponsible);
  }

  function expenseMatchesBudgetType(expense, selectedType, articleLookup) {
    if (!selectedType || selectedType === "all") return true;
    const article = articleLookup
      ? articleLookup(expense)
      : articleById(expense.articleId);
    return normalizeBudgetType(article?.budgetType) === selectedType;
  }

  function expenseMatchesAttributeFilters(expense, filters, attrsLookup) {
    const service = filters?.service || "all";
    const legalEntity = filters?.legalEntity || "all";
    const location = filters?.location || "all";
    if (service === "all" && legalEntity === "all" && location === "all") return true;
    const attr = attrsLookup ? attrsLookup(expense) : projectAttributesFor(expense.articleId, expense.locationId, expense.quarterKey);
    if (service !== "all" && attr.service !== service) return false;
    if (legalEntity !== "all" && attr.legalEntity !== legalEntity) return false;
    if (location !== "all" && attr.location !== location) return false;
    return true;
  }

  function populateAttributeFilter(selectEl, currentFilter, allLabel, values, opts = {}) {
    const locale = opts.locale || (language === "en" ? "en" : "ru");
    const sorted = [...values].sort((a, b) => a.localeCompare(b, locale));
    const options = ['<option value="all">' + escapeHtml(translateString(allLabel)) + '</option>']
      .concat(sorted.map((value) => '<option value="' + escapeAttribute(value) + '">' + escapeHtml(value) + '</option>'));
    if (opts.unassignedLabel) {
      options.push('<option value="' + UNASSIGNED_RESPONSIBLE + '">' + escapeHtml(translateString(opts.unassignedLabel)) + '</option>');
    }
    selectEl.innerHTML = options.join("");
    const allowUnassigned = Boolean(opts.unassignedLabel);
    selectEl.value = (values.has(currentFilter) || (allowUnassigned && currentFilter === UNASSIGNED_RESPONSIBLE))
      ? currentFilter
      : "all";
  }

  function populateExpenseAttributeFilters() {
    const key = selectedQuarterKey();
    const visible = effectiveLocationSet();
    const services = new Set();
    const legals = new Set();
    const offices = new Set();
    const responsibles = new Set();
    let hasUnassignedResponsible = false;
    (state.expenses || []).forEach((expense) => {
      if (expense.quarterKey !== key || !visible.has(expense.locationId)) return;
      const attr = projectAttributesFor(expense.articleId, expense.locationId, expense.quarterKey);
      if (attr.service) services.add(attr.service);
      if (attr.legalEntity) legals.add(attr.legalEntity);
      if (attr.location) offices.add(attr.location);
      const groups = projectResponsibleGroups(expense.articleId, expense.locationId, expense.quarterKey);
      if (groups.length) groups.forEach((name) => responsibles.add(name));
      else hasUnassignedResponsible = true;
    });
    (state.forecastTickets || []).flatMap((ticket) => ticket.allocations || []).forEach((allocation) => {
      if (allocation.quarterKey !== key || !visible.has(allocation.locationId)) return;
      const attr = projectAttributesFor(allocation.articleId, allocation.locationId, allocation.quarterKey);
      if (attr.service) services.add(attr.service);
      if (attr.legalEntity) legals.add(attr.legalEntity);
      if (attr.location) offices.add(attr.location);
      const groups = projectResponsibleGroups(allocation.articleId, allocation.locationId, allocation.quarterKey);
      if (groups.length) groups.forEach((name) => responsibles.add(name));
      else hasUnassignedResponsible = true;
    });
    populateAttributeFilter(dom.expenseServiceFilter, dom.expenseServiceFilter.value || "all", "Все сервисы", services);
    populateAttributeFilter(dom.expenseLegalFilter, dom.expenseLegalFilter.value || "all", "Все юр лица", legals);
    populateAttributeFilter(dom.expenseLocationFilter, dom.expenseLocationFilter.value || "all", "Все локации", offices);
    populateAttributeFilter(
      dom.expenseResponsibleFilter, dom.expenseResponsibleFilter.value || "all",
      "Все ответственные", responsibles,
      hasUnassignedResponsible ? { unassignedLabel: "Без ответственного" } : {}
    );
  }

  function populateExpenseProjectArticles(preferredSubarticleId) {
    const project = articleById(dom.expenseArticle.value);
    const current = preferredSubarticleId ?? dom.expenseSubarticle.value;
    const quarter = validDateInput(dom.expenseDate.value)
      ? quarterKeyFromDateInput(dom.expenseDate.value)
      : selectedQuarterKey();
    const contextual = projectArticlesForContext(project, expenseFormLocationId(), quarter);
    const projectArticles = contextual.length ? contextual : activeProjectArticles(project);
    dom.expenseSubarticle.innerHTML = '<option value="">На уровне проекта (без статьи)</option>' + projectArticles
      .map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.code ? `${item.name} · ${item.code}` : item.name)}</option>`)
      .join("");
    dom.expenseSubarticle.value = projectArticles.some((item) => item.id === current) ? current : "";
    dom.expenseSubarticle.disabled = !project;
  }

  function populateForecastProjectArticles(preferredSubarticleId) {
    const project = articleById(dom.forecastArticle.value);
    const current = preferredSubarticleId ?? dom.forecastSubarticle.value;
    const quarter = validDateInput(dom.forecastDate.value)
      ? quarterKeyFromDateInput(dom.forecastDate.value)
      : selectedQuarterKey();
    const contextual = projectArticlesForContext(project, dom.forecastLocationId.value || selectedLocation, quarter);
    const projectArticles = contextual.length ? contextual : activeProjectArticles(project);
    dom.forecastSubarticle.innerHTML = '<option value="">На уровне проекта (без статьи)</option>' + projectArticles
      .map((item) => `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.name)}</option>`)
      .join("");
    dom.forecastSubarticle.value = projectArticles.some((item) => item.id === current) ? current : "";
    dom.forecastSubarticle.disabled = !project;
  }

  function loadSelectedLocation() {
    try {
      const stored = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
      if (stored.locationId === ALL_LOCATIONS) return ALL_LOCATIONS;
      if (typeof stored.locationId === "string"
        && state.locations.some((l) => l.id === stored.locationId && !l.archived)) {
        return stored.locationId;
      }
    } catch {}
    const firstActive = activeLocations()[0];
    return firstActive ? firstActive.id : (state.locations[0]?.id || ALL_LOCATIONS);
  }

  function saveSelectedLocation() {
    try {
      const stored = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
      stored.locationId = selectedLocation;
      localStorage.setItem(UI_KEY, JSON.stringify(stored));
    } catch {}
  }

  function selectLocation(locationId) {
    if (selectedLocation === locationId) return;
    if (locationId !== ALL_LOCATIONS && !state.locations.some((l) => l.id === locationId)) return;
    if (budgetDirty && !confirmAction("Есть несохранённые изменения бюджета. Сменить локацию?")) return;
    selectedLocation = locationId;
    budgetEditMode = false;
    budgetDirty = false;
    saveSelectedLocation();
    renderAll();
  }

  function renderLocations() {
    renderTopbarLocation();
    if (!dom.locationList) return;
    const items = filterLocationsByQuery(activeLocations(), dom.sidebarLocationSearch?.value)
      .map((loc) => ({ id: loc.id, name: loc.name, code: loc.code }));
    if (!items.length) {
      const hasQuery = Boolean(cleanText(dom.sidebarLocationSearch?.value, 160));
      dom.locationList.innerHTML = `<div class="location-empty">${hasQuery
        ? escapeHtml(translateString("Локации не найдены"))
        : (isAdminClient()
          ? "Нет активных локаций. Создайте через «Управление локациями»."
          : "Нет доступных локаций. Обратитесь к администратору.")}</div>`;
      return;
    }
    dom.locationList.innerHTML = items.map((item) => `
      <button class="location-item ${selectedLocation === item.id ? "is-active" : ""}" type="button" data-location-id="${escapeAttribute(item.id)}" role="listitem">
        <span class="location-name">${escapeHtml(item.name)}</span>
        ${item.code ? `<span class="location-code">${escapeHtml(item.code)}</span>` : ""}
      </button>`).join("");
    renderAllLocationsItem(items);
  }

  function renderAllLocationsItem() {
    if (!dom.locationList) return;
    const hasQuery = Boolean(cleanText(dom.sidebarLocationSearch?.value, 160));
    if (hasQuery) return;
    const visibleCount = activeLocations().filter((loc) => locationPermissionClient(loc.id) !== "hidden").length;
    if (visibleCount <= 1) return;
    const allItem = `<button class="location-item location-item-all ${selectedLocation === ALL_LOCATIONS ? "is-active" : ""}" type="button" data-location-id="${escapeAttribute(ALL_LOCATIONS)}" role="listitem">
      <span class="location-name">${escapeHtml(translateString("Все локации"))}</span>
    </button>`;
    dom.locationList.insertAdjacentHTML("afterbegin", allItem);
  }

  // Локация в шапке: название и код открытой локации — пока меню задвинуто, иначе её не видно
  // (nav-drawer.css). Подсказка с полным названием — на заново созданном узле: перевод страницы
  // возвращает постоянным элементам подписи первого прохода.
  function renderTopbarLocation() {
    if (!dom.topbarLocation) return;
    const allLocations = isAllLocationsMode();
    const location = allLocations ? null : locationById(selectedLocation);
    const name = location ? location.name : translateString("Все локации");
    const markup = `<span title="${escapeAttribute(name)}">${escapeHtml(name)}</span>`;
    if (markup !== topbarLocationMarkup) {
      dom.topbarLocationValue.innerHTML = markup;
      topbarLocationMarkup = markup;
    }
    dom.topbarLocationCode.textContent = location?.code || "";
    dom.topbarLocation.hidden = allLocations ? !activeLocations().length : !location;
  }

  function renderLocationTable() {
    if (!dom.locationTableBody) return;
    const locations = filterLocationsByQuery(state.locations, dom.locationSearch?.value);
    if (!locations.length) {
      dom.locationTableBody.innerHTML = `<tr><td colspan="4" class="table-empty location-search-empty">${escapeHtml(translateString("Локации не найдены"))}</td></tr>`;
      return;
    }
    dom.locationTableBody.innerHTML = locations.map((loc) => {
      const expenseCount = state.expenses.filter((e) => e.locationId === loc.id).length;
      const forecastCount = state.forecastTickets.flatMap((ticket) => ticket.allocations || [])
        .filter((allocation) => allocation.locationId === loc.id).length;
      const canDelete = expenseCount === 0 && forecastCount === 0;
      return `
        <tr class="${loc.archived ? "archived-row" : ""}">
          <td>
            <strong>${escapeHtml(loc.name)}</strong>
            ${loc.archived ? '<span class="status-label">Архив</span>' : ""}
          </td>
          <td>${escapeHtml(loc.code || "—")}</td>
          <td class="number-cell">${expenseCount}${forecastCount ? `<small> + ${forecastCount} прогнозов</small>` : ""}</td>
          <td class="actions-cell">
            <div class="row-actions">
              <button class="row-action" type="button" data-loc-action="edit" data-loc-id="${escapeAttribute(loc.id)}" aria-label="Редактировать" title="Редактировать">✎</button>
              <button class="row-action" type="button" data-loc-action="archive" data-loc-id="${escapeAttribute(loc.id)}" aria-label="${loc.archived ? "Восстановить" : "Архивировать"}" title="${loc.archived ? "Восстановить из архива" : "Архивировать"}">${loc.archived ? "↺" : "⊠"}</button>
              <button class="row-action danger" type="button" data-loc-action="delete" data-loc-id="${escapeAttribute(loc.id)}" ${canDelete ? "" : "disabled"} aria-label="Удалить" title="${canDelete ? "Удалить" : `Нельзя удалить: есть связанные расходы или прогнозы`}">🗑</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  function filterLocationsByQuery(locations, query) {
    const needle = cleanText(query, 160).toLocaleLowerCase("ru-RU");
    if (!needle) return Array.isArray(locations) ? locations : [];
    return (Array.isArray(locations) ? locations : []).filter((location) =>
      `${location?.name || ""} ${location?.code || ""}`.toLocaleLowerCase("ru-RU").includes(needle));
  }

  function openLocationDialog() {
    if (!isAdminClient()) return;
    dom.locationFormError.textContent = "";
    dom.locationEditId.value = "";
    dom.locationNameInput.value = "";
    dom.locationCodeInput.value = "";
    if (dom.locationSearch) dom.locationSearch.value = "";
    dom.locationSaveBtn.textContent = "Добавить";
    dom.locationModalTitle.textContent = translateString("Управление локациями");
    renderLocationTable();
    dom.locationDialog.showModal();
  }

  function closeLocationDialog() {
    dom.locationDialog.close();
    dom.locationFormError.textContent = "";
  }

  async function saveLocationFromDialog() {
    if (!isAdminClient()) return;
    dom.locationFormError.textContent = "";
    const name = dom.locationNameInput.value.trim();
    const code = dom.locationCodeInput.value.trim();
    const editId = dom.locationEditId.value;
    if (!name) {
      dom.locationFormError.textContent = "Введите название локации";
      return;
    }
    try {
      if (editId) {
        await mutate("updateLocation", { id: editId, name, code });
        showToast("Локация обновлена");
      } else {
        await mutate("addLocation", { id: createId(), name, code });
        showToast("Локация добавлена");
      }
      dom.locationEditId.value = "";
      dom.locationNameInput.value = "";
      dom.locationCodeInput.value = "";
      dom.locationSaveBtn.textContent = "Добавить";
      renderLocationTable();
    } catch (error) {
      dom.locationFormError.textContent = error.message;
    }
  }

  async function handleLocationTableAction(event) {
    if (!isAdminClient()) return;
    const button = event.target.closest("[data-loc-action]");
    if (!button) return;
    const { locAction, locId } = button.dataset;
    const loc = state.locations.find((l) => l.id === locId);
    if (!loc) return;

    if (locAction === "edit") {
      dom.locationEditId.value = loc.id;
      dom.locationNameInput.value = loc.name;
      dom.locationCodeInput.value = loc.code || "";
      dom.locationSaveBtn.textContent = "Сохранить";
      dom.locationFormError.textContent = "";
      dom.locationNameInput.focus();
      return;
    }

    if (locAction === "archive") {
      const makeArchived = !loc.archived;
      const verb = makeArchived ? "Архивировать" : "Восстановить";
      if (!confirmAction(`${verb} локацию «${loc.name}»?`)) return;
      try {
        await mutate("archiveLocation", { id: loc.id, archived: makeArchived });
        if (makeArchived && selectedLocation === loc.id) {
          const firstActive = activeLocations()[0];
          selectLocation(firstActive ? firstActive.id : (state.locations[0]?.id || ALL_LOCATIONS));
        }
        renderLocationTable();
        showToast(makeArchived ? "Локация архивирована" : "Локация восстановлена");
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }

    if (locAction === "delete") {
      const count = state.expenses.filter((e) => e.locationId === loc.id).length;
      if (count > 0) {
        showToast(`Нельзя удалить: есть ${count} ${pluralExpensesClient(count)}. Сначала удалите или перенесите их.`, true);
        return;
      }
      if (!confirmAction(`Удалить локацию «${loc.name}»? Это действие нельзя отменить.`)) return;
      try {
        await mutate("deleteLocation", { id: loc.id });
        if (selectedLocation === loc.id) {
          const firstActive = activeLocations()[0];
          selectLocation(firstActive ? firstActive.id : (state.locations[0]?.id || ALL_LOCATIONS));
        }
        renderLocationTable();
        showToast("Локация удалена");
      } catch (error) {
        showToast(error.message, true);
      }
    }
  }

  function navigate(page) {
    if (selectedPage === "budget" && budgetDirty && page !== "budget") {
      if (!confirmAction("Есть несохранённые изменения бюджета. Перейти без сохранения?")) return;
      budgetDirty = false;
      renderBudgetEditor();
    }
    if (selectedPage === "budget" && page !== "budget") {
      budgetEditMode = false;
      releaseActiveEditLock({ resourceType: "budget", resourceId: `${selectedLocation}|${selectedQuarterKey()}` });
    }
    selectedPage = page;
    dom.navItems.forEach((button) => button.classList.toggle("is-active", button.dataset.page === page));
    dom.pages.forEach((section) => section.classList.toggle("is-active", section.id === `page-${page}`));
  }

  function handlePeriodChange() {
    const nextYear = Number(dom.yearSelect.value);
    const nextQuarter = Number(dom.quarterSelect.value);
    if (budgetDirty && !confirmAction("Есть несохранённые изменения бюджета. Сменить период без сохранения?")) {
      setPeriodControls();
      return;
    }
    releaseActiveEditLock({ resourceType: "budget", resourceId: `${selectedLocation}|${selectedQuarterKey()}` });
    selectedYear = nextYear;
    selectedQuarter = nextQuarter;
    budgetDirty = false;
    budgetEditMode = false;
    localStorage.setItem(UI_KEY, JSON.stringify({ year: selectedYear, quarter: selectedQuarter, locationId: selectedLocation }));
    renderAll();
  }

  async function openForecastDialog(ticketId = null, allocationId = null) {
    if (!ticketId && !canEditSelectedLocation()) {
      showToast("Для этой локации доступен только просмотр", true);
      return;
    }
    const existingTicket = ticketId
      ? state.forecastTickets.find((candidate) => candidate.id === ticketId)
      : null;
    const existingAllocation = existingTicket?.allocations.find((candidate) => candidate.id === allocationId);
    if (ticketId && (!existingTicket || !existingAllocation || !canEditForecastAllocation(existingTicket, existingAllocation))) return;
    if (ticketId) {
      try {
        await acquireEditLock({ resourceType: "forecast", resourceId: ticketId });
      } catch (error) {
        showToast(error.message, true);
        return;
      }
    }
    dom.forecastForm.reset();
    dom.forecastFormError.textContent = "";
    dom.forecastTicketId.value = ticketId || "";
    dom.forecastAllocationId.value = allocationId || "";
    dom.forecastLocationId.value = selectedLocation;
    populateArticleControls();

    if (ticketId && allocationId) {
      const ticket = existingTicket;
      const allocation = existingAllocation;
      dom.forecastLocationId.value = allocation.locationId;
      dom.forecastModalTitle.textContent = "Редактировать прогноз";
      dom.forecastArticle.value = allocation.articleId;
      dom.forecastDate.value = allocation.expectedDate;
      populateForecastProjectArticles(allocation.subarticleId);
      dom.forecastSubarticle.value = allocation.subarticleId || "";
      populateForecastCurrencyOptions(allocation.currency);
      dom.forecastAmount.value = formatGroupedNumber(allocation.amount);
      dom.forecastTicket.value = ticket.ticketUrl;
      dom.forecastComment.value = allocation.comment || ticket.description;
      dom.forecastArticle.disabled = true;
      dom.forecastSubarticle.disabled = true;
      dom.forecastCurrency.disabled = true;
    } else {
      dom.forecastModalTitle.textContent = "Добавить прогноз";
      dom.forecastArticle.disabled = false;
      dom.forecastSubarticle.disabled = false;
      dom.forecastCurrency.disabled = false;
      const current = periodFromDate(new Date());
      dom.forecastDate.value = selectedQuarterKey() === quarterKey(current.year, current.quarter)
        ? toDateInputValue(new Date())
        : `${quarterMonthKeysFromQuarterKey(selectedQuarterKey())[0]}-01`;
      const firstProject = state.articles.find((article) => !article.archived);
      if (firstProject) dom.forecastArticle.value = firstProject.id;
      populateForecastProjectArticles();
      populateForecastCurrencyOptions();
    }
    updateForecastDateNotice();
    if (ticketId && allocationId) {
      dom.forecastArticle.disabled = true;
      dom.forecastSubarticle.disabled = true;
      dom.forecastCurrency.disabled = true;
    }
    dom.forecastDialog.showModal();
  }

  function closeForecastDialog() {
    const ticketId = dom.forecastTicketId.value;
    dom.forecastDialog.close();
    dom.forecastFormError.textContent = "";
    if (ticketId) releaseActiveEditLock({ resourceType: "forecast", resourceId: ticketId });
  }

  function updateForecastDateNotice() {
    const value = dom.forecastDate.value;
    if (!validDateInput(value)) {
      dom.forecastAutoDate.textContent = "Выберите ожидаемую дату";
      return;
    }
    const period = periodFromDateInput(value);
    dom.forecastAutoDate.textContent = `${formatDate(value)} · ${periodLabel(period.year, period.quarter)}`;
    populateForecastProjectArticles(dom.forecastSubarticle.value);
  }

  function populateForecastCurrencyOptions(preferredCurrency) {
    const articleId = dom.forecastArticle.value;
    const subarticleId = dom.forecastSubarticle.value;
    const quarter = validDateInput(dom.forecastDate.value)
      ? quarterKeyFromDateInput(dom.forecastDate.value)
      : selectedQuarterKey();
    const planned = plannedCurrenciesForSelection(
      state, dom.forecastLocationId.value || selectedLocation, quarter, articleId, subarticleId
    );
    const choices = planned.length ? planned : availableCurrencyCodes();
    const preferred = normalizeCurrencyCode(preferredCurrency || dom.forecastCurrency.value);
    dom.forecastCurrency.innerHTML = choices.map((currency) =>
      `<option value="${currency}">${escapeHtml(currencyLabel(currency))} (${currency})</option>`).join("");
    dom.forecastCurrency.value = choices.includes(preferred) ? preferred : choices[0];
    dom.forecastCurrency.disabled = choices.length === 1;
  }

  async function saveForecast(event) {
    event.preventDefault();
    dom.forecastFormError.textContent = "";
    const ticketId = dom.forecastTicketId.value;
    const allocationId = dom.forecastAllocationId.value;
    const payload = {
      id: ticketId || createId(),
      allocationId: allocationId || createId(),
      ticketId,
      locationId: dom.forecastLocationId.value || selectedLocation,
      articleId: dom.forecastArticle.value,
      subarticleId: dom.forecastSubarticle.value,
      currency: dom.forecastCurrency.value,
      expectedDate: dom.forecastDate.value,
      amount: parseGroupedNumber(dom.forecastAmount.value),
      ticketUrl: dom.forecastTicket.value.trim(),
      comment: dom.forecastComment.value.trim(),
      author: currentActorName()
    };
    try {
      validateForecastPayload(state, payload);
      await mutate(ticketId ? "updateForecastAllocation" : "addForecast", payload);
      const period = periodFromDateInput(payload.expectedDate);
      selectedYear = period.year;
      selectedQuarter = period.quarter;
      selectedLocation = payload.locationId;
      populateYearOptions();
      setPeriodControls();
      saveSelectedLocation();
      localStorage.setItem(UI_KEY, JSON.stringify({ year: period.year, quarter: period.quarter, locationId: selectedLocation }));
      closeForecastDialog();
      navigate("forecast");
      renderAll();
      showToast(ticketId ? "Прогноз обновлён" : "Прогноз добавлен и зарезервировал бюджет");
    } catch (error) {
      dom.forecastFormError.textContent = error.message;
      setSaveStatus("Изменения не сохранены", true);
    }
  }

  async function handleForecastTableAction(event) {
    const button = event.target.closest("[data-forecast-action]");
    if (!button) return;
    const action = button.dataset.forecastAction;
    const ticketId = button.dataset.ticketId;
    const allocationId = button.dataset.allocationId;
    const ticket = state.forecastTickets.find((candidate) => candidate.id === ticketId);
    const allocation = ticket?.allocations.find((candidate) => candidate.id === allocationId);
    if (!ticket) return;
    if (action === "edit") {
      openForecastDialog(ticketId, allocationId);
      return;
    }
    if (action === "release") {
      const reason = promptAction("Почему тикет стал неактуальным? Причина сохранится в истории.", "Тикет больше не актуален");
      if (reason === null) return;
      try {
        await mutate("releaseForecastTicket", { ticketId, reason, author: currentActorName() });
        showToast("Резерв освобождён и снова доступен в квартале");
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }
    if (action === "restore") {
      if (!confirmAction("Вернуть резерв по этому прогнозному тикету?")) return;
      try {
        await mutate("restoreForecastTicket", { ticketId, author: currentActorName() });
        showToast("Резерв восстановлен");
      } catch (error) {
        showToast(error.message, true);
      }
      return;
    }
    if (action === "convert" && allocation) {
      openExpenseDialog(null, { ticketId, allocationId });
    }
  }

  function expenseForecastContext() {
    const ticketId = dom.expenseForecastTicketId?.value;
    const allocationId = dom.expenseForecastAllocationId?.value;
    if (!ticketId || !allocationId) return null;
    const ticket = state.forecastTickets.find((candidate) => candidate.id === ticketId);
    const allocation = ticket?.allocations.find((candidate) => candidate.id === allocationId);
    return ticket && allocation ? { ticket, allocation } : null;
  }

  function expenseFormLocationId() {
    return expenseForecastContext()?.allocation.locationId || selectedLocation;
  }

  function defaultActualDate(allocation) {
    const today = toDateInputValue(new Date());
    if (quarterKeyFromDateInput(today) === allocation.quarterKey) return today;
    const match = String(allocation.quarterKey || "").match(/^(\d{4})-Q([1-4])$/);
    if (!match) return "";
    const quarterEnd = new Date(Date.UTC(Number(match[1]), Number(match[2]) * 3, 0)).toISOString().slice(0, 10);
    return quarterEnd <= today ? quarterEnd : "";
  }

  function resetExpenseDialogPresentation() {
    dom.expenseForecastTicketId.value = "";
    dom.expenseForecastAllocationId.value = "";
    dom.expenseForecastSourceNote.hidden = true;
    dom.expenseDateCaption.textContent = "Дата расхода определяет квартал";
    dom.expenseSubmitBtn.textContent = "Сохранить расход";
    dom.expenseForm.dataset.lockTicket = "false";
    dom.expenseArticle.disabled = false;
    dom.expenseSubarticle.disabled = false;
    dom.expenseCurrency.disabled = false;
    dom.expenseTicket.disabled = false;
  }

  function syncExpenseFormIdentityLock() {
    const locked = Boolean(expenseForecastContext());
    if (!locked) return;
    dom.expenseArticle.disabled = true;
    dom.expenseSubarticle.disabled = true;
    dom.expenseCurrency.disabled = true;
    dom.expenseTicket.disabled = dom.expenseForm.dataset.lockTicket === "true";
  }

  async function openExpenseDialog(expenseId = null, forecastContext = null) {
    const forecastTicket = forecastContext
      ? state.forecastTickets.find((candidate) => candidate.id === forecastContext.ticketId) : null;
    const forecastAllocation = forecastTicket?.allocations.find((candidate) => candidate.id === forecastContext.allocationId);
    if (forecastContext && (!forecastTicket || !forecastAllocation || !canEditForecastAllocation(forecastTicket, forecastAllocation))) {
      showToast("Прогноз недоступен для подтверждения", true);
      return;
    }
    if (!expenseId && !forecastContext && !canEditSelectedLocation()) {
      showToast("Для этой локации доступен только просмотр", true);
      return;
    }
    const existingExpense = expenseId ? state.expenses.find((item) => item.id === expenseId) : null;
    if (expenseId && (!existingExpense || existingExpense.status === "canceled" || !canEditExpense(existingExpense))) return;
    const resource = expenseId
      ? { resourceType: "expense", resourceId: expenseId }
      : (forecastTicket ? { resourceType: "forecast", resourceId: forecastTicket.id } : null);
    if (resource) {
      try {
        await acquireEditLock(resource);
      } catch (error) {
        showToast(error.message, true);
        return;
      }
    }
    dom.expenseForm.reset();
    resetExpenseDialogPresentation();
    dom.expenseFormError.textContent = "";
    dom.expenseId.value = expenseId || "";
    populateArticleControls();

    if (forecastTicket && forecastAllocation) {
      dom.expenseForecastTicketId.value = forecastTicket.id;
      dom.expenseForecastAllocationId.value = forecastAllocation.id;
      dom.expenseModalTitle.textContent = "Записать фактический расход";
      dom.expenseDateCaption.textContent = "Подтвердите дату фактической оплаты";
      dom.expenseSubmitBtn.textContent = "Записать в факт";
      dom.expenseForecastSourceNote.hidden = false;
      dom.expenseForm.dataset.lockTicket = forecastTicket.ticketUrl ? "true" : "false";
      dom.expenseArticle.value = forecastAllocation.articleId;
      dom.expenseDate.value = defaultActualDate(forecastAllocation);
      populateExpenseProjectArticles(forecastAllocation.subarticleId);
      dom.expenseSubarticle.value = forecastAllocation.subarticleId || "";
      populateExpenseCurrencyOptions(forecastAllocation.currency);
      dom.expenseCurrency.value = forecastAllocation.currency;
      dom.expenseAmount.value = formatGroupedNumber(forecastAllocation.amount);
      dom.expenseTicket.value = forecastTicket.ticketUrl || "";
      dom.expenseComment.value = forecastAllocation.comment || forecastTicket.description;
    } else if (expenseId) {
      const expense = existingExpense;
      dom.expenseModalTitle.textContent = "Редактировать расход";
      dom.expenseArticle.value = expense.articleId;
      dom.expenseDate.value = expense.expenseDate;
      populateExpenseProjectArticles(expense.subarticleId);
      dom.expenseSubarticle.value = expense.subarticleId || "";
      populateExpenseCurrencyOptions(expense.currency);
      dom.expenseAmount.value = formatGroupedNumber(expense.amount);
      dom.expenseTicket.value = expense.ticketUrl;
      dom.expenseComment.value = expense.comment;
    } else {
      dom.expenseModalTitle.textContent = "Добавить расход";
      const current = periodFromDate(new Date());
      dom.expenseDate.value = selectedQuarterKey() === quarterKey(current.year, current.quarter)
        ? toDateInputValue(new Date())
        : "";
      const firstProject = state.articles.find((article) => !article.archived);
      if (firstProject) dom.expenseArticle.value = firstProject.id;
      populateExpenseProjectArticles();
      populateExpenseCurrencyOptions();
    }

    updateExpenseDateNotice();
    syncExpenseFormIdentityLock();
    dom.expenseDialog.showModal();
  }

  function closeExpenseDialog() {
    const resource = dom.expenseId.value
      ? { resourceType: "expense", resourceId: dom.expenseId.value }
      : (dom.expenseForecastTicketId.value
          ? { resourceType: "forecast", resourceId: dom.expenseForecastTicketId.value }
          : null);
    dom.expenseDialog.close();
    dom.expenseFormError.textContent = "";
    resetExpenseDialogPresentation();
    if (resource) releaseActiveEditLock(resource);
  }

  function updateExpenseDateNotice() {
    const value = dom.expenseDate.value;
    if (!validDateInput(value)) {
      dom.expenseAutoDate.textContent = "Выберите дату — по ней расход попадёт в нужный квартал";
      return;
    }
    const period = periodFromDateInput(value);
    dom.expenseAutoDate.textContent = `${formatDate(value)} · ${periodLabel(period.year, period.quarter)}`;
    populateExpenseProjectArticles(dom.expenseSubarticle.value);
    populateExpenseCurrencyOptions(dom.expenseCurrency.value);
    syncExpenseFormIdentityLock();
  }

  function populateExpenseCurrencyOptions(preferredCurrency) {
    const articleId = dom.expenseArticle.value;
    const subarticleId = dom.expenseSubarticle.value;
    const quarter = validDateInput(dom.expenseDate.value)
      ? quarterKeyFromDateInput(dom.expenseDate.value)
      : selectedQuarterKey();
    const planned = plannedCurrenciesForSelection(state, expenseFormLocationId(), quarter, articleId, subarticleId);
    const choices = planned.length ? planned : availableCurrencyCodes();
    const preferred = normalizeCurrencyCode(preferredCurrency || dom.expenseCurrency.value);
    dom.expenseCurrency.innerHTML = choices.map((currency) =>
      `<option value="${currency}">${escapeHtml(currencyLabel(currency))} (${currency})</option>`).join("");
    dom.expenseCurrency.value = choices.includes(preferred) ? preferred : choices[0];
    dom.expenseCurrency.disabled = choices.length === 1;
    dom.expenseCurrencyField.classList.toggle("is-auto", choices.length === 1);
  }

  async function saveExpense(event) {
    event.preventDefault();
    dom.expenseFormError.textContent = "";
    const id = dom.expenseId.value;
    const forecastContext = expenseForecastContext();
    const payload = {
      id: id || createId(),
      locationId: selectedLocation,
      articleId: dom.expenseArticle.value,
      subarticleId: dom.expenseSubarticle.value,
      currency: dom.expenseCurrency.value,
      expenseDate: dom.expenseDate.value,
      amount: parseGroupedNumber(dom.expenseAmount.value),
      ticketUrl: dom.expenseTicket.value.trim(),
      comment: dom.expenseComment.value.trim(),
      author: currentActorName()
    };

    let mutationCommitted = false;
    try {
      if (forecastContext) {
        const expenseId = createId();
        await mutate("convertForecastAllocation", {
          expenseId,
          ticketId: forecastContext.ticket.id,
          allocationId: forecastContext.allocation.id,
          amount: payload.amount,
          expenseDate: payload.expenseDate,
          ticketUrl: payload.ticketUrl,
          comment: payload.comment,
          author: currentActorName()
        });
        mutationCommitted = true;
        const period = periodFromDateInput(payload.expenseDate);
        selectedYear = period.year;
        selectedQuarter = period.quarter;
        selectedLocation = forecastContext.allocation.locationId;
        recentlyCreatedExpenseId = expenseId;
        populateYearOptions();
        setPeriodControls();
        saveSelectedLocation();
        localStorage.setItem(UI_KEY, JSON.stringify({
          year: selectedYear, quarter: selectedQuarter, locationId: selectedLocation
        }));
        resetExpenseFiltersForCreatedExpense();
        closeExpenseDialog();
        navigate("expenses");
        renderAll();
        focusRecentlyCreatedExpense();
        showToast("Фактический расход создан, прогнозный резерв снят");
        return;
      }
      validateExpensePayload(state, payload);
      await mutate(id ? "updateExpense" : "addExpense", payload);
      mutationCommitted = true;
      const period = periodFromDateInput(payload.expenseDate);
      selectedYear = period.year;
      selectedQuarter = period.quarter;
      populateYearOptions();
      setPeriodControls();
      localStorage.setItem(UI_KEY, JSON.stringify({ ...period, locationId: selectedLocation }));
      closeExpenseDialog();
      navigate("expenses");
      renderAll();
      showToast(id ? "Расход обновлён, кварталы пересчитаны" : "Расход добавлен и учтён в факте");
    } catch (error) {
      if (mutationCommitted) {
        console.warn("Расход сохранён, но последующее обновление интерфейса завершилось ошибкой.", error);
        closeExpenseDialog();
        renderAll();
        setSaveStatus("Все изменения сохранены");
        showToast("Расход сохранён; обновите страницу, если он не отображается", true);
        return;
      }
      dom.expenseFormError.textContent = error.message;
      setSaveStatus("Изменения не сохранены", true);
    }
  }

  function resetExpenseFiltersForCreatedExpense() {
    dom.expenseSearch.value = "";
    dom.expenseArticleFilter.value = "all";
    dom.expenseStatusFilter.value = "active";
    dom.expenseResponsibleFilter.value = "all";
    dom.expenseBudgetTypeFilter.value = "all";
    dom.expenseServiceFilter.value = "all";
    dom.expenseLegalFilter.value = "all";
    dom.expenseLocationFilter.value = "all";
  }

  function focusRecentlyCreatedExpense() {
    if (!recentlyCreatedExpenseId || typeof window === "undefined") return;
    const expenseId = recentlyCreatedExpenseId;
    window.setTimeout(() => {
      const row = [...dom.expensesTableBody.querySelectorAll("[data-expense-id]")]
        .find((candidate) => candidate.dataset.expenseId === expenseId);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.focus({ preventScroll: true });
      recentlyCreatedExpenseId = null;
    }, 0);
  }

  async function handleExpenseTableAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "comments") {
      openCommentDialog(id);
      return;
    }
    if (action === "edit") {
      openExpenseDialog(id);
      return;
    }
    if (action === "cancel") {
      const expense = state.expenses.find((item) => item.id === id);
      if (!expense) return;
      if (!confirmAction(`Аннулировать расход на ${formatMoney(expense.amount, expense.currency)}? Он перестанет учитываться в факте.`)) return;
      try {
        await mutate("cancelExpense", { id, author: currentActorName() });
        showToast("Расход аннулирован, остаток пересчитан");
      } catch (error) {
        showToast(error.message, true);
      }
    }
    if (action === "restore") {
      const expense = state.expenses.find((item) => item.id === id);
      if (!expense) return;
      if (!confirmAction(`Вернуть аннулированный расход на ${formatMoney(expense.amount, expense.currency)}? Он снова будет учитываться в факте.`)) return;
      try {
        await mutate("restoreExpense", { id, author: currentActorName() });
        showToast("Расход возвращён, остаток пересчитан");
      } catch (error) {
        showToast(error.message, true);
      }
    }
  }

  function openCommentDialog(expenseId) {
    const expense = state.expenses.find((item) => item.id === expenseId);
    if (!canCommentExpense(expense)) return;
    const article = articleById(expense.articleId);
    dom.commentExpenseId.value = expense.id;
    dom.commentModalTitle.textContent = article?.name || "Комментарии";
    dom.commentExpenseSummary.innerHTML = `
      <div><strong>${formatMoney(expense.amount, expense.currency)}</strong><span>${escapeHtml(formatDate(expense.expenseDate))}</span></div>
      <a href="${escapeAttribute(expense.ticketUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ticketLabel(expense.ticketUrl))} ↗</a>`;
    dom.commentText.value = "";
    dom.commentFormError.textContent = "";
    renderExpenseComments(expense.id);
    dom.commentDialog.showModal();
    dom.commentText.focus();
  }

  function renderExpenseComments(expenseId) {
    const comments = state.comments
      .filter((comment) => comment.expenseId === expenseId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    dom.commentList.innerHTML = comments.length ? comments.map((comment) => `
      <article class="comment-item">
        <div><strong>${escapeHtml(comment.createdBy)}</strong><time>${escapeHtml(formatDateTime(comment.createdAt))}</time></div>
        <p>${escapeHtml(comment.text)}</p>
      </article>`).join("") : '<div class="empty-inline">Комментариев пока нет.</div>';
  }

  function closeCommentDialog() {
    dom.commentDialog.close();
    dom.commentFormError.textContent = "";
  }

  async function saveExpenseComment(event) {
    event.preventDefault();
    const expenseId = dom.commentExpenseId.value;
    const text = dom.commentText.value.trim();
    dom.commentFormError.textContent = "";
    try {
      await mutate("addComment", { id: createId(), expenseId, text, author: currentActorName() });
      dom.commentText.value = "";
      renderExpenseComments(expenseId);
      showToast("Комментарий добавлен");
    } catch (error) {
      dom.commentFormError.textContent = error.message;
    }
  }

  async function saveBudget() {
    if (!canEditSelectedLocation()) return;
    const itemKeys = [...new Set([...dom.budgetEditorBody.querySelectorAll("tr[data-budget-item-key]")]
      .map((row) => row.dataset.budgetItemKey))];
    const items = [...dom.budgetEditorBody.querySelectorAll(".budget-currency-row")].map((row) => {
      const detailed = row.dataset.monthlyDetailed === "true";
      const months = Object.fromEntries([...row.querySelectorAll(".budget-month-input")]
        .map((input) => [input.dataset.monthKey, parseGroupedNumber(input.value) || 0]));
      return {
        articleId: row.dataset.articleId,
        subarticleId: row.dataset.subarticleId,
        currency: row.querySelector(".budget-currency-input")?.value || row.querySelector(".budget-month-input")?.dataset.currency,
        ...(detailed ? { months } : { amount: Number(row.dataset.quarterAmount) || 0 })
      };
    });
    try {
      await mutate("saveBudget", { locationId: selectedLocation, quarterKey: selectedQuarterKey(), itemKeys, items });
      budgetEditMode = false;
      budgetDirty = false;
      await releaseActiveEditLock({ resourceType: "budget", resourceId: `${selectedLocation}|${selectedQuarterKey()}` });
      renderBudgetEditor();
      showToast("Бюджет сохранён");
    } catch (error) {
      showToast(error.message, true);
      setSaveStatus("Изменения не сохранены", true);
    }
  }

  async function copyPreviousBudget() {
    if (!canEditSelectedLocation()) return;
    const target = selectedQuarterKey();
    const source = previousQuarterKey(selectedYear, selectedQuarter);
    const hasTargetValues = state.articles.some((article) => activeProjectArticles(article).some((projectArticle) =>
      Object.values(budgetAmounts(selectedLocation, target, budgetItemKey(article.id, projectArticle.id))).some((amount) => amount > 0)));
    const sourceHasValues = state.articles.some((article) => activeProjectArticles(article).some((projectArticle) =>
      Object.values(budgetAmounts(selectedLocation, source, budgetItemKey(article.id, projectArticle.id))).some((amount) => amount > 0)));
    if (!sourceHasValues) {
      showToast("В предыдущем квартале нет плановых сумм", true);
      return;
    }
    if (hasTargetValues && !confirmAction("В текущем квартале уже есть план. Заменить его данными прошлого квартала?")) return;
    try {
      await mutate("copyBudget", { locationId: selectedLocation, from: source, to: target });
      budgetDirty = false;
      showToast("План прошлого квартала скопирован");
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function updateBudgetEditorTotal() {
    const totals = {};
    const projectEntries = {};
    dom.budgetEditorBody.querySelectorAll(".budget-currency-row").forEach((row) => {
      const currency = row.querySelector(".budget-currency-input")?.value
        || row.querySelector(".budget-month-input")?.dataset.currency;
      if (!currency) return;
      const detailed = row.dataset.monthlyDetailed === "true";
      const months = detailed ? Object.fromEntries([...row.querySelectorAll(".budget-month-input")]
        .map((input) => [input.dataset.monthKey, parseGroupedNumber(input.value) || 0])) : null;
      const amount = detailed ? sumMonthAmounts(months, selectedQuarterKey()) : Number(row.dataset.quarterAmount) || 0;
      row.dataset.quarterAmount = String(amount);
      const quarterTotal = row.querySelector(".budget-quarter-total");
      if (quarterTotal) quarterTotal.textContent = formatGroupedNumber(amount);
      totals[currency] = (totals[currency] || 0) + amount;
      projectEntries[row.dataset.articleId] ||= [];
      projectEntries[row.dataset.articleId].push({ currency, amount, months });
    });
    dom.budgetEditorBody.querySelectorAll(".budget-project-summary-row").forEach((row) => {
      const projectTotals = aggregateBudgetEntries(projectEntries[row.dataset.budgetProjectId] || [], selectedQuarterKey());
      const currencies = Object.keys(projectTotals).sort();
      const currencyCell = row.querySelector("[data-project-currencies]");
      if (currencyCell) currencyCell.innerHTML = currencies.length
        ? currencies.map((currency) => `<span class="currency-badge">${escapeHtml(currency)}</span>`).join("")
        : "—";
      row.querySelectorAll("[data-project-month-total]").forEach((cell) => {
        const monthKey = quarterMonthKeysFromQuarterKey(selectedQuarterKey())[Number(cell.dataset.projectMonthTotal)];
        cell.innerHTML = budgetProjectTotalBreakdownHtml(projectTotals, monthKey);
      });
      const quarterCell = row.querySelector("[data-project-quarter-total]");
      if (quarterCell) quarterCell.innerHTML = budgetProjectTotalBreakdownHtml(projectTotals, "quarter");
    });
    dom.budgetEditorTotal.innerHTML = Object.keys(totals).length
      ? Object.keys(totals).sort().map((currency) => `<span><b>${escapeHtml(currency)}</b> ${formatMoney(totals[currency], currency)}</span>`).join("")
      : "—";
  }

  function aggregateBudgetEntries(entries, quarterKey) {
    const monthKeys = quarterMonthKeysFromQuarterKey(quarterKey);
    const totals = {};
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const currency = normalizeCurrencyCode(entry?.currency);
      if (!currency) return;
      const hasMonths = entry.months && typeof entry.months === "object" && !Array.isArray(entry.months)
        && monthKeys.every((monthKey) => Object.prototype.hasOwnProperty.call(entry.months, monthKey));
      const amount = hasMonths ? sumMonthAmounts(entry.months, quarterKey) : (Number(entry.amount) || 0);
      totals[currency] ||= {
        quarter: 0,
        months: Object.fromEntries(monthKeys.map((monthKey) => [monthKey, 0])),
        monthlyComplete: true
      };
      totals[currency].quarter += amount;
      if (hasMonths) {
        monthKeys.forEach((monthKey) => { totals[currency].months[monthKey] += Number(entry.months[monthKey]) || 0; });
      } else if (amount !== 0) {
        totals[currency].monthlyComplete = false;
      }
    });
    return totals;
  }

  function budgetProjectTotalBreakdownHtml(totals, field) {
    const currencies = Object.keys(totals).sort();
    if (!currencies.length) return "—";
    return currencies.map((currency) => {
      const item = totals[currency];
      const unavailable = field !== "quarter" && !item.monthlyComplete;
      const amount = field === "quarter" ? item.quarter : item.months[field];
      return `<span class="budget-project-total-line"><b>${escapeHtml(currency)}</b><span>${unavailable ? "—" : escapeHtml(formatGroupedNumber(amount))}</span></span>`;
    }).join("");
  }

  function saveProfile(event) {
    event.preventDefault();
    if (sharedMode) return;
    profile.name = dom.profileName.value.trim().slice(0, 80);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    renderUser();
    showToast(profile.name ? "Имя пользователя сохранено" : "Имя очищено");
  }

  function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      application: "План · Факт",
      state
    };
    downloadFile(
      `plan-fact-backup-${toDateInputValue(new Date())}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
    showToast("Резервная копия подготовлена");
  }

  function exportCsv() {
    const key = selectedQuarterKey();
    const filters = currentExpenseFilters();
    const expenses = filteredExpensesForCurrentView(filters);
    const forecasts = state.forecastTickets.flatMap((ticket) => (ticket.allocations || []).map((allocation) => ({ ticket, allocation })))
      .filter(({ allocation }) => allocation.quarterKey === key)
      .filter(({ allocation }) => effectiveLocationSet().has(allocation.locationId))
      .filter(({ ticket, allocation }) => forecastMatchesExpenseExportFilters(ticket, allocation, filters))
      .sort((left, right) => right.allocation.expectedDate.localeCompare(left.allocation.expectedDate));
    const rows = [
      ["Тип", "Дата", "Квартал", "Локация", "Валюта", "Код проекта", "Проект", "Тип бюджета", "Сервис", "Юр лицо", "Ответственный", "Код статьи", "Статья", "Сумма без НДС", "Тикет", "Описание", "Добавил", "Создано", "Статус"].map(translateString),
      ...expenses.map((expense) => {
        const article = articleById(expense.articleId);
        const loc = locationById(expense.locationId);
        const sub = expense.subarticleId ? subarticleById(expense.articleId, expense.subarticleId) : null;
        const attrs = projectAttributesFor(expense.articleId, expense.locationId, expense.quarterKey);
        return [
          translateString("Факт"), formatDate(expense.expenseDate), translateString(periodLabel(selectedYear, selectedQuarter)),
          translateString(loc?.name || ""), expense.currency, article?.code || "",
          article?.name || "", budgetTypeExportLabel(article), attrs.service, attrs.legalEntity,
          projectResponsibleGroups(expense.articleId, expense.locationId, expense.quarterKey).join(", "),
          sub?.code || "", sub?.name || "", Math.round(expense.amount), expense.ticketUrl, expense.comment,
          expense.createdBy, formatDateTime(expense.createdAt), translateString(expense.status === "canceled" ? "Аннулирован" : "Действует")
        ];
      }),
      ...forecasts.map(({ ticket, allocation }) => {
        const article = articleById(allocation.articleId);
        const loc = locationById(allocation.locationId);
        const sub = subarticleById(allocation.articleId, allocation.subarticleId);
        const attrs = projectAttributesFor(allocation.articleId, allocation.locationId, allocation.quarterKey);
        return [
          translateString("Прогноз"), formatDate(allocation.expectedDate), translateString(periodLabel(selectedYear, selectedQuarter)),
          translateString(loc?.name || ""), allocation.currency, article?.code || "", article?.name || "",
          budgetTypeExportLabel(article), attrs.service, attrs.legalEntity,
          projectResponsibleGroups(allocation.articleId, allocation.locationId, allocation.quarterKey).join(", "),
          sub?.code || "", sub?.name || "", Math.round(allocation.amount), ticket.ticketUrl,
          allocation.comment || ticket.description, ticket.createdBy, formatDateTime(ticket.createdAt),
          translateString(forecastLifecycleMeta(allocation)[0])
        ];
      })
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    downloadFile(`${language === "en" ? "expenses-and-forecasts" : "rashody-i-prognozy"}-${key}.csv`, csv, "text/csv;charset=utf-8");
    showToast(`CSV подготовлен для Excel: расходов ${expenses.length}, прогнозов ${forecasts.length}`);
  }

  function forecastMatchesExpenseExportFilters(ticket, allocation, filters) {
    if (filters.status === "canceled") return false;
    if (filters.articleId !== "all" && allocation.articleId !== filters.articleId) return false;
    if (!expenseMatchesResponsible(allocation, filters.responsible)) return false;
    if (!expenseMatchesBudgetType(allocation, filters.budgetType)) return false;
    if (!expenseMatchesAttributeFilters(allocation, filters)) return false;
    if (!filters.search) return true;
    const article = articleById(allocation.articleId);
    const projectArticle = subarticleById(allocation.articleId, allocation.subarticleId);
    return [article?.name, article?.code, projectArticle?.name, projectArticle?.code, ticket.ticketUrl,
      ticket.description, ticket.supplier, allocation.comment, ticket.createdBy, allocation.currency, allocation.amount]
      .join(" ").toLocaleLowerCase("ru").includes(filters.search);
  }

  function budgetTypeExportLabel(article) {
    const type = normalizeBudgetType(article?.budgetType);
    return type === "opex" ? "OPEX" : (type === "capex" ? "CAPEX" : translateString("Другое"));
  }

  async function importJson(event) {
    if (authMode === "corporate-idm") return;
    if (sharedMode && !isAdminClient()) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = normalizeState(parsed.state || parsed);
      const scope = sharedMode ? "общие данные всех пользователей" : "текущие локальные данные";
      if (!confirmAction(`Импорт заменит ${scope}. Продолжить?`)) return;
      await mutate("importState", { state: imported });
      populateYearOptions();
      setPeriodControls();
      showToast("Данные восстановлены из резервной копии");
    } catch (error) {
      showToast(`Не удалось импортировать файл: ${error.message}`, true);
    }
  }

  function openExpenseImportDialog() {
    if (!canImportExpensesClient()) return;
    pendingExpenseWorkbook = null;
    pendingExpenseMappings = {};
    pendingExpenseImport = null;
    dom.expenseImportInput.value = "";
    dom.expenseImportFileName.textContent = "Файл не выбран";
    dom.expenseImportDateField.value = "expected";
    dom.expenseImportStatus.classList.remove("is-error");
    dom.expenseImportStatus.textContent = "Выберите Excel-отчёт по ЗП.";
    dom.expenseImportSummary.innerHTML = "";
    dom.expenseImportConflicts.innerHTML = "";
    dom.expenseImportMappings.innerHTML = "";
    dom.expenseImportPreviewBody.innerHTML = "";
    dom.expenseImportPreviewNote.textContent = "";
    dom.expenseImportPreviewWrap.hidden = true;
    setExpenseImportButtonState("disabled");
    dom.expenseImportDialog.showModal();
  }

  async function inspectSelectedExpenseWorkbook(event) {
    if (!canImportExpensesClient()) return;
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    pendingExpenseWorkbook = null;
    pendingExpenseMappings = {};
    pendingExpenseImport = null;
    dom.expenseImportFileName.textContent = file.name;
    dom.expenseImportStatus.classList.remove("is-error");
    dom.expenseImportStatus.textContent = `Проверяю структуру ${file.name}…`;
    dom.expenseImportSummary.innerHTML = "";
    dom.expenseImportConflicts.innerHTML = "";
    dom.expenseImportMappings.innerHTML = "";
    dom.expenseImportPreviewBody.innerHTML = "";
    dom.expenseImportPreviewWrap.hidden = true;
    setExpenseImportButtonState("disabled");
    try {
      const parsed = await ExpenseImport.parseExpenseWorkbook(file, { sourceFile: file.name });
      pendingExpenseWorkbook = parsed;
      prepareExpenseImportPreview();
    } catch (error) {
      dom.expenseImportStatus.textContent = `Не удалось прочитать Excel: ${error.message}`;
      dom.expenseImportStatus.classList.add("is-error");
    }
  }

  function prepareExpenseImportPreview() {
    if (!canImportExpensesClient()) return;
    pendingExpenseImport = null;
    setExpenseImportButtonState("disabled");
    if (!pendingExpenseWorkbook) {
      dom.expenseImportStatus.textContent = "Сначала выберите Excel-файл.";
      return;
    }
    try {
      const preview = ExpenseImport.buildExpenseImportPreview(state, pendingExpenseWorkbook.rows, {
        sourceFile: pendingExpenseWorkbook.sourceFile,
        statusMode: "forecast",
        dateField: dom.expenseImportDateField.value,
        mappings: pendingExpenseMappings,
        today: toDateInputValue(new Date())
      });
      pendingExpenseImport = { parsed: pendingExpenseWorkbook, mappings: { ...pendingExpenseMappings }, preview };
      renderExpenseImportPreview(preview);
    } catch (error) {
      dom.expenseImportStatus.textContent = `Не удалось подготовить импорт: ${error.message}`;
      dom.expenseImportStatus.classList.add("is-error");
      dom.expenseImportSummary.innerHTML = "";
      dom.expenseImportConflicts.innerHTML = "";
      dom.expenseImportMappings.innerHTML = "";
      dom.expenseImportPreviewWrap.hidden = true;
    }
  }

  function expenseImportActionMeta(action) {
    return {
      new: ["Новый прогноз", "is-new"],
      update: ["Обновить", "is-update"],
      unchanged: ["Без изменений", "is-unchanged"],
      mapping: ["Нужен выбор", "is-warning"],
      "missing-reference": ["Нет в бюджете", "is-error"],
      "excluded-mapping": ["Пропуск: выбран", "is-skipped"],
      "excluded-zero": ["Пропуск: ноль", "is-skipped"],
      "closed-period": ["Период закрыт", "is-error"],
      invalid: ["Ошибка строки", "is-error"]
    }[action] || [action, "is-skipped"];
  }

  function expenseImportButtonMode(preview) {
    if (preview?.canApply) return "apply";
    const stats = preview?.stats;
    if (stats && !stats.newRows && !stats.updatedRows && stats.unchangedRows > 0) return "open";
    return "disabled";
  }

  function setExpenseImportButtonState(mode) {
    const labels = language === "en"
      ? { apply: "Apply import", open: "Open forecasts", disabled: "Nothing to import" }
      : { apply: "Применить импорт", open: "Открыть прогнозы", disabled: "Нет строк для импорта" };
    dom.applyExpenseImportBtn.disabled = mode === "disabled";
    dom.applyExpenseImportBtn.dataset.mode = mode;
    dom.applyExpenseImportBtn.textContent = labels[mode] || labels.disabled;
  }

  function preferredImportedForecast(preview) {
    const rows = (preview?.rows || []).filter((row) =>
      row.forecast && ["new", "update", "unchanged"].includes(row.action));
    const currentQuarter = quarterKeyFromDateInput(preview?.today || toDateInputValue(new Date()));
    return rows.find((row) => ["active", "review"].includes(row.forecast.lifecycle)
        && row.forecast.quarterKey === currentQuarter)?.forecast
      || rows.find((row) => ["active", "review"].includes(row.forecast.lifecycle))?.forecast
      || rows[0]?.forecast
      || null;
  }

  function openImportedForecasts(preview) {
    const forecast = preferredImportedForecast(preview);
    if (forecast) {
      selectedLocation = forecast.locationId;
      const period = periodFromDateInput(forecast.expectedDate);
      selectedYear = period.year;
      selectedQuarter = period.quarter;
      saveSelectedLocation();
      localStorage.setItem(UI_KEY, JSON.stringify({ year: selectedYear, quarter: selectedQuarter, locationId: selectedLocation }));
      populateYearOptions();
      setPeriodControls();
    }
    closeExpenseImportDialog();
    dom.forecastSearch.value = "";
    dom.forecastArticleFilter.value = "all";
    dom.forecastLifecycleFilter.value = "current";
    navigate("forecast");
    renderAll();
  }

  function renderExpenseImportPreview(preview) {
    const stats = preview.stats;
    dom.expenseImportStatus.classList.toggle("is-error", stats.closedPeriodRows > 0);
    dom.expenseImportStatus.textContent = `${preview.sourceFile} · прочитано строк: ${stats.sourceRows}`;
    dom.expenseImportSummary.innerHTML = [
      [stats.ticketRows, "тикетов", `${stats.activeRows} активных распределений`],
      [stats.newRows, "новых", "будут добавлены в прогноз"],
      [stats.updatedRows, "изменённых", "обновят сумму, статус или дату"],
      [stats.unchangedRows, "без изменений", "дубли не создаются"],
      [stats.projectLevelRows, "без статьи", stats.projectLevelRows ? "учтены на уровне проекта" : "все статьи определены"],
      [stats.currencyWarningRows, "валютных предупреждений", "сохранены в валюте отчёта"],
      [stats.blockingRows, "пропущено", "остальные строки можно применить"],
      [stats.reviewRows, "на проверке", `${stats.futureClosedRows} конфликтов статуса и даты · ${stats.zeroRows} нулевых`],
      [stats.releasedRows, "освобождённых", `${stats.overdueRows} активных просрочено`]
    ].map(([value, label, note]) => `<article><strong>${value}</strong><span>${label}</span><small>${escapeHtml(note)}</small></article>`).join("");

    const problemRows = preview.rows.filter((row) => ["missing-reference", "closed-period", "invalid"].includes(row.action));
    dom.expenseImportConflicts.innerHTML = problemRows.length
      ? `<div class="import-warning"><strong>${stats.closedPeriodRows ? "Импорт затрагивает закрытый период" : "Некоторые строки будут пропущены, остальные можно применить"}</strong>${problemRows.slice(0, 12)
          .map((row) => `<p>Строка ${row.sourceRow}: ${escapeHtml(row.reason)}</p>`).join("")}
          ${problemRows.length > 12 ? `<p>И ещё ${problemRows.length - 12}…</p>` : ""}</div>`
      : `<div class="import-ok">Локации, проекты и технические ключи проверены.${stats.currencyWarningRows ? ` ${stats.currencyWarningRows} строк(и) будут сохранены в валюте отчёта.` : ""}</div>`;

    dom.expenseImportMappings.innerHTML = preview.mappingGroups.length
      ? `<div class="expense-mapping-panel"><div class="expense-mapping-heading"><strong>Необязательное сопоставление статей</strong><span>Без выбора прогноз будет учтён на уровне проекта.</span></div>${preview.mappingGroups.map((group) => `
          <label class="expense-mapping-row">
            <span><b>${escapeHtml(group.projectCode)} · ${escapeHtml(group.projectName)}</b><small>${escapeHtml(group.sourceLabel)} · ${group.rows} строк</small></span>
            <select data-expense-mapping-key="${escapeAttribute(group.key)}">
              <option value="">На проект без статьи (по умолчанию)</option>
              <option value="${ExpenseImport.SKIP_MAPPING}" ${group.selectedId === ExpenseImport.SKIP_MAPPING ? "selected" : ""}>Не импортировать эту группу</option>
              ${group.candidates.map((candidate) => `<option value="${escapeAttribute(candidate.id)}" ${group.selectedId === candidate.id ? "selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("")}
            </select>
          </label>`).join("")}</div>`
      : "";

    const visibleRows = preview.rows.slice(0, 150);
    dom.expenseImportPreviewBody.innerHTML = visibleRows.map((row) => {
      const [actionLabel, actionClass] = expenseImportActionMeta(row.action);
      const forecast = row.forecast;
      const article = forecast ? state.articles.find((item) => item.id === forecast.articleId) : null;
      const subarticle = forecast ? (article?.subarticles || []).find((item) => item.id === forecast.subarticleId) : null;
      const chosenDate = preview.dateField === "reservation" ? row.source.reservationDate : row.source.expectedDate;
      const destination = ["new", "update", "unchanged"].includes(row.action) ? "Прогнозы" : "Пропуск";
      return `<tr class="expense-import-row ${actionClass}">
        <td><span class="expense-import-action ${actionClass}">${escapeHtml(actionLabel)}</span><small>${escapeHtml(row.reason || "")}</small></td>
        <td>${escapeHtml(formatDate(chosenDate))}</td>
        <td>${escapeHtml(row.source.locationName)}<small>${escapeHtml(row.source.locationCode)}</small></td>
        <td>${escapeHtml(article?.name || row.source.projectName)}<small>${escapeHtml(row.source.projectCode)}</small></td>
        <td>${escapeHtml(forecast ? (subarticle?.name || "На уровне проекта") : "—")}</td>
        <td><span class="currency-badge">${escapeHtml(row.source.currency || "—")}</span></td>
        <td class="number-cell">${row.source.amountValid ? formatMoney(row.source.amount, row.source.currency) : "—"}</td>
        <td>${escapeHtml(row.source.requestNumber)}</td>
        <td>${escapeHtml(row.source.status)}</td>
        <td>${destination}</td>
      </tr>`;
    }).join("");
    dom.expenseImportPreviewWrap.hidden = false;
    dom.expenseImportPreviewNote.textContent = preview.rows.length > visibleRows.length
      ? `Показаны первые ${visibleRows.length} строк из ${preview.rows.length}. Правила применятся ко всем строкам.`
      : `Проверены все ${preview.rows.length} строк.`;
    const buttonMode = expenseImportButtonMode(preview);
    setExpenseImportButtonState(buttonMode);
    if (!stats.blockingRows && !stats.newRows && !stats.updatedRows) {
      dom.expenseImportStatus.textContent += " Новых или изменённых прогнозов нет.";
    }
    if (buttonMode === "open") {
      dom.expenseImportStatus.textContent += " Этот файл уже импортирован — можно открыть существующие прогнозы.";
    }
  }

  function handleExpenseImportMapping(event) {
    const select = event.target.closest("[data-expense-mapping-key]");
    if (!select) return;
    const key = select.dataset.expenseMappingKey;
    if (select.value) pendingExpenseMappings[key] = select.value;
    else delete pendingExpenseMappings[key];
    prepareExpenseImportPreview();
  }

  async function applyPendingExpenseImport() {
    if (!canImportExpensesClient() || !pendingExpenseImport?.preview) return;
    const { parsed, preview } = pendingExpenseImport;
    const stats = preview.stats;
    const buttonMode = expenseImportButtonMode(preview);
    if (buttonMode === "open") {
      openImportedForecasts(preview);
      showToast("Отчёт уже импортирован. Открыты существующие прогнозы");
      return;
    }
    if (buttonMode !== "apply") return;
    dom.applyExpenseImportBtn.disabled = true;
    dom.expenseImportStatus.classList.remove("is-error");
    dom.expenseImportStatus.textContent = "Сохраняю прогнозные тикеты…";
    try {
      await mutate("importExpenses", {
        sourceFile: parsed.sourceFile,
        rows: parsed.rows,
        statusMode: preview.statusMode,
        dateField: preview.dateField,
        mappings: pendingExpenseMappings,
        today: preview.today,
        author: currentActorName(),
        authorId: currentUser?.id || null
      });
      openImportedForecasts(preview);
      const skipped = stats.sourceRows - stats.newRows - stats.updatedRows - stats.unchangedRows;
      showToast(`Импорт отчёта завершён: ${stats.ticketRows} тикетов, ${stats.activeRows} активных распределений${skipped ? ` · пропущено строк: ${skipped}` : ""}`);
    } catch (error) {
      dom.expenseImportStatus.textContent = `Импорт не применён: ${error.message}`;
      dom.expenseImportStatus.classList.add("is-error");
      setExpenseImportButtonState(expenseImportButtonMode(preview));
    }
  }

  function closeExpenseImportDialog() {
    dom.expenseImportDialog.close();
    pendingExpenseWorkbook = null;
    pendingExpenseMappings = {};
    pendingExpenseImport = null;
    dom.expenseImportInput.value = "";
    dom.expenseImportStatus.classList.remove("is-error");
  }

  function openExcelImportDialog() {
    if (!isAdminClient()) return;
    if (budgetDirty) {
      showToast("Сначала сохраните или отмените изменения бюджета", true);
      return;
    }
    pendingBudgetWorkbookFile = null;
    pendingBudgetWorkbookInfo = null;
    pendingBudgetImport = null;
    dom.importExcelInput.value = "";
    dom.excelImportFileName.textContent = "Файл не выбран";
    dom.excelImportPeriod.innerHTML = '<option value="">Сначала выберите файл</option>';
    dom.excelImportPeriod.disabled = true;
    dom.applyExcelImportBtn.disabled = true;
    dom.excelImportStatus.classList.remove("is-error");
    dom.excelImportStatus.textContent = "Выберите Excel-файл, затем укажите отчётный период.";
    dom.excelImportSummary.innerHTML = "";
    dom.excelImportConflicts.innerHTML = "";
    dom.excelImportPreviewBody.innerHTML = "";
    dom.excelImportPreviewNote.textContent = "";
    dom.excelImportPreviewWrap.hidden = true;
    dom.excelImportDialog.showModal();
  }

  async function inspectSelectedBudgetWorkbook(event) {
    if (!isAdminClient()) return;
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    pendingBudgetWorkbookFile = file;
    pendingBudgetWorkbookInfo = null;
    pendingBudgetImport = null;
    dom.excelImportFileName.textContent = file.name;
    dom.excelImportPeriod.innerHTML = '<option value="">Проверяю периоды…</option>';
    dom.excelImportPeriod.disabled = true;
    dom.applyExcelImportBtn.disabled = true;
    dom.excelImportStatus.classList.remove("is-error");
    dom.excelImportStatus.textContent = `Проверяю структуру ${file.name}…`;
    dom.excelImportSummary.innerHTML = "";
    dom.excelImportConflicts.innerHTML = "";
    dom.excelImportPreviewBody.innerHTML = "";
    dom.excelImportPreviewNote.textContent = "";
    dom.excelImportPreviewWrap.hidden = true;
    try {
      const info = await BudgetImport.inspectBudgetWorkbook(file, { sourceFile: file.name });
      if (pendingBudgetWorkbookFile !== file) return;
      pendingBudgetWorkbookInfo = info;
      dom.excelImportPeriod.innerHTML = [
        '<option value="">Выберите период</option>',
        ...info.availableQuarters.map((quarterKey) => `<option value="${escapeAttribute(quarterKey)}">${escapeHtml(importQuarterLabel(quarterKey))}</option>`)
      ].join("");
      dom.excelImportPeriod.disabled = false;
      dom.excelImportStatus.textContent = `${file.name} · доступно периодов: ${info.availableQuarters.length}. Выберите период импорта.`;
      dom.excelImportPeriod.focus();
    } catch (error) {
      if (pendingBudgetWorkbookFile !== file) return;
      pendingBudgetWorkbookFile = null;
      pendingBudgetWorkbookInfo = null;
      dom.excelImportPeriod.innerHTML = '<option value="">Сначала выберите файл</option>';
      dom.excelImportStatus.textContent = `Не удалось прочитать Excel: ${error.message}`;
      dom.excelImportStatus.classList.add("is-error");
    }
  }

  async function prepareBudgetImportPreview() {
    if (!isAdminClient()) return;
    const file = pendingBudgetWorkbookFile;
    const quarterKey = dom.excelImportPeriod.value;
    pendingBudgetImport = null;
    dom.applyExcelImportBtn.disabled = true;
    dom.excelImportSummary.innerHTML = "";
    dom.excelImportConflicts.innerHTML = "";
    dom.excelImportPreviewBody.innerHTML = "";
    dom.excelImportPreviewNote.textContent = "";
    dom.excelImportPreviewWrap.hidden = true;
    if (!file || !pendingBudgetWorkbookInfo || !quarterKey) {
      dom.excelImportStatus.textContent = file ? "Выберите отчётный период." : "Сначала выберите Excel-файл.";
      return;
    }
    if (!pendingBudgetWorkbookInfo.availableQuarters.includes(quarterKey)) {
      dom.excelImportStatus.textContent = "Выбранного периода нет одновременно на листах OPEX и CAPEX.";
      dom.excelImportStatus.classList.add("is-error");
      return;
    }
    dom.excelImportStatus.classList.remove("is-error");
    dom.excelImportStatus.textContent = `Читаю ${file.name} за ${importQuarterLabel(quarterKey)}…`;
    try {
      const parsed = await BudgetImport.parseBudgetWorkbook(file, { sourceFile: file.name, quarterKey });
      if (pendingBudgetWorkbookFile !== file || dom.excelImportPeriod.value !== quarterKey) return;
      const preview = BudgetImport.buildBudgetImportPreview(state, parsed.rows, {
        quarterKey,
        sourceFile: parsed.sourceFile,
        sourceRows: parsed.stats.sourceRows,
        skippedRows: parsed.stats.skippedRows,
        ignoredAmountCells: parsed.stats.ignoredAmountCells,
        recoveredProjectCodes: parsed.stats.recoveredProjectCodes
      });
      pendingBudgetImport = {
        quarterKey,
        sourceFile: parsed.sourceFile,
        sourceRows: parsed.stats.sourceRows,
        skippedRows: parsed.stats.skippedRows,
        ignoredAmountCells: parsed.stats.ignoredAmountCells,
        recoveredProjectCodes: parsed.stats.recoveredProjectCodes,
        exchangeRates: parsed.exchangeRates,
        exchangeRateCount: parsed.stats.exchangeRates,
        skippedExchangeRates: parsed.stats.skippedExchangeRates,
        exchangeRateSheetFound: parsed.stats.exchangeRateSheetFound,
        rows: parsed.rows,
        preview
      };
      renderBudgetImportPreview(preview);
      dom.applyExcelImportBtn.disabled = false;
    } catch (error) {
      if (pendingBudgetWorkbookFile !== file || dom.excelImportPeriod.value !== quarterKey) return;
      dom.excelImportStatus.textContent = `Не удалось прочитать Excel: ${error.message}`;
      dom.excelImportStatus.classList.add("is-error");
    }
  }

  function importQuarterLabel(quarterKey) {
    const match = String(quarterKey || "").match(/^(\d{4})-Q([1-4])$/);
    return match ? translateString(periodLabel(Number(match[1]), Number(match[2]))) : quarterKey;
  }

  function renderBudgetImportPreview(preview) {
    const stats = preview.stats;
    const months = BudgetImport.quarterMonths(preview.quarterKey);
    dom.excelImportStatus.classList.remove("is-error");
    const skippedNote = stats.skippedRows ? ` · пропущено пустых/некорректных строк: ${stats.skippedRows}` : "";
    const amountNote = stats.ignoredAmountCells ? ` · нечисловых сумм: ${stats.ignoredAmountCells}` : "";
    const recoveredNote = stats.recoveredProjectCodes ? ` · восстановлено кодов проекта: ${stats.recoveredProjectCodes}` : "";
    const rateCount = Number(pendingBudgetImport?.exchangeRateCount) || 0;
    const rateNote = pendingBudgetImport?.exchangeRateSheetFound
      ? ` · курсов валют: ${rateCount}`
      : " · лист «курс» не найден";
    dom.excelImportStatus.textContent = `${preview.sourceFile} · ${importQuarterLabel(preview.quarterKey)} · прочитано строк: ${stats.sourceRows}${recoveredNote}${skippedNote}${amountNote}${rateNote}`;
    [dom.excelImportMonth1, dom.excelImportMonth2, dom.excelImportMonth3].forEach((heading, index) => {
      heading.textContent = formatMonthLabel(months[index]?.key);
    });
    dom.excelImportQuarterTotal.textContent = `${translateString("Итого")} ${importQuarterLabel(preview.quarterKey)}`;
    dom.excelImportSummary.innerHTML = [
      [stats.locations, "локаций", `${stats.nonZeroLocations} с суммами · +${stats.newLocations} новых`],
      [stats.projects, "проектов", `${stats.nonZeroProjects} с суммами · +${stats.newProjects} новых`],
      [stats.projectArticles, "статей", `${stats.nonZeroProjectArticles} с суммами · +${stats.newProjectArticles} новых`],
      [stats.responsibles, "ответственных", stats.responsibles ? "из Excel" : "столбец не заполнен"],
      [stats.currencies.length, "валют", stats.currencies.join(", ")],
      [rateCount, "курсов", pendingBudgetImport?.exchangeRateSheetFound ? "из листа «курс»" : "лист не найден"],
      [stats.nonZeroGroups, "сумм", `${stats.replacedValues} будут заменены`]
    ].map(([value, label, note]) => `<article><strong>${value}</strong><span>${label}</span><small>${escapeHtml(note)}</small></article>`).join("");
    const protectionNotice = budgetAlreadyLoaded(state, preview.quarterKey)
      ? '<div class="import-warning">Повторный импорт обновит плановые суммы из файла. Записанные расходы, прогнозы и комментарии сохранятся.</div>'
      : "";
    dom.excelImportConflicts.innerHTML = protectionNotice + (preview.conflicts.length
      ? `<div class="import-warning"><strong>Найдены различия в названиях (${preview.conflicts.length})</strong>
          ${preview.conflicts.map((item) => `<p><code>${escapeHtml(item.key)}</code>: ${item.names.map(escapeHtml).join(" / ")} → <b>${escapeHtml(item.chosen)}</b></p>`).join("")}
        </div>`
      : '<div class="import-ok">Конфликтов кодов и названий не найдено.</div>');
    const visibleRows = preview.rows.filter((row) => row.amount !== 0).slice(0, 120);
    dom.excelImportPreviewBody.innerHTML = visibleRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.locationName)}<small>${escapeHtml(row.locationCode)}</small></td>
        <td>${budgetTypeBadge({ budgetType: row.budgetType }, true)}</td>
        <td>${escapeHtml(row.projectName)}<small>${escapeHtml(row.projectCode)}</small></td>
        <td>${escapeHtml(row.projectArticleName)}</td>
        <td>${escapeHtml(row.responsibleGroups.join(" / ") || "—")}</td>
        <td><span class="currency-badge">${escapeHtml(row.currency)}</span></td>
        <td class="number-cell">${formatMoney(row.months?.[months[0]?.key] || 0, row.currency)}</td>
        <td class="number-cell">${formatMoney(row.months?.[months[1]?.key] || 0, row.currency)}</td>
        <td class="number-cell">${formatMoney(row.months?.[months[2]?.key] || 0, row.currency)}</td>
        <td class="number-cell">${formatMoney(row.amount, row.currency)}</td>
      </tr>`).join("");
    dom.excelImportPreviewWrap.hidden = false;
    dom.excelImportPreviewNote.textContent = preview.rows.filter((row) => row.amount !== 0).length > visibleRows.length
      ? `Показаны первые ${visibleRows.length} строк из ${stats.nonZeroGroups}. Все строки будут импортированы.`
      : `Будут импортированы все ${stats.nonZeroGroups} ненулевых сумм.`;
  }

  function budgetAlreadyLoaded(current, quarterKey) {
    return (current.imports || []).some((item) => item.quarterKey === quarterKey)
      || [current.budgets, current.monthlyBudgets].some((budgets) => Object.entries(budgets || {})
        .some(([key, store]) => key.endsWith(`|${quarterKey}`) && Object.keys(store || {}).length > 0));
  }

  async function applyPendingBudgetImport() {
    if (!isAdminClient()) return;
    if (!pendingBudgetImport) return;
    const payload = {
      quarterKey: pendingBudgetImport.quarterKey,
      sourceFile: pendingBudgetImport.sourceFile,
      sourceRows: pendingBudgetImport.sourceRows,
      skippedRows: pendingBudgetImport.skippedRows,
      ignoredAmountCells: pendingBudgetImport.ignoredAmountCells,
      recoveredProjectCodes: pendingBudgetImport.recoveredProjectCodes,
      exchangeRates: pendingBudgetImport.exchangeRates,
      rows: pendingBudgetImport.rows
    };
    // Перепроверяем текущее состояние при нажатии, а не только при построении предпросмотра.
    const repeatedImport = budgetAlreadyLoaded(state, payload.quarterKey);
    if (repeatedImport
      && !confirmAction(`Бюджет за ${importQuarterLabel(payload.quarterKey)} уже загружен. Обновить план из выбранного файла? Записанные расходы, прогнозы и комментарии сохранятся.`)) return;
    dom.applyExcelImportBtn.disabled = true;
    dom.excelImportStatus.textContent = "Сохраняю бюджет…";
    try {
      const firstLocationCode = pendingBudgetImport.preview.rows.find((row) => row.amount !== 0)?.locationCode;
      await mutate("importBudget", payload);
      const periodMatch = payload.quarterKey.match(/^(\d{4})-Q([1-4])$/);
      selectedYear = Number(periodMatch[1]);
      selectedQuarter = Number(periodMatch[2]);
      const firstLocation = state.locations.find((location) => normalizeCode(location.code) === firstLocationCode);
      const selectedLocationAvailable = selectedLocation === ALL_LOCATIONS
        || state.locations.some((location) => location.id === selectedLocation && !location.archived);
      if (firstLocation && (!repeatedImport || !selectedLocationAvailable)) selectedLocation = firstLocation.id;
      saveSelectedLocation();
      localStorage.setItem(UI_KEY, JSON.stringify({ year: selectedYear, quarter: selectedQuarter, locationId: selectedLocation }));
      populateYearOptions();
      setPeriodControls();
      closeExcelImportDialog();
      renderAll();
      const importedRateCount = Object.keys(payload.exchangeRates || {}).length;
      showToast(`Бюджет за ${importQuarterLabel(payload.quarterKey)} импортирован: ${payload.rows.length} строк, ${importedRateCount} курсов`);
    } catch (error) {
      const outcomeUnknown = error.mutationOutcome === "unknown";
      dom.excelImportStatus.textContent = outcomeUnknown
        ? `Результат импорта не подтверждён: ${error.message}`
        : `Импорт не применён: ${error.message}`;
      dom.excelImportStatus.classList.add("is-error");
      dom.applyExcelImportBtn.disabled = outcomeUnknown;
    }
  }

  function closeExcelImportDialog() {
    dom.excelImportDialog.close();
    pendingBudgetWorkbookFile = null;
    pendingBudgetWorkbookInfo = null;
    pendingBudgetImport = null;
    dom.importExcelInput.value = "";
    dom.excelImportStatus.classList.remove("is-error");
  }

  function updateStorageMode() {
    dom.storageBadge.classList.toggle("is-shared", sharedMode);
    dom.storageBadge.querySelector("strong").textContent = sharedMode ? "Общий режим" : "Локальный режим";
    dom.storageBadge.querySelector("small").textContent = sharedMode ? "Единые данные команды" : "Данные сохраняются в браузере";
    dom.updateTrackerTokenBtn.hidden = !trackerPersonalTokenAllowed(sharedMode);
    if (sharedMode && dom.trackerTokenDialog.open) closeTrackerTokenDialog();
  }

  function trackerPersonalTokenAllowed(isSharedMode) {
    return !isSharedMode;
  }

  function populateYearOptions() {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 4; year <= currentYear + 3; year += 1) years.add(year);
    years.add(selectedYear);
    Object.keys(state?.budgets || {}).forEach((key) => {
      const match = key.match(/\|(\d{4})-Q[1-4]$/) || key.match(/^(\d{4})-Q[1-4]$/);
      if (match) years.add(Number(match[1]));
    });
    (state?.expenses || []).forEach((expense) => years.add(Number(expense.quarterKey.slice(0, 4))));
    (state?.forecastTickets || []).flatMap((ticket) => ticket.allocations || [])
      .forEach((allocation) => years.add(Number(allocation.quarterKey.slice(0, 4))));
    dom.yearSelect.innerHTML = [...years]
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("");
  }

  function setPeriodControls() {
    dom.yearSelect.value = String(selectedYear);
    dom.quarterSelect.value = String(selectedQuarter);
  }

  function selectedQuarterKey() {
    return quarterKey(selectedYear, selectedQuarter);
  }

  function quarterKey(year, quarter) {
    return `${year}-Q${quarter}`;
  }

  function quarterMonthKeysFromQuarterKey(value) {
    const match = String(value || "").match(/^(\d{4})-Q([1-4])$/);
    if (!match) return [];
    const year = Number(match[1]);
    const firstMonth = (Number(match[2]) - 1) * 3 + 1;
    return [0, 1, 2].map((offset) => `${year}-${String(firstMonth + offset).padStart(2, "0")}`);
  }

  function formatMonthLabel(monthKey) {
    const match = String(monthKey || "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return "";
    const label = new Intl.DateTimeFormat(language === "en" ? "en-US" : "ru-RU", { month: "long" })
      .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function quarterKeyFromDateInput(value) {
    const period = periodFromDateInput(value);
    return quarterKey(period.year, period.quarter);
  }

  function monthKeyFromDateInput(value) {
    const match = String(value || "").match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  function periodFromDateInput(value) {
    const [year, month] = value.split("-").map(Number);
    return { year, quarter: Math.floor((month - 1) / 3) + 1 };
  }

  function periodFromDate(date) {
    return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
  }

  function previousQuarterKey(year, quarter) {
    return quarter > 1 ? quarterKey(year, quarter - 1) : quarterKey(year - 1, 4);
  }

  function periodLabel(year, quarter) {
    return `${quarter} квартал ${year}`;
  }

  function activeLocations() {
    return state.locations.filter((loc) => !loc.archived);
  }

  function effectiveLocationIds() {
    if (!isAllLocationsMode()) return [selectedLocation];
    return activeLocations()
      .filter((loc) => locationPermissionClient(loc.id) !== "hidden")
      .map((loc) => loc.id);
  }

  function effectiveLocationSet() {
    return new Set(effectiveLocationIds());
  }

  function locationById(id) {
    return state.locations.find((loc) => loc.id === id);
  }

  function isAllLocationsMode() {
    return selectedLocation === ALL_LOCATIONS;
  }

  function budgetStoreKey(locationId, quarterKey) {
    return `${locationId}|${quarterKey}`;
  }

  function projectResponsibleGroups(articleId, locationId, quarterKey) {
    const assignments = state.responsibleGroups?.[budgetStoreKey(locationId, quarterKey)];
    return Array.isArray(assignments?.[articleId]) ? assignments[articleId] : [];
  }

  function projectAttributesFor(articleId, locationId, quarterKey) {
    const entry = state.projectAttributes?.[budgetStoreKey(locationId, quarterKey)]?.[articleId];
    return {
      service: typeof entry?.service === "string" ? entry.service : "",
      serviceCode: typeof entry?.serviceCode === "string" ? entry.serviceCode : "",
      legalEntity: typeof entry?.legalEntity === "string" ? entry.legalEntity : "",
      cfo: typeof entry?.cfo === "string" ? entry.cfo : "",
      cfoCode: typeof entry?.cfoCode === "string" ? entry.cfoCode : "",
      location: typeof entry?.location === "string" ? entry.location : ""
    };
  }

  function budgetItemKey(articleId, subarticleId) {
    return subarticleId ? `${articleId}|${subarticleId}` : articleId;
  }

  function activeProjectArticles(article) {
    return (article?.subarticles || []).filter((item) => !item.archived);
  }

  function isExcelProjectArticle(projectArticle) {
    return String(projectArticle?.id || "").startsWith("excel:");
  }

  function projectArticlesForContext(article, locationId, quarterKey) {
    const locationIds = locationId === ALL_LOCATIONS ? effectiveLocationIds() : [locationId];
    return activeProjectArticles(article).filter((projectArticle) => {
      const legacyImportedDefault = article?.imported === true
        && projectArticle.id === BudgetImport.DEFAULT_PROJECT_ARTICLE_ID;
      if (!isExcelProjectArticle(projectArticle) && !legacyImportedDefault) return true;
      const itemKey = budgetItemKey(article.id, projectArticle.id);
      const hasBudget = locationIds.some((locId) =>
        Object.keys(budgetAmounts(locId, quarterKey, itemKey)).length > 0
        || Object.keys(budgetMonthlyAmounts(locId, quarterKey, itemKey)).length > 0);
      const hasExpense = state.expenses.some((expense) => locationIds.includes(expense.locationId)
        && expense.quarterKey === quarterKey
        && expense.articleId === article.id
        && expense.subarticleId === projectArticle.id);
      const hasForecast = state.forecastTickets.some((ticket) => (ticket.allocations || []).some((allocation) =>
        locationIds.includes(allocation.locationId)
        && allocation.quarterKey === quarterKey
        && allocation.articleId === article.id
        && allocation.subarticleId === projectArticle.id));
      return hasBudget || hasExpense || hasForecast;
    });
  }

  function budgetItemHasValuesClient(current, itemKey) {
    return [current.budgets, current.monthlyBudgets].some((collection) =>
      Object.values(collection || {}).some((store) => {
        const currencies = store?.[itemKey];
        if (!currencies || typeof currencies !== "object") return false;
        return Object.values(currencies).some((value) => {
          if (value && typeof value === "object") return Object.values(value).some((amount) => Number(amount) !== 0);
          return Number(value) !== 0;
        });
      }));
  }

  function budgetAmounts(locationId, quarterKey, itemKey) {
    const store = state.budgets[budgetStoreKey(locationId, quarterKey)];
    return normalizeCurrencyAmounts(store?.[itemKey], DEFAULT_CURRENCY);
  }

  function budgetMonthlyAmounts(locationId, quarterKey, itemKey) {
    const store = state.monthlyBudgets?.[budgetStoreKey(locationId, quarterKey)];
    return normalizeMonthlyCurrencyAmounts(store?.[itemKey], quarterKey);
  }

  function budgetMonthlyAmountsFor(quarterKey, itemKey) {
    const monthKeys = quarterMonthKeysFromQuarterKey(quarterKey);
    const totals = {};
    effectiveLocationIds().forEach((locationId) => {
      Object.entries(budgetMonthlyAmounts(locationId, quarterKey, itemKey)).forEach(([currency, months]) => {
        if (!months) return;
        if (!totals[currency]) totals[currency] = Object.fromEntries(monthKeys.map((m) => [m, 0]));
        monthKeys.forEach((monthKey) => {
          totals[currency][monthKey] = (totals[currency][monthKey] || 0) + (Number(months[monthKey]) || 0);
        });
      });
    });
    return totals;
  }

  function aggregateBudgetAmounts(source, locationIds, quarterKey, itemKey) {
    const totals = {};
    (Array.isArray(locationIds) ? locationIds : []).forEach((locationId) => {
      const store = source?.budgets?.[budgetStoreKey(locationId, quarterKey)];
      Object.entries(normalizeCurrencyAmounts(store?.[itemKey], DEFAULT_CURRENCY)).forEach(([currency, amount]) => {
        if (!amount) return;
        totals[currency] = (totals[currency] || 0) + (Number(amount) || 0);
      });
    });
    return totals;
  }

  function budgetAmountsFor(quarterKey, itemKey) {
    return aggregateBudgetAmounts(state, effectiveLocationIds(), quarterKey, itemKey);
  }

  function activeExpensesForQuarter(key) {
    const locationSet = effectiveLocationSet();
    return state.expenses.filter((expense) =>
      expense.quarterKey === key
      && expense.status !== "canceled"
      && locationSet.has(expense.locationId)
    );
  }

  function forecastAllocations() {
    return state.forecastTickets.flatMap((ticket) => (ticket.allocations || []).map((allocation) => ({
      ...allocation,
      remainingAmount: forecastAllocationRemainingAmount(state, ticket.id, allocation),
      ticketId: ticket.id,
      ticketUrl: ticket.ticketUrl,
      sourceRequestNumber: ticket.sourceRequestNumber,
      ticketDescription: ticket.description,
      supplier: ticket.supplier,
      ticketCreatedAt: ticket.createdAt,
      ticketCreatedBy: ticket.createdBy,
      ticketSourceType: ticket.sourceType
    })));
  }

  function activeForecastAllocationsForQuarter(key) {
    const locationSet = effectiveLocationSet();
    return forecastAllocations().filter((allocation) =>
      allocation.quarterKey === key
      && allocation.lifecycle === "active"
      && Number(allocation.remainingAmount) > 0
      && locationSet.has(allocation.locationId));
  }

  function catalogCurrencyCode(value) {
    const code = String(value || "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : "";
  }

  function normalizeCurrencyCatalog(value, requiredCodes = new Set()) {
    const codes = new Set(["RUB", ...(Array.isArray(value) ? [] : CURRENCY_CODES), ...requiredCodes]);
    (Array.isArray(value) ? value : []).forEach((item) => {
      const code = catalogCurrencyCode(typeof item === "string" ? item : item?.code);
      if (code) codes.add(code);
    });
    return [...codes].sort().map((code) => ({ code }));
  }

  function collectStateCurrencyCodes(source) {
    const codes = new Set();
    Object.values(source?.budgets || {}).forEach((store) => Object.values(store || {}).forEach((amounts) =>
      Object.keys(amounts || {}).forEach((code) => { const normalized = catalogCurrencyCode(code); if (normalized) codes.add(normalized); })));
    (source?.expenses || []).forEach((item) => { const code = catalogCurrencyCode(item?.currency); if (code) codes.add(code); });
    (source?.forecastTickets || []).flatMap((ticket) => ticket.allocations || []).forEach((item) => {
      const code = catalogCurrencyCode(item?.currency); if (code) codes.add(code);
    });
    return codes;
  }

  function normalizeExchangeRatePeriods(value) {
    const normalized = {};
    if (!value || typeof value !== "object") return normalized;
    Object.entries(value).forEach(([quarterKey, entries]) => {
      if (!/^\d{4}-Q[1-4]$/.test(quarterKey) || !entries || typeof entries !== "object") return;
      const period = {};
      Object.entries(entries).forEach(([currency, entry]) => {
        const code = catalogCurrencyCode(currency);
        if (!code || code === "RUB") return;
        const rateToRub = positiveNumber(typeof entry === "number" ? entry : entry?.rateToRub);
        if (!rateToRub) return;
        period[code] = {
          rateToRub,
          direction: entry?.direction === "rubToCurrency" ? "rubToCurrency" : "currencyToRub"
        };
      });
      if (Object.keys(period).length) normalized[quarterKey] = period;
    });
    return normalized;
  }

  function convertToRub(amount, currency, quarterKey, ratesByQuarter) {
    const source = catalogCurrencyCode(currency);
    if (!source || !/^\d{4}-Q[1-4]$/.test(String(quarterKey || ""))) return null;
    if (source === "RUB") return Number(amount) || 0;
    const rate = Number(ratesByQuarter?.[quarterKey]?.[source]?.rateToRub);
    return Number.isFinite(rate) && rate > 0 ? (Number(amount) || 0) * rate : null;
  }

  function exchangeRateViewValue(rateToRub, reversed) {
    const rate = positiveNumber(rateToRub);
    if (!rate) return 0;
    return reversed ? 1 / rate : rate;
  }

  function formatExchangeRate(value) {
    const amount = positiveNumber(value);
    if (!amount) return "";
    return new Intl.NumberFormat(language === "en" ? "en-US" : "ru-RU", {
      useGrouping: true,
      minimumFractionDigits: 0,
      maximumFractionDigits: 10
    }).format(amount).replace(/[\u00a0\u202f]/g, " ");
  }

  function convertTotalsToRub(totals, quarterKey, ratesByQuarter) {
    const result = { plan: 0, fact: 0, forecast: 0, balance: 0, free: 0, expected: 0, missing: [] };
    Object.entries(totals || {}).forEach(([currency, item]) => {
      const rate = convertToRub(1, currency, quarterKey, ratesByQuarter);
      if (rate == null) {
        result.missing.push(currency);
        return;
      }
      ["plan", "fact", "forecast", "balance", "free", "expected"].forEach((field) => {
        result[field] += (Number(item?.[field]) || 0) * rate;
      });
    });
    return result;
  }

  function displaySummaryMoney(totals, converted, field, colorBalance = false) {
    if (!converted) return moneyBreakdownHtml(totals, field, colorBalance);
    if (converted.missing.length) return `<span class="conversion-missing">Нет курса: ${escapeHtml(converted.missing.join(", "))}</span>`;
    const value = converted[field] || 0;
    const className = colorBalance ? (value < 0 ? "balance-negative" : "balance-positive") : "";
    return `<span class="${className}">${formatMoney(value, "RUB")}</span>`;
  }

  function displayConvertedUtilization(converted) {
    if (converted.missing.length) return "—";
    const ratio = utilization(converted.plan, converted.expected);
    return converted.plan === 0 && converted.expected > 0 ? ">100%" : `${formatPercent(ratio)}%`;
  }

  function exchangeRateQuarterKey() {
    return `${exchangeRateYear}-Q${exchangeRateQuarter}`;
  }

  function currenciesUsedInQuarter(quarterKey) {
    const codes = new Set();
    Object.entries(state.budgets || {}).filter(([key]) => key.endsWith(`|${quarterKey}`)).forEach(([, store]) =>
      Object.values(store || {}).forEach((amounts) => Object.keys(amounts || {}).forEach((code) => codes.add(code))));
    state.expenses.filter((item) => item.quarterKey === quarterKey).forEach((item) => codes.add(item.currency));
    state.forecastTickets.flatMap((ticket) => ticket.allocations || []).filter((item) => item.quarterKey === quarterKey)
      .forEach((item) => codes.add(item.currency));
    return codes;
  }

  function renderExchangeRates() {
    const quarterKey = exchangeRateQuarterKey();
    const used = currenciesUsedInQuarter(quarterKey);
    const rates = state.exchangeRatesByQuarter[quarterKey] || {};
    const years = new Set([selectedYear, exchangeRateYear]);
    Object.keys(state.exchangeRatesByQuarter || {}).forEach((key) => years.add(Number(key.slice(0, 4))));
    Object.keys(state.budgets || {}).forEach((key) => { const match = key.match(/\|(\d{4})-Q[1-4]$/); if (match) years.add(Number(match[1])); });
    dom.exchangeRateYear.innerHTML = [...years].filter(Number.isInteger).sort((a, b) => b - a).map((year) => `<option value="${year}">${year}</option>`).join("");
    dom.exchangeRateYear.value = String(exchangeRateYear);
    dom.exchangeRateQuarter.value = String(exchangeRateQuarter);
    const visibleCurrencies = [...new Set([...used, ...Object.keys(rates)])].filter((currency) => currency !== "RUB").sort();
    dom.exchangeRatesGrid.innerHTML = visibleCurrencies.map((currency) => {
      const entry = rates[currency];
      if (!entry?.rateToRub) return `<div class="exchange-rate-row is-used"><strong>${escapeHtml(currency)}</strong><span class="conversion-missing">Нет курса в импортированном файле</span></div>`;
      const reversed = entry.direction === "rubToCurrency";
      const viewValue = exchangeRateViewValue(entry.rateToRub, reversed);
      const equation = reversed ? `1 RUB = ${currency}` : `1 ${currency} = RUB`;
      return `<div class="exchange-rate-row${used.has(currency) ? " is-used" : ""}">
        <strong>${escapeHtml(currency)}</strong>
        <span><span class="exchange-rate-equation">${escapeHtml(equation)}</span><strong>${escapeHtml(formatExchangeRate(viewValue))}</strong></span>
        <button class="exchange-rate-swap" type="button" data-rate-swap="${escapeAttribute(currency)}" aria-label="Поменять ${escapeAttribute(currency)} и RUB местами" title="Обратный перевод">⇄</button>
      </div>`;
    }).join("");
    const missing = [...used].filter((code) => code !== "RUB" && !rates[code]?.rateToRub).sort();
    const legacyWarning = state.legacyExchangeRates
      ? " Старые общие курсы сохранены без привязки к кварталу и не применяются автоматически."
      : "";
    dom.exchangeRateStatus.textContent = (missing.length
      ? `Не задан курс ${missing.join(", ")} для ${quarterKey}`
      : `Курсы ${quarterKey}: ${Object.keys(rates).length} валют`) + legacyWarning;
  }

  function handleExchangeRateSwap(event) {
    const button = event.target.closest("[data-rate-swap]");
    if (!button) return;
    const currency = catalogCurrencyCode(button.dataset.rateSwap);
    const quarterKey = exchangeRateQuarterKey();
    const entry = state.exchangeRatesByQuarter[quarterKey]?.[currency];
    if (!entry?.rateToRub) return;
    entry.direction = entry.direction === "rubToCurrency" ? "currencyToRub" : "rubToCurrency";
    state.revision += 1;
    saveState(state);
    renderExchangeRates();
    renderOverview();
    renderExpenses();
    renderForecasts();
    setSaveStatus("Все изменения сохранены");
  }

  function handleCurrencyDisplayModeChange() {
    currencyDisplayMode = dom.currencyDisplayMode.value === "RUB" ? "RUB" : "original";
    try { localStorage.setItem(CURRENCY_DISPLAY_KEY, currencyDisplayMode); } catch {}
    renderOverview();
    renderExpenses();
    renderForecasts();
  }

  function moneyBreakdownHtml(totals, field, colorBalance = false) {
    const currencies = Object.keys(totals).sort();
    if (!currencies.length) return "—";
    return currencies.map((currency) => {
      const value = totals[currency][field] || 0;
      const className = colorBalance ? (value < 0 ? "balance-negative" : "balance-positive") : "";
      return `<span class="${className}"><b>${escapeHtml(currency)}</b><em title="${escapeAttribute(formatMoney(value, currency))}">${formatMoney(value, currency)}</em></span>`;
    }).join("");
  }

  function articleById(id) {
    return state.articles.find((article) => article.id === id);
  }

  function subarticleById(articleId, subarticleId) {
    const article = articleById(articleId);
    return (article?.subarticles || []).find((s) => s.id === subarticleId);
  }

  function utilization(plan, fact) {
    if (plan === 0) return fact > 0 ? Number.POSITIVE_INFINITY : 0;
    return (fact / plan) * 100;
  }

  function utilizationClass(ratio) {
    if (!Number.isFinite(ratio) || ratio > 100) return "is-danger";
    return "is-ok";
  }

  function utilizationColor(ratio) {
    const kind = utilizationClass(ratio);
    if (kind === "is-danger") return "var(--red)";
    return "var(--primary)";
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) return 100;
    return Math.round(value * 10) / 10;
  }

  function normalizeCurrencyCode(value) {
    return BudgetImport?.normalizeCurrencyCode(value) || "";
  }

  function normalizeBudgetType(value) {
    return BudgetImport?.normalizeBudgetType(value) || "";
  }

  function normalizeCurrencyAmounts(value, legacyCurrency) {
    const fallback = normalizeCurrencyCode(legacyCurrency) || DEFAULT_CURRENCY;
    if (Number.isFinite(Number(value)) && value !== null && value !== "") {
      const amount = Number(value);
      return amount >= 0 ? { [fallback]: amount } : {};
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const amounts = {};
    Object.entries(value).forEach(([currency, rawAmount]) => {
      const code = normalizeCurrencyCode(currency);
      const amount = Number(rawAmount);
      if (code && Number.isFinite(amount) && amount >= 0) amounts[code] = amount;
    });
    return amounts;
  }

  function normalizeMonthlyCurrencyAmounts(value, quarterKey) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const monthKeys = quarterMonthKeysFromQuarterKey(quarterKey);
    if (monthKeys.length !== 3) return {};
    const result = {};
    Object.entries(value).forEach(([currency, rawMonths]) => {
      const code = normalizeCurrencyCode(currency);
      if (!code || !rawMonths || typeof rawMonths !== "object" || Array.isArray(rawMonths)) return;
      if (!monthKeys.some((monthKey) => Object.prototype.hasOwnProperty.call(rawMonths, monthKey))) return;
      result[code] = Object.fromEntries(monthKeys.map((monthKey) => {
        const amount = Number(rawMonths[monthKey]);
        return [monthKey, Number.isFinite(amount) && amount >= 0 ? amount : 0];
      }));
    });
    return result;
  }

  function validateMonthAmounts(value, quarterKey) {
    const monthKeys = quarterMonthKeysFromQuarterKey(quarterKey);
    const suppliedKeys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
    if (monthKeys.length !== 3 || suppliedKeys.length !== 3
      || suppliedKeys.some((monthKey) => !monthKeys.includes(monthKey))) {
      throw new Error("Помесячный план не соответствует выбранному кварталу");
    }
    return Object.fromEntries(monthKeys.map((monthKey) => {
      const amount = Number(value[monthKey]);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Проверьте помесячные суммы бюджета");
      return [monthKey, amount];
    }));
  }

  function sumMonthAmounts(value, quarterKey) {
    return quarterMonthKeysFromQuarterKey(quarterKey)
      .reduce((sum, monthKey) => sum + (Number(value?.[monthKey]) || 0), 0);
  }

  function remapMonthlyBudgetStore(store, fromQuarter, toQuarter) {
    if (!store || typeof store !== "object") return {};
    const fromMonths = quarterMonthKeysFromQuarterKey(fromQuarter);
    const toMonths = quarterMonthKeysFromQuarterKey(toQuarter);
    if (fromMonths.length !== 3 || toMonths.length !== 3) return {};
    const result = {};
    Object.entries(store).forEach(([itemKey, currencies]) => {
      if (!currencies || typeof currencies !== "object" || Array.isArray(currencies)) return;
      Object.entries(currencies).forEach(([currency, months]) => {
        const code = normalizeCurrencyCode(currency);
        if (!code || !months || typeof months !== "object" || Array.isArray(months)) return;
        result[itemKey] ||= {};
        result[itemKey][code] = Object.fromEntries(toMonths.map((monthKey, index) => [monthKey, Number(months[fromMonths[index]]) || 0]));
      });
    });
    return result;
  }

  function normalizeCode(value) {
    return cleanText(value, 80).toUpperCase();
  }

  function currencyLabel(currencyCode) {
    const code = normalizeCurrencyCode(currencyCode) || DEFAULT_CURRENCY;
    try {
      return new Intl.DisplayNames([language === "en" ? "en" : "ru"], { type: "currency" }).of(code) || code;
    } catch {
      return code;
    }
  }

  function currencyOptions(selected) {
    const normalized = normalizeCurrencyCode(selected);
    const available = availableCurrencyCodes();
    const codes = normalized && !available.includes(normalized) ? [normalized, ...available] : available;
    return codes.map((code) => `<option value="${code}" ${code === normalized ? "selected" : ""}>${escapeHtml(currencyLabel(code))} (${code})</option>`).join("");
  }

  function availableCurrencyCodes() {
    return [...new Set((state.currencyCatalog || []).map((item) => item.code).filter(Boolean))].sort();
  }

  function budgetTypeBadge(article, standalone = false) {
    const type = normalizeBudgetType(article?.budgetType);
    const label = type ? type.toUpperCase() : (language === "en" ? "Manual" : "Вручную");
    return `<span class="budget-type-badge ${type ? `is-${type}` : "is-manual"} ${standalone ? "is-standalone" : ""}">${label}</span>`;
  }

  function formatGroupedNumber(value, targetLanguage = language) {
    const amount = Number(value);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat(targetLanguage === "en" ? "en-US" : "ru-RU", {
      useGrouping: true,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(safeAmount).replace(/[\u00a0\u202f]/g, " ");
  }

  function parseGroupedNumber(value, targetLanguage = language) {
    if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
    let normalized = String(value ?? "").trim().replace(/[\s\u00a0\u202f']/g, "");
    if (!normalized) return Number.NaN;
    const commaIndex = normalized.lastIndexOf(",");
    const dotIndex = normalized.lastIndexOf(".");
    if (commaIndex >= 0 && dotIndex >= 0) {
      const decimalSeparator = commaIndex > dotIndex ? "," : ".";
      const groupingSeparator = decimalSeparator === "," ? "." : ",";
      normalized = normalized.split(groupingSeparator).join("");
      normalized = normalized.replace(decimalSeparator, ".");
    } else if (commaIndex >= 0) {
      const isGroupedInteger = /^[-+]?\d{1,3}(?:,\d{3})+$/.test(normalized);
      const separatorCount = (normalized.match(/,/g) || []).length;
      normalized = isGroupedInteger && (targetLanguage === "en" || separatorCount > 1)
        ? normalized.replace(/,/g, "")
        : normalized.replace(",", ".");
    } else if (dotIndex >= 0) {
      const isGroupedInteger = /^[-+]?\d{1,3}(?:\.\d{3})+$/.test(normalized);
      if (isGroupedInteger && (normalized.match(/\./g) || []).length > 1) normalized = normalized.replace(/\./g, "");
    }
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : Number.NaN;
  }

  function formatAmountInput(input) {
    if (!input || !String(input.value).trim()) return;
    const amount = parseGroupedNumber(input.value);
    if (Number.isFinite(amount)) input.value = formatGroupedNumber(amount);
  }

  function formatMoney(value, currencyCode) {
    const code = normalizeCurrencyCode(currencyCode) || DEFAULT_CURRENCY;
    if (CURRENCY_SYMBOLS[code]) {
      return `${formatGroupedNumber(value)} ${CURRENCY_SYMBOLS[code]}`;
    }
    try {
      return moneyFormatterFor(code).format(Number(value) || 0).replace(/[\u00a0\u202f]/g, " ");
    } catch {
      return `${formatGroupedNumber(value)} ${code}`;
    }
  }

  function formatMoneyForDisplay(value, currencyCode, quarterKey = selectedQuarterKey()) {
    if (currencyDisplayMode === "original") return formatMoney(value, currencyCode);
    const converted = convertToRub(value, currencyCode, quarterKey, state.exchangeRatesByQuarter);
    return converted == null ? `Не задан курс ${currencyCode} для ${quarterKey}` : formatMoney(converted, "RUB");
  }

  function formatDate(value) {
    if (!validDateInput(value)) return "—";
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(language === "en" ? "en-GB" : "ru-RU", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function toDateInputValue(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function validDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function validIsoDateTime(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function ticketLabel(value) {
    try {
      const url = new URL(value);
      const lastPart = url.pathname.split("/").filter(Boolean).pop();
      return lastPart || url.hostname;
    } catch {
      return value || "Тикет";
    }
  }

  function articleOptionLabel(article) {
    const type = normalizeBudgetType(article.budgetType);
    const prefix = type ? `[${type.toUpperCase()}] ` : "";
    return article.code ? `${prefix}${article.code} · ${article.name}` : `${prefix}${article.name}`;
  }

  function projectCodeHtml(code) {
    return code
      ? `<span class="project-code">${escapeHtml(code)}</span>`
      : '<span class="missing-code">Не задан</span>';
  }

  function pluralizeExpenses(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? "расход"
      : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
        ? "расхода"
        : "расходов";
    return `${count} ${word}`;
  }

  function compareExpensesNewestFirst(a, b) {
    return b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt);
  }

  function loadProfile() {
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return { name: cleanText(stored.name, 80) };
    } catch {
      return { name: "" };
    }
  }

  function loadInitialPeriod() {
    const current = periodFromDate(new Date());
    try {
      const stored = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
      const year = Number(stored.year);
      const quarter = Number(stored.quarter);
      return Number.isInteger(year) && quarter >= 1 && quarter <= 4 ? { year, quarter } : current;
    } catch {
      return current;
    }
  }

  function loadTrackerPeriod(fallback) {
    const safeFallback = fallback && Number.isInteger(fallback.year)
      && Number.isInteger(fallback.quarter) && fallback.quarter >= 1 && fallback.quarter <= 4
      ? fallback : periodFromDate(new Date());
    try {
      const stored = JSON.parse(localStorage.getItem(TRACKER_PERIOD_KEY) || "{}");
      const year = Number(stored.year);
      const quarter = Number(stored.quarter);
      return Number.isInteger(year) && quarter >= 1 && quarter <= 4
        ? { year, quarter }
        : { ...safeFallback };
    } catch {
      return { ...safeFallback };
    }
  }

  function saveTrackerPeriod() {
    try {
      localStorage.setItem(TRACKER_PERIOD_KEY, JSON.stringify(trackerPeriod));
    } catch {}
  }

  function loadTrackerSearchScope() {
    try {
      return localStorage.getItem(TRACKER_SCOPE_KEY) === "queue" ? "queue" : "mine";
    } catch {
      return "mine";
    }
  }

  function saveTrackerSearchScope() {
    try {
      localStorage.setItem(TRACKER_SCOPE_KEY, trackerSearchScope);
    } catch {}
  }

  function trackerSearchScopeLabel(scope) {
    return scope === "queue" ? "вся очередь TAXIASSIST" : "мои тикеты TAXIASSIST";
  }

  function trackerSearchScopeObjectLabel(scope) {
    return scope === "queue" ? "всю очередь TAXIASSIST" : "мои тикеты TAXIASSIST";
  }

  function populateTrackerScopeControl() {
    if (dom.trackerSyncScope) dom.trackerSyncScope.value = trackerSearchScope;
  }

  function handleTrackerScopeChange() {
    if (trackerSyncInProgress) {
      populateTrackerScopeControl();
      return;
    }
    trackerSearchScope = dom.trackerSyncScope.value === "queue" ? "queue" : "mine";
    saveTrackerSearchScope();
    renderTrackerSyncCard();
  }

  function trackerQuarterKey() {
    return quarterKey(trackerPeriod.year, trackerPeriod.quarter);
  }

  function populateTrackerPeriodControls() {
    if (!dom.trackerSyncQuarter || !dom.trackerSyncYear) return;
    const years = new Set([selectedYear, trackerPeriod.year, new Date().getFullYear()]);
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 4; year <= currentYear + 3; year += 1) years.add(year);
    (state?.expenses || []).forEach((expense) => {
      const match = String(expense.quarterKey || "").match(/^(\d{4})-Q[1-4]$/);
      if (match) years.add(Number(match[1]));
    });
    dom.trackerSyncYear.innerHTML = [...years]
      .filter(Number.isFinite)
      .sort((a, b) => b - a)
      .map((year) => `<option value="${year}">${year}</option>`)
      .join("");
    dom.trackerSyncQuarter.value = String(trackerPeriod.quarter);
    dom.trackerSyncYear.value = String(trackerPeriod.year);
  }

  function handleTrackerPeriodChange() {
    if (trackerSyncInProgress) {
      populateTrackerPeriodControls();
      return;
    }
    const year = Number(dom.trackerSyncYear.value);
    const quarter = Number(dom.trackerSyncQuarter.value);
    if (!Number.isInteger(year) || quarter < 1 || quarter > 4) {
      populateTrackerPeriodControls();
      return;
    }
    trackerPeriod = { year, quarter };
    saveTrackerPeriod();
    renderTrackerSyncCard();
  }

  function loadCurrencyDisplayMode() {
    try {
      const stored = localStorage.getItem(CURRENCY_DISPLAY_KEY);
      return stored === "RUB" ? "RUB" : "original";
    } catch {
      return "original";
    }
  }

  function initials(name) {
    if (!name) return "?";
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  }

  function createId() {
    return globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function confirmAction(message) {
    return window.confirm(translateString(message));
  }

  function promptAction(message, defaultValue = "") {
    return window.prompt(translateString(message), translateString(defaultValue));
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " is-error" : ""}`;
    toast.textContent = translateString(message);
    dom.toastRegion?.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3800);
  }

  function setSaveStatus(message, isError = false) {
    dom.saveStatus.textContent = translateString(message);
    dom.saveStatus.style.color = isError ? "var(--red)" : "";
  }

  function isBackdropClick(event) {
    const dialog = event.currentTarget;
    if (!dialog || event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function toCamel(value) {
    return value.replace(/-([a-z0-9])/gi, (_, character) => character.toUpperCase());
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      createInitialState,
      normalizeState,
      applyLocalMutation,
      utilization,
      utilizationClass,
      formatGroupedNumber,
      parseGroupedNumber,
      groupArticlesByBudgetType,
      filterProjectsByResponsible,
      filterProjectsByBudgetType,
      filterProjectsByAttribute,
      filterProjectsByQuery,
      filterLocationsByQuery,
      globalTicketSearchResults,
      periodFromDateInput,
      quarterKeyFromDateInput,
      quarterMonthKeysFromQuarterKey,
      normalizeMonthlyCurrencyAmounts,
      sumMonthAmounts,
      remapMonthlyBudgetStore,
      aggregateBudgetEntries,
      aggregateBudgetAmounts,
      normalizeExchangeRatePeriods,
      normalizeCurrencyCatalog,
      convertToRub,
      convertTotalsToRub,
      exchangeRateViewValue,
      applyBudgetProjectExpansion,
      expenseMatchesAttributeFilters,
      expenseMatchesResponsible,
      expenseMatchesBudgetType,
      expenseImportButtonMode,
      saveState,
      loadLocalState,
      budgetImportMatchesPayload,
      expenseMatchesPayload,
      serverMutationWasApplied,
      recoverCommittedServerMutation,
      csvCell,
      classifyCorporateAuth,
      corporateLoginRedirectAllowed,
      translateToEnglish,
      ndaNoticeUrl,
      trackerPersonalTokenAllowed,
      monthKeyFromDateInput,
      toCamel
    };
  }
})();
