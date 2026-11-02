export const DASHBOARD_TILES = [
  { key: 'services', label: 'Услуги связи' },
  { key: 'contracts', label: 'Договоры' },
  { key: 'cellular', label: 'Сотовая связь' },
  { key: 'satellites', label: 'Спутники (ГКС)' },
  { key: 'purchases', label: 'Закупки' },
  { key: 'import-substitution', label: 'Импортозамещение' },
  { key: 'equipment-accounting', label: 'Учет оборудования' },
] as const

export type DashboardTileKey = (typeof DASHBOARD_TILES)[number]['key']
export type DashboardTileStatus = 'red' | 'yellow' | 'green'
export type DashboardTileStatuses = Record<DashboardTileKey, DashboardTileStatus>

export function isDashboardTileStatus(value: unknown): value is DashboardTileStatus {
  return value === 'red' || value === 'yellow' || value === 'green'
}

export const DASHBOARD_TILE_STATUS_OPTIONS: Array<{ value: DashboardTileStatus; label: string }> = [
  { value: 'red', label: 'Красный — тестовый режим' },
  { value: 'yellow', label: 'Жёлтый — частично обновлено' },
  { value: 'green', label: 'Зелёный — данные актуальны' },
]

export const DEFAULT_DASHBOARD_TILE_STATUSES: DashboardTileStatuses = {
  services: 'red',
  contracts: 'red',
  cellular: 'red',
  satellites: 'red',
  purchases: 'red',
  'import-substitution': 'red',
  'equipment-accounting': 'red',
}
