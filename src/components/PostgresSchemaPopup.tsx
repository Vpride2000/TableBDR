import { useState, type ReactElement } from 'react'

type SchemaColumn = {
  name: string
  type: string
  nullable: boolean
  foreignKeys: string[]
}

type SchemaTable = {
  schema: string
  name: string
  columns: SchemaColumn[]
}

type SchemaResponse = {
  database: string
  tables: SchemaTable[]
}

export default function PostgresSchemaPopup(): ReactElement {
  const [schema, setSchema] = useState<SchemaResponse | null>(null)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [search, setSearch] = useState('')

  async function refreshSchema(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/database/schema', { cache: 'no-store' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as {
          error?: string
          details?: {
            message?: string
            code?: string
            detail?: string
            hint?: string
          }
        }
        const errorLines = [
          payload.error || `HTTP ${response.status}`,
          payload.details?.message,
          payload.details?.code ? `Код ошибки: ${payload.details.code}` : undefined,
          payload.details?.detail ? `Подробности: ${payload.details.detail}` : undefined,
          payload.details?.hint ? `Подсказка: ${payload.details.hint}` : undefined,
        ].filter((line): line is string => Boolean(line))
        throw new Error(errorLines.join('\n'))
      }
      setSchema(await response.json() as SchemaResponse)
      setExpandedTables(new Set())
      setUpdatedAt(new Date())
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setLoading(false)
    }
  }

  function toggleTable(key: string): void {
    setExpandedTables((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const searchTerm = search.trim().toLocaleLowerCase('ru')
  const matchingTables = (schema?.tables ?? []).flatMap((table) => {
    const tableNameMatches = `${table.schema}.${table.name}`.toLocaleLowerCase('ru').includes(searchTerm)
    const matchingColumns = table.columns.filter((column) => [
      column.name,
      column.type,
      column.nullable ? 'null да' : 'null нет',
      ...column.foreignKeys,
    ].join(' ').toLocaleLowerCase('ru').includes(searchTerm))

    if (searchTerm && !tableNameMatches && matchingColumns.length === 0) return []
    return [{
      ...table,
      columns: searchTerm && !tableNameMatches ? matchingColumns : table.columns,
      tableNameMatches,
    }]
  })

  return (
    <main className="postgres-schema-popup">
      <header className="postgres-schema-header">
        <div>
          <h2>Схема базы данных</h2>
          <p className="hint">
            {schema
              ? `База: ${schema.database}${updatedAt ? ` · обновлено ${updatedAt.toLocaleString('ru-RU')}` : ''}`
              : 'Схема не загружена'}
          </p>
        </div>
        <button type="button" className="page-action-btn page-action-btn--secondary" onClick={() => void refreshSchema()} disabled={loading}>
          {loading ? 'Загрузка...' : schema ? 'Обновить схему' : 'Загрузить схему'}
        </button>
      </header>

      {error && <p className="hint hint--error">Не удалось загрузить схему: {error}</p>}
      {schema && schema.tables.length === 0 && <p className="hint">В доступных схемах таблиц не найдено.</p>}

      {schema && schema.tables.length > 0 && (
        <>
          <label className="postgres-schema-search">
            <span>Поиск по таблицам, столбцам и связям</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Введите название таблицы, столбца или внешнего ключа"
            />
          </label>
          {matchingTables.length === 0 ? (
            <p className="hint">Совпадений не найдено.</p>
          ) : (
            <section className="postgres-schema-list" aria-label="Таблицы базы данных">
              {matchingTables.map((table, tableIndex) => {
            const key = `${table.schema}.${table.name}`
            const expanded = expandedTables.has(key) || (Boolean(searchTerm) && (table.tableNameMatches || table.columns.length > 0))
            return (
              <article className="postgres-schema-table" key={key}>
                <button
                  type="button"
                  className="postgres-schema-table-toggle"
                  aria-expanded={expanded}
                  onClick={() => toggleTable(key)}
                >
                  <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                  <span className="postgres-schema-table-number">{tableIndex + 1}.</span>
                  <code>{key}</code>
                  <span className="postgres-schema-column-count">{table.columns.length} ст.</span>
                </button>
                {expanded && (
                  <div className="postgres-schema-columns-wrap">
                    <table className="postgres-schema-columns">
                      <thead>
                        <tr>
                          <th>№</th>
                          <th>Столбец</th>
                          <th>Тип</th>
                          <th>NULL</th>
                          <th>Внешний ключ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.columns.map((column, columnIndex) => (
                          <tr key={column.name}>
                            <td>{columnIndex + 1}</td>
                            <td><code>{column.name}</code></td>
                            <td>{column.type}</td>
                            <td>{column.nullable ? 'Да' : 'Нет'}</td>
                            <td>
                              {column.foreignKeys.length > 0
                                ? column.foreignKeys.map((foreignKey) => (
                                    <div className="postgres-schema-foreign-key" key={foreignKey}>{foreignKey}</div>
                                  ))
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            )
          })}
            </section>
          )}
        </>
      )}
    </main>
  )
}
