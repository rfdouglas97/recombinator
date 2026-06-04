// Recombinator brand mark — rounded coral square with a "venn" glyph (two
// overlapping rings), lifted from the design handoff (brand-config.jsx).
interface Props {
  size?: number;
}

export function BrandMark({ size = 26 }: Props) {
  const r = 8; // Recombinator radius
  const cr = size * 0.21;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flex: '0 0 auto' }}
      aria-hidden="true"
    >
      <rect width={size} height={size} rx={r} fill="var(--accent)" />
      <g fill="none" stroke="var(--accent-ink)" strokeWidth={size * 0.085}>
        <circle cx={size * 0.4} cy={size * 0.5} r={cr} />
        <circle cx={size * 0.6} cy={size * 0.5} r={cr} />
      </g>
    </svg>
  );
}
