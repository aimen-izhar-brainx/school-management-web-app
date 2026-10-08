interface SelectProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}

export function Select({ id, label, value, onChange, options }: SelectProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      >
        <option value="">Select&hellip;</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  )
}
