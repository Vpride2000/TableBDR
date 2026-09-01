import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { aggregateSatelliteRowsByMac, parseSatelliteRowsFromBuffer, type SatelliteRow } from './satelliteXml'

interface Satellite {
  GN_satellite_id: number
  GN_satellite_mac: string
  GN_satellite_direction_name: string
  GN_satellite_description: string | null
  GN_Dep_id: number | null
  GN_department: string | null
  GN_satellite_gt_numbers_FK: number | null
  GN_satellite_diameter: string | null
  GN_satellite_power: string | null
  GN_satellite_model: string | null
  GN_satellite_modem: string | null
}

interface DepartmentOption {
  GN_Dep_id: number
  GN_department: string
}

interface SatelliteGtNumberOption {
  GN_satellite_gt_numbers_id: number
  GN_satellite_gt_number: string
}

type SatelliteMonthStatus = 'сломан' | 'склад' | 'в работе' | 'отключен' | 'ошибка'
type SortDirection = 'asc' | 'desc'
type SatelliteMonthCell = { branch: string; tariff: string; tariffNote: string; status: SatelliteMonthStatus; amount: number; savedAt: string }

const SATELLITE_MONTH_STATUSES: SatelliteMonthStatus[] = ['сломан', 'склад', 'в работе', 'отключен', 'ошибка']
const SATELLITES_AUTH_USERS = ['ADM', 'ВГГФ', 'СГГФ', 'ТГГФ'] as const
const MONTH_ORDER_TOKENS: Array<{ token: string; order: number }> = [
  { token: 'январ', order: 0 },
  { token: 'феврал', order: 1 },
  { token: 'март', order: 2 },
  { token: 'апрел', order: 3 },
  { token: 'ма', order: 4 },
  { token: 'июн', order: 5 },
  { token: 'июл', order: 6 },
  { token: 'август', order: 7 },
  { token: 'сентябр', order: 8 },
  { token: 'октябр', order: 9 },
  { token: 'ноябр', order: 10 },
  { token: 'декабр', order: 11 },
]

function extractMonthOrder(value: string): number {
  const normalized = String(value ?? '').trim().toLowerCase()
  for (const item of MONTH_ORDER_TOKENS) {
    if (normalized.includes(item.token)) {
      return item.order
    }
  }
  return 99
}

function extractMonthYear(value: string): number {
  const normalized = String(value ?? '').trim()
  const found = normalized.match(/\b(19\d{2}|20\d{2})\b/)
  return found ? Number(found[1]) : 0
}

