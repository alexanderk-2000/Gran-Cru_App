import { memo } from 'react';

export const FormField = memo(function FormField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-stone-700">
      {label}
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
      />
    </label>
  );
});
