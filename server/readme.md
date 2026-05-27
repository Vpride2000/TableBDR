# Server API Reference

Этот файл описывает HTTP API, доступные в серверной части приложения.
Все маршруты начинаются с `/api`.

## Общие маршруты

### `GET /api/health`
Проверка работоспособности сервера.
- Ответ: `{ status: 'ok' }`

## Прогноз по месяцам

### `GET /api/gn/forecast-monthly`
Получить все строки месячного прогноза.
- Ответ: `{ rows: Array<{ rowId: number; monthlyValues: number[]; monthlyFactValues: number[] }> }`

### `PUT /api/gn/forecast-monthly`
Сохранить или обновить данные месячного прогноза.
- Тело запроса: `{ rows: Array<{ rowId: number; monthlyValues: number[12]; monthlyFactValues: number[12] }> }`
- В ответе возвращается количество сохранённых строк и удалённых устаревших записей.

## Справочные GN сущности

### `GET /api/gn/departments`
Получить список подразделений (`GN_department`).

### `GET /api/gn/budget-items`
Получить список статей бюджета общества (`GN_budget_network_item`).

### `GET /api/gn/pao-budget-items`
Получить список статей бюджета УС (`PAO__budget_network_item`).

### `GET /api/gn/contractors`
Получить список контрагентов (`GN_contractor`).

### `GET /api/gn/dogovors`
Получить список договоров (`GN_dogovor`).

### `GET /api/gn/objects`
Получить список объектов (`GN_departament_object`).

### `GET /api/gn/contracts`
Получить список контрактов (`GN_contracts`) с именем договора.

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
