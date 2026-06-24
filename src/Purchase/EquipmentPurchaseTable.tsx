import { useEffect, useState } from 'react'
import { formatHttpError, formatErrorMessage } from '../utils/forecastUtils'

interface EquipmentPurchaseRow {
  GN_equipment_purchase_id: number
  equipment_model: string
  manufacturer: string
  equipment_type: string
  department: string
  budget_item: string
  object: string
  purchase_status: string
  purchase_quantity: number
  GN_equipment_model_FK?: number
  GN_department_FK?: number
  GN_budget_network_item_FK?: number
  GN_departament_object_FK?: number
}

interface LookupData {
  id: number | string
  name: string
}

interface LookupOptions {
  manufacturers: LookupData[]
  types: LookupData[]
  departments: LookupData[]
  budgetItems: LookupData[]
  objects: LookupData[]
  statuses: LookupData[]
}

interface EditingDraft extends Partial<EquipmentPurchaseRow> {}

const TABLE_COLUMNS = ['equipment_model', 'manufacturer', 'equipment_type', 'department', 'budget_item', 'object', 'purchase_status', 'purchase_quantity'] as const
const COLUMN_LABELS: Record<(typeof TABLE_COLUMNS)[number], string> = {
  equipment_model: 'Модель оборудования',
  manufacturer: 'Производитель',
  equipment_type: 'Тип оборудования',
  department: 'Подразделение',
  budget_item: 'Статья бюджета',
  object: 'Объект',
  purchase_status: 'Статус',
  purchase_quantity: 'Кол-во',
}

/**
 * Таблица закупок оборудования с возможностью редактирования и добавления новых записей.
 */
