import { Maximize2, Minus, X } from 'lucide-react';

export function TitleBar() {
  const isElectron = Boolean(window.designxDesktop);

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span aria-hidden="true" className="titlebar__mark">
          DX
        </span>
        <span>DesignX</span>
      </div>
      {!isElectron ? (
        <div aria-hidden="true" className="titlebar__window-controls">
          <span>
            <Minus size={14} />
          </span>
          <span>
            <Maximize2 size={12} />
          </span>
          <span>
            <X size={14} />
          </span>
        </div>
      ) : null}
    </header>
  );
}