export default function SatellitesControlPage() {
  const initialAuthUser = sessionStorage.getItem('satellites-control-user')
  const initialAuthToken = sessionStorage.getItem('satellites-control-token')

  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [gtNumbers, setGtNumbers] = useState<SatelliteGtNumberOption[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authUser, setAuthUser] = useState<string | null>(() => (initialAuthUser && initialAuthToken ? initialAuthUser : null))
  const [authToken, setAuthToken] = useState<string | null>(() => (initialAuthUser && initialAuthToken ? initialAuthToken : null))
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [xmlRowsByMacMonth, setXmlRowsByMacMonth] = useState<Record<string, Record<string, SatelliteMonthCell>>>({})
  const [months, setMonths] = useState<string[]>([])
  const [xmlRowsCount, setXmlRowsCount] = useState(0)
  const [xmlMatchedCount, setXmlMatchedCount] = useState(0)
  const [uploadingXml, setUploadingXml] = useState(false)
  const [clearingMonth, setClearingMonth] = useState<string | null>(null)
  const [editingMonthCellKey, setEditingMonthCellKey] = useState<string | null>(null)
  const [draftMonthCell, setDraftMonthCell] = useState<{ tariff: string; tariffNote: string; status: SatelliteMonthStatus } | null>(null)
  const [savingMonthCellKey, setSavingMonthCellKey] = useState<string | null>(null)
  const [editingSatelliteId, setEditingSatelliteId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState<'limited' | 'full' | null>(null)
  const [draftSatellite, setDraftSatellite] = useState<{ mac: string; directionName: string; description: string; departmentId: number | null; gtNumbersFK: number | null; diameter: string; power: string; model: string; modem: string } | null>(null)
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({})
  const [hideUnusedRows, setHideUnusedRows] = useState(false)
  const [hideEquipmentColumns, setHideEquipmentColumns] = useState(true)
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [sortState, setSortState] = useState<{ key: string; direction: SortDirection }>({ key: 'index', direction: 'asc' })
  const [savingRowEdit, setSavingRowEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const moneyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  )

  function normalizeMacKey(value: string): string {
    return (value ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  }

  function parseAmount(value: string | number): number {
    const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.')
    const numeric = Number(normalized)
    return Number.isFinite(numeric) ? numeric : 0
  }

  function normalizeStatus(value: string | null | undefined): SatelliteMonthStatus {
    const normalized = String(value ?? '').trim().toLowerCase() as SatelliteMonthStatus
    return SATELLITE_MONTH_STATUSES.includes(normalized) ? normalized : 'склад'
  }

  function formatSavedAt(value: string | null | undefined): string {
    if (!value) return ''
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toLocaleString('ru-RU')
  }

  function buildXmlMatrix(rows: Array<{ mac_norm: string; month_name: string; branch: string | null; tariff: string | null; tariff_note: string | null; status: string | null; amount_without_vat: string | number; uploaded_at: string | null }>): {
    matrix: Record<string, Record<string, SatelliteMonthCell>>
    monthList: string[]
  } {
    const monthSet = new Set<string>()
    const matrix: Record<string, Record<string, SatelliteMonthCell>> = {}

    rows.forEach((row) => {
      const mac = String(row.mac_norm ?? '').trim()
      const month = String(row.month_name ?? '').trim()
      if (!mac || !month) return
      monthSet.add(month)
      if (!matrix[mac]) matrix[mac] = {}
      matrix[mac][month] = {
        branch: String(row.branch ?? '').trim(),
        tariff: String(row.tariff ?? '').trim(),
        tariffNote: String(row.tariff_note ?? '').trim(),
        status: normalizeStatus(row.status),
        amount: parseAmount(row.amount_without_vat),
        savedAt: formatSavedAt(row.uploaded_at),
      }
    })

    return {
      matrix,
      monthList: [...monthSet],
    }
  }

  async function loadXmlMonthly(): Promise<void> {
    if (!authToken) return

    const response = await fetch('/api/satellites/xml-monthly', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    if (response.status === 401) {
      handleLogout()
      setAuthError('Сессия истекла. Войдите снова.')
      return
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const payload = (await response.json()) as {
      rows: Array<{
        mac_norm: string
        month_name: string
        branch: string | null
        tariff: string | null
        tariff_note: string | null
        status: string | null
        amount_without_vat: string | number
        uploaded_at: string | null
      }>
    }

    const { matrix, monthList } = buildXmlMatrix(payload.rows)
    setXmlRowsByMacMonth(matrix)
    setMonths(monthList)
    setXmlRowsCount(payload.rows.length)
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e): Promise<void> => {
      try {
        const buffer = e.target?.result
        if (!(buffer instanceof ArrayBuffer)) throw new Error('Некорректный формат файла')

        const parsedRows = aggregateSatelliteRowsByMac(parseSatelliteRowsFromBuffer(buffer))
        setUploadingXml(true)

        const saveResponse = await fetch('/api/satellites/xml-monthly', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            rows: parsedRows.map((row) => ({
              macAddress: row.macAddress,
              month: row.month,
              branch: row.branch,
              tariff: row.tariff,
              tariffNote: row.tariffNote,
              status: 'склад',
              amountWithoutVat: row.amountWithoutVat,
            })),
          }),
        })

        if (saveResponse.status === 401) {
          handleLogout()
          setAuthError('Сессия истекла. Войдите снова.')
          return
        }

        if (!saveResponse.ok) {
          const payload = (await saveResponse.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || 'Не удалось сохранить XML в базу')
        }

        await loadXmlMonthly()

        const matched = satellites.reduce((acc, sat) => {
          const satKey = normalizeMacKey(sat.GN_satellite_mac)
          return satKey && parsedRows.some((row) => normalizeMacKey(row.macAddress) === satKey) ? acc + 1 : acc
        }, 0)

        setXmlMatchedCount(matched)
        setError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось загрузить XML'
        setError(message)
      } finally {
        setUploadingXml(false)
      }
    }
    reader.onerror = (): void => {
      setError('Ошибка при чтении файла')
    }
    reader.readAsArrayBuffer(file)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function clearXmlData(): void {
    setXmlRowsByMacMonth({})
    setMonths([])
    setXmlRowsCount(0)
    setXmlMatchedCount(0)
    setError(null)
  }

  function toggleMonthExpanded(month: string): void {
    if (editingMonthCellKey?.endsWith(`-${month}`)) {
      cancelMonthEdit()
    }
    setExpandedMonths((prev) => ({
      ...prev,
      [month]: !prev[month],
    }))
  }

  function toggleSort(columnKey: string): void {
    setSortState((prev) => {
      if (prev.key === columnKey) {
        return {
          key: columnKey,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
      }
      return {
        key: columnKey,
        direction: 'asc',
      }
    })
  }

  function sortMark(columnKey: string): string {
    if (sortState.key !== columnKey) return '↕'
    return sortState.direction === 'asc' ? '↑' : '↓'
  }

  function startEditRow(sat: Satellite, mode: 'limited' | 'full'): void {
    if (!authUser) return
    cancelMonthEdit()
    setEditingSatelliteId(sat.GN_satellite_id)
    setEditMode(mode)
    setDraftSatellite({
      mac: sat.GN_satellite_mac,
      directionName: sat.GN_satellite_direction_name,
      description: sat.GN_satellite_description ?? '',
      departmentId: sat.GN_Dep_id,
      gtNumbersFK: sat.GN_satellite_gt_numbers_FK,
      diameter: sat.GN_satellite_diameter ?? '',
      power: sat.GN_satellite_power ?? '',
      model: sat.GN_satellite_model ?? '',
      modem: sat.GN_satellite_modem ?? '',
    })
  }

  function cancelEditRow(): void {
    setEditingSatelliteId(null)
    setEditMode(null)
    setDraftSatellite(null)
    setSavingRowEdit(false)
  }

  async function saveEditRow(sat: Satellite): Promise<void> {
    if (!authToken || !authUser) return
    if (!draftSatellite) return

    setSavingRowEdit(true)
    try {
      const response = await fetch(`/api/satellites/${sat.GN_satellite_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          mac: editMode === 'full' ? draftSatellite.mac : sat.GN_satellite_mac,
          directionName: editMode === 'full' ? draftSatellite.directionName : sat.GN_satellite_direction_name,
          description: draftSatellite.description,
          departmentId: editMode === 'full' ? draftSatellite.departmentId : sat.GN_Dep_id,
          gtNumbersFK: draftSatellite.gtNumbersFK,
          diameter: draftSatellite.diameter,
          power: draftSatellite.power,
          model: draftSatellite.model,
          modem: draftSatellite.modem,
        }),
      })

      if (response.status === 401) {
        handleLogout()
        setAuthError('Сессия истекла. Войдите снова.')
        return
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Не удалось сохранить изменения спутника')
      }

      const updated = (await response.json()) as Satellite
      setSatellites((prev) => prev.map((item) => (item.GN_satellite_id === updated.GN_satellite_id ? updated : item)))
      cancelEditRow()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения спутника')
    } finally {
      setSavingRowEdit(false)
    }
  }

  async function clearMonth(month: string): Promise<void> {
    if (!authToken || authUser !== 'ADM') return
    setClearingMonth(month)
    try {
      const response = await fetch(`/api/satellites/xml-monthly/${encodeURIComponent(month)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })

      if (response.status === 401) {
        handleLogout()
        setAuthError('Сессия истекла. Войдите снова.')
        return
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Не удалось очистить месяц')
      }

      await loadXmlMonthly()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось очистить месяц')
    } finally {
      setClearingMonth(null)
    }
  }

  function startMonthEdit(sat: Satellite, month: string): void {
    if (!authUser) return
    const macKey = normalizeMacKey(sat.GN_satellite_mac)
    const cell = xmlRowsByMacMonth[macKey]?.[month]
    setEditingMonthCellKey(`${sat.GN_satellite_id}-${month}`)
    setDraftMonthCell({
      tariff: cell?.tariff ?? '',
      tariffNote: cell?.tariffNote ?? '',
      status: cell?.status ?? 'склад',
    })
  }

  function cancelMonthEdit(): void {
    setEditingMonthCellKey(null)
    setDraftMonthCell(null)
    setSavingMonthCellKey(null)
  }

  async function saveMonthCell(sat: Satellite, month: string): Promise<void> {
    if (!authUser || !authToken) return
    if (!draftMonthCell) return

    const macKey = normalizeMacKey(sat.GN_satellite_mac)
    const cell = xmlRowsByMacMonth[macKey]?.[month] ?? {
      branch: '',
      tariff: '',
      tariffNote: '',
      status: 'склад' as SatelliteMonthStatus,
      amount: 0,
      savedAt: '',
    }

    const cellKey = `${sat.GN_satellite_id}-${month}`
    setSavingMonthCellKey(cellKey)

    try {
      const response = await fetch('/api/satellites/xml-monthly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          rows: [{
            macAddress: sat.GN_satellite_mac,
            month,
            branch: cell.branch,
            tariff: draftMonthCell.tariff,
            tariffNote: draftMonthCell.tariffNote,
            status: draftMonthCell.status,
            amountWithoutVat: cell.amount,
          }],
        }),
      })

      if (response.status === 401) {
        handleLogout()
        setAuthError('Сессия истекла. Войдите снова.')
        return
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Не удалось сохранить статус')
      }

      await loadXmlMonthly()
      cancelMonthEdit()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить изменения месяца')
    } finally {
      setSavingMonthCellKey(null)
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAuthLoading(true)
    setAuthError(null)

    try {
      const response = await fetch('/api/satellites/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Ошибка авторизации')
      }

      const payload = (await response.json()) as { user?: string; token?: string }
      const user = String(payload.user ?? username)
      const token = String(payload.token ?? '')
      if (!token) {
        throw new Error('Не получен токен авторизации')
      }

      setAuthUser(user)
      setAuthToken(token)
      sessionStorage.setItem('satellites-control-user', user)
      sessionStorage.setItem('satellites-control-token', token)
      setPassword('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Ошибка авторизации')
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout(): void {
    sessionStorage.removeItem('satellites-control-user')
    sessionStorage.removeItem('satellites-control-token')
    setAuthUser(null)
    setAuthToken(null)
    setSatellites([])
    clearXmlData()
    setError(null)
  }

  useEffect(() => {
    if (!authUser || !authToken) {
      setLoading(false)
      return
    }

    let isActive = true

    async function loadData(): Promise<void> {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/satellites', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })

        if (response.status === 401) {
          handleLogout()
          setAuthError('Сессия истекла. Войдите снова.')
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json() as { satellites: Satellite[] }
        if (!isActive) return
        setSatellites(data.satellites)

        const depResponse = await fetch('/api/gn/departments')
        if (depResponse.ok) {
          const depRows = (await depResponse.json()) as DepartmentOption[]
          if (!isActive) return
          setDepartments(depRows)
        }

        const gtResponse = await fetch('/api/gn/satellite-gt-numbers')
        if (gtResponse.ok) {
          const gtRows = (await gtResponse.json()) as SatelliteGtNumberOption[]
          if (!isActive) return
          setGtNumbers(gtRows)
        }

        await loadXmlMonthly()
      } catch (err) {
        if (!isActive) return
        const message = err instanceof Error ? err.message : 'Не удалось загрузить данные'
        setError(message)
      } finally {
        if (!isActive) return
        setLoading(false)
      }
    }

    void loadData()

    return () => {
      isActive = false
    }
  }, [authUser, authToken])

  const sortedMonths = useMemo(() => {
    return [...months].sort((left, right) => {
      const leftYear = extractMonthYear(left)
      const rightYear = extractMonthYear(right)
      if (leftYear !== rightYear) return leftYear - rightYear

      const leftOrder = extractMonthOrder(left)
      const rightOrder = extractMonthOrder(right)
      if (leftOrder !== rightOrder) return leftOrder - rightOrder

      return left.localeCompare(right, 'ru')
    })
  }, [months])

  useEffect(() => {
    setExpandedMonths((prev) => {
      const next: Record<string, boolean> = {}
      sortedMonths.forEach((month) => {
        if (prev[month]) {
          next[month] = true
        }
      })
      return next
    })
  }, [sortedMonths])

  const satelliteIndexById = useMemo(() => {
    const indexMap = new Map<number, number>()
    satellites.forEach((satellite, index) => {
      indexMap.set(satellite.GN_satellite_id, index)
    })
    return indexMap
  }, [satellites])

  const departmentFilterOptions = useMemo(() => {
    const values = new Set(satellites.map((satellite) => satellite.GN_department?.trim()).filter((department): department is string => !!department))
    return [...values].sort((left, right) => left.localeCompare(right, 'ru'))
  }, [satellites])

  const preparedSatellites = useMemo(() => {
    const filtered = satellites.filter((satellite) => {
      if (departmentFilter && satellite.GN_department !== departmentFilter) {
        return false
      }
      if (!hideUnusedRows) {
        return true
      }
      const macKey = normalizeMacKey(satellite.GN_satellite_mac)
      return sortedMonths.some((month) => (xmlRowsByMacMonth[macKey]?.[month]?.amount ?? 0) !== 0)
    })

    const directionFactor = sortState.direction === 'asc' ? 1 : -1
    const parseMonthKey = (key: string): { month: string; column: string } | null => {
      if (!key.startsWith('month:')) return null
      const parts = key.split(':')
      if (parts.length !== 3) return null
      return { month: parts[1], column: parts[2] }
    }

    const compareValues = (left: string | number | null, right: string | number | null): number => {
      if (left == null && right == null) return 0
      if (left == null) return 1
      if (right == null) return -1
      if (typeof left === 'number' && typeof right === 'number') return left - right
      return String(left).localeCompare(String(right), 'ru', { sensitivity: 'base' })
    }

    return [...filtered].sort((left, right) => {
      const leftMacKey = normalizeMacKey(left.GN_satellite_mac)
      const rightMacKey = normalizeMacKey(right.GN_satellite_mac)
      let baseCompare = 0

      const monthSortKey = parseMonthKey(sortState.key)
      if (monthSortKey) {
        const leftCell = xmlRowsByMacMonth[leftMacKey]?.[monthSortKey.month]
        const rightCell = xmlRowsByMacMonth[rightMacKey]?.[monthSortKey.month]

        if (monthSortKey.column === 'amount') {
          baseCompare = compareValues(leftCell?.amount ?? null, rightCell?.amount ?? null)
        } else if (monthSortKey.column === 'tariff') {
          baseCompare = compareValues(leftCell?.tariff ?? null, rightCell?.tariff ?? null)
        } else if (monthSortKey.column === 'status') {
          baseCompare = compareValues(leftCell?.status ?? null, rightCell?.status ?? null)
        } else if (monthSortKey.column === 'edit') {
          baseCompare = compareValues(leftCell ? 1 : 0, rightCell ? 1 : 0)
        }
      } else {
        switch (sortState.key) {
          case 'index':
            baseCompare = (satelliteIndexById.get(left.GN_satellite_id) ?? 0) - (satelliteIndexById.get(right.GN_satellite_id) ?? 0)
            break
          case 'mac':
            baseCompare = compareValues(left.GN_satellite_mac, right.GN_satellite_mac)
            break
          case 'direction':
            baseCompare = compareValues(left.GN_satellite_direction_name, right.GN_satellite_direction_name)
            break
          case 'department':
            baseCompare = compareValues(left.GN_department ?? null, right.GN_department ?? null)
            break
          case 'gtNumbers': {
            const leftGtNumber = gtNumbers.find((gt) => gt.GN_satellite_gt_numbers_id === left.GN_satellite_gt_numbers_FK)?.GN_satellite_gt_number ?? null
            const rightGtNumber = gtNumbers.find((gt) => gt.GN_satellite_gt_numbers_id === right.GN_satellite_gt_numbers_FK)?.GN_satellite_gt_number ?? null
            baseCompare = compareValues(leftGtNumber, rightGtNumber)
            break
          }
          case 'description':
            baseCompare = compareValues(left.GN_satellite_description ?? null, right.GN_satellite_description ?? null)
            break
          case 'diameter':
            baseCompare = compareValues(left.GN_satellite_diameter ?? null, right.GN_satellite_diameter ?? null)
            break
          case 'power':
            baseCompare = compareValues(left.GN_satellite_power ?? null, right.GN_satellite_power ?? null)
            break
          case 'model':
            baseCompare = compareValues(left.GN_satellite_model ?? null, right.GN_satellite_model ?? null)
            break
          case 'modem':
            baseCompare = compareValues(left.GN_satellite_modem ?? null, right.GN_satellite_modem ?? null)
            break
          case 'actions':
            baseCompare = compareValues(left.GN_satellite_id, right.GN_satellite_id)
            break
          default:
            baseCompare = 0
            break
        }
      }

      if (baseCompare === 0) {
        baseCompare = (satelliteIndexById.get(left.GN_satellite_id) ?? 0) - (satelliteIndexById.get(right.GN_satellite_id) ?? 0)
      }

      return baseCompare * directionFactor
    })
  }, [satellites, departmentFilter, hideUnusedRows, sortedMonths, xmlRowsByMacMonth, sortState, satelliteIndexById])

  const visibleMonthTotals = useMemo(() => {
    const totals: Record<string, number> = {}

    sortedMonths.forEach((month) => {
      totals[month] = preparedSatellites.reduce((acc, sat) => {
        const macKey = normalizeMacKey(sat.GN_satellite_mac)
        return acc + (xmlRowsByMacMonth[macKey]?.[month]?.amount ?? 0)
      }, 0)
    })

    return totals
  }, [preparedSatellites, sortedMonths, xmlRowsByMacMonth])

  function exportToXlsx(): void {
    if (preparedSatellites.length === 0) {
      setError('Нет данных для экспорта')
      return
    }

    const header = [
      '№',
      'MAC',
      'Имя',
      'ПФ',
      'Номера ГТ',
      'Диаметр',
      'Мощность',
      'Модель',
      'Модем',
      'Местонахождение',
      ...sortedMonths.flatMap((month) => [`${month}: Сумма`, `${month}: Тариф`, `${month}: Статус`, `${month}: Примечание`]),
    ]
    const rows = preparedSatellites.map((satellite, index) => {
      const macKey = normalizeMacKey(satellite.GN_satellite_mac)
      const gtNumber = gtNumbers.find((item) => item.GN_satellite_gt_numbers_id === satellite.GN_satellite_gt_numbers_FK)?.GN_satellite_gt_number ?? ''

      return [
        index + 1,
        satellite.GN_satellite_mac,
        satellite.GN_satellite_direction_name,
        satellite.GN_department ?? '',
        gtNumber,
        satellite.GN_satellite_diameter ?? '',
        satellite.GN_satellite_power ?? '',
        satellite.GN_satellite_model ?? '',
        satellite.GN_satellite_modem ?? '',
        satellite.GN_satellite_description ?? '',
        ...sortedMonths.flatMap((month) => {
          const cell = xmlRowsByMacMonth[macKey]?.[month]
          return [cell?.amount ?? 0, cell?.tariff ?? '', cell?.status ?? '', cell?.tariffNote ?? '']
        }),
      ]
    })
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows])
    const numberColumns = new Set<number>([0])
    sortedMonths.forEach((_, monthIndex) => numberColumns.add(10 + monthIndex * 4))

    rows.forEach((_, rowIndex) => {
      numberColumns.forEach((columnIndex) => {
        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })]
        if (cell) cell.z = columnIndex === 0 ? '0' : '#,##0.00'
      })
    })
    worksheet['!cols'] = header.map((title, columnIndex) => ({
      wch: Math.min(40, Math.max(12, ...[title, ...rows.map((row) => String(row[columnIndex] ?? ''))].map((value) => value.length + 2))),
    }))
    worksheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) }
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Контроль спутников')
    XLSX.writeFile(workbook, `Спутники_контроль_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <section className="page-section satellites-section">
      <div className="page-header satellites-page-header">
        <h1>Спутники: Контроль</h1>      
      </div>

      <div className="page-content satellites-content">
        {!authUser && (
          <div className="satellites-table-card" style={{ maxWidth: '420px' }}>
            <h3 className="satellites-subtitle">Авторизация</h3>
            <form className="invest-popup-grid" onSubmit={handleAuthSubmit}>
              <div>
                <span className="hint">Пользователь</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {SATELLITES_AUTH_USERS.map((userCode) => (
                    <button
                      key={userCode}
                      type="button"
                      className={userCode === username ? 'page-action-btn page-action-btn--success' : 'page-action-btn page-action-btn--secondary'}
                      onClick={() => {
                        setUsername(userCode)
                        setPassword('')
                        setAuthError(null)
                      }}
                    >
                      {userCode === 'ADM' ? 'АДМ' : userCode}
                    </button>
                  ))}
                </div>
              </div>
              {username && (
                <label className="invest-popup-field">
                  <span>Пароль ({username === 'ADM' ? 'АДМ' : username})</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>
              )}
              {authError && <p className="hint hint--error">Ошибка: {authError}</p>}
              <div>
                <button className="page-action-btn page-action-btn--success" type="submit" disabled={authLoading || !username || !password}>
                  {authLoading ? 'Проверка...' : 'Войти'}
                </button>
              </div>
            </form>
          </div>
        )}

        {authUser && (
          <div className="satellites-control-action" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
            <p className="hint">Пользователь: <strong>{authUser}</strong></p>
            <button className="page-action-btn page-action-btn--secondary" type="button" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        )}

        {loading && <p className="hint">Загрузка данных...</p>}
        {!loading && error && <p className="hint hint--error">Ошибка: {error}</p>}
        {!loading && !error && authUser && satellites.length > 0 && (
          <div className="satellites-table-card">           
            <p className="hint">Найдено направлений: <strong>{satellites.length}</strong></p>
            <div className="satellites-actions">
              <button className="page-action-btn page-action-btn--secondary" type="button" onClick={exportToXlsx}>
                Выгрузить в Excel
              </button>
              {authUser === 'ADM' && (
                <label className="satellites-file-input-label">
                  <span className="page-action-btn page-action-btn--success">Загрузить XML</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
            {xmlRowsCount > 0 && (
              <p className="hint">
                Из XML загружено строк: <strong>{xmlRowsCount}</strong>. Сопоставлено по MAC: <strong>{xmlMatchedCount}</strong>.
              </p>
            )}
            <label className="satellites-hide-unused-label">
                        <span>ПФ</span>
                        <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                          <option value="">Все ПФ</option>
                          {departmentFilterOptions.map((department) => (
                            <option key={department} value={department}>{department}</option>
                          ))}
                        </select>
                      </label>
            <label className="satellites-hide-unused-label">
                        <input
                          type="checkbox"
                          checked={hideUnusedRows}
                          onChange={(event) => setHideUnusedRows(event.target.checked)}
                        />
                        скрыть не исп.
                      </label>
                      <label className="satellites-hide-unused-label">
                        <input
                          type="checkbox"
                          checked={hideEquipmentColumns}
                          onChange={(event) => setHideEquipmentColumns(event.target.checked)}
                        />
                        скрыть оборудование
                      </label>
            <table className="guide-table table-compact satellites-table">
              <thead>
                <tr>
                  <th rowSpan={2}>№</th>
                  <th rowSpan={2}>
                    <div className="satellites-header-stack">
                      <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('mac')}>
                        MAC {sortMark('mac')}
                      </button>
                      
                    </div>
                  </th>
                  <th rowSpan={2}>
                    <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('direction')}>
                      Имя {sortMark('direction')}
                    </button>
                  </th>
                  <th rowSpan={2}>
                    <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('department')}>
                      ПФ {sortMark('department')}
                    </button>
                  </th>
                  <th rowSpan={2}>
                    <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('gtNumbers')}>
                      Номера ГТ {sortMark('gtNumbers')}
                    </button>
                  </th>
                  {!hideEquipmentColumns && (
                    <th rowSpan={2}>
                      <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('diameter')}>
                        Диаметр {sortMark('diameter')}
                      </button>
                    </th>
                  )}
                  {!hideEquipmentColumns && (
                    <th rowSpan={2}>
                      <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('power')}>
                        Мощность {sortMark('power')}
                      </button>
                    </th>
                  )}
                  {!hideEquipmentColumns && (
                    <th rowSpan={2}>
                      <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('model')}>
                        Модель {sortMark('model')}
                      </button>
                    </th>
                  )}
                  {!hideEquipmentColumns && (
                    <th rowSpan={2}>
                      <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('modem')}>
                        Модем {sortMark('modem')}
                      </button>
                    </th>
                  )}
                  {authUser === 'ADM' && (
                    <th rowSpan={2}>
                      <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('actions')}>
                        Действия {sortMark('actions')}
                      </button>
                    </th>
                  )}
                  <th rowSpan={2}>
                    <button className="satellites-sort-btn" type="button" onClick={() => toggleSort('description')}>
                      Местонахождение {sortMark('description')}
                    </button>
                  </th>
                  {sortedMonths.map((month) => (
                    <th key={month} colSpan={expandedMonths[month] ? 4 : 1}>
                      <div className="satellites-month-header-grid">
                        <span className="satellites-month-title">{month}</span>
                        <button
                          className="page-action-btn page-action-btn--secondary"
                          type="button"
                          onClick={() => toggleMonthExpanded(month)}
                        >
                          {expandedMonths[month] ? '−' : '+'}
                        </button>
                        {authUser === 'ADM' && (
                          <button
                            className="page-action-btn page-action-btn--danger"
                            type="button"
                            onClick={() => {
                              void clearMonth(month)
                            }}
                            disabled={clearingMonth === month}
                          >
                            {clearingMonth === month ? 'Очистка...' : 'Очистить'}
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {sortedMonths.map((month) => (
                    <Fragment key={`sub-${month}`}>
                      <th>
                        <button className="satellites-sort-btn" type="button" onClick={() => toggleSort(`month:${month}:amount`)}>
                          Сумма {sortMark(`month:${month}:amount`)}
                        </button>
                        <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '2px' }}>
                          {moneyFormatter.format(visibleMonthTotals[month] ?? 0)}
                        </div>
                      </th>
                      {expandedMonths[month] && (
                        <>
                          <th>
                            <button className="satellites-sort-btn" type="button" onClick={() => toggleSort(`month:${month}:tariff`)}>
                              Тариф {sortMark(`month:${month}:tariff`)}
                            </button>
                          </th>
                          <th>
                            <button className="satellites-sort-btn" type="button" onClick={() => toggleSort(`month:${month}:status`)}>
                              Статус {sortMark(`month:${month}:status`)}
                            </button>
                          </th>
                          <th>
                            <button className="satellites-sort-btn" type="button" onClick={() => toggleSort(`month:${month}:edit`)}>
                              ИЗМ {sortMark(`month:${month}:edit`)}
                            </button>
                          </th>
                        </>
                      )}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preparedSatellites.map((sat, index) => {
                  const macKey = normalizeMacKey(sat.GN_satellite_mac)
                  const isEditingRow = !!authUser && editingSatelliteId === sat.GN_satellite_id
                  const isFullEdit = isEditingRow && editMode === 'full'

                  return (
                    <tr key={sat.GN_satellite_id}>
                      <td>{index + 1}</td>
                      <td>
                        {isFullEdit ? (
                          <input
                            className="invest-program-inline-input"
                            value={draftSatellite?.mac ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, mac: value } : prev))
                            }}
                          />
                        ) : sat.GN_satellite_mac}
                      </td>
                      <td>
                        {isFullEdit ? (
                          <input
                            className="invest-program-inline-input"
                            value={draftSatellite?.directionName ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, directionName: value } : prev))
                            }}
                          />
                        ) : sat.GN_satellite_direction_name}
                      </td>
                      <td>
                        {isFullEdit ? (
                          <select
                            className="invest-program-inline-input"
                            value={draftSatellite?.departmentId ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, departmentId: value ? Number(value) : null } : prev))
                            }}
                          >
                            <option value="">-</option>
                            {departments.map((dep) => (
                              <option key={dep.GN_Dep_id} value={dep.GN_Dep_id}>{dep.GN_department}</option>
                            ))}
                          </select>
                        ) : (sat.GN_department || '-')}
                      </td>
                      <td>
                        {isFullEdit || (isEditingRow && editMode === 'limited') ? (
                          <select
                            className="invest-program-inline-input"
                            value={draftSatellite?.gtNumbersFK ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setDraftSatellite((prev) => (prev ? { ...prev, gtNumbersFK: value ? Number(value) : null } : prev))
                            }}
                          >
                            <option value="">-</option>
                            {gtNumbers.map((gt) => (
                              <option key={gt.GN_satellite_gt_numbers_id} value={gt.GN_satellite_gt_numbers_id}>{gt.GN_satellite_gt_number}</option>
                            ))}
                          </select>
                        ) : (
                          (() => {
                            const gtNumber = gtNumbers.find((gt) => gt.GN_satellite_gt_numbers_id === sat.GN_satellite_gt_numbers_FK)
                            return gtNumber ? gtNumber.GN_satellite_gt_number : '-'
                          })()
                        )}
                      </td>
                      {!hideEquipmentColumns && (
                        <td>
                          {isEditingRow ? (
                            <input
                              className="invest-program-inline-input"
                              value={draftSatellite?.diameter ?? ''}
                              onChange={(event) => {
                                const value = event.target.value
                                setDraftSatellite((prev) => (prev ? { ...prev, diameter: value } : prev))
                              }}
                            />
                          ) : (sat.GN_satellite_diameter || '-')}
                        </td>
                      )}
                      {!hideEquipmentColumns && (
                        <td>
                          {isEditingRow ? (
                            <input
                              className="invest-program-inline-input"
                              value={draftSatellite?.power ?? ''}
                              onChange={(event) => {
                                const value = event.target.value
                                setDraftSatellite((prev) => (prev ? { ...prev, power: value } : prev))
                              }}
                            />
                          ) : (sat.GN_satellite_power || '-')}
                        </td>
                      )}
                      {!hideEquipmentColumns && (
                        <td>
                          {isEditingRow ? (
                            <input
                              className="invest-program-inline-input"
                              value={draftSatellite?.model ?? ''}
                              onChange={(event) => {
                                const value = event.target.value
                                setDraftSatellite((prev) => (prev ? { ...prev, model: value } : prev))
                              }}
                            />
                          ) : (sat.GN_satellite_model || '-')}
                        </td>
                      )}
                      {!hideEquipmentColumns && (
                        <td>
                          {isEditingRow ? (
                            <input
                              className="invest-program-inline-input"
                              value={draftSatellite?.modem ?? ''}
                              onChange={(event) => {
                                const value = event.target.value
                                setDraftSatellite((prev) => (prev ? { ...prev, modem: value } : prev))
                              }}
                            />
                          ) : (sat.GN_satellite_modem || '-')}
                        </td>
                      )}
                      {authUser === 'ADM' && (
                        <td className="invest-program-actions-cell">
                          {!isEditingRow || editMode !== 'full' ? (
                            <button
                              className="page-action-btn page-action-btn--success"
                              type="button"
                              onClick={() => startEditRow(sat, 'full')}
                            >
                              правка
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="page-action-btn page-action-btn--success"
                                type="button"
                                onClick={() => {
                                  void saveEditRow(sat)
                                }}
                                disabled={savingRowEdit}
                              >
                                {savingRowEdit ? 'Сохр...' : 'Сохранить'}
                              </button>
                              <button
                                className="page-action-btn page-action-btn--secondary"
                                type="button"
                                onClick={cancelEditRow}
                                disabled={savingRowEdit}
                              >
                                Отмена
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                      <td>
                        {isEditingRow && editMode === 'limited' ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              className="invest-program-inline-input"
                              value={draftSatellite?.description ?? ''}
                              onChange={(event) => {
                                const value = event.target.value
                                setDraftSatellite((prev) => (prev ? { ...prev, description: value } : prev))
                              }}
                            />
                            <button
                              className="page-action-btn page-action-btn--success"
                              type="button"
                              onClick={() => {
                                void saveEditRow(sat)
                              }}
                              disabled={savingRowEdit}
                            >
                              {savingRowEdit ? 'Сохр...' : 'Сохранить'}
                            </button>
                            <button
                              className="page-action-btn page-action-btn--secondary"
                              type="button"
                              onClick={cancelEditRow}
                              disabled={savingRowEdit}
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span>{sat.GN_satellite_description || '-'}</span>
                            {authUser && (
                              <button
                                className="page-action-btn page-action-btn--secondary"
                                type="button"
                                onClick={() => startEditRow(sat, 'limited')}
                              >
                                ИЗМ
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      {sortedMonths.map((month) => {
                        const cell = xmlRowsByMacMonth[macKey]?.[month]
                        const statusValue = cell?.status ?? 'склад'
                        const tariffTooltip = [cell?.tariff || '-', cell?.tariffNote || ''].filter(Boolean).join('\n')
                        const tooltip = cell ? `Филиал: ${cell.branch || '-'}\nТариф: ${tariffTooltip || '-'}\nСтатус: ${statusValue}` : ''
                        const statusTooltip = cell?.savedAt
                          ? `Последнее сохранение: ${cell.savedAt}`
                          : 'Последнее сохранение: нет данных'
                        const statusClass = statusValue === 'в работе'
                          ? 'satellite-amount--green'
                          : statusValue === 'ошибка'
                            ? 'satellite-amount--red'
                            : 'satellite-amount--yellow'

                        const monthCellKey = `${sat.GN_satellite_id}-${month}`
                        const isMonthEditing = editingMonthCellKey === monthCellKey

                        return (
                          <Fragment key={`${sat.GN_satellite_id}-${month}`}>
                            <td className={`number-cell ${statusClass}`} title={tooltip}>
                              {cell ? moneyFormatter.format(cell.amount) : '-'}
                            </td>
                            {expandedMonths[month] && (
                              <>
                                <td>
                                  {isMonthEditing ? (
                                    <div style={{ display: 'grid', gap: '4px' }}>
                                      <input
                                        className="invest-program-inline-input"
                                        value={draftMonthCell?.tariff ?? ''}
                                        onChange={(event) => {
                                          const value = event.target.value
                                          setDraftMonthCell((prev) => (prev ? { ...prev, tariff: value } : prev))
                                        }}
                                      />
                                      <input
                                        className="invest-program-inline-input"
                                        value={draftMonthCell?.tariffNote ?? ''}
                                        onChange={(event) => {
                                          const value = event.target.value
                                          setDraftMonthCell((prev) => (prev ? { ...prev, tariffNote: value } : prev))
                                        }}
                                        placeholder="Дата / примечание"
                                      />
                                    </div>
                                  ) : (
                                    <span style={{ display: 'grid', gap: '2px' }}>
                                      <span>{cell?.tariff || '-'}</span>
                                      <small style={{ color: '#64748b', fontSize: '0.58rem' }}>
                                        {cell?.tariffNote || '-'}
                                      </small>
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {isMonthEditing ? (
                                    <select
                                      className="invest-program-inline-input"
                                      value={draftMonthCell?.status ?? statusValue}
                                      onChange={(event) => {
                                        const value = normalizeStatus(event.target.value)
                                        setDraftMonthCell((prev) => (prev ? { ...prev, status: value } : prev))
                                      }}
                                      disabled={savingMonthCellKey === monthCellKey}
                                    >
                                      {SATELLITE_MONTH_STATUSES.map((status) => (
                                        <option key={`${sat.GN_satellite_id}-${month}-${status}`} value={status}>{status}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span title={statusTooltip} style={{ display: 'grid', gap: '2px' }}>
                                      <span>{statusValue}</span>
                                      <small style={{ color: '#64748b', fontSize: '0.58rem' }}>
                                        {cell?.savedAt ? cell.savedAt : 'нет данных'}
                                      </small>
                                    </span>
                                  )}
                                </td>
                                <td className="invest-program-actions-cell">
                                  {!isMonthEditing ? (
                                    <button
                                      className="page-action-btn page-action-btn--secondary"
                                      type="button"
                                      onClick={() => startMonthEdit(sat, month)}
                                    >
                                      ИЗМ
                                    </button>
                                  ) : (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button
                                        className="page-action-btn page-action-btn--success"
                                        type="button"
                                        onClick={() => {
                                          void saveMonthCell(sat, month)
                                        }}
                                        disabled={savingMonthCellKey === monthCellKey}
                                      >
                                        {savingMonthCellKey === monthCellKey ? 'Сохр...' : 'Сохранить'}
                                      </button>
                                      <button
                                        className="page-action-btn page-action-btn--secondary"
                                        type="button"
                                        onClick={cancelMonthEdit}
                                        disabled={savingMonthCellKey === monthCellKey}
                                      >
                                        Отмена
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </>
                            )}
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {uploadingXml && <p className="hint">Сохранение XML в базу...</p>}
          </div>
        )}

        {!loading && !error && authUser && satellites.length === 0 && (
          <p className="hint">Данные о спутниковых услугах отсутствуют</p>
        )}
      </div>
    </section>
  )
}

