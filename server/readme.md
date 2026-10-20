# Server API Reference

Этот файл описывает HTTP API, доступные в серверной части приложения.
Все маршруты начинаются с `/api`.

## Общие маршруты

### `GET /api/health`
Проверка работоспособности сервера.
- Ответ: `{ status: 'ok' }`

## Заметки

Заметки доступны всем пользователям приложения без отдельных аккаунтов. При запуске backend автоматически создаются таблицы для блокнотов, разделов, страниц, тегов и полнотекстового индекса PostgreSQL.

### `GET /api/notes`
Получить навигационную структуру: блокноты, разделы и метаданные страниц с тегами.

### `POST /api/notes/notebooks`, `PUT /api/notes/notebooks/:id`, `DELETE /api/notes/notebooks/:id`
Создать, переименовать или удалить блокнот. Удалить можно только блокнот без разделов; в противном случае API возвращает `409 Conflict`.

### `POST /api/notes/sections`, `PUT /api/notes/sections/:id`, `DELETE /api/notes/sections/:id`
Создать, переименовать или удалить раздел внутри блокнота. Удаление возвращает снимок раздела и его страниц, который можно передать в `POST /api/notes/sections/:id/restore`, чтобы восстановить их.

### `POST /api/notes/pages`, `GET /api/notes/pages/:id`, `PUT /api/notes/pages/:id`, `DELETE /api/notes/pages/:id`
Создать, прочитать, удалить страницу или сохранить её заголовок, TipTap JSON-документ и теги. Удаление возвращает снимок страницы, который можно передать в `POST /api/notes/pages/:id/restore`, чтобы восстановить содержимое и теги. Интерфейс сохраняет изменения автоматически.

### `GET /api/notes/search?q=<текст>`
Полнотекстовый поиск по заголовкам и содержимому страниц; поиск по тегам также учитывается. Максимальная длина запроса — 200 символов.

## Справочные GN сущности

### `GET /api/gn/departments`
Получить список подразделений (`GN_department`).

### `GET /api/gn/budget-items`
Получить список статей бюджета общества (`GN_budget_network_item`).

### `GET /api/gn/pao-budget-items`
Получить список статей бюджета УС (`PAO__budget_network_item`).

### `GET /api/gn/contractors`
Получить список контрагентов (`GN_contractor`).

### `GET /api/database/schema`
Возвращает имена доступных пользовательских таблиц и представлений PostgreSQL с названиями, типами и nullable-статусом столбцов.
Запрос выполняется при явном нажатии «Загрузить схему» или «Обновить схему» в справочнике, автоматического обновления нет.

### `GET /api/gn/dogovors`
Получить список договоров (`GN_dogovor`).

### `GET /api/gn/objects`
Получить список объектов (`GN_departament_object`).

### `GET /api/gn/contracts`
Получить список контрактов (`GN_contracts`) с именем договора.
Параметр `includeArchive=false` исключает не действующие договоры; `archive=true` возвращает только их.

### `GET /api/gn/gazprom-telecom`
Получить записи «Газпром телеком» с названиями связанных договора, статьи бюджета УС и подразделения.

Для создания, изменения и удаления используются `POST /api/gn/gazprom-telecom`,
`PUT /api/gn/gazprom-telecom/:id` и `DELETE /api/gn/gazprom-telecom/:id`.
Внешние ключи: `GN_dogovor_FK` (справочник `GN_dogovor`), `PAO_budget_network_item_FK`, `GN_department_FK`, `GN_departament_object_FK`.
Для выбора договора используется `GN_dogovor` с контрагентом «Газпром телеком ООО».
Объект выбирается из `GN_departament_object` после выбора подразделения; список ограничен объектами, связанными с этим подразделением.
Итоговая стоимость не хранится отдельно и рассчитывается как `quantity × monthly_tariff`.

### `GET /api/gn/contract-additional-agreements`
Получить список дополнительных соглашений по контрактам.

### `POST /api/gn/contract-additional-agreements`
Создать новое дополнительное соглашение.
- Тело запроса должно содержать:
  - `contractId`: number
  - `number`: string
  - `date`: string
  - `description`: string
  - `amount`: number
  - `approvalStatus?`: string (`действующий` или `на согласовании`)

### `PUT /api/gn/contract-additional-agreements/:id`
Обновить дополнительное соглашение по `id`.
- Тело запроса аналогично POST.

### `DELETE /api/gn/contract-additional-agreements/:id`
Удалить дополнительное соглашение по `id`.

### `GET /api/gn/invest-okdp-tko-is-prit`
Получить записи справочника ОКДП ТКО для ИС ПРИТ.

### `GET /api/gn/invest-ogruz-rekvizit`
Получить записи справочника реквизитов ОГРУЗ.

### `GET /api/gn/invest-program`
Получить список инвестиционных программ с дополнительными полями из связанных справочников.

## BDR (бюджетные данные)

### `GET /api/gn/bdr`
Получить полный список строк BDR с расшифровками связанных сущностей.

### `GET /api/gn/bdr/:id`
Получить одну строку BDR по `id`.

### `POST /api/gn/bdr`
Создать новую строку BDR.
- Тело запроса должно содержать:
  - `pao_budget_item`: string
  - `department`: string
  - `object_name`: string
  - `dogovor`: string
  - `contractor`: string
  - `budget_item`: string
  - `predmet_dogovora`: string
  - `ed_izm`: string
  - `kol_vo`: number
  - `limit`: number
  - `bdr25_corr_kol_vo?`: number
  - `bdr26_kol_vo?`: number
  - `bdr26_corr_kol_vo?`: number
  - `bdr27?`: number
  - `bdr27_kol_vo?`: number
  - `edin_limit`: number
  - `comments?`: string

### `PUT /api/gn/bdr/:id`
Обновить поля строки BDR по `id`.
- Поддерживаются значения для:
  - `Статья бюджета УС`
  - `Подразделение`
  - `Объект`
  - `Договор`
  - `Контрагент`
  - `Статья бюджета`
  - `Предмет договора`
  - `Ед. изм.`
  - `Кол-во`
  - `Лимит`
  - `Кол-во БДР25корр`
  - `Кол-во БДР26`
  - `Кол-во БДР26корр`
  - `БДР27`
  - `Кол-во БДР27`
  - `БДР25корр`
  - `БДР26`
  - `БДР26корр`
  - `Един. лимит`
  - `Примечания`

### `GET /api/gn/bdr/:id/limit-calculation`
Получить расчёт лимита для строки BDR.
- Возвращает данные по строкам расчёта, итоговой сумме и разнице с сохранённым лимитом.

### `PUT /api/gn/bdr/:id/limit-calculation`
Сохранить расчёт лимита для строки BDR.
- Тело запроса:
  - `unitLimit?`: number
  - `comments?`: string
  - `lines`: Array<{ quantity: number; tariff: number; note: string }>

## Универсальное обновление GN сущностей

### `PUT /api/gn/:entity/:id`
Обновить строку произвольной GN сущности.
- Параметр `:entity` должен быть одним из:
  - `departments`
  - `budget-items`
  - `pao-budget-items`
  - `contractors`
  - `dogovors`
  - `objects`
  - `contracts`
  - `invest-okdp-tko-is-prit`
  - `invest-ogruz-rekvizit`
  - `invest-program`
  - `contract-additional-agreements`
- Тело запроса содержит поля, разрешённые для редактирования в соответствующей таблице.

## Примечания
- Все запросы к API ожидают JSON, если передаётся тело запроса.
- Ошибки валидации возвращаются с кодом `400`.
- Ошибки сервера возвращаются с кодом `500`.
