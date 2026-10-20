import { useEffect, useState } from 'react';

type Row = Record<string, unknown>;

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  GN_bdr_ID: 30,
  'Статья бюджета УС': 54,
  Подразделение: 92,
  Объект: 92,
  Договор: 112,
  РАСЧЕТ: 78,
  Контрагент: 96,
  'Статья бюджета': 54,
  'Предмет договора': 100,
  'Ед. изм.': 58,
  'Кол-во': 44,
  Лимит: 74,
  БДР25корр: 76,
  'Кол-во БДР25корр': 44,
  БДР26: 76,
  'Кол-во БДР26': 44,
  БДР26корр: 76,
  'Кол-во БДР26корр': 44,
  БДР27: 76,
  'Кол-во БДР27': 44,
  'Един. лимит': 76,
  Примечания: 90,
};
const DEFAULT_COLUMN_WIDTH = 86;
const ACTIONS_COLUMN_WIDTH = 126;
const NOTES_COLUMN_WIDTH = 180;
const PREVIOUS_BDR_AMOUNT_COLUMN: Record<string, string> = {
  БДР25корр: 'Лимит',
  БДР26: 'БДР25корр',
  БДР26корр: 'БДР26',
  БДР27: 'БДР26корр',
};

interface MainBudgetTableContentProps {
  onAddRow: () => void;
  visibleMainColumns: string[];
  filteredData: Row[];
  filteredLimitTotal: number;
  filteredNumericTotals: Record<string, number>;
  sort: { key: string; direction: 'asc' | 'desc' } | null;
  editingRowId: number | null;
  draft: Row;
  saving: boolean;
  saveError: string | null;
  filters: Record<string, string>;
  lookupRows: Record<string, Row[]>;
  contractsLookup: Record<string, number>;
  COLUMN_TITLES: Record<string, string>;
  LOCKED_EDIT_COLUMNS: Set<string>;
  BDR_SELECT_CONFIG: Record<string, { endpoint: string; labelKey: string }>;
  EXTRA_NUMERIC_COLUMNS: Set<string>;
  FINANCIAL_NUMBER_FORMATTER: Intl.NumberFormat;
  onToggleSort: (column: string) => void;
  onSetFilter: (column: string, value: string) => void;
  onStartEdit: (row: Row) => void;
  onSaveEdit: () => Promise<void>;
  onDeleteEdit: () => Promise<void>;
  onCopyPreviousColumn: (targetColumn: string, sourceColumn: string) => Promise<void>;
  onCancelEdit: () => void;
  onUpdateDraft: (column: string, value: string) => void;
  onGetSelectOptions: (column: string) => Array<{ value: string; label: string }>;
  onFormatCellValue: (column: string, value: unknown) => string;
  onOpenObject: (rowId: number) => void;
  onOpenDepartment: (rowId: number) => void;
  onOpenContractor: (rowId: number) => void;
  onOpenContract: (contractId: number) => void;
}

