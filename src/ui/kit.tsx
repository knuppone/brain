import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="bullets">
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  );
}

export function Callout({ kind = 'note', label, children }: { kind?: 'fact' | 'warn' | 'note'; label: string; children: ReactNode }) {
  return (
    <div className={`callout ${kind}`}>
      <b className="k">{label}</b>
      {children}
    </div>
  );
}

export function Header({ eyebrow, color, title, lede, onBack, backLabel }: {
  eyebrow: string; color?: string; title: string; lede?: string; onBack?: () => void; backLabel?: string;
}) {
  return (
    <>
      {onBack && (
        <button className="back" onClick={onBack}>‹ {backLabel ?? 'Back'}</button>
      )}
      <div className="eyebrow">
        {color && <span className="swatch" style={{ background: color }} />}
        {eyebrow}
      </div>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </>
  );
}

export function Chip({ label, color, on, onClick }: { label: string; color?: string; on?: boolean; onClick?: () => void }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} onClick={onClick}>
      {color && <i style={{ background: color }} />}
      {label}
    </button>
  );
}

export function Row({ title, sub, color, on, onClick, trailing }: {
  title: string; sub?: string; color?: string; on?: boolean; onClick?: () => void; trailing?: ReactNode;
}) {
  return (
    <button className={`row ${on ? 'on' : ''}`} onClick={onClick}>
      <i style={{ background: color ?? 'transparent' }} />
      <span>
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="go">{trailing ?? '›'}</span>
    </button>
  );
}

export function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, format }: {
  label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="ctl">
      {label}
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {format && <span className="v">{format(value)}</span>}
    </label>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="sw" />
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="ctl">
      {label}
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? 'on' : ''}
            onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Divider() {
  return <span className="divider" />;
}

/** "go deeper" call to action at the bottom of a panel */
export function DiveCTA({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button className="cta" onClick={onClick}>
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
      <span className="arrow">↘</span>
    </button>
  );
}

export function Meter({ label, value, color, text }: { label: string; value: number; color: string; text?: string }) {
  return (
    <div className="meter-row">
      <span>{label}</span>
      <span className="track"><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} /></span>
      <span className="val">{text ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}
