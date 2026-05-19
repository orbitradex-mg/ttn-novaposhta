# ТТН Нової пошти — панель для менеджерів

Веб-сторінка для перегляду відправлених експрес-накладних (ТТН) через API Нової пошти. Розміщується на **GitHub Pages** без окремого сервера.

## Можливості

- Список ТТН за обраний період
- Отримувач, місто, статус, опис, сума накладного платежу
- Пошук і фільтр по датах
- Посилання на відстеження на novaposhta.ua
- Копіювання номера ТТН в один клік
- Дані з `data/shipments.json`, який оновлює **GitHub Actions** (ключ у Secret `NP_API_KEY`)

## Розклад синхронізації (GitHub Actions)

У `.github/workflows/sync-ttn.yml` задано:

- **`schedule`**: `*/5 * * * *` — **кожні 5 хвилин** (за UTC; фактичний час запуску GitHub може зсуватися на хвилини при навантаженні).
- **`workflow_dispatch`** — запуск **вручну** (кнопка **Run workflow**).

У списку запусків автоматичні матимуть тип **«scheduled»**, ручні — **«Manually run»**. Якщо є лише ручні:

1. Перевірте, що workflow **увімкнено** (Actions → **Sync Nova Poshta TTN** → немає стану «disabled»).
2. У **публічних** репозиторіях GitHub **вимикає** `schedule`, якщо **~60 днів** не було комітів/PR тощо. Допомагає будь-який **push** у `main` або зміна цього YAML — після цього cron знову може запрацювати.
3. Переконайтеся, що **Actions увімкнені** для репозиторію: **Settings** → **Actions** → **General** → дозвіл на виконання workflows.

Якщо cron з організаційних причин недоступний, залишайте періодичний **ручний** запуск або зовнішній cron (наприклад, раз на годину виклик [workflow_dispatch через API](https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#create-a-workflow-dispatch-event) з Personal Access Token).

**Важливо:** push у `main` з job’а Actions через стандартний `GITHUB_TOKEN` **не запускає** інші workflows (зокрема старий лише `push`-тригер для Pages). Тому після синхронізації `data/shipments.json` у цьому репозиторії **у тому ж workflow** виконується redeploy GitHub Pages (`publish-pages`), і сайт отримує актуальний JSON.

## Швидкий старт (GitHub Pages)

### 1. Створіть репозиторій на GitHub

Завантажте цю папку в новий репозиторій (наприклад `ttn-novaposhta`).

### 2. Увімкніть GitHub Pages

1. Репозиторій → **Settings** → **Pages**
2. **Build and deployment** → Source: **GitHub Actions**
3. Після push у гілку `main` workflow `Deploy GitHub Pages` опублікує сайт

Адреса буде: `https://<ваш-логін>.github.io/<назва-репо>/`

### 3. API-ключ Нової пошти

Отримайте ключ у [кабінеті бізнес-клієнта](https://business.novaposhta.ua/) → Налаштування → Безпека → API-ключі.

#### Варіант A — для всіх менеджерів без ключа в браузері (рекомендовано)

1. **Settings** → **Secrets and variables** → **Actions**
2. Додайте secret: `NP_API_KEY` = ваш API-ключ
3. Опційно variable: `NP_DAYS` = `14` (скільки днів завантажувати)
4. **Actions** → **Sync Nova Poshta TTN** → **Run workflow**

Після синхронізації сторінка показує дані з `data/shipments.json`. За замовчуванням оновлення за розкладом — **кожні 5 хвилин** (див. розділ вище) або вручну через **Run workflow**. Для **приватного** репозиторію це витрачає більше хвилин Actions — за потреби збільште інтервал у `sync-ttn.yml` (cron).

#### Варіант B — оновлення лише локально

Запускайте `npm run sync` на своєму ПК з ключем у `.env` і пуште `data/shipments.json` у репозиторій (якщо потрібно без Actions).

## Локальна перевірка

```bash
# Синхронізація (потрібен ключ)
set NP_API_KEY=ваш_ключ
npm run sync

# Перегляд сторінки
npx --yes serve .
```

Відкрийте `http://localhost:3000` (або порт, який покаже serve).

## Структура проєкту

```
├── index.html          # головна сторінка
├── css/styles.css
├── js/                 # логіка та запити до API
├── data/shipments.json # кеш відправлень (оновлює Actions)
├── scripts/sync.js     # скрипт синхронізації
└── .github/workflows/
    ├── pages.yml       # деплой на GitHub Pages
    └── sync-ttn.yml    # оновлення даних з API
```

## API Нової пошти

Використовуються методи:

| Модель | Метод | Призначення |
|--------|--------|-------------|
| `InternetDocument` | `getDocumentList` | список створених ЕН за період |
| `TrackingDocument` | `getStatusDocuments` | актуальні статуси доставки |

Документація: [developers.novaposhta.ua](https://developers.novaposhta.ua/)

## Безпека

- Не комітьте API-ключ у репозиторій
- Для спільного доступу використовуйте **GitHub Secret** `NP_API_KEY`
- Репозиторій можна зробити **приватним** — GitHub Pages для приватних репо доступні на платних планах GitHub; для безкоштовного плану репозиторій має бути публічним

## Усунення проблем

| Проблема | Рішення |
|----------|---------|
| Старі дані / «Оновлено» не змінюється | Перевірте історію **Sync Nova Poshta TTN**: чи є запуски **scheduled**; запустіть **Run workflow**; перегляньте розділ «Розклад синхронізації» вище |
| Порожня таблиця | Перевірте `NP_API_KEY`, запустіть sync workflow |
| Помилка API / CORS | Дані лише з `shipments.json` через Actions |
