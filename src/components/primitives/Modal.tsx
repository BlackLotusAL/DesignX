import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  size?: 'small' | 'medium' | 'large';
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({
  open,
  title,
  description,
  size = 'medium',
  footer,
  onClose,
  children,
}: PropsWithChildren<ModalProps>) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      aria-hidden={false}
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby={description ? 'modal-description' : undefined}
        aria-modal="true"
        className={`modal modal--${size}`}
        role="dialog"
      >
        <header className="modal__header">
          <div>
            <h2>{title}</h2>
            {description ? <p id="modal-description">{description}</p> : null}
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
