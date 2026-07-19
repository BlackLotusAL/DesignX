import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { LoaderCircle } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  children,
  variant = 'secondary',
  loading = false,
  className = '',
  disabled,
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={`button button--${variant} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="button__spinner" size={15} /> : null}
      {children}
    </button>
  );
}
