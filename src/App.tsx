import { useRef, useState, useMemo, useEffect } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import BudgetTable from './budget/BudgetTable'
import BudgetSummaryPopup from './budget/BudgetSummaryPopup'
import Guide from './Guide'
import AddBudgetRowPage from './budget/AddBudgetRowPage'
import LimitDetailsPage from './budget/LimitDetailsPage'
import ObjectDetailsPage from './budget/ObjectDetailsPage'
import DepartmentDetailsPage from './budget/DepartmentDetailsPage'
import ContractorDetailsPage from './budget/ContractorDetailsPage'
import ContractDetailsPage from './contract/ContractDetailsPage'
import ContractsPage from './contract/ContractsPage'
import EquipmentOrderPopup from './Purchase/EquipmentOrderPopup'
import SatellitesPage from './satellites/SatellitesPage'
import SatellitesControlPage from './satellites/SatellitesControlPage'
import SatellitesDetailsPage from './satellites/SatellitesDetailsPage'
import CellularPage from './cellular/CellularPage'
import CellularTariffGuidePopup from './cellular/CellularTariffGuidePopup'
import CellularIdentifierGuidePopup from './cellular/CellularIdentifierGuidePopup'
import CellularAccountGuidePopup from './cellular/CellularAccountGuidePopup'
import GazpromTelecomTable from './cellular/GazpromTelecomTable'
import ImportSubstitutionPage from './importSubstitution/ImportSubstitutionPage'
import ImportSubstitutionTable from './importSubstitution/ImportSubstitutionTable'
import EquipmentAccountingTable from './importSubstitution/EquipmentAccountingTable'
import PostgresSchemaPopup from './components/PostgresSchemaPopup'
import PersonalAccountPage from './components/PersonalAccountPage'
import NotesPage from './notes/NotesPage'
import PrimaryPage from './PrimaryPage'
import {
  DEFAULT_DASHBOARD_TILE_STATUSES,
  isDashboardTileStatus,
  type DashboardTileKey,
  type DashboardTileStatus,
  type DashboardTileStatuses,
} from './utils/dashboardTileStatuses'
import {
  DASHBOARD_BDR_FIELDS,
  DEFAULT_DASHBOARD_BDR_FIELD,
  isDashboardBdrField,
} from './utils/dashboardBdrField'

type Page = 'start' | 'budget' | 'guide' | 'contracts' | 'satellites' | 'satellites-control' | 'cellular' | 'import-substitution' | 'notes' | 'personal-account' | 'primary'

function pageFromHash(hash: string): Page {
  if (hash === '#start') return 'start'
  if (
    hash === '#invest-program-table'
    || hash === '#equipment-purchases'
    || hash === '#equipment-accounting'
  ) return 'import-substitution'
  if (hash === '#notes') return 'notes'
  if (hash === '#primary') return 'primary'
  if (hash === '#contracts') return 'contracts'
  if (hash === '#satellites') return 'satellites'
  if (hash === '#satellites-control') return 'satellites-control'
  if (hash === '#personal-account') return 'personal-account'
  if (hash === '#cellular') return 'cellular'
  if (hash === '#import-substitution') return 'import-substitution'
  if (hash === '#guide') return 'guide'
  return 'budget'
}

/*
  Основная точка входа клиентской части приложения.
  Отвечает за маршрутизацию между страницами по хэшу,
  отображение попапов и навигацию между разделами.
*/

interface DashboardSummary {
  serviceLines: number
  serviceTypes: number
  totalServiceBudget: number
  contractCount: number
  contractStatusCounts: Record<string, number>
  agreementCount: number
  agreementStatusCounts: Record<string, number>
  cellularCount: number
  cellularActiveCount: number
  cellularGlonassCount: number
  cellularNonBlockedPercent: number
  cellularAccountCount: number
  satelliteCount: number
  satelliteActiveCount: number
  satelliteDepartmentCount: number
  satelliteDirectionCount: number
  topServices: Array<{ name: string; budget: number }>
  purchaseRows: number
  purchaseQuantity: number
  purchaseOnmQuantity: number
  purchasePenQuantity: number
  purchaseInProgressQuantity: number
  purchaseDeliveredQuantity: number
  purchaseInProgressOnmQuantity: number
  purchaseInProgressPenQuantity: number
  purchaseDeliveredOnmQuantity: number
  purchaseDeliveredPenQuantity: number
  importRows: number
  importQuantity: number
  importRegistryQuantity: number
  importWithdrawnQuantity: number
  importRegistryPercent: number
  topEquipmentTypes: Array<{ type: string; quantity: number }>
}

interface ObjectUsageSummaryRow {
  department: string
  objectName: string
  communicationServices: Array<{ serviceItem: string; contractorsContracts: string[] }>
  communicationServiceCostTotal: number
  equipmentTypes: Array<{ type: string; quantity: number }>
  equipmentCostTotal: number
}

type ObjectUsageSortKey = 'department' | 'objectName' | 'communicationServices' | 'communicationServiceCostTotal' | 'equipmentTypes' | 'equipmentCostTotal'

function DashboardTrafficLight({ status, label }: { status: DashboardTileStatus; label: string }): React.ReactElement {
  const colors: Record<DashboardTileStatus, string> = {
    red: '#ff1f1f',
    yellow: '#ffe600',
    green: '#00d84a',
  }
  const statusLabels: Record<DashboardTileStatus, string> = {
    red: 'тестовый режим',
    yellow: 'частично обновлено',
    green: 'данные актуальны',
  }
  const order: DashboardTileStatus[] = ['red', 'yellow', 'green']

  return (
    <svg
      className="dashboard-traffic-light"
      viewBox="0 0 48 20"
      role="img"
      aria-label={`${label}: ${statusLabels[status]}`}
      title={`${label}: ${statusLabels[status]}`}
    >
      <rect x="1" y="2" width="46" height="16" rx="7" fill="#b8c0c5" stroke="#78858c" strokeWidth="1" />
      {order.map((light, index) => (
        <circle
          key={light}
          cx={9 + index * 15}
          cy="10"
          r="4"
          fill={light === status ? colors[light] : '#718087'}
          stroke={light === status ? '#fff' : '#59666d'}
          strokeWidth="1"
        />
      ))}
    </svg>
  )
}

function StartDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [tileStatuses, setTileStatuses] = useState<DashboardTileStatuses>(DEFAULT_DASHBOARD_TILE_STATUSES)
  const [tileStatusesError, setTileStatusesError] = useState<string | null>(null)
  const [dashboardBdrField, setDashboardBdrField] = useState(DEFAULT_DASHBOARD_BDR_FIELD)
  const [objectUsageSummary, setObjectUsageSummary] = useState<ObjectUsageSummaryRow[]>([])
  const [objectSummaryFilters, setObjectSummaryFilters] = useState<Record<ObjectUsageSortKey, string>>({
    department: '',
    objectName: '',
    communicationServices: '',
    communicationServiceCostTotal: '',
    equipmentTypes: '',
    equipmentCostTotal: '',
  })
  const [objectSummarySort, setObjectSummarySort] = useState<{ key: ObjectUsageSortKey; direction: 'asc' | 'desc' }>({
    key: 'department',
    direction: 'asc',
  })
  const [objectSummaryColumnWidths, setObjectSummaryColumnWidths] = useState<Record<ObjectUsageSortKey, number>>({
    department: 120,
    objectName: 130,
    communicationServices: 250,
    communicationServiceCostTotal: 130,
    equipmentTypes: 230,
    equipmentCostTotal: 190,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function loadTileStatuses(): Promise<void> {
      try {
        const response = await fetch('/api/dashboard/tile-statuses')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const savedStatuses = await response.json() as Partial<Record<DashboardTileKey, unknown>>
        const validStatuses: DashboardTileStatuses = { ...DEFAULT_DASHBOARD_TILE_STATUSES }
        for (const key of Object.keys(DEFAULT_DASHBOARD_TILE_STATUSES) as DashboardTileKey[]) {
          const value = savedStatuses[key]
          if (isDashboardTileStatus(value)) validStatuses[key] = value
        }
        if (active) setTileStatuses(validStatuses)
      } catch (requestError) {
        if (active) setTileStatusesError(requestError instanceof Error
          ? requestError.message
          : 'Не удалось загрузить статусы актуальности плиток')
      }
    }

    void loadTileStatuses()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadSummary(): Promise<void> {
      try {
        const [bdrResponse, contractsResponse, agreementsResponse, cellularResponse, satellitesResponse, importSubstitutionResponse, bdrFieldResponse] = await Promise.all([
          fetch('/api/gn/bdr'),
          fetch('/api/gn/contracts'),
          fetch('/api/gn/contract-additional-agreements'),
          fetch('/api/gn/cellular'),
          fetch('/api/satellites/summary'),
          fetch('/api/import-substitution', { cache: 'no-store' }),
          fetch('/api/dashboard/bdr-field'),
        ])

        if (!bdrResponse.ok) throw new Error(`BDR HTTP ${bdrResponse.status}`)
        if (!contractsResponse.ok) throw new Error(`Contracts HTTP ${contractsResponse.status}`)
        if (!agreementsResponse.ok) throw new Error(`Agreements HTTP ${agreementsResponse.status}`)
        if (!cellularResponse.ok) throw new Error(`Cellular HTTP ${cellularResponse.status}`)
        if (!satellitesResponse.ok) throw new Error(`Satellites HTTP ${satellitesResponse.status}`)
        if (!importSubstitutionResponse.ok) throw new Error(`Import substitution HTTP ${importSubstitutionResponse.status}`)
        if (!bdrFieldResponse.ok) throw new Error(`Dashboard BDR field HTTP ${bdrFieldResponse.status}`)

        const bdrRows = (await bdrResponse.json()) as Array<Record<string, unknown>>
        const contractRows = (await contractsResponse.json()) as Array<Record<string, unknown>>
        const agreementRows = (await agreementsResponse.json()) as Array<Record<string, unknown>>
        const cellularRows = (await cellularResponse.json()) as Array<Record<string, unknown>>
        const importSubstitutionRows = (await importSubstitutionResponse.json()) as Array<Record<string, unknown>>
        const bdrFieldPayload = await bdrFieldResponse.json() as { field?: unknown }
        if (!isDashboardBdrField(bdrFieldPayload.field)) {
          throw new Error('Сервер вернул неизвестный вариант БДР для сводки')
        }
        const selectedBdrField = bdrFieldPayload.field
        setDashboardBdrField(selectedBdrField)
        const satellitesSummary = (await satellitesResponse.json()) as {
          satelliteCount: number
          activeSatelliteCount: number
          departmentCount: number
          directionCount: number
        }

        const parseNumber = (value: unknown): number => {
          const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.')
          const parsed = Number(normalized)
          return Number.isFinite(parsed) ? parsed : 0
        }

        const serviceBudgetByType = new Map<string, number>()
        bdrRows.forEach((row) => {
          const serviceName = String(row['Статья бюджета'] ?? 'Не указана').trim()
          const amount = parseNumber(row[selectedBdrField])
          serviceBudgetByType.set(serviceName, (serviceBudgetByType.get(serviceName) ?? 0) + amount)
        })

        const countBy = (rows: Array<Record<string, unknown>>, key: string): Record<string, number> => {
          return rows.reduce<Record<string, number>>((acc, row) => {
            const value = String(row[key] ?? 'не указано').trim() || 'не указано'
            acc[value] = (acc[value] ?? 0) + 1
            return acc
          }, {})
        }

        const normalizeStatus = (value: unknown): string => String(value ?? 'не указано').trim() || 'не указано'
        const purchaseRows = importSubstitutionRows.filter((row) => Number(row['Год']) === 2026)
        const purchaseQuantity = purchaseRows.reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchaseOnmQuantity = purchaseRows
          .filter((row) => String(row['Статья затрат ТКО'] ?? '').trim() === 'ОНМ')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchasePenQuantity = purchaseRows
          .filter((row) => String(row['Статья затрат ТКО'] ?? '').trim() === 'ПЭН')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchaseInProgressQuantity = purchaseRows
          .filter((row) => ['в закупе', 'в закупке'].includes(String(row['Статус закупки'] ?? '').trim().toLowerCase()))
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchaseDeliveredQuantity = purchaseRows
          .filter((row) => String(row['Статус закупки'] ?? '').trim().toLowerCase() === 'поставленно')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const isPurchaseInProgress = (row: Record<string, unknown>): boolean => (
          ['в закупе', 'в закупке'].includes(String(row['Статус закупки'] ?? '').trim().toLowerCase())
        )
        const isPurchaseDelivered = (row: Record<string, unknown>): boolean => (
          String(row['Статус закупки'] ?? '').trim().toLowerCase() === 'поставленно'
        )
        const purchaseInProgressOnmQuantity = purchaseRows
          .filter((row) => isPurchaseInProgress(row) && String(row['Статья затрат ТКО'] ?? '').trim() === 'ОНМ')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchaseInProgressPenQuantity = purchaseRows
          .filter((row) => isPurchaseInProgress(row) && String(row['Статья затрат ТКО'] ?? '').trim() === 'ПЭН')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchaseDeliveredOnmQuantity = purchaseRows
          .filter((row) => isPurchaseDelivered(row) && String(row['Статья затрат ТКО'] ?? '').trim() === 'ОНМ')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const purchaseDeliveredPenQuantity = purchaseRows
          .filter((row) => isPurchaseDelivered(row) && String(row['Статья затрат ТКО'] ?? '').trim() === 'ПЭН')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const importQuantity = importSubstitutionRows.reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const importRegistryQuantity = importSubstitutionRows
          .filter((row) => String(row['Классификация ТКО'] ?? '').trim() === 'РФ в реестре')
          .reduce((sum, row) => sum + parseNumber(row['Количество']), 0)
        const equipmentQuantityByType = new Map<string, number>()
        importSubstitutionRows.forEach((row) => {
          const type = String(row['Тип'] ?? '').trim() || 'Не указан'
          const quantity = parseNumber(row['Количество'])
          equipmentQuantityByType.set(type, (equipmentQuantityByType.get(type) ?? 0) + quantity)
        })
        const topEquipmentTypes = [...equipmentQuantityByType.entries()]
          .map(([type, quantity]) => ({ type, quantity }))
          .sort((left, right) => right.quantity - left.quantity
            || left.type.localeCompare(right.type, 'ru', { sensitivity: 'base' }))
          .slice(0, 5)
        const importWithdrawnQuantity = importSubstitutionRows.reduce(
          (sum, row) => sum + Math.round(parseNumber(row['Выведен из эксплуатации'])),
          0,
        )
        const importAdjustedQuantity = importQuantity - importWithdrawnQuantity
        const contractStatusCounts = contractRows.reduce<Record<string, number>>((acc, row) => {
          const status = normalizeStatus(row['GN_contract_approval_status'] ?? row['GN_contract_state'])
          if (status.replace(/^[-–—\s]+/, '').toLocaleLowerCase('ru') === 'снят с контроля') return acc
          acc[status] = (acc[status] ?? 0) + 1
          return acc
        }, {})

        const agreementStatusCounts = agreementRows.reduce<Record<string, number>>((acc, row) => {
          const status = normalizeStatus(row['GN_additional_agreement_status'])
          acc[status] = (acc[status] ?? 0) + 1
          return acc
        }, {})

        const objectUsage = new Map<string, {
          department: string
          objectName: string
          communicationServices: Map<string, Set<string>>
          communicationServiceCostTotal: number
          equipmentTypes: Map<string, number>
          equipmentCostTotal: number
        }>()
        const getObjectUsage = (department: string, objectName: string) => {
          const key = `${department}\u0000${objectName}`
          const existing = objectUsage.get(key)
          if (existing) return existing
          const next = {
            department,
            objectName,
            communicationServices: new Map<string, Set<string>>(),
            communicationServiceCostTotal: 0,
            equipmentTypes: new Map<string, number>(),
            equipmentCostTotal: 0,
          }
          objectUsage.set(key, next)
          return next
        }

        bdrRows.forEach((row) => {
          const communicationServiceCost = parseNumber(row[selectedBdrField])
          if (communicationServiceCost === 0) return

          const department = String(row['Подразделение'] ?? '').trim() || 'Не указано'
          const objectName = String(row['Объект'] ?? '').trim() || 'Не указан'
          const serviceItem = String(row['Статья бюджета УС'] ?? '').trim() || 'Статья не указана'
          const contract = String(row['Договор'] ?? '').trim() || 'Договор не указан'
          const contractor = String(row['Контрагент'] ?? '').trim() || 'Контрагент не указан'
          const usage = getObjectUsage(department, objectName)
          const contractorsContracts = usage.communicationServices.get(serviceItem) ?? new Set<string>()
          contractorsContracts.add(`${contractor} — ${contract}`)
          usage.communicationServices.set(serviceItem, contractorsContracts)
          usage.communicationServiceCostTotal += communicationServiceCost
        })

        importSubstitutionRows.forEach((row) => {
          const department = String(row['Подразделение'] ?? '').trim() || 'Не указано'
          const rawObjects = Array.isArray(row['ОБЪЕКТ']) ? row['ОБЪЕКТ'] : [row['ОБЪЕКТ']]
          const objectNames = rawObjects.map((value) => String(value ?? '').trim()).filter(Boolean)
          const equipmentType = String(row['Тип'] ?? '').trim()
          const quantity = parseNumber(row['Количество'])
          objectNames.forEach((objectName) => {
            const usage = getObjectUsage(department, objectName)
            if (equipmentType) usage.equipmentTypes.set(equipmentType, (usage.equipmentTypes.get(equipmentType) ?? 0) + quantity)
            usage.equipmentCostTotal += parseNumber(row['Платеж ТР без НДС'])
          })
        })

        if (!isMounted) return

        setObjectUsageSummary([...objectUsage.values()]
          .map((row) => ({
            ...row,
            communicationServices: [...row.communicationServices.entries()]
              .map(([serviceItem, contractorsContracts]) => ({
                serviceItem,
                contractorsContracts: [...contractorsContracts].sort((left, right) => left.localeCompare(right, 'ru')),
              }))
              .sort((left, right) => left.serviceItem.localeCompare(right.serviceItem, 'ru')),
            equipmentTypes: [...row.equipmentTypes.entries()]
              .map(([type, quantity]) => ({ type, quantity }))
              .sort((left, right) => left.type.localeCompare(right.type, 'ru')),
          }))
          .filter((row) => row.communicationServices.length > 0)
          .sort((left, right) => left.department.localeCompare(right.department, 'ru')
            || left.objectName.localeCompare(right.objectName, 'ru')))

        setSummary({
          serviceLines: bdrRows.length,
          serviceTypes: serviceBudgetByType.size,
          totalServiceBudget: Array.from(serviceBudgetByType.values()).reduce((sum, value) => sum + value, 0),
          contractCount: contractRows.length,
          contractStatusCounts,
          agreementCount: agreementRows.length,
          agreementStatusCounts,
          cellularCount: cellularRows.length,
          cellularActiveCount: cellularRows.filter((row) => String(row['GN_cellular_status'] ?? '').trim().toLowerCase() === 'действующий').length,
          cellularGlonassCount: cellularRows.filter((row) => {
            const tariffText = `${String(row['GN_cellular_tariff_plan'] ?? '')} ${String(row['GN_cellular_tariff_plan_details'] ?? '')}`.toLowerCase()
            return tariffText.includes('глонасс')
          }).length,
          cellularNonBlockedPercent: cellularRows.length === 0
            ? 0
            : (cellularRows.filter((row) => String(row['GN_cellular_status'] ?? '').trim().toLowerCase() !== 'заблокирован').length / cellularRows.length) * 100,
          cellularAccountCount: new Set(cellularRows
            .map((row) => String(row['GN_cellular_account'] ?? '').trim())
            .filter(Boolean)).size,
          satelliteCount: satellitesSummary.satelliteCount,
          satelliteActiveCount: satellitesSummary.activeSatelliteCount,
          satelliteDepartmentCount: satellitesSummary.departmentCount,
          satelliteDirectionCount: satellitesSummary.directionCount,
          topServices: Array.from(serviceBudgetByType.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'ru', { numeric: true, sensitivity: 'base' }))
            .slice(0, 5)
            .map(([name, budget]) => ({ name, budget })),
          purchaseRows: purchaseRows.length,
          purchaseQuantity,
          purchaseOnmQuantity,
          purchasePenQuantity,
          purchaseInProgressQuantity,
          purchaseDeliveredQuantity,
          purchaseInProgressOnmQuantity,
          purchaseInProgressPenQuantity,
          purchaseDeliveredOnmQuantity,
          purchaseDeliveredPenQuantity,
          importRows: importSubstitutionRows.length,
          importQuantity,
          importRegistryQuantity,
          importWithdrawnQuantity,
          importRegistryPercent: importAdjustedQuantity > 0 ? (importRegistryQuantity / importAdjustedQuantity) * 100 : 0,
          topEquipmentTypes,
        })
      } catch (err) {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
      } finally {
        if (!isMounted) return
        setLoading(false)
      }
    }

    void loadSummary()
    return () => {
      isMounted = false
    }
  }, [])

  const formatCount = (value: number): string => new Intl.NumberFormat('ru-RU').format(value)
  const formatMoney = (value: number): string => new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
  const formatPercent = (value: number): string => new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 1,
  }).format(value) + '%'
  const formatQuantity = (value: number): string => new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(value)

  function openDashboardPopup(hash: string, name: string, features: string): void {
    const popup = window.open(`${window.location.pathname}${hash}`, name, features)
    if (popup) popup.focus()
  }

  function openBudgetMainWindow(): void {
    openDashboardPopup(
      '#budget-main-window',
      'budget-main-window',
      'popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes',
    )
  }

  function openImportSubstitutionTableWindow(): void {
    openDashboardPopup(
      '#import-substitution-table-window',
      'import-substitution-table-window',
      'popup=yes,width=1500,height=900,resizable=yes,scrollbars=yes',
    )
  }

  function openEquipmentAccountingWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#equipment-accounting-window`,
      'equipment-accounting-window',
      'popup=yes,width=1500,height=900,resizable=yes,scrollbars=yes',
    )
    if (popup) popup.focus()
  }

  const objectSummaryColumns: Array<{ key: ObjectUsageSortKey; label: string }> = [
    { key: 'department', label: 'Подразделение' },
    { key: 'objectName', label: 'Объект' },
    { key: 'communicationServices', label: 'Услуги связи' },
    { key: 'communicationServiceCostTotal', label: 'ЗАТРАТЫ В ГОД' },
    { key: 'equipmentTypes', label: 'ОБОРУДОВАНИЕ' },
    { key: 'equipmentCostTotal', label: 'СТОИМОСТЬ ВСЕГО ОБОРУДОВАНИЯ' },
  ]
  const objectSummaryTableWidth = Object.values(objectSummaryColumnWidths).reduce((total, width) => total + width, 0)

  const getObjectSummarySortValue = (row: ObjectUsageSummaryRow, key: ObjectUsageSortKey): string | number => {
    if (key === 'department') return row.department
    if (key === 'objectName') return row.objectName
    if (key === 'communicationServices') {
      return row.communicationServices
        .map(({ serviceItem, contractorsContracts }) => `${serviceItem} ${contractorsContracts.join('; ')}`)
        .join(' ')
    }
    if (key === 'communicationServiceCostTotal') return row.communicationServiceCostTotal
    if (key === 'equipmentTypes') return row.equipmentTypes.map(({ type, quantity }) => `${type} ${quantity}`).join(' ')
    return row.equipmentCostTotal
  }

  const filteredAndSortedObjectUsageSummary = objectUsageSummary
    .filter((row) => objectSummaryColumns.every(({ key }) => (
      String(getObjectSummarySortValue(row, key)).toLocaleLowerCase()
        .includes(objectSummaryFilters[key].trim().toLocaleLowerCase())
    )))
    .sort((left, right) => {
      const leftValue = getObjectSummarySortValue(left, objectSummarySort.key)
      const rightValue = getObjectSummarySortValue(right, objectSummarySort.key)
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ru', { numeric: true, sensitivity: 'base' })
      return objectSummarySort.direction === 'asc' ? comparison : -comparison
    })

  const objectSummaryCostTotals = filteredAndSortedObjectUsageSummary.reduce(
    (totals, row) => ({
      communicationServiceCostTotal: totals.communicationServiceCostTotal + row.communicationServiceCostTotal,
      equipmentCostTotal: totals.equipmentCostTotal + row.equipmentCostTotal,
    }),
    { communicationServiceCostTotal: 0, equipmentCostTotal: 0 },
  )

  function toggleObjectSummarySort(key: ObjectUsageSortKey): void {
    setObjectSummarySort((previous) => previous.key === key
      ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' })
  }

  function startObjectSummaryColumnResize(event: ReactPointerEvent<HTMLSpanElement>, key: ObjectUsageSortKey): void {
    event.preventDefault()
    event.stopPropagation()
    const header = event.currentTarget.closest('th')
    if (!header) return

    const startX = event.clientX
    const startWidth = header.getBoundingClientRect().width
    const resizeColumn = (moveEvent: PointerEvent): void => {
      setObjectSummaryColumnWidths((previous) => ({
        ...previous,
        [key]: Math.max(64, startWidth + moveEvent.clientX - startX),
      }))
    }
    const stopResizing = (): void => {
      window.removeEventListener('pointermove', resizeColumn)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }

    window.addEventListener('pointermove', resizeColumn)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)
  }

  if (loading) {
    return <p className="hint">Загрузка сводной информации...</p>
  }

  if (error || !summary) {
    return <p className="hint hint--error">Ошибка загрузки: {error ?? 'данные недоступны'}</p>
  }

  const usefulLinks = [
    { label: 'Диск на портале', href: 'http://portal.corp.nedra.gazprom.ru/company/personal/user/10705/disk/path/Отдел%20телекоммуникаций%20СИУСиС/' },
    { label: 'Файл Услуги связи', href: 'http://portal.corp.nedra.gazprom.ru/~XHH57' },
    { label: 'Redmine Отдел телекоммуникаций', href: 'https://appredmine.adm.ggr.gazprom.ru/projects/telecom/issues?per_page=50&query_id=30' },
    { label: 'Управление связи', href: 'https://ucn.adm.gazprom.ru/ucn/' },
    { label: 'Zabbix', href: 'https://monitoring.adm.ggr.gazprom.ru/zabbix/index.php' },
    { label: 'NetBox', href: 'https://netbox.esk.nedra.gazprom.ru/' },
  ]

  const renderStatusItems = (statusCounts: Record<string, number>) => (
    <ul className="dashboard-stat-list">
      {Object.entries(statusCounts).map(([status, count]) => (
        <li className="dashboard-stat-item" key={status}>
          <span>{status}</span>
          <strong>{formatCount(count)}</strong>
        </li>
      ))}
    </ul>
  )

  return (
    <section className="dashboard-section">
      <div className="dashboard-header">             
          <h2>Обзор ключевых метрик</h2>        
      </div>
      {tileStatusesError && (
        <p className="hint hint--error" role="alert">
          Не удалось загрузить статусы актуальности: {tileStatusesError}
        </p>
      )}

      <div className="dashboard-grid">
        <a
          className="dashboard-card dashboard-card--link dashboard-card--budget-summary"
          href="#budget-main-window"
          onClick={(event) => {
            event.preventDefault()
            openBudgetMainWindow()
          }}
        >
          <DashboardTrafficLight status={tileStatuses.services} label="Услуги связи" />
          <h3>
            Услуги связи ({DASHBOARD_BDR_FIELDS.find((field) => field.value === dashboardBdrField)?.label ?? dashboardBdrField})
          </h3>
          <ul className="dashboard-compact-list">
            {summary.topServices.map((item) => (
              <li key={item.name}>
                {item.name} — {formatMoney(item.budget)}
              </li>
            ))}
            <li className="dashboard-compact-list__total">
              Итого — {formatMoney(summary.totalServiceBudget)}
            </li>
          </ul>
        </a>

        <a className="dashboard-card dashboard-card--link" href="#contracts">
          <DashboardTrafficLight status={tileStatuses.contracts} label="Договоры" />
          <h3>Договоры</h3>
          <p className="dashboard-card-value">Всего договоров: <strong>{formatCount(summary.contractCount)}</strong></p>
          {renderStatusItems(summary.contractStatusCounts)}
          <p className="dashboard-card-value dashboard-card-value--spaced">Всего доп. соглашений: <strong>{formatCount(summary.agreementCount)}</strong></p>
          {renderStatusItems(summary.agreementStatusCounts)}
        </a>
        <a className="dashboard-card dashboard-card--link" href="#cellular">
          <DashboardTrafficLight status={tileStatuses.cellular} label="Сотовая связь" />
          <h3>Сотовая связь</h3>
          <ul className="dashboard-stat-list">
            <li className="dashboard-stat-item">
              <span>Номера</span>
              <strong>{formatCount(summary.cellularCount)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Действующие (с ГЛОНАСС)</span>
              <strong>
                {formatCount(summary.cellularActiveCount)} ({formatPercent(summary.cellularCount > 0
                  ? (summary.cellularActiveCount / summary.cellularCount) * 100
                  : 0)})
              </strong>
            </li>
            <li className="dashboard-stat-item">
              <span>С тарифом Глонасс</span>
              <strong>{formatCount(summary.cellularGlonassCount)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Лицевые счета</span>
              <strong>{formatCount(summary.cellularAccountCount)}</strong>
            </li>
          </ul>
        </a>

        <a className="dashboard-card dashboard-card--link" href="#satellites">
          <DashboardTrafficLight status={tileStatuses.satellites} label="Спутники" />
          <h3>Спутники (ГКС)</h3>
          <ul className="dashboard-stat-list">
            <li className="dashboard-stat-item">
              <span>Спутниковые станции</span>
              <strong>{formatCount(summary.satelliteCount)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Активные станции</span>
              <strong>
                {formatCount(summary.satelliteActiveCount)} ({formatPercent(summary.satelliteCount > 0
                  ? (summary.satelliteActiveCount / summary.satelliteCount) * 100
                  : 0)})
              </strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Филиалы</span>
              <strong>{formatCount(summary.satelliteDepartmentCount)}</strong>
            </li>
          </ul>
        </a>

        <a className="dashboard-card dashboard-card--link" href="#equipment-purchases">
          <DashboardTrafficLight status={tileStatuses.purchases} label="Закупки" />
          <h3>Закупки</h3>
          <ul className="dashboard-stat-list">
            <li className="dashboard-stat-item">
              <span>Строк за 2026 год</span>
              <strong>{formatCount(summary.purchaseRows)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Всего оборудования</span>
              <strong>{formatQuantity(summary.purchaseQuantity)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>ОНМ / ПЭН</span>
              <strong>{formatQuantity(summary.purchaseOnmQuantity)} / {formatQuantity(summary.purchasePenQuantity)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>В закупке / поставленно</span>
              <strong>{formatQuantity(summary.purchaseInProgressQuantity)} / {formatQuantity(summary.purchaseDeliveredQuantity)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>В закупке: ОНМ / ПЭН</span>
              <strong>{formatQuantity(summary.purchaseInProgressOnmQuantity)} / {formatQuantity(summary.purchaseInProgressPenQuantity)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Поставленно: ОНМ / ПЭН</span>
              <strong>{formatQuantity(summary.purchaseDeliveredOnmQuantity)} / {formatQuantity(summary.purchaseDeliveredPenQuantity)}</strong>
            </li>
          </ul>          
        </a>

        <a
          className="dashboard-card dashboard-card--link"
          href="#import-substitution-table-window"
          onClick={(event) => {
            event.preventDefault()
            openImportSubstitutionTableWindow()
          }}
        >
          <DashboardTrafficLight status={tileStatuses['import-substitution']} label="Импортозамещение" />
          <h3>Импортозамещение</h3>
          <ul className="dashboard-stat-list">
            <li className="dashboard-stat-item">
              <span>Позиций</span>
              <strong>{formatCount(summary.importRows)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>Общий объем</span>
              <strong>{formatQuantity(summary.importQuantity)}</strong>
            </li>
            <li className="dashboard-stat-item">
              <span>РФ в реестре</span>
              <strong>{formatQuantity(summary.importRegistryQuantity)} ({formatPercent(summary.importRegistryPercent)})</strong>
            </li>
          </ul>
                  </a>

        <button
          type="button"
          className="dashboard-card dashboard-card--link dashboard-card--equipment-dashboard"
          onClick={openEquipmentAccountingWindow}
          aria-label="Открыть учет оборудования в новом окне"
        >
          <DashboardTrafficLight status={tileStatuses['equipment-accounting']} label="Учет оборудования" />
          <h3>Учет оборудования</h3>
          <ul className="dashboard-stat-list dashboard-equipment-import-list">
            {summary.topEquipmentTypes.map((item) => (
              <li className="dashboard-stat-item" key={item.type}>
                <span>{item.type}</span>
                <strong>{formatQuantity(item.quantity)}</strong>
              </li>
            ))}
            {summary.topEquipmentTypes.length === 0 && (
              <li className="dashboard-stat-item"><span>Нет данных</span></li>
            )}
          </ul>
        </button>

        <div className="dashboard-card dashboard-card--links">
          <h3>ссылки</h3>
          <ul className="dashboard-links-list">
            {usefulLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <section className="dashboard-object-summary">
        <h2>Сводка по подразделениям и объектам</h2>
        <div className="guide-table-wrap dashboard-object-summary__table-wrap">
          <table
            className="guide-table table-compact dashboard-object-summary__table"
            style={{ width: '100%', minWidth: objectSummaryTableWidth, tableLayout: 'fixed' }}
          >
            <colgroup>
              {objectSummaryColumns.map(({ key }) => (
                <col key={key} style={{ width: `${objectSummaryColumnWidths[key]}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {objectSummaryColumns.map(({ key, label }) => (
                  <th
                    key={key}
                    className="dashboard-object-summary__resizable-header"
                    style={{ width: objectSummaryColumnWidths[key] }}
                  >
                    <button
                      type="button"
                      className="dashboard-object-summary__sort-button"
                      onClick={() => toggleObjectSummarySort(key)}
                    >
                      {key === 'communicationServiceCostTotal'
                        ? `ЗАТРАТЫ В ГОД (${DASHBOARD_BDR_FIELDS.find((field) => field.value === dashboardBdrField)?.label ?? dashboardBdrField})`
                        : label}
                      {objectSummarySort.key === key ? (objectSummarySort.direction === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                    <input
                      className="dashboard-object-summary__filter"
                      type="search"
                      aria-label={`Фильтр: ${label}`}
                      value={objectSummaryFilters[key]}
                      onChange={(event) => setObjectSummaryFilters((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))}
                    />
                    {key === 'communicationServiceCostTotal' && (
                      <span className="dashboard-object-summary__header-total">
                        {formatMoney(objectSummaryCostTotals.communicationServiceCostTotal)}
                      </span>
                    )}
                    {key === 'equipmentCostTotal' && (
                      <span className="dashboard-object-summary__header-total">
                        {formatMoney(objectSummaryCostTotals.equipmentCostTotal)}
                      </span>
                    )}
                    <span
                      className="dashboard-object-summary__resizer"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Изменить ширину столбца ${label}`}
                      onPointerDown={(event) => startObjectSummaryColumnResize(event, key)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedObjectUsageSummary.map((row) => (
                <tr key={`${row.department}\u0000${row.objectName}`}>
                  <td>{row.department}</td>
                  <td>{row.objectName}</td>
                  <td>
                    {row.communicationServices.length > 0 ? (
                      <ul className="dashboard-object-summary__list">
                        {row.communicationServices.map(({ serviceItem, contractorsContracts }) => (
                          <li key={serviceItem}>
                            <strong>{serviceItem}</strong> ({contractorsContracts.join('; ')})
                          </li>
                        ))}
                      </ul>
                    ) : '—'}
                  </td>
                  <td>{formatMoney(row.communicationServiceCostTotal)}</td>
                  <td>
                    {row.equipmentTypes.length > 0 ? (
                      <ul className="dashboard-object-summary__list">
                        {row.equipmentTypes.map(({ type, quantity }) => (
                          <li key={type}>{type} — {formatQuantity(quantity)} шт.</li>
                        ))}
                      </ul>
                    ) : '—'}
                  </td>
                  <td>{formatMoney(row.equipmentCostTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedObjectUsageSummary.length === 0 && (
            <p className="hint">
              {objectUsageSummary.length === 0 ? 'Нет данных по объектам.' : 'По заданным фильтрам данные не найдены.'}
            </p>
          )}
        </div>
      </section>
    </section>
  )
}

// Компонент подраздела страницы «Услуги_связи».
// Содержит вкладки бюджета, детализаций и Газпром телеком.
function BudgetSectionPage({
  onOpenBudgetDept,
  onOpenBudgetMain,
  onOpenSatellitesDetails,
}: {
  onOpenBudgetDept: () => void
  onOpenBudgetMain: () => void
  onOpenSatellitesDetails: () => void
}) {
  const [activeTab, setActiveTab] = useState<'budget' | 'details' | 'gazprom-telecom'>('budget')

  return (
    <div>
      <div className="budget-subnav">
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'budget' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('budget')}
        >
          Бюджет
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'details' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Детализации
        </button>
        <button
          type="button"
          className={`budget-subnav-tab${activeTab === 'gazprom-telecom' ? ' budget-subnav-tab--active' : ''}`}
          onClick={() => setActiveTab('gazprom-telecom')}
        >
          Газпром телеком
        </button>
      </div>

      {activeTab === 'gazprom-telecom' && <GazpromTelecomTable />}

      {activeTab === 'budget' && (
        <div className="budget-popup-links">
          <button type="button" className="budget-popup-link-btn" onClick={onOpenBudgetDept}>
            Своды по лимитам
          </button>
          <button type="button" className="budget-popup-link-btn" onClick={onOpenBudgetMain}>
            БДР Услуги связи
          </button>
        </div>
      )}

      {activeTab === 'details' && (
        <div className="budget-popup-links">
          <button type="button" className="budget-popup-link-btn" onClick={onOpenSatellitesDetails}>
            Спутники: Сделать детализацию из XML первички
          </button>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const isAddRowPopup = window.location.hash === '#add-row-window'
  const isSatellitesDetailsPopup = window.location.hash === '#satellites-window'
  const isBudgetDeptPopup = window.location.hash === '#budget-dept-window'
  const isBudgetMainPopup = window.location.hash === '#budget-main-window'
  const isCellularTariffGuidePopup = window.location.hash === '#cellular-tariff-guide-window'
  const isCellularIdentifierGuidePopup = window.location.hash === '#cellular-identifier-guide-window'
  const isCellularAccountGuidePopup = window.location.hash === '#cellular-account-guide-window'
  const isImportSubstitutionTablePopup = window.location.hash === '#import-substitution-table-window'
  const isEquipmentAccountingPopup = window.location.hash === '#equipment-accounting-window'
  const isMseAccountingPopup = window.location.hash === '#mse-accounting-window'
  const isEquipmentOrderPopup = window.location.hash === '#equipment-order-window'
  const guidePopupMatch = window.location.hash.match(/^#guide-window-([a-z-]+)$/)
  const guidePopupEntity = guidePopupMatch ? guidePopupMatch[1] : null
  const isGuidePopup = guidePopupEntity != null
  const limitPopupMatch = window.location.hash.match(/^#limit-window-(\d+)$/)
  const limitPopupRowId = limitPopupMatch ? Number(limitPopupMatch[1]) : null
  const isLimitPopup = limitPopupRowId != null && !Number.isNaN(limitPopupRowId)
  const contractPopupMatch = window.location.hash.match(/^#contract-window-(\d+)$/)
  const contractPopupId = contractPopupMatch ? Number(contractPopupMatch[1]) : null
  const isContractPopup = contractPopupId != null && !Number.isNaN(contractPopupId)
  const objectPopupMatch = window.location.hash.match(/^#object-window-(\d+)$/)
  const objectPopupRowId = objectPopupMatch ? Number(objectPopupMatch[1]) : null
  const isObjectPopup = objectPopupRowId != null && !Number.isNaN(objectPopupRowId)
  const departmentPopupMatch = window.location.hash.match(/^#department-window-(\d+)$/)
  const departmentPopupRowId = departmentPopupMatch ? Number(departmentPopupMatch[1]) : null
  const isDepartmentPopup = departmentPopupRowId != null && !Number.isNaN(departmentPopupRowId)
  const contractorPopupMatch = window.location.hash.match(/^#contractor-window-(\d+)$/)
  const contractorPopupRowId = contractorPopupMatch ? Number(contractorPopupMatch[1]) : null
  const isContractorPopup = contractorPopupRowId != null && !Number.isNaN(contractorPopupRowId)
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash === '#add-row-window') return
      if (window.location.hash === '#satellites-window') return
      if (window.location.hash === '#budget-dept-window') return
      if (window.location.hash === '#budget-main-window') return
      if (window.location.hash === '#cellular-tariff-guide-window') return
      if (window.location.hash === '#cellular-identifier-guide-window') return
      if (window.location.hash === '#cellular-account-guide-window') return
      if (window.location.hash === '#import-substitution-table-window') return
      if (window.location.hash === '#equipment-accounting-window') return
      if (window.location.hash === '#mse-accounting-window') return
      if (window.location.hash === '#equipment-order-window') return
      if (/^#guide-window-[a-z-]+$/.test(window.location.hash)) return
      if (/^#limit-window-\d+$/.test(window.location.hash)) return
      if (/^#contract-window-.+$/.test(window.location.hash)) return
      if (/^#object-window-\d+$/.test(window.location.hash)) return
      if (/^#department-window-\d+$/.test(window.location.hash)) return
      if (/^#contractor-window-\d+$/.test(window.location.hash)) return
      setPage(pageFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', onHashChange)

    if (!window.location.hash && !isAddRowPopup && !isLimitPopup && !isContractPopup) {
      window.location.hash = '#start'
    }

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [isAddRowPopup, isLimitPopup, isContractPopup])

  // Переключает активную страницу приложения, обновляя хэш URL.
  function goTo(nextPage: Page): void {
    if (nextPage === 'start') {
      window.location.hash = '#start'
      return
    }
    if (nextPage === 'contracts') {
      window.location.hash = '#contracts'
      return
    }
    if (nextPage === 'notes') {
      window.location.hash = '#notes'
      return
    }
    if (nextPage === 'primary') {
      window.location.hash = '#primary'
      return
    }
    if (nextPage === 'personal-account') {
      window.location.hash = '#personal-account'
      return
    }
    if (nextPage === 'satellites') {
      window.location.hash = '#satellites'
      return
    }
    if (nextPage === 'satellites-control') {
      window.location.hash = '#satellites-control'
      return
    }
    if (nextPage === 'cellular') {
      window.location.hash = '#cellular'
      return
    }
    if (nextPage === 'import-substitution') {
      window.location.hash = '#import-substitution'
      return
    }
    if (nextPage === 'guide') {
      window.location.hash = '#guide'
      return
    }
    window.location.hash = '#budget'
  }

  // Открывает отдельное окно для создания новой строки бюджета.
  function openAddRowWindow(): void {
    const popupUrl = `${window.location.pathname}#add-row-window`
    const popup = window.open(
      popupUrl,
      'add-row-window',
      'popup=yes,width=980,height=900,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает подраздел "Детализация" (спутники) в отдельном окне.
  function openSatellitesDetailsWindow(): void {
    const popupUrl = `${window.location.pathname}#satellites-window`
    const popup = window.open(
      popupUrl,
      'satellites-details-window',
      'popup=yes,width=1300,height=850,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра деталей по договору, передавая его ID через хэш.
  function openContractWindow(contractId: number): void {
    const popupUrl = `${window.location.pathname}#contract-window-${contractId}`
    const popup = window.open(
      popupUrl,
      `contract-window-${contractId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра информации по объекту, передавая идентификатор строки.
  function openObjectWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#object-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `object-window-${rowId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра информации по подразделению, передавая идентификатор строки.
  function openDepartmentWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#department-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `department-window-${rowId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает окно просмотра информации по контрагенту, передавая идентификатор строки.
  function openContractorWindow(rowId: number): void {
    const popupUrl = `${window.location.pathname}#contractor-window-${rowId}`
    const popup = window.open(
      popupUrl,
      `contractor-window-${rowId}`,
      'popup=yes,width=900,height=700,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }

  // Открывает попап-окно сводной таблицы по подразделениям.
  function openBudgetDeptWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#budget-dept-window`,
      'budget-dept-window',
      'popup=yes,width=900,height=800,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  // Открывает попап-окно основной таблицы лимитов.
  function openBudgetMainWindow(): void {
    const popup = window.open(
      `${window.location.pathname}#budget-main-window`,
      'budget-main-window',
      'popup=yes,width=1400,height=900,resizable=yes,scrollbars=yes'
    )
    if (popup) popup.focus()
  }

  if (isBudgetDeptPopup) {
    return (
      <main>
        <BudgetSummaryPopup />
      </main>
    )
  }

  if (isBudgetMainPopup) {
    return (
      <main>
        <h2 className="budget-popup-title">БДР Услуги связи</h2>
        <BudgetTable
          onAddRow={openAddRowWindow}
          onOpenContract={openContractWindow}
          onOpenObject={openObjectWindow}
          onOpenDepartment={openDepartmentWindow}
          onOpenContractor={openContractorWindow}
          showMainTable
        />
      </main>
    )
  }

  if (isAddRowPopup) {
    return (
      <main>
        <AddBudgetRowPage onBack={() => window.close()} showFormOnLoad={true} />
      </main>
    )
  }

  if (isSatellitesDetailsPopup) {
    return (
      <main>
        <SatellitesDetailsPage />
      </main>
    )
  }

  if (isCellularTariffGuidePopup) {
    return (
      <main>
        <CellularTariffGuidePopup />
      </main>
    )
  }

  if (isCellularIdentifierGuidePopup) {
    return (
      <main>
        <CellularIdentifierGuidePopup />
      </main>
    )
  }

  if (isCellularAccountGuidePopup) {
    return (
      <main>
        <CellularAccountGuidePopup />
      </main>
    )
  }

  if (isImportSubstitutionTablePopup) {
    return (
      <main>
        <div className="page-header">
          <h3>Данные ИС ПРИТ</h3>
        </div>
        <ImportSubstitutionTable />
      </main>
    )
  }

  if (isEquipmentAccountingPopup) {
    return <EquipmentAccountingTable />
  }

  if (isMseAccountingPopup) {
    return <EquipmentAccountingTable requiredType="МСЭ" />
  }

  if (isEquipmentOrderPopup) {
    return (
      <main>
        <EquipmentOrderPopup />
      </main>
    )
  }

  if (isGuidePopup && guidePopupEntity === 'postgres-schema') {
    return <PostgresSchemaPopup />
  }

  if (isGuidePopup && guidePopupEntity) {
    return (
      <main>
        <Guide onlyEntities={[guidePopupEntity]} initialExpandedEntities={[guidePopupEntity]} />
      </main>
    )
  }

  if (isLimitPopup && limitPopupRowId != null) {
    return (
      <main>
        <LimitDetailsPage rowId={limitPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isContractPopup && contractPopupId) {
    return (
      <main>
        <ContractDetailsPage contractId={contractPopupId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isObjectPopup && objectPopupRowId != null) {
    return (
      <main>
        <ObjectDetailsPage rowId={objectPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isDepartmentPopup && departmentPopupRowId != null) {
    return (
      <main>
        <DepartmentDetailsPage rowId={departmentPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  if (isContractorPopup && contractorPopupRowId != null) {
    return (
      <main>
        <ContractorDetailsPage rowId={contractorPopupRowId} onBack={() => window.close()} />
      </main>
    )
  }

  const isStandaloneSatellitesControl = page === 'satellites-control'

  if (isStandaloneSatellitesControl) {
    return (
      <main>
        <SatellitesControlPage />
      </main>
    )
  }

  return (
    <main>
      <nav className="app-nav">
        <div className="app-nav-personal">
          <a href="#personal-account" onClick={(event) => { event.preventDefault(); goTo('personal-account') }}>
            ЛК
          </a>
        </div>
        <div className="app-nav-center">
          <a href="#start" onClick={(event) => { event.preventDefault(); goTo('start') }}>
            Начало
          </a>
          <a href="#budget" onClick={(event) => { event.preventDefault(); goTo('budget') }}>
            Услуги_связи
          </a>
          <a href="#contracts" onClick={(event) => { event.preventDefault(); goTo('contracts') }}>
            Договора
          </a>
          <a href="#primary" onClick={(event) => { event.preventDefault(); goTo('primary') }}>
            Первичные
          </a>
          <a href="#notes" onClick={(event) => { event.preventDefault(); goTo('notes') }}>
            Заметки
          </a>
          <a href="#satellites" onClick={(event) => { event.preventDefault(); goTo('satellites') }}>
            Спутники
          </a>
          <a href="#cellular" onClick={(event) => { event.preventDefault(); goTo('cellular') }}>
            Сотовая
          </a>
          <a href="#import-substitution" onClick={(event) => { event.preventDefault(); goTo('import-substitution') }}>
            Оборудование
          </a>
        </div>        
        <div className="app-nav-guide">
          <a href="#guide" onClick={(event) => { event.preventDefault(); goTo('guide') }}>
            Справочник
          </a>
        </div>
      </nav>

      {page === 'guide' && <Guide directoryView />}
      {page === 'start' && (
        <div className="page-start-wrapper">
     
          <StartDashboard />
         
        </div>
      )}
      {page === 'cellular' && <CellularPage />}
      {page === 'import-substitution' && <ImportSubstitutionPage />}
      {page === 'budget' && (
        <BudgetSectionPage
          onOpenBudgetDept={openBudgetDeptWindow}
          onOpenBudgetMain={openBudgetMainWindow}
          onOpenSatellitesDetails={openSatellitesDetailsWindow}
        />
      )}
      {page === 'satellites' && <SatellitesPage />}
      {page === 'satellites-control' && <SatellitesControlPage onBack={() => goTo('satellites')} />}
      {page === 'contracts' && <ContractsPage onOpenContract={openContractWindow} />}
      {page === 'notes' && <NotesPage />}
      {page === 'personal-account' && <PersonalAccountPage />}
      {page === 'primary' && <PrimaryPage />}
    </main>
  )
}
