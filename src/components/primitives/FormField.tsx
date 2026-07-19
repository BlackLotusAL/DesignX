import type {
  InputHTMLAttributes,
  PropsWithChildren,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface FormFieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
}

export function FormField({
  label,
  hint,
  htmlFor,
  children,
}: PropsWithChildren<FormFieldProps>) {
  return (
    <label className="form-field" htmlFor={htmlFor}>
      <span className="form-field__label">
        {label}
        {hint ? <span>{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Select({
  className = '',
  children,
  ...props
}: PropsWithChildren<SelectHTMLAttributes<HTMLSelectElement>>) {
  return (
    <select className={`select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`} {...props} />;
}
