interface InputProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
}

export function Input({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
}: InputProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      />
    </div>
  )
}
