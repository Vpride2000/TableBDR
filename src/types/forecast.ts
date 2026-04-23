// Типы и константы, используемые на странице прогнозов и в App.tsx.
// Описывают доступные страницы, структуру строк прогноза и фиксированные метки.
export type Page = 'budget' | 'guide' | 'forecasts' | 'contracts' | 'invest-program-table'

export interface ForecastSourceRow extends Record<string, unknown> {}

export interface ForecastRow {
  rowId: number
  'Статья бюджета': string
  Контрагент: string
  Договор: string
  Подразделение: string
  'Предмет договора': string
  monthlyValues: number[]
  totalLimit: number
}

export interface ForecastMonthlyApiRow {
  rowId: number
  monthlyValues: number[]
  monthlyFactValues?: number[]
}

export type ForecastMonthlyEdits = Record<string, number[]>
export type ForecastMonthlyFactEdits = Record<string, number[]>

export const FORECAST_HIERARCHY_COLUMNS: Array<keyof Pick<ForecastRow, 'Статья бюджета' | 'Контрагент' | 'Договор' | 'Подразделение' | 'Предмет договора'>> = [
  'Статья бюджета',
  'Контрагент',
  'Договор',
  'Подразделение',
  'Предмет договора',
]

export const FORECAST_MONTH_LABELS = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
]

export const FORECAST_NUMBER_FORMATTER = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const FORECAST_UPDATED_EVENT_KEY = 'forecast:last-update'
export const BDR_UPDATED_EVENT_KEY = 'bdr:last-update'