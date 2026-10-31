import { describe, expect, it } from 'vitest';
import { analyze } from '../core/engine/analyze';
import { deltaToY, reduceNetwork, parallel } from '../core/engine/methods/reduce';
import { byLabel } from '../core/engine/mna';
import { mulberry32 } from '../core/engine/generate';
import { resistorEdges } from '../core/solutions/dc';
import { reqBetween, cascade, CUADERNO_CASCADA, currentDivider, escalera, material1150, materialDivisor, puenteNoBalanceado, voltageDivider, wheatstone } from '../sim/calc';
import { GENS } from '../sim/content';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('Simulador 3 — casos del cuaderno', () => {
  it('divisor en cascada: 28 V; 10 y 4 Ω; luego 2 y 4 Ω ⇒ V_ab = 8 V; V_bc = 5,33 V; P ≈ 7,1 W', () => {
    const r = cascade(CUADERNO_CASCADA.E, CUADERNO_CASCADA.stages, null, false);
    expect(rel(r.vout[0], 8)).toBeLessThan(1e-12);
    expect(rel(r.vout[1], 16 / 3)).toBeLessThan(1e-12);
    expect(Number(r.vout[1].toFixed(2))).toBe(5.33);
    expect(Number(r.P.toFixed(1))).toBe(7.1);
  });
  it('Δ → Y: 10, 65 y 25 Ω ⇒ 6,5; 2,5 y 16,25 Ω', () => {
    const y = deltaToY(10, 65, 25);
    expect([y.Rx, y.Ry, y.Rz].map((x) => Number(x.toFixed(10)))).toEqual([6.5, 2.5, 16.25]);
  });
  it('puente de 9 Ω: Δ de 9 Ω → Y de 3 Ω; 18 ∥ 27 ∥ 18 = 6,75 Ω', () => {
    expect(deltaToY(9, 9, 9).Rx).toBeCloseTo(3, 12);
    expect(rel(parallel(18, 27, 18), 6.75)).toBeLessThan(1e-12);
  });
});

describe('Simulador 3 — material U3 y herramientas', () => {
  it('divisor del material: V_ab = 2,14 V y V_R1 = 12,86 V', () => {
    const a = analyze(materialDivisor());
    expect(byLabel(a.dc!, 'R2')!.v).toBeCloseTo(2.14, 2);
    expect(byLabel(a.dc!, 'R1')!.v).toBeCloseTo(12.86, 2);
  });
  it('1 kΩ + 250 ∥ 500 ∥ 1500 = 1150 Ω por reducción', () => {
    const a = analyze(material1150());
    const s = a.net.elements.find((e) => e.kind === 'V')!;
    const red = reduceNetwork(resistorEdges(a), s.n1, s.n2);
    expect(rel(red.Req, 1150)).toBeLessThan(1e-12);
  });
  it('divisor de corriente del material: 0,32 A y 0,105 A', () => {
    const d = currentDivider(2, [100, 500, 1500]);
    expect(d.I[1]).toBeCloseTo(0.32, 2);
    expect(d.I[2]).toBeCloseTo(0.105, 3);
  });
  it('divisor de voltaje con n resistencias', () => {
    const d = voltageDivider(12, [1, 2, 3]);
    expect(d.V).toEqual([2, 4, 6]);
  });
  it('escalera: R_eq por reducción coincide con E/I del MNA', () => {
    const a = analyze(escalera());
    const s = a.net.elements.find((e) => e.kind === 'V')!;
    const red = reduceNetwork(resistorEdges(a), s.n1, s.n2);
    expect(red.ok).toBe(true);
    expect(rel(red.Req, s.value / -a.dc!.el.get(s.id)!.i)).toBeLessThan(1e-9);
  });
  it('red no reducible: propone Δ→Y y coincide con MNA', () => {
    const a = analyze(puenteNoBalanceado());
    const s = a.net.elements.find((e) => e.kind === 'V')!;
    const red = reduceNetwork(resistorEdges(a), s.n1, s.n2);
    expect(red.usedDeltaY).toBe(true);
    expect(red.proposal).toMatch(/triángulo/);
    expect(rel(red.Req, s.value / -a.dc!.el.get(s.id)!.i)).toBeLessThan(1e-9);
  });
  it('puente de Wheatstone balanceado: I_g = 0', () => {
    const w = wheatstone(10, 100, 200, 150, 300, 50);
    expect(w.balanced).toBe(true);
    expect(Math.abs(w.Ig)).toBeLessThan(1e-12);
    const w2 = wheatstone(12, 10, 20, 30, 40, 50);
    expect(w2.balanced).toBe(false);
    expect(Math.abs(w2.Ig)).toBeGreaterThan(1e-6);
  });
  it('efecto de carga reduce el voltaje de salida', () => {
    const ideal = cascade(28, CUADERNO_CASCADA.stages, null, false);
    const real = cascade(28, CUADERNO_CASCADA.stages, null, true);
    expect(real.vout[0]).toBeLessThan(ideal.vout[0]);
  });
  it('ejercicios generados con respuestas finitas', () => {
    const r = mulberry32(11);
    for (const g of GENS)
      for (const l of ['basico', 'intermedio', 'examen'] as const) {
        const ex = g.gen(r, l);
        for (const x of ex.answers) expect(isFinite(x.value)).toBe(true);
      }
  });
  it('revisión: R_eq entre terminales cortocircuita las fuentes de voltaje', () => {
    const a = analyze(escalera());
    const n2 = a.net.elements.find((e) => e.label === 'R2')!.n1;
    const r = reqBetween(a, n2, 0);
    expect(r.ok).toBe(true);
    expect(r.Req).toBeCloseTo(1, 12); // 2 ∥ 6 ∥ (1 + 4 ∥ 4)
  });
});
