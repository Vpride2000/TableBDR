import { useState } from 'react';

type Row = Record<string, unknown>;

interface MainBudgetTableContentProps {
  visibleMainColumns: string[];
  filteredData: Row[];
  filteredLimitTotal: number;
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
  onCancelEdit: () => void;
  onUpdateDraft: (column: string, value: string) => void;
  onGetSelectOptions: (column: string) => Array<{ value: string; label: string }>;
  onFormatCellValue: (column: string, value: unknown) => string;
  onOpenLimit: (rowId: number) => void;
  onOpenObject: (rowId: number) => void;
  onOpenDepartment: (rowId: number) => void;
  onOpenContractor: (rowId: number) => void;
  onOpenContract: (contractId: number) => void;
}

export default function MainBudgetTableContent({
  visibleMainColumns,
  filteredData,
  filteredLimitTotal,
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
  onCancelEdit,
  onUpdateDraft,
  onGetSelectOptions,
  onFormatCellValue,
  onOpenLimit,
  onOpenObject,
  onOpenDepartment,
  onOpenContractor,
  onOpenContract,
}: MainBudgetTableContentProps) {
  function getSortMarker(column: string): string {
    if (!sort || sort.key !== column) return '';
    return sort.direction === 'asc' ? ' ▲' : ' ▼';
  }

  function formatFinancialValue(value: unknown): string {
    const normalized = String(value ?? '').replace(/\s+/g, '').replace(',', '.');
    const parsed = Number(normalized);
    const numValue = Number.isNaN(parsed) ? 0 : parsed;
    return FINANCIAL_NUMBER_FORMATTER.format(numValue);
  }

  return (
    <div className="guide-table-wrap">
      <table className="guide-table table-compact">
        <thead>
          <tr>
            {visibleMainColumns.map((col) => {
              const isLimitColumn = col === 'Лимит';
              const displayName = COLUMN_TITLES[col] ?? col;

              return (
                <th key={col}>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => onToggleSort(col)}
                  >
                    <span className={isLimitColumn ? 'budget-limit-header' : undefined}>
                      {displayName}
                      {isLimitColumn && (
                        <span className="budget-limit-header-total">
                          {FINANCIAL_NUMBER_FORMATTER.format(filteredLimitTotal)}
                        </span>
                      )}
                    </span>
                    {getSortMarker(col)}
                  </button>
                </th>
              );
            })}
            <th>Действия</th>
          </tr>
          <tr className="filter-row">
            {visibleMainColumns.map((col) => (
              <th key={col}>
                {col === 'GN_bdr_ID' ? null : (
                  <input
                    className="column-filter-input"
                    type="text"
                    value={filters[col] ?? ''}
                    onChange={(e) => onSetFilter(col, e.target.value)}
                    placeholder="Фильтр..."
                  />
                )}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {filteredData.map((row, i) => {
            const rowId = Number(row['GN_bdr_ID']);
            const isEditing = editingRowId === rowId;

            return (
              <tr key={i} className={isEditing ? 'editing' : ''}>
                {visibleMainColumns.map((col) => (
                  <td key={col}>
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
                    ) : isEditing && col !== 'GN_bdr_ID' && EXTRA_NUMERIC_COLUMNS.has(col) ? (
                      <input
                        type="number"
                        step="0.01"
                        value={String(draft[col] ?? '')}
                        onChange={(event) => onUpdateDraft(col, event.target.value)}
                        placeholder="необязательно"
                      />
                    ) : isEditing && col !== 'GN_bdr_ID' ? (
                      <input
                        value={String(draft[col] ?? '')}
                        onChange={(event) => onUpdateDraft(col, event.target.value)}
                      />
                    ) : !isEditing && col === 'Лимит' ? (
                      <button
                        type="button"
                        className="limit-cell-button"
                        onClick={() => onOpenLimit(rowId)}
                      >
                        {formatFinancialValue(row[col])}
                      </button>
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
                    ) : (
                      onFormatCellValue(col, isEditing ? draft[col] : row[col])
                    )}
                  </td>
                ))}
                <td>
                  {!isEditing ? (
                    <button type="button" onClick={() => onStartEdit(row)}>испр</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void onSaveEdit()} disabled={saving}>сохр</button>
                      <button type="button" onClick={onCancelEdit} disabled={saving}>отм</button>
                    </>
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
