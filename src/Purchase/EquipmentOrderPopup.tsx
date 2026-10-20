import { useEffect, useState } from 'react'
import { formatHttpError } from '../utils/httpUtils'

type LookupOption = { value: string; label: string }
type InvestRow = Record<string, string>

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

// Таблица «Доступно для заказа» из раздела Закупки, вынесенная в отдельное popup-окно.
export default function EquipmentOrderPopup() {
  const [equipmentRows, setEquipmentRows] = useState<InvestRow[]>([])
  const [equipmentManufacturerOptions, setEquipmentManufacturerOptions] = useState<LookupOption[]>([])
  const [equipmentTypeOptions, setEquipmentTypeOptions] = useState<LookupOption[]>([])
  const [loadingEquipment, setLoadingEquipment] = useState(true)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [editingEquipmentRowIndex, setEditingEquipmentRowIndex] = useState<number | null>(null)
  const [editingEquipmentDraft, setEditingEquipmentDraft] = useState<InvestRow | null>(null)

  useEffect(() => {
    async function loadEquipmentModels(): Promise<void> {
      setLoadingEquipment(true)
      setEquipmentError(null)

      try {
        const [modelsRes, manuRes, typeRes] = await Promise.all([
          fetch('/api/gn/equipment-models'),
          fetch('/api/gn/equipment-manufacturers'),
          fetch('/api/gn/equipment-types'),
        ])

        if (!modelsRes.ok) throw new Error(formatHttpError(modelsRes.status))
        if (!manuRes.ok) throw new Error(formatHttpError(manuRes.status))
        if (!typeRes.ok) throw new Error(formatHttpError(typeRes.status))

        const models = (await modelsRes.json()) as Array<Record<string, unknown>>
        const manu = (await manuRes.json()) as Array<Record<string, unknown>>
        const types = (await typeRes.json()) as Array<Record<string, unknown>>

        const manuMap = new Map(manu.map((r) => [String(r.GN_equipment_manufacturer_id), String(r.GN_equipment_manufacturer || '')]))
        const typeMap = new Map(types.map((r) => [String(r.GN_equipment_type_id), String(r.GN_equipment_type || '')]))

        const mapped = models.map((row) => ({
          'Модель': String(row.GN_equipment_model ?? ''),
          'Производитель': manuMap.get(String(row.GN_equipment_manufacturer_FK ?? '')) ?? '',
          'Тип': typeMap.get(String(row.GN_equipment_type_FK ?? '')) ?? '',
          'ПроизводительId': String(row.GN_equipment_manufacturer_FK ?? ''),
          'ТипId': String(row.GN_equipment_type_FK ?? ''),
          'Подразделение': String(row.GN_equipment_department_FK ?? ''),
          'Статья бюджета': String(row.GN_equipment_budget_item_FK ?? ''),
          'Объект': String(row.GN_equipment_object_FK ?? ''),
          'Статус': String(row.GN_equipment_status ?? 'готово к заккупке'),
          'id': String(row.GN_equipment_model_id ?? ''),
        }))

        setEquipmentManufacturerOptions(mapLookupOptions(manu, 'GN_equipment_manufacturer_id', 'GN_equipment_manufacturer'))
        setEquipmentTypeOptions(mapLookupOptions(types, 'GN_equipment_type_id', 'GN_equipment_type'))
        setEquipmentRows(mapped)
      } catch (err) {
        setEquipmentError(err instanceof Error ? err.message : 'Не удалось загрузить модели оборудования')
      } finally {
        setLoadingEquipment(false)
      }
    }

    void loadEquipmentModels()
  }, [])

  return (
    <section className="guide invest-program">
      <div className="guide-section">
        <h2>Доступно для заказа</h2>
        {loadingEquipment && <p className="hint">Загрузка моделей...</p>}
        {equipmentError && <p className="hint hint--error">Ошибка: {equipmentError}</p>}
        {!loadingEquipment && !equipmentError && (
          <div className="guide-table-wrap invest-program-table-wrap--narrow">
            <table className="guide-table table-compact">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Тип</th>
                  <th>Производитель</th>
                  <th>Модель</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {equipmentRows.map((er, idx) => {
                  const isEditingEq = editingEquipmentRowIndex === idx && editingEquipmentDraft != null
                  const draft = isEditingEq ? editingEquipmentDraft : er
                  return (
                    <tr key={`eq-${er.id || idx}`}>
                      <td>{idx + 1}</td>
                      <td>
                        {isEditingEq ? (
                          <select
                            className="invest-program-field"
                            value={draft['ТипId']}
                            onChange={(event) => setEditingEquipmentDraft((prev) => prev ? {
                              ...prev,
                              'ТипId': event.target.value,
                              'Тип': equipmentTypeOptions.find((option) => option.value === event.target.value)?.label ?? '',
                            } : prev)}
                          >
                            {equipmentTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : er['Тип']}
                      </td>
                      <td>
                        {isEditingEq ? (
                          <select
                            className="invest-program-field"
                            value={draft['ПроизводительId']}
                            onChange={(event) => setEditingEquipmentDraft((prev) => prev ? {
                              ...prev,
                              'ПроизводительId': event.target.value,
                              'Производитель': equipmentManufacturerOptions.find((option) => option.value === event.target.value)?.label ?? '',
                            } : prev)}
                          >
                            {equipmentManufacturerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : er['Производитель']}
                      </td>
                      <td>
                        {isEditingEq ? (
                          <input
                            className="invest-program-field"
                            value={draft['Модель']}
                            onChange={(event) => setEditingEquipmentDraft((prev) => prev ? { ...prev, 'Модель': event.target.value } : prev)}
                          />
                        ) : er['Модель']}
                      </td>
                      <td className="invest-program-actions-cell">
                        {isEditingEq ? (
                          <>
                            <button type="button" className="invest-program-row-action-button" onClick={async () => {
                              const d = editingEquipmentDraft!
                              const response = await fetch(`/api/gn/equipment-models/${d['id']}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  model: d['Модель'],
                                  manufacturer_fk: d['ПроизводительId'] ? Number(d['ПроизводительId']) : null,
                                  type_fk: d['ТипId'] ? Number(d['ТипId']) : null,
                                  department_fk: d['Подразделение'] ? Number(d['Подразделение']) : null,
                                  budget_item_fk: d['Статья бюджета'] ? Number(d['Статья бюджета']) : null,
                                  object_fk: d['Объект'] ? Number(d['Объект']) : null,
                                  status: d['Статус'],
                                }),
                              })

                              if (!response.ok) {
                                throw new Error(formatHttpError(response.status))
                              }

                              setEquipmentRows((prev) => prev.map((r, i) => i === idx ? { ...d } : r))
                              setEditingEquipmentRowIndex(null)
                              setEditingEquipmentDraft(null)
                            }}>
                              СОХР
                            </button>
                            <button type="button" className="invest-program-row-action-button invest-program-row-action-button--secondary" onClick={() => {
                              setEditingEquipmentRowIndex(null)
                              setEditingEquipmentDraft(null)
                            }}>
                              ОТМ
                            </button>
                          </>
                        ) : (
                          <button type="button" className="invest-program-row-action-button" onClick={() => {
                            setEditingEquipmentRowIndex(idx)
                            setEditingEquipmentDraft({ ...er })
                          }}>
                            ИЗМ
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