export function EquipmentPurchaseTable() {
  const [rows, setRows] = useState<EquipmentPurchaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadingLookups, setLoadingLookups] = useState(true)
  const [lookupError, setLookupError] = useState('')
  const [lookupOptions, setLookupOptions] = useState<LookupOptions>({
    manufacturers: [],
    types: [],
    departments: [],
    budgetItems: [],
    objects: [],
    statuses: [],
  })
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null)
  const [editingRowDraft, setEditingRowDraft] = useState<EditingDraft | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)

  /**
   * Загружает данные о закупках оборудования с сервера.
   */
  async function loadEquipmentPurchases(): Promise<void> {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/gn/equipment-purchases')
      if (!response.ok) {
        throw new Error(formatHttpError(response))
      }
      const data: EquipmentPurchaseRow[] = await response.json()
      setRows(data)
    } catch (err) {
      setError(formatErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /**
   * Загружает справочники для заполнения dropdown'ов.
   */
  async function loadLookups(): Promise<void> {
    try {
      setLoadingLookups(true)
      setLookupError('')
      const response = await fetch('/api/gn/equipment-lookups')
      if (!response.ok) {
        throw new Error(formatHttpError(response))
      }
      const data: LookupOptions = await response.json()
      setLookupOptions(data)
    } catch (err) {
      setLookupError(formatErrorMessage(err))
    } finally {
      setLoadingLookups(false)
    }
  }

  useEffect(() => {
    void loadEquipmentPurchases()
    void loadLookups()
  }, [])

  /**
   * Запускает редактирование существующей строки.
   */
  function startRowEdit(rowIndex: number): void {
    setEditingRowIndex(rowIndex)
    setEditingRowDraft({ ...rows[rowIndex] })
    setIsAddingNew(false)
  }

  /**
   * Запускает добавление новой строки.
   */
  function startAddNew(): void {
    setEditingRowIndex(null)
    setEditingRowDraft({
      GN_equipment_model_FK: undefined,
      GN_department_FK: undefined,
      GN_budget_network_item_FK: undefined,
      GN_departament_object_FK: undefined,
      purchase_status: 'готово к закупке',
      purchase_quantity: 1,
    })
    setIsAddingNew(true)
  }

  /**
   * Отменяет редактирование или добавление.
   */
  function cancelEdit(): void {
    setEditingRowIndex(null)
    setEditingRowDraft(null)
    setIsAddingNew(false)
  }

  /**
   * Сохраняет новую или отредактированную строку.
   */
  async function saveEdit(): Promise<void> {
    if (editingRowDraft == null) return

    try {
      const url = isAddingNew ? '/api/gn/equipment-purchases' : `/api/gn/equipment-purchases/${editingRowDraft.GN_equipment_purchase_id}`
      const method = isAddingNew ? 'POST' : 'PUT'
      const body = {
        GN_equipment_model_FK: editingRowDraft.GN_equipment_model_FK,
        GN_department_FK: editingRowDraft.GN_department_FK,
        GN_budget_network_item_FK: editingRowDraft.GN_budget_network_item_FK,
        GN_departament_object_FK: editingRowDraft.GN_departament_object_FK,
        GN_purchase_status: editingRowDraft.purchase_status,
        GN_purchase_quantity: editingRowDraft.purchase_quantity,
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(formatHttpError(response))
      }

      cancelEdit()
      await loadEquipmentPurchases()
    } catch (err) {
      alert(`Ошибка сохранения: ${formatErrorMessage(err)}`)
    }
  }

  /**
   * Удаляет строку.
   */
  async function deleteRow(rowId: number): Promise<void> {
    if (!confirm('Удалить эту закупку?')) return

    try {
      const response = await fetch(`/api/gn/equipment-purchases/${rowId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(formatHttpError(response))
      }

      await loadEquipmentPurchases()
    } catch (err) {
      alert(`Ошибка удаления: ${formatErrorMessage(err)}`)
    }
  }

  /**
   * Обновляет значение в черновике редактируемой строки.
   */
  function updateDraftCell(column: string, nextValue: string | number): void {
    setEditingRowDraft((prevDraft) => (prevDraft ? { ...prevDraft, [column]: nextValue } : prevDraft))
  }

  /**
   * Возвращает значение из справочника по id.
   */
  function getLookupLabel(lookups: LookupData[], id: number | string | undefined): string {
    if (id === undefined || id === null) return '-'
    const lookup = lookups.find((l) => l.id === id)
    return lookup ? lookup.name : String(id)
  }

  return (
    <section className="guide equipment-purchase">
      <div className="guide-section">
        <h2>Закупки оборудования</h2>
        {loading && <p className="hint">Загрузка данных...</p>}
        {error && <p className="hint hint--error">Ошибка: {error}</p>}
        {loadingLookups && <p className="hint">Загрузка справочников...</p>}
        {lookupError && <p className="hint hint--error">Ошибка: {lookupError}</p>}

        {!loading && !error && (
          <div className="guide-table-wrap">
            <div className="guide-actions">
              <button
                type="button"
                className="btn btn-add"
                onClick={() => startAddNew()}
                disabled={editingRowIndex !== null && editingRowIndex !== -1 || isAddingNew}
              >
                Добавить
              </button>
            </div>

            <table className="guide-table table-compact">
              <thead>
                <tr>
                  <th>№</th>
                  {TABLE_COLUMNS.map((column) => (
                    <th key={column}>{COLUMN_LABELS[column]}</th>
                  ))}
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {isAddingNew && editingRowDraft && (
                  <tr className="equipment-purchase-editing-row">
                    <td className="equipment-purchase-row-number">Новая</td>
                    {TABLE_COLUMNS.map((column) => (
                      <td key={`new-${column}`}>
                        {column === 'GN_equipment_model_FK' ? (
                          <select
                            className="equipment-purchase-field"
                            value={editingRowDraft.GN_equipment_model_FK ?? ''}
                            onChange={(e) => updateDraftCell('GN_equipment_model_FK', parseInt(e.target.value, 10))}
                            disabled={loadingLookups || lookupOptions.manufacturers.length === 0}
                          >
                            <option value="">-- Выберите --</option>
                            {lookupOptions.manufacturers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        ) : column === 'GN_department_FK' ? (
                          <select
                            className="equipment-purchase-field"
                            value={editingRowDraft.GN_department_FK ?? ''}
                            onChange={(e) => updateDraftCell('GN_department_FK', parseInt(e.target.value, 10))}
                            disabled={loadingLookups || lookupOptions.departments.length === 0}
                          >
                            <option value="">-- Выберите --</option>
                            {lookupOptions.departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : column === 'GN_budget_network_item_FK' ? (
                          <select
                            className="equipment-purchase-field"
                            value={editingRowDraft.GN_budget_network_item_FK ?? ''}
                            onChange={(e) => updateDraftCell('GN_budget_network_item_FK', parseInt(e.target.value, 10))}
                            disabled={loadingLookups || lookupOptions.budgetItems.length === 0}
                          >
                            <option value="">-- Выберите --</option>
                            {lookupOptions.budgetItems.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        ) : column === 'GN_departament_object_FK' ? (
                          <select
                            className="equipment-purchase-field"
                            value={editingRowDraft.GN_departament_object_FK ?? ''}
                            onChange={(e) => updateDraftCell('GN_departament_object_FK', parseInt(e.target.value, 10))}
                            disabled={loadingLookups || lookupOptions.objects.length === 0}
                          >
                            <option value="">-- Выберите --</option>
                            {lookupOptions.objects.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        ) : column === 'purchase_status' ? (
                          <select
                            className="equipment-purchase-field"
                            value={editingRowDraft.purchase_status ?? ''}
                            onChange={(e) => updateDraftCell('purchase_status', e.target.value)}
                          >
                            {lookupOptions.statuses.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        ) : column === 'purchase_quantity' ? (
                          <input
                            type="number"
                            className="equipment-purchase-field"
                            value={editingRowDraft.purchase_quantity ?? 1}
                            onChange={(e) => updateDraftCell('purchase_quantity', parseInt(e.target.value, 10) || 1)}
                          />
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="btn btn-small btn-save"
                        onClick={() => void saveEdit()}
                      >
                        ✓
                      </button>
                      <button type="button" className="btn btn-small btn-cancel" onClick={() => cancelEdit()}>
                        ✕
                      </button>
                    </td>
                  </tr>
                )}

                {rows.map((row, rowIndex) => (
                  <tr
                    key={`row-${row.GN_equipment_purchase_id}`}
                    className={editingRowIndex === rowIndex ? 'equipment-purchase-editing-row' : ''}
                  >
                    <td className="equipment-purchase-row-number">{rowIndex + 1}</td>
                    {TABLE_COLUMNS.map((column) => {
                      const isEditingRow = editingRowIndex === rowIndex && editingRowDraft != null
                      let cellValue: unknown

                      if (isEditingRow) {
                        if (column === 'equipment_model') {
                          cellValue = editingRowDraft.equipment_model
                        } else if (column === 'manufacturer') {
                          cellValue = editingRowDraft.manufacturer
                        } else if (column === 'equipment_type') {
                          cellValue = editingRowDraft.equipment_type
                        } else if (column === 'department') {
                          cellValue = editingRowDraft.department
                        } else if (column === 'budget_item') {
                          cellValue = editingRowDraft.budget_item
                        } else if (column === 'object') {
                          cellValue = editingRowDraft.object
                        } else if (column === 'purchase_status') {
                          cellValue = editingRowDraft.purchase_status
                        } else if (column === 'purchase_quantity') {
                          cellValue = editingRowDraft.purchase_quantity
                        }
                      } else {
                        cellValue = row[column]
                      }

                      if (isEditingRow && (column === 'purchase_status' || column === 'purchase_quantity')) {
                        return (
                          <td key={`${column}-${rowIndex}`}>
                            {column === 'purchase_status' ? (
                              <select
                                className="equipment-purchase-field"
                                value={String(cellValue ?? '')}
                                onChange={(e) => updateDraftCell('purchase_status', e.target.value)}
                              >
                                {lookupOptions.statuses.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="number"
                                className="equipment-purchase-field"
                                value={cellValue ?? 1}
                                onChange={(e) => updateDraftCell('purchase_quantity', parseInt(e.target.value, 10) || 1)}
                              />
                            )}
                          </td>
                        )
                      }

                      return (
                        <td key={`${column}-${rowIndex}`}>
                          <span className="equipment-purchase-cell-text">{cellValue ?? '-'}</span>
                        </td>
                      )
                    })}
                    <td>
                      {isEditingRow ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-small btn-save"
                            onClick={() => void saveEdit()}
                          >
                            ✓
                          </button>
                          <button type="button" className="btn btn-small btn-cancel" onClick={() => cancelEdit()}>
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-small btn-edit"
                            onClick={() => startRowEdit(rowIndex)}
                            disabled={editingRowIndex !== null || isAddingNew}
                          >
                            ✏
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-delete"
                            onClick={() => void deleteRow(row.GN_equipment_purchase_id)}
                            disabled={editingRowIndex !== null || isAddingNew}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
