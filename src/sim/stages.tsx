import React, { useEffect, useState } from 'react';
import { Analysis } from '../core/engine/analyze';
import { REdge, ReduceResult } from '../core/engine/methods/reduce';
import { fmtEng } from '../core/engine/units';
import { Tex, usePalette } from '../core/ui/basic';
import { U } from '../core/ui/symbols';

/** Posición de cada nodo (centroide de sus puntos de grilla) */
export function nodePositions(a: Analysis): Map<number, { x: number; y: number }> {
  const m = new Map<number, { x: number; y: number }>();
  a.net.nodePoints.forEach((pts, n) => {
    if (!pts.length) return;
    m.set(n, { x: (pts.reduce((s, p) => s + p.x, 0) / pts.length) * U, y: (pts.reduce((s, p) => s + p.y, 0) / pts.length) * U });
  });
  return m;
}

function zig(x1: number, y1: number, x2: number, y2: number, bend: number) {
  // resistencia dibujada entre dos puntos (con curvatura para paralelos)
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  return { path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, lx: mx + nx * (bend * 0.55), ly: my + ny * (bend * 0.55) };
}

export function StageDrawing({ edges, pos, s, t, highlight = [], height = 220 }: { edges: REdge[]; pos: Map<number, { x: number; y: number }>; s: number; t: number; highlight?: string[]; height?: number }) {
  const pal = usePalette();
  const ps = [...new Set(edges.flatMap((e) => [e.a, e.b]).concat([s, t]))].map((n) => ({ n, p: pos.get(n) ?? { x: 0, y: 0 } }));
  if (!ps.length) return null;
  const xs = ps.map((q) => q.p.x);
  const ys = ps.map((q) => q.p.y);
  const pad = 50;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`;
  const pairCount = new Map<string, number>();
  return (
    <svg viewBox={vb} style={{ width: '100%', height, background: pal.bg, border: '1px solid var(--border)', borderRadius: 8 }} role="img" aria-label="etapa de reducción">
      {edges.map((e) => {
        const p1 = pos.get(e.a) ?? { x: 0, y: 0 };
        const p2 = pos.get(e.b) ?? { x: 0, y: 0 };
        const k = [Math.min(e.a, e.b), Math.max(e.a, e.b)].join('-');
        const c = pairCount.get(k) ?? 0;
        pairCount.set(k, c + 1);
        const bend = c === 0 ? 0 : (c % 2 ? 1 : -1) * 40 * Math.ceil(c / 2);
        const z = zig(p1.x, p1.y, p2.x, p2.y, bend);
        const hi = highlight.includes(e.name);
        return (
          <g key={e.id}>
            <path d={z.path} stroke={hi ? pal.sel : pal.el} strokeWidth={hi ? 4 : 2.5} fill="none" />
            <rect x={z.lx - 30} y={z.ly - 11} width={60} height={22} rx={5} fill={pal.bg} stroke={hi ? pal.sel : pal.muted} />
            <text x={z.lx} y={z.ly + 4} fontSize={10.5} textAnchor="middle" fill={hi ? pal.sel : pal.text}>
              {fmtEng(e.R, 'Ω', 4)}
            </text>
            <text x={z.lx} y={z.ly - 15} fontSize={10} textAnchor="middle" fill={pal.muted}>
              {e.name.replace(/[{}_\\]/g, '')}
            </text>
          </g>
        );
      })}
      {ps.map(({ n, p }) => (
        <g key={n}>
          <circle cx={p.x} cy={p.y} r={n === s || n === t ? 7 : 4} fill={n === s || n === t ? pal.accent : pal.node} />
          {(n === s || n === t) && (
            <text x={p.x + 9} y={p.y - 8} fontSize={12} fontWeight={700} fill={pal.accent}>
              {n === s ? 'A' : 'B'}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function ReductionAnimation({ red, pos, s, t }: { red: ReduceResult; pos: Map<number, { x: number; y: number }>; s: number; t: number }) {
  const [k, setK] = useState(0); // 0 = original
  const [play, setPlay] = useState(false);
  const n = red.steps.length;
  useEffect(() => setK(0), [red]);
  useEffect(() => {
    if (!play) return;
    const id = setInterval(() => setK((x) => (x >= n ? (setPlay(false), n) : x + 1)), 1400);
    return () => clearInterval(id);
  }, [play, n]);
  // centros de estrella: ubicar en el centroide de sus vecinos
  const p2 = new Map(pos);
  for (const st of red.steps)
    if (st.newNode !== undefined && !p2.has(st.newNode)) {
      const nb = st.edges.filter((e) => e.a === st.newNode || e.b === st.newNode).map((e) => (e.a === st.newNode ? e.b : e.a));
      const pts = nb.map((x) => p2.get(x)).filter(Boolean) as { x: number; y: number }[];
      p2.set(st.newNode, { x: pts.reduce((a, b) => a + b.x, 0) / (pts.length || 1), y: pts.reduce((a, b) => a + b.y, 0) / (pts.length || 1) });
    }
  const edges = k === 0 ? red.initial : red.steps[k - 1].edges;
  const cur = k > 0 ? red.steps[k - 1] : null;
  const next = k < n ? red.steps[k] : null;
  return (
    <div>
      <div className="row">
        <button onClick={() => setK(0)}>⏮ Original</button>
        <button onClick={() => setK(Math.max(0, k - 1))} disabled={k === 0}>
          ◀
        </button>
        <span className="small">
          Etapa {k}/{n} {k === 0 ? '(circuito original)' : k === n ? '(reducido)' : ''}
        </span>
        <button onClick={() => setK(Math.min(n, k + 1))} disabled={k === n}>
          ▶
        </button>
        <button onClick={() => { setK(0); setPlay(true); }}>▶ Animar</button>
      </div>
      <StageDrawing edges={edges} pos={p2} s={s} t={t} highlight={[...(cur?.outputs ?? []), ...(next?.inputs ?? [])]} />
      {cur && (
        <div className="card">
          <b>{cur.kind === 'serie' ? 'Serie' : cur.kind === 'paralelo' ? 'Paralelo' : cur.kind === 'Δ→Y' ? 'Triángulo → estrella' : 'Se elimina'}:</b> {cur.text}
          <Tex tex={cur.tex} block />
        </div>
      )}
      {next && <p className="hint">Siguiente: {next.text}</p>}
    </div>
  );
}
