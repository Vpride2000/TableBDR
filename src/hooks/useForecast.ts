import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ForecastRow,
  ForecastMonthlyEdits,
  ForecastMonthlyFactEdits,
  ForecastMonthlyApiRow,
  FORECAST_HIERARCHY_COLUMNS,
  FORECAST_UPDATED_EVENT_KEY,
} from '../types/forecast'
import { toForecastNumber, normalizeMonthlyValues, getForecastRowKey, buildForecastRows, distributeByMonths, toForecastKeyPart, buildRowSpans, formatHttpError, formatErrorMessage } from '../utils/forecastUtils'

// Хук, который инкапсулирует загрузку прогнозных данных, фильтрацию и вычисление
// итоговых значений для страницы прогнозов.
export function useForecast() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [monthlyEdits, setMonthlyEdits] = useState<ForecastMonthlyEdits>({})
  const [monthlyFactEdits, setMonthlyFactEdits] = useState<ForecastMonthlyFactEdits>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [monthIndex, setMonthIndex] = useState(() => new Date().getMonth())
  const [forecastFilters, setForecastFilters] = useState<Record<string, string>>({})

  const loadForecastData = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const [bdrResponse, forecastResponse] = await Promise.all([
        fetch('/api/gn/bdr'),
        fetch('/api/gn/forecast-monthly'),
      ])

      if (!bdrResponse.ok) throw new Error(formatHttpError(bdrResponse.status))
      if (!forecastResponse.ok) throw new Error(formatHttpError(forecastResponse.status))

      const [bdrRows, forecastPayload] = await Promise.all([
        bdrResponse.json() as Promise<Record<string, unknown>[]>,
        forecastResponse.json() as Promise<{ rows?: ForecastMonthlyApiRow[] }>,
      ])

      const nextMonthlyEdits: ForecastMonthlyEdits = {}
      const nextMonthlyFactEdits: ForecastMonthlyFactEdits = {}
      ;(forecastPayload.rows ?? []).forEach((row) => {
        const key = String(toForecastNumber(row.rowId))

        const values = Array.isArray(row.monthlyValues)
          ? row.monthlyValues.map((value) => toForecastNumber(value))
          : []
        const factValues = Array.isArray(row.monthlyFactValues)
          ? row.monthlyFactValues.map((value) => toForecastNumber(value))
          : []

        nextMonthlyEdits[key] = normalizeMonthlyValues(values)
        nextMonthlyFactEdits[key] = normalizeMonthlyValues(factValues)
      })

      setRows(bdrRows)
      setMonthlyEdits(nextMonthlyEdits)
      setMonthlyFactEdits(nextMonthlyFactEdits)
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadForecastData()
  }, [loadForecastData])

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== FORECAST_UPDATED_EVENT_KEY) return
      void loadForecastData()
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [loadForecastData])

  const forecastRows = useMemo(() => buildForecastRows(rows), [rows])

  const filteredForecastRows = useMemo(() => {
    return forecastRows.filter((row) =>
      FORECAST_HIERARCHY_COLUMNS.every((column) => {
        const filterValue = String(forecastFilters[column] ?? '').trim().toLowerCase()
        if (!filterValue) return true
        return String(row[column] ?? '').toLowerCase().includes(filterValue)
      })
    )
  }, [forecastRows, forecastFilters])

  const filteredRowSpans = useMemo(() => buildRowSpans(filteredForecastRows), [filteredForecastRows])

  const getDisplayedMonthlyValues = useCallback((row: ForecastRow): number[] => {
    return monthlyEdits[getForecastRowKey(row)] ?? row.monthlyValues
  }, [monthlyEdits])

  const getDisplayedMonthlyFactValues = useCallback((row: ForecastRow): number[] => {
    return monthlyFactEdits[getForecastRowKey(row)] ?? new Array<number>(12).fill(0)
  }, [monthlyFactEdits])

  const getForecastCellStatusClass = useCallback((planValue: number, factValue: number): string => {
    if (factValue === 0) return 'forecast-month-cell--zero-fact'
    if (Math.abs(planValue - factValue) < 0.005) return 'forecast-month-cell--match'
    return 'forecast-month-cell--mismatch'
  }, [])

  const setForecastFilter = useCallback((column: (typeof FORECAST_HIERARCHY_COLUMNS)[number], value: string): void => {
    setForecastFilters((prev) => ({ ...prev, [column]: value }))
  }, [])

  const openForecastMonthPopup = useCallback((monthIndex: number): void => {
    const popupUrl = `${window.location.pathname}#forecast-month-window-${monthIndex}`
    const popup = window.open(
      popupUrl,
      `forecast-month-window-${monthIndex}`,
      'popup=yes,width=1100,height=820,resizable=yes,scrollbars=yes'
    )

    if (popup) {
      popup.focus()
    }
  }, [])

  const totalByMonths = useMemo(() => {
    const totals = new Array<number>(12).fill(0)
    filteredForecastRows.forEach((row) => {
      getDisplayedMonthlyValues(row).forEach((value, index) => {
        totals[index] += value
      })
    })
    return totals
  }, [filteredForecastRows, getDisplayedMonthlyValues])

  const grandTotal = useMemo(
    () =>
      filteredForecastRows.reduce(
        (sum, row) => sum + getDisplayedMonthlyValues(row).reduce((acc, value) => acc + value, 0),
        0
      ),
    [filteredForecastRows, getDisplayedMonthlyValues]
  )

  const editableMonthIndexes = useMemo(
    () => [monthIndex - 1, monthIndex, monthIndex + 1].filter((index) => index >= 0 && index < 12),
    [monthIndex]
  )

  // Другие функции, такие как updateMonthlyValue, saveMonthlyForecastEdits и т.д.

  return {
    rows,
    monthlyEdits,
    monthlyFactEdits,
    loading,
    error,
    saving,
    saveError,
    saveSuccess,
    monthIndex,
    forecastFilters,
    forecastRows,
    filteredForecastRows,
    filteredRowSpans,
    getDisplayedMonthlyValues,
    getDisplayedMonthlyFactValues,
    getForecastCellStatusClass,
    setForecastFilter,
    openForecastMonthPopup,
    totalByMonths,
    grandTotal,
    editableMonthIndexes,
    loadForecastData,
  }
}