import { useState } from 'react'

type SelectOption = { value: string; label: string }

export default function PrimarySearchableSelect({
  label,
  value,
  options,
  onChange,
  multiple = false,
  disabled = false,
  searchable = true,
  placeholder = 'Выберите значение',
}: {
  label: string
  value: string | string[]
  options: SelectOption[]
  onChange: (value: string | string[]) => void
  multiple?: boolean
  disabled?: boolean
  searchable?: boolean
  placeholder?: string
}): React.ReactElement {
  const [search, setSearch] = useState('')
  const sortedOptions = [...options].sort((left, right) => left.label.localeCompare(right.label, 'ru', { numeric: true, sensitivity: 'base' }))
  const filteredOptions = searchable
    ? sortedOptions.filter((option) => option.label.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
    : sortedOptions
  const selectedValues = Array.isArray(value) ? value : [value]
  const selectedOptions = sortedOptions.filter((option) => selectedValues.includes(option.value) && !filteredOptions.includes(option))

  return (
    <div className="primary-table__select-resizable">
      {searchable && (
        <input
          type="search"
          className="primary-table__select-search"
          aria-label={`Поиск: ${label}`}
          placeholder="Поиск..."
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}
      <select
        aria-label={label}
        multiple={multiple}
        size={multiple ? Math.min(5, Math.max(2, filteredOptions.length + 1)) : undefined}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          if (!multiple) {
            onChange(event.target.value)
            setSearch('')
            return
          }
          const visibleSelected = [...event.target.selectedOptions].map((option) => option.value)
          onChange([...new Set([...selectedValues.filter((selected) => selectedOptions.some((option) => option.value === selected)), ...visibleSelected])])
        }}
      >
        {!multiple && <option value="">{placeholder}</option>}
        {selectedOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        {filteredOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}
