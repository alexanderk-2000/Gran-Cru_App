interface FilterSelectProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
}

export const FilterSelect = <T extends string>({ label, value, onChange, options }: FilterSelectProps<T>) => (
  <select
    aria-label={label}
    value={value}
    onChange={(e) => onChange(e.target.value as T)}
    className="min-w-0 flex-1 px-4 sm:px-6 py-3.5 bg-alabaster border-2 border-transparent rounded-[1.25rem] text-xs font-black text-charcoal focus:outline-none appearance-none hover:border-burgundy/10"
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
