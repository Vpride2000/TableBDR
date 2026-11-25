type EquipmentOptionPickerProps = {
  label: string
  value: unknown
  options: string[]
  onChange: (value: string) => void
  wide?: boolean
}

export default function EquipmentOptionPicker({ label, value, options, onChange, wide = false }: EquipmentOptionPickerProps): React.ReactElement {
  return (
    <div className={wide ? 'equipment-group-picker equipment-group-picker--wide' : 'equipment-group-picker'} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={String(value ?? '') === option ? 'equipment-group-picker__option equipment-group-picker__option--active' : 'equipment-group-picker__option'}
          aria-pressed={String(value ?? '') === option}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
