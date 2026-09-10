import React, { useMemo, useState } from 'react'
import {
  TKO_CLASSIFICATIONS,
  TkoSummaryRow,
  TkoSummarySortDirection,
  TkoSummarySortKey,
  buildSummaryByField,
  sortSummaryRows,
} from './tkoSummary'

type Row = Record<string, unknown>;

interface Props {
  data: Row[];
}

const EMPTY_VALUE_LABEL = '— (не указано)';
const KEY_SEPARATOR = '::';
const GROUP_CODE_FIELD = 'Укрупненный код ТКО';

function formatSummaryNumber(value: number): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function rowMatchesField(row: Row, field: string, expected: string): boolean {
  const rawValue = String(row[field] ?? '').trim();
  return (rawValue || EMPTY_VALUE_LABEL) === expected;
}

function rowMatchesCumulativeYear(row: Row, expectedYear: string): boolean {
  const rowYear = String(row['Год'] ?? '').trim();
  if (!rowYear) return true;
  const parsedRowYear = Number(rowYear);
  const parsedExpectedYear = Number(expectedYear);
  return Number.isFinite(parsedRowYear) && Number.isFinite(parsedExpectedYear) && parsedRowYear <= parsedExpectedYear;
}

// Укрупненный код ТКО — первые три блока цифр «Кода ТКО» до точек (например, «26.20.13» из «26.20.13.110»).
function deriveGroupCode(codeValue: unknown): string {
  const raw = String(codeValue ?? '').trim();
  if (!raw) return '';
  const blocks = raw.split('.').filter(Boolean);
  return blocks.slice(0, 3).join('.');
}