export default function MainBudgetTableContent({
  onAddRow,
  visibleMainColumns,
  filteredData,
  filteredLimitTotal,
  filteredNumericTotals,
  sort,
  editingRowId,
  draft,
  saving,
  saveError,
  filters,
  lookupRows,
  contractsLookup,
  COLUMN_TITLES,
  LOCKED_EDIT_COLUMNS,
  BDR_SELECT_CONFIG,
  EXTRA_NUMERIC_COLUMNS,
  FINANCIAL_NUMBER_FORMATTER,
  onToggleSort,
  onSetFilter,
  onStartEdit,
  onSaveEdit,
  onDeleteEdit,
  onCopyPreviousColumn,
  onCancelEdit,
  onUpdateDraft,
  onGetSelectOptions,
  onFormatCellValue,
  onOpenObject,
  onOpenDepartment,
  onOpenContractor,
  onOpenContract,
}: MainBudgetTableContentProps) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizeStart, setResizeStart] = useState<{ column: string; startX: number; width: number } | null>(null);

  useEffect(() => {
    if (!resizeStart) return;
    const onMouseMove = (event: MouseEvent) => {
      setColumnWidths((previous) => ({
        ...previous,
        [resizeStart.column]: Math.max(
          resizeStart.column === 'GN_bdr_ID' ? 30 : resizeStart.column.startsWith('Кол-во') ? 44 : 40,
          resizeStart.width + event.clientX - resizeStart.startX
        ),
      }));
    };
    const onMouseUp = () => setResizeStart(null);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizeStart]);

  function getSortMarker(column: string): string {
    if (!sort || sort.key !== column) return '';
    return sort.direction === 'asc' ? ' ▲' : ' ▼';
  }

  function splitBudgetItem(value: unknown): { number: string; description: string } {
    const text = String(value ?? '').trim();
    const separatorIndex = text.indexOf('.');
    if (separatorIndex === -1) return { number: text, description: '' };
    return {
      number: text.slice(0, separatorIndex).trim(),
      description: text.slice(separatorIndex + 1).trim(),
    };
  }

  function getColumnWidth(column: string): number {
    return columnWidths[column] ?? DEFAULT_COLUMN_WIDTHS[column] ?? DEFAULT_COLUMN_WIDTH;
  }

  const tableWidth = visibleMainColumns.reduce(
    (total, column) => total + getColumnWidth(column),
    ACTIONS_COLUMN_WIDTH + NOTES_COLUMN_WIDTH
  );
  const headerGroups: Array<{ title: string; columns: string[]; subTitles?: string[] }> = [
    { title: 'СТАТЬИ', columns: ['Статья бюджета УС', 'Статья бюджета'] },
    { title: 'БДР25', columns: ['Кол-во', 'Лимит'], subTitles: ['КОЛ.', 'Сумма'] },
    { title: 'БДР25корр', columns: ['Кол-во БДР25корр', 'БДР25корр'], subTitles: ['КОЛ.', 'Сумма'] },
    { title: 'БДР26', columns: ['Кол-во БДР26', 'БДР26'], subTitles: ['КОЛ.', 'Сумма'] },
    { title: 'БДР26корр', columns: ['Кол-во БДР26корр', 'БДР26корр'], subTitles: ['КОЛ.', 'Сумма'] },
    { title: 'БДР27', columns: ['Кол-во БДР27', 'БДР27'], subTitles: ['КОЛ.', 'Сумма'] },
  ].filter((group) => {
    const firstIndex = visibleMainColumns.indexOf(group.columns[0]);
    return firstIndex !== -1 && group.columns.every((column, index) => visibleMainColumns[firstIndex + index] === column);
  });
  const groupedColumns = new Set(headerGroups.flatMap((group) => group.columns));
  const groupByFirstColumn = new Map(headerGroups.map((group) => [group.columns[0], group]));
  const groupByColumn = new Map(headerGroups.flatMap((group) => group.columns.map((column, index) => [
    column,
    { group, index },
  ] as const)));

  function renderColumnHeader(col: string, index: number, rowSpan?: number, titleOverride?: string) {
    const isLimitColumn = col === 'Лимит';
    const displayName = titleOverride ?? COLUMN_TITLES[col] ?? col;
    const previousColumn = visibleMainColumns[index - 1];
    const sourceColumn = PREVIOUS_BDR_AMOUNT_COLUMN[col] ?? previousColumn;
    const width = getColumnWidth(col);
    const pairedColumn = groupByColumn.get(col);
    const pairEdgeClass = pairedColumn
      ? `${pairedColumn.index === 0 ? ' budget-pair-start' : ''}${pairedColumn.index === pairedColumn.group.columns.length - 1 ? ' budget-pair-end' : ''}`
      : '';

    return (
      <th
        key={col}
        className={`budget-resizable-header${col.startsWith('Кол-во') ? ' budget-quantity-header' : ''}${pairEdgeClass}`}
        rowSpan={rowSpan}
        style={{ width, minWidth: width, maxWidth: width }}
      >
        <div className="budget-main-header-content">
          <button
            type="button"
            className="table-sort-button budget-main-header-title"
            onClick={() => onToggleSort(col)}
          >
            {displayName}{getSortMarker(col)}
          </button>
          {col === 'GN_bdr_ID' ? (
            <span className="budget-limit-header-total">{filteredData.length}</span>
          ) : (isLimitColumn || EXTRA_NUMERIC_COLUMNS.has(col)) && (
            <span className="budget-limit-header-total">
              {FINANCIAL_NUMBER_FORMATTER.format(isLimitColumn ? filteredLimitTotal : filteredNumericTotals[col] ?? 0)}
            </span>
          )}
          <div className="budget-main-header-controls">
            {EXTRA_NUMERIC_COLUMNS.has(col) && sourceColumn && (
              <button
                type="button"
                className="budget-copy-button"
                title={`Скопировать значения из столбца «${COLUMN_TITLES[sourceColumn] ?? sourceColumn}»`}
                aria-label={`Скопировать значения из столбца ${COLUMN_TITLES[sourceColumn] ?? sourceColumn}`}
                onClick={() => void onCopyPreviousColumn(col, sourceColumn)}
              >С</button>
            )}
            {col !== 'GN_bdr_ID' && (
              <input
                className="column-filter-input"
                type="text"
                value={filters[col] ?? ''}
                onChange={(event) => onSetFilter(col, event.target.value)}
                placeholder={
                  col === 'Статья бюджета УС' ||
                  col === 'Статья бюджета' ||
                  col === 'Кол-во' ||
                  col === 'Лимит' ||
                  col.startsWith('Кол-во БДР') ||
                  EXTRA_NUMERIC_COLUMNS.has(col)
                    ? ''
                    : 'Фильтр...'
                }
              />
            )}
          </div>
        </div>
        <span
          className="budget-column-resizer"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(event) => {
            event.preventDefault();
            setResizeStart({ column: col, startX: event.clientX, width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? 120 });
          }}
        />
      </th>
    );
  }

  return (
    <div className="guide-table-wrap budget-main-table-wrap">
      <table
        className="guide-table table-compact budget-main-table"
        style={{ width: tableWidth, minWidth: tableWidth, tableLayout: 'fixed' }}
      >
        <thead>
          <tr className={headerGroups.length > 0 ? 'budget-main-group-row' : 'budget-main-column-row'}>
            {headerGroups.length > 0
              ? visibleMainColumns.map((col, index) => {
                const group = groupByFirstColumn.get(col);
                if (group) {
                  const groupWidth = group.columns.reduce((width, column) => width + getColumnWidth(column), 0);
                  return (
                    <th
                      key={`budget-group-${col}`}
                      className="budget-main-group-title budget-pair-group budget-pair-start budget-pair-end"
                      scope="colgroup"
                      colSpan={group.columns.length}
                      style={{ width: groupWidth, minWidth: groupWidth, maxWidth: groupWidth }}
                    >
                      {group.title}
                    </th>
                  );
                }
                if (groupedColumns.has(col)) return null;
                return renderColumnHeader(col, index, 2);
              })
              : visibleMainColumns.map((col, index) => renderColumnHeader(col, index))}
            <th
              rowSpan={headerGroups.length > 0 ? 2 : undefined}
              style={{ width: ACTIONS_COLUMN_WIDTH, minWidth: ACTIONS_COLUMN_WIDTH, maxWidth: ACTIONS_COLUMN_WIDTH }}
            >
              <div className="budget-main-header-content">
                <span className="budget-main-header-title">Действия</span>
                <button type="button" className="budget-copy-button" onClick={onAddRow}>
                  Добавить строку
                </button>
              </div>
            </th>
            <th
              rowSpan={headerGroups.length > 0 ? 2 : undefined}
              style={{ width: NOTES_COLUMN_WIDTH, minWidth: NOTES_COLUMN_WIDTH, maxWidth: NOTES_COLUMN_WIDTH }}
            >
              <span className="budget-main-header-title">Примечание</span>
            </th>
          </tr>
          {headerGroups.length > 0 && (
            <tr className="budget-main-column-row">
              {visibleMainColumns.map((col, index) => {
                const group = headerGroups.find((headerGroup) => headerGroup.columns.includes(col));
                if (!group) return null;
                const subTitle = group.subTitles?.[group.columns.indexOf(col)];
                return renderColumnHeader(col, index, undefined, subTitle);
              })}
            </tr>
          )}
        </thead>
        <tbody>
          {filteredData.map((row, i) => {
            const rowId = Number(row['GN_bdr_ID']);
            const isEditing = editingRowId === rowId;

            return (
              <tr key={i} className={isEditing ? 'editing' : ''}>
                {visibleMainColumns.map((col) => (
                  <td
                    key={col}
                    className={groupByColumn.has(col)
                      ? `${groupByColumn.get(col)?.index === 0 ? 'budget-pair-start ' : ''}${groupByColumn.get(col)?.index === (groupByColumn.get(col)?.group.columns.length ?? 0) - 1 ? 'budget-pair-end' : ''}`.trim()
                      : undefined}
                    style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col), maxWidth: getColumnWidth(col) }}
                  >
                    {isEditing && col !== 'GN_bdr_ID' && LOCKED_EDIT_COLUMNS.has(col) ? (
                      String(draft[col] ?? '')
                    ) : isEditing && col !== 'GN_bdr_ID' && BDR_SELECT_CONFIG[col] ? (
                      (() => {
                        const options = onGetSelectOptions(col);
                        const needsDepartment = col === 'Объект';
                        const needsContractor = col === 'Договор';
                        const disabled =
                          (needsDepartment && !draft['Подразделение']) ||
                          (needsContractor && !draft['Контрагент']);

                        return (
                          <select
                            className="budget-main-table-edit-field"
                            value={String(draft[col] ?? '')}
                            onChange={(event) => onUpdateDraft(col, event.target.value)}
                            disabled={disabled}
                          >
                            <option value="">
                              {needsDepartment && !draft['Подразделение']
                                ? 'Сначала выберите Подразделение'
                                : needsContractor && !draft['Контрагент']
                                  ? 'Сначала выберите Контрагента'
                                  : 'Выберите значение'}
                            </option>
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        );
                      })()
                    ) : isEditing && col !== 'GN_bdr_ID' && (
                      col === 'Кол-во' || col === 'Лимит' || col.startsWith('Кол-во БДР') || EXTRA_NUMERIC_COLUMNS.has(col)
                    ) ? (
                      <input
                        className="budget-main-table-edit-field"
                        type="number"
                        step={col === 'Кол-во' || col.startsWith('Кол-во БДР') ? 'any' : '0.01'}
                        value={String(draft[col] ?? '')}
                        onChange={(event) => onUpdateDraft(col, event.target.value)}
                        placeholder="необязательно"
                      />
                    ) : isEditing && col !== 'GN_bdr_ID' ? (
                      <input
                        className="budget-main-table-edit-field"
                        value={String(draft[col] ?? '')}
                        onChange={(event) => onUpdateDraft(col, event.target.value)}
                      />
                    ) : !isEditing && col === 'Объект' && String(row[col] ?? '').trim() !== '' ? (
                      <button
                        type="button"
                        className="contract-cell-button"
                        onClick={() => onOpenObject(rowId)}
                      >
                        {String(row[col] ?? '')}
                      </button>
                    ) : !isEditing && col === 'Подразделение' && String(row[col] ?? '').trim() !== '' ? (
                      <button
                        type="button"
                        className="contract-cell-button"
                        onClick={() => onOpenDepartment(rowId)}
                      >
                        {String(row[col] ?? '')}
                      </button>
                    ) : !isEditing && col === 'Контрагент' && String(row[col] ?? '').trim() !== '' ? (
                      <button
                        type="button"
                        className="contract-cell-button"
                        onClick={() => onOpenContractor(rowId)}
                      >
                        {String(row[col] ?? '')}
                      </button>
                    ) : !isEditing && col === 'Договор' && String(row[col] ?? '').trim() !== '' ? (
                      <button
                        type="button"
                        className="contract-cell-button"
                        onClick={() => {
                          const contractName = String(row[col] ?? '');
                          const contractId = contractsLookup[contractName];
                          if (contractId) {
                            onOpenContract(contractId);
                          }
                        }}
                      >
                        {String(row[col] ?? '')}
                      </button>
                    ) : !isEditing && (col === 'Статья бюджета УС' || col === 'Статья бюджета') ? (
                      (() => {
                        const item = splitBudgetItem(row[col]);
                        return (
                          <span
                            className="budget-item-tooltip"
                            title={item.description || undefined}
                            aria-label={item.description ? `${item.number}. ${item.description}` : item.number}
                          >
                            {item.number}
                          </span>
                        );
                      })()
                    ) : (
                      onFormatCellValue(col, isEditing ? draft[col] : row[col])
                    )}
                  </td>
                ))}
                <td style={{ width: ACTIONS_COLUMN_WIDTH, minWidth: ACTIONS_COLUMN_WIDTH, maxWidth: ACTIONS_COLUMN_WIDTH }}>
                  {!isEditing ? (
                    <button type="button" className="budget-row-edit-button" onClick={() => onStartEdit(row)}>ИЗМ</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void onSaveEdit()} disabled={saving}>сохр</button>
                      <button type="button" onClick={onCancelEdit} disabled={saving}>отм</button>
                      <button type="button" className="budget-delete-button" onClick={() => void onDeleteEdit()} disabled={saving}>удалить</button>
                    </>
                  )}
                </td>
                <td style={{ width: NOTES_COLUMN_WIDTH, minWidth: NOTES_COLUMN_WIDTH, maxWidth: NOTES_COLUMN_WIDTH }}>
                  {isEditing ? (
                    <input
                      className="budget-main-table-edit-field budget-main-table-note-field"
                      value={String(draft['Примечания'] ?? '')}
                      onChange={(event) => onUpdateDraft('Примечания', event.target.value)}
                    />
                  ) : (
                    String(row['Примечания'] ?? '')
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {saveError && <p className="hint hint--error">Ошибка редактирования: {saveError}</p>}
    </div>
  );
}
