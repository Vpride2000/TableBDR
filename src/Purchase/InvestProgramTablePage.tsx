import { useEffect, useState } from 'react'
import { formatHttpError } from '../utils/forecastUtils'
import PurchaseStateTable from './PurchaseStateTable'

// Страница «Закупки»: таблицы «Состояние закупок ОНМ/ПЭН» строятся на данных
// раздела «Импортозамещение» (Год = 2026, без суммирования), свёрнуты по умолчанию
// и грузят строки лениво при раскрытии. Таблица «Доступно для заказа» открывается
// в отдельном popup-окне.
type LookupOption = { value: string; label: string }

/**
 * Преобразует массив строк справочника в список опций для select.
 */
function mapLookupOptions(
  rows: Array<Record<string, unknown>>,
  valueKey: string,
  labelKey: string
): LookupOption[] {
  return rows.map((row) => {
    const value = String(row[valueKey] ?? '')
    const label = String(row[labelKey] ?? '')
    return { value, label }
  })
}

function openEquipmentOrderWindow(): void {
  const popup = window.open(
    `${window.location.pathname}#equipment-order-window`,
    'equipment-order-window',
    'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes'
  )
  if (popup) popup.focus()
}

export default function InvestProgramTablePage() {
  const [contractorOptions, setContractorOptions] = useState<LookupOption[]>([])
  const [ogruzOptions, setOgruzOptions] = useState<LookupOption[]>([])
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [lookupError, setLookupError] = useState<string | null>(null)

  useEffect(() => {
    async function loadLookups(): Promise<void> {
      setLoadingLookups(true)
      setLookupError(null)

      try {
        const [contractorRes, ogruzRes] = await Promise.all([
          fetch('/api/gn/contractors'),
          fetch('/api/gn/invest-ogruz-rekvizit'),
        ])

        if (!contractorRes.ok) throw new Error(formatHttpError(contractorRes.status))
        if (!ogruzRes.ok) throw new Error(formatHttpError(ogruzRes.status))

        const contractorRows = (await contractorRes.json()) as Array<Record<string, unknown>>
        const ogruzRows = (await ogruzRes.json()) as Array<Record<string, unknown>>

        setContractorOptions(mapLookupOptions(contractorRows, 'GN_c_id', 'GN_contarctor'))
        setOgruzOptions(mapLookupOptions(ogruzRows, 'GN_invest_ogruz_rekvizit_id', 'GN_invest_ogruz_rekvizit'))
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : 'Не удалось загрузить справочники')
      } finally {
        setLoadingLookups(false)
      }
    }

    void loadLookups()
  }, [])

  return (
    <section className="guide invest-program">
      <div className="guide-section">
        <div className="guide-table-actions">
          <button
            type="button"
            className="page-text-link"
            onClick={openEquipmentOrderWindow}
          >
            Доступно для заказа
          </button>
        </div>

        {lookupError && <p className="hint hint--error">Ошибка: {lookupError}</p>}

        <PurchaseStateTable
          title="Состояние закупок ОНМ"
          costItem="ОНМ"
          contractorOptions={contractorOptions}
          ogruzOptions={ogruzOptions}
          loadingLookups={loadingLookups}
        />

        <PurchaseStateTable
          title="Состояние закупок МЦОС"
          costItem="ПЭН"
          contractorOptions={contractorOptions}
          ogruzOptions={ogruzOptions}
          loadingLookups={loadingLookups}
        />
      </div>
    </section>
  )
}