// Сводная таблица с уровнями: Год → Укрупненный код ТКО → Код ТКО → Подразделение → Тип → Наименование ТКО.
// Уровни свернуты по умолчанию; дочерние сводки вычисляются лениво при разворачивании.
// Чек-бокс «Убрать код ТКО» убирает сразу два уровня — укрупненный код и сам код ТКО;
// «Скрыть год» и «Скрыть подразделение» убирают соответствующие уровни.
export default function ImportSubstitutionSummaryTable({ data }: Props): React.ReactElement | null {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [hideCodeLevel, setHideCodeLevel] = useState(true);
  const [hideYearLevel, setHideYearLevel] = useState(false);
  const [hideDepartmentLevel, setHideDepartmentLevel] = useState(false);
  const [summarySort, setSummarySort] = useState<{ key: TkoSummarySortKey; direction: TkoSummarySortDirection }>({
    key: 'code',
    direction: 'asc',
  });

  const levels = useMemo(() => {
    const result: string[] = [];
    if (!hideYearLevel) result.push('Год');
    if (!hideCodeLevel) result.push(GROUP_CODE_FIELD, 'Код ТКО');
    if (!hideDepartmentLevel) result.push('Подразделение');
    result.push('Тип', 'Наименование ТКО');
    return result;
  }, [hideCodeLevel, hideYearLevel, hideDepartmentLevel]);

  // Данные с добавленным вычисляемым полем укрупненного кода ТКО для группировки верхнего уровня.
  const augmentedData = useMemo(
    () => data.map((row) => ({ ...row, [GROUP_CODE_FIELD]: deriveGroupCode(row['Код ТКО']) })),
    [data]
  );

  const topField = levels[0];
  const topRows = useMemo(
    () => buildSummaryByField(augmentedData, topField, EMPTY_VALUE_LABEL, topField === 'Год'),
    [augmentedData, topField]
  );

  // Итоги по всей таблице: суммы по классификациям и общий процент «РФ в реестре».
  const grandTotal = useMemo(() => {
    const quantities: Record<(typeof TKO_CLASSIFICATIONS)[number], number> = {
      'РФ НЕ в реестре': 0,
      'Импорт': 0,
      'РФ в реестре': 0,
    };
    let withdrawnImportedTko = 0;
    topRows.forEach((summaryRow) => {
      TKO_CLASSIFICATIONS.forEach((classification) => {
        quantities[classification] += summaryRow.quantities[classification];
      });
      withdrawnImportedTko += summaryRow.withdrawnImportedTko;
    });
    const total = TKO_CLASSIFICATIONS.reduce((sum, classification) => sum + quantities[classification], 0);
    const adjustedTotal = total - withdrawnImportedTko;
    const registryPercentage = adjustedTotal === 0 ? 0 : (quantities['РФ в реестре'] / adjustedTotal) * 100;
    return { quantities, total, withdrawnImportedTko, registryPercentage };
  }, [topRows]);

  // Ленивый расчет дочерних сводок: вычисляются только для развернутых узлов.
  const childRowsByKey = useMemo(() => {
    const result = new Map<string, TkoSummaryRow[]>();
    expandedKeys.forEach((key) => {
      const parts = key.split(KEY_SEPARATOR);
      const levelIndex = parts.length - 1;
      if (levelIndex >= levels.length - 1) return;
      const filtered = augmentedData.filter((row) =>
        parts.every((part, i) => levels[i] === 'Год'
          ? rowMatchesCumulativeYear(row, part)
          : rowMatchesField(row, levels[i], part))
      );
      const nextField = levels[levelIndex + 1];
      result.set(key, buildSummaryByField(filtered, nextField, EMPTY_VALUE_LABEL, nextField === 'Год'));
    });
    return result;
  }, [augmentedData, expandedKeys, levels]);

  function toggleNode(key: string): void {
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleHideCodeLevel(checked: boolean): void {
    setHideCodeLevel(checked);
    setExpandedKeys(new Set());
  }

  function toggleHideYearLevel(checked: boolean): void {
    setHideYearLevel(checked);
    setExpandedKeys(new Set());
  }

  function toggleHideDepartmentLevel(checked: boolean): void {
    setHideDepartmentLevel(checked);
    setExpandedKeys(new Set());
  }

  function toggleSort(key: TkoSummarySortKey): void {
    setSummarySort((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return { key, direction: 'asc' };
    });
  }

  function renderQuantityCells(summaryRow: TkoSummaryRow): React.ReactElement {
    return (
      <>
        {TKO_CLASSIFICATIONS.map((classification) => (
          <td
            key={classification}
            className={classification === 'РФ в реестре' ? 'summary-cell--registry' : undefined}
          >
            {formatSummaryNumber(summaryRow.quantities[classification])}
          </td>
        ))}
        <td>{formatSummaryNumber(summaryRow.total)}</td>
        <td>{formatSummaryNumber(summaryRow.withdrawnImportedTko)}</td>
        <td className="summary-cell--registry">{formatSummaryNumber(summaryRow.registryPercentage)}%</td>
      </>
    );
  }

  // Рекурсивный рендер уровней иерархии; дочерние строки появляются только у развернутых узлов.
  function renderLevelRows(summaryRows: TkoSummaryRow[], levelIndex: number, parentKey: string): React.ReactNode {
    const isLastLevel = levelIndex === levels.length - 1;
    const sortedRows = sortSummaryRows(summaryRows, summarySort.key, summarySort.direction);

    return sortedRows.map((summaryRow) => {
      const nodeKey = parentKey ? `${parentKey}${KEY_SEPARATOR}${summaryRow.code}` : summaryRow.code;
      const isExpanded = expandedKeys.has(nodeKey);
      return (
        <React.Fragment key={nodeKey}>
          <tr className={levelIndex > 0 ? `summary-row--level-${levelIndex + 1}` : undefined}>
            <td>
              {!isLastLevel && (
                <button
                  type="button"
                  className="summary-expand-btn"
                  aria-label={isExpanded ? `Свернуть ${summaryRow.code}` : `Развернуть ${summaryRow.code}`}
                  onClick={() => toggleNode(nodeKey)}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              )}
              {summaryRow.code}
            </td>
            <td className="summary-cell--vendors">{isLastLevel ? summaryRow.vendors.join(', ') : ''}</td>
            <td className="summary-cell--departments">{summaryRow.departments.join(', ')}</td>
            {renderQuantityCells(summaryRow)}
          </tr>
          {!isLastLevel && isExpanded && renderLevelRows(childRowsByKey.get(nodeKey) ?? [], levelIndex + 1, nodeKey)}
        </React.Fragment>
      );
    });
  }

  if (topRows.length === 0) return null;

  return (
    <div>
      <label className="form-checkbox" style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <input
          type="checkbox"
          checked={hideCodeLevel}
          onChange={(event) => toggleHideCodeLevel(event.target.checked)}
        />
        Убрать код ТКО
      </label>
      <label className="form-checkbox" style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <input
          type="checkbox"
          checked={hideYearLevel}
          onChange={(event) => toggleHideYearLevel(event.target.checked)}
        />
        Скрыть год (с накопленным итогом)
      </label>
      <label className="form-checkbox" style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <input
          type="checkbox"
          checked={hideDepartmentLevel}
          onChange={(event) => toggleHideDepartmentLevel(event.target.checked)}
        />
        Скрыть подразделение
      </label>
      <div className="guide-table-wrap" style={{ marginBottom: '8px', maxWidth: '1100px' }}>
      <table className="guide-table table-compact">
        <thead>
          <tr>
            <th onClick={() => toggleSort('code')} style={{ cursor: 'pointer' }}>
              {levels.join(' / ')}
              {summarySort.key === 'code' ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
            <th onClick={() => toggleSort('vendors')} style={{ cursor: 'pointer' }}>
              Вендор ТКО
              {summarySort.key === 'vendors' ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
            <th onClick={() => toggleSort('departments')} style={{ cursor: 'pointer' }}>
              Подразделение
              {summarySort.key === 'departments' ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
            {TKO_CLASSIFICATIONS.map((classification) => (
              <th
                key={classification}
                className={classification === 'РФ в реестре' ? 'summary-cell--registry' : undefined}
                onClick={() => toggleSort(classification)}
                style={{ cursor: 'pointer' }}
              >
                {classification}
                {summarySort.key === classification ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
            <th onClick={() => toggleSort('total')} style={{ cursor: 'pointer' }}>
              Итого количество
              {summarySort.key === 'total' ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
            <th onClick={() => toggleSort('withdrawnImportedTko')} style={{ cursor: 'pointer' }}>
              Кол-во выводенного импортного ТКО
              {summarySort.key === 'withdrawnImportedTko' ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
            <th className="summary-cell--registry" onClick={() => toggleSort('registryPercentage')} style={{ cursor: 'pointer' }}>
              РФ в реестре, %
              {summarySort.key === 'registryPercentage' ? (summarySort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {renderLevelRows(topRows, 0, '')}
          <tr className="summary-row--total">
            <td>ИТОГО</td>
            <td />
            <td />
            {TKO_CLASSIFICATIONS.map((classification) => (
              <td
                key={classification}
                className={classification === 'РФ в реестре' ? 'summary-cell--registry' : undefined}
              >
                {formatSummaryNumber(grandTotal.quantities[classification])}
              </td>
            ))}
            <td>{formatSummaryNumber(grandTotal.total)}</td>
            <td>{formatSummaryNumber(grandTotal.withdrawnImportedTko)}</td>
            <td className="summary-cell--registry">{formatSummaryNumber(grandTotal.registryPercentage)}%</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  )
}
