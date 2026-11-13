// Single-series magnitude: one hue, sorted, value labelled at the bar end. Plain HTML, so it
// renders on the server and reads well with assistive tech (it is a list of label/value pairs).
export function CategoryBars({ items, label }: { items: { label: string; count: number }[]; label: string }) {
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="bars" aria-label={label}>
      {items.map((item) => (
        <li key={item.label} className="bars__row" title={`${item.label}: ${item.count}`}>
          <span className="bars__label">{item.label}</span>
          <span className="bars__track">
            <span className="bars__fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="bars__value">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}
