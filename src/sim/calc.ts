// Cálculos propios del Simulador 3 (circuitos resistivos).
import { analyze } from '../core/engine/analyze';
import { cb } from '../core/engine/builder';
import { byLabel } from '../core/engine/mna';
import { Circuit } from '../core/engine/types';
import { Analysis } from '../core/engine/analyze';
import { reduceNetwork } from '../core/engine/methods/reduce';
import { resistorEdges } from '../core/solutions/dc';

/** R_eq entre dos nodos con las fuentes apagadas (V → corto, I → abierto) */
export function reqBetween(a: Analysis, s: number, t: number): ReturnType<typeof reduceNetwork> {
  const par = Array.from({ length: a.net.nodeCount }, (_, i) => i);
  const f = (x: number): number => (par[x] === x ? x : (par[x] = f(par[x])));
  // la fuente conectada justo entre los terminales es la que «mira» la red: se retira (no se cortocircuita)
  const between = (e: { n1: number; n2: number }) => (e.n1 === s && e.n2 === t) || (e.n1 === t && e.n2 === s);
  for (const e of a.net.elements) if ((e.kind === 'V' || e.kind === 'AM' || e.kind === 'VCVS' || e.kind === 'CCVS') && !between(e)) par[f(e.n1)] = f(e.n2);
  const edges = resistorEdges(a).map((e) => ({ ...e, a: f(e.a), b: f(e.b) }));
  if (f(s) === f(t)) return { ok: true, Req: 0, steps: [], initial: edges, usedDeltaY: false, message: 'Los terminales quedan unidos por una fuente de voltaje apagada (cortocircuito): R_eq = 0.' };
  return reduceNetwork(edges, f(s), f(t));
}

export function seriesR(R: number[]) {
  return R.reduce((a, b) => a + b, 0);
}
export function parallelR(R: number[]) {
  return 1 / R.reduce((a, b) => a + 1 / b, 0);
}

/** Divisor de voltaje con n resistencias en serie: V_k = R_k / ΣR · E */
export function voltageDivider(E: number, R: number[]) {
  const S = seriesR(R);
  return { S, I: E / S, V: R.map((r) => (r / S) * E) };
}

/** Divisor de corriente con n ramas en paralelo: I_k = G_k / ΣG · I (dos ramas: R_otra/(R1+R2)·I) */
export function currentDivider(I: number, R: number[]) {
  const G = R.map((r) => 1 / r);
  const sG = G.reduce((a, b) => a + b, 0);
  return { Req: 1 / sG, V: I / sG, I: G.map((g) => (g / sG) * I) };
}

export interface CascadeStage {
  Ra: number; // resistencia superior
  Rb: number; // resistencia inferior (de la que se toma la salida)
}
/**
 * Divisor en cascada. Si `loaded` = false cada etapa se alimenta con la salida ideal de la anterior
 * (sin efecto de carga, como en el cuaderno). Si `loaded` = true se resuelve el circuito real conectado.
 */
export function cascade(E: number, stages: CascadeStage[], RL: number | null, loaded: boolean) {
  if (!loaded) {
    const vin: number[] = [];
    const vout: number[] = [];
    let v = E;
    for (const st of stages) {
      vin.push(v);
      v = (st.Rb / (st.Ra + st.Rb)) * v;
      vout.push(v);
    }
    let vL = v;
    if (RL) {
      const last = stages[stages.length - 1];
      const Rp = parallelR([last.Rb, RL]);
      vL = (Rp / (last.Ra + Rp)) * vin[vin.length - 1];
    }
    return { vin, vout, vL, P: (vout[vout.length - 1] ** 2) / stages[stages.length - 1].Rb };
  }
  const c = cascadeCircuit(E, stages, RL);
  const a = analyze(c);
  const vout = stages.map((_, k) => a.dc!.el.get(`Rb${k}`)!.v);
  const vin = [E, ...vout.slice(0, -1)];
  return { vin, vout, vL: RL ? a.dc!.el.get('RL')!.v : vout[vout.length - 1], P: a.dc!.el.get(`Rb${stages.length - 1}`)!.p };
}

export function cascadeCircuit(E: number, stages: CascadeStage[], RL: number | null): Circuit {
  const b = cb();
  b.el('V', 'E', String(E), [0, 0], [0, 8]);
  let x = 0;
  stages.forEach((st, k) => {
    b.el('R', `R${2 * k + 1}`, String(st.Ra), [x, 0], [x + 8, 0], { id: `Ra${k}` });
    b.el('R', `R${2 * k + 2}`, String(st.Rb), [x + 8, 0], [x + 8, 8], { id: `Rb${k}` });
    x += 8;
  });
  if (RL) {
    b.wire([x, 0], [x + 8, 0]);
    b.el('R', 'RL', String(RL), [x + 8, 0], [x + 8, 8], { id: 'RL' });
    x += 8;
  }
  b.wire([0, 8], [x, 8]);
  b.gnd([0, 8]);
  return b.build();
}

export function voltageDividerCircuit(E: number, R: number[]): Circuit {
  const b = cb();
  const H = 4 * R.length + 4;
  b.el('V', 'E', String(E), [0, 0], [0, H]);
  b.wire([0, 0], [8, 0]);
  R.forEach((r, k) => b.el('R', `R${k + 1}`, String(r), [8, 4 * k], [8, 4 * k + 4]));
  b.wire([8, 4 * R.length], [8, H], [0, H]);
  b.gnd([0, H]);
  return b.build();
}
export function currentDividerCircuit(I: number, R: number[]): Circuit {
  const b = cb();
  b.el('I', 'Is', String(I), [0, 8], [0, 0]);
  R.forEach((r, k) => b.el('R', `R${k + 1}`, String(r), [8 * (k + 1), 0], [8 * (k + 1), 8]));
  b.wire([0, 0], [8 * R.length, 0]);
  b.wire([0, 8], [8 * R.length, 8]);
  b.gnd([0, 8]);
  return b.build();
}

export function wheatstone(E: number, R1: number, R2: number, R3: number, R4: number, Rg: number) {
  const c = bridgeCircuit(E, R1, R2, R3, R4, Rg);
  const a = analyze(c);
  const g = byLabel(a.dc!, 'Rg')!;
  const balanced = Math.abs(R1 * R4 - R2 * R3) <= 1e-12 * Math.max(R1 * R4, R2 * R3);
  return { a, Ig: g.i, Vg: g.v, balanced, Rx: (R2 * R3) / R1, Req: -E / byLabel(a.dc!, 'E')!.i };
}

/**
 * Puente en forma de rombo dibujado con tramos rectos:
 *   nodo superior (12,0); izquierda: R1 de arriba a A(4,8) … usamos geometría rectangular:
 *   A = punto medio izquierdo, B = punto medio derecho, galvanómetro horizontal entre A y B.
 */
export function bridgeCircuit(E: number, R1: number, R2: number, R3: number, R4: number, Rg: number): Circuit {
  const b = cb();
  b.el('V', 'E', String(E), [0, 0], [0, 16]);
  b.wire([0, 0], [8, 0]);
  b.wire([8, 0], [24, 0]);
  b.el('R', 'R1', String(R1), [8, 0], [8, 8]);
  b.el('R', 'R2', String(R2), [24, 0], [24, 8]);
  b.el('R', 'R3', String(R3), [8, 8], [8, 16]);
  b.el('R', 'R4', String(R4), [24, 8], [24, 16]);
  b.el('R', 'Rg', String(Rg), [8, 8], [24, 8]);
  b.wire([0, 16], [24, 16]);
  b.gnd([0, 16]);
  b.name([8, 8], 'a');
  b.name([24, 8], 'b');
  return b.build();
}

// ---------------- plantillas ----------------
/** Material U3: 15 V, R1 = 1 kΩ en serie con 250 ∥ 500 → V_ab = 2,14 V; V_R1 = 12,86 V */
export function materialDivisor(): Circuit {
  const b = cb();
  b.el('V', 'E', '15', [0, 0], [0, 8]);
  b.el('R', 'R1', '1k', [0, 0], [8, 0]);
  b.el('R', 'R2', '250', [8, 0], [8, 8]);
  b.wire([8, 0], [16, 0]);
  b.el('R', 'R3', '500', [16, 0], [16, 8]);
  b.wire([0, 8], [16, 8]);
  b.gnd([0, 8]);
  b.name([8, 0], 'a');
  return b.build();
}
/** Material U3: 2 A en 100 ∥ 500 ∥ 1,5 k → I_R2 = 0,32 A; I_R3 = 0,105 A */
export const materialDivisorI = () => currentDividerCircuit(2, [100, 500, 1500]);
/** Material U3: 1 kΩ + 250 ∥ 500 ∥ 1,5 kΩ = 1150 Ω (vista desde la fuente) */
export function material1150(): Circuit {
  const b = cb();
  b.el('V', 'E', '10', [0, 0], [0, 8]);
  b.el('R', 'R1', '1k', [0, 0], [8, 0]);
  [250, 500, 1500].forEach((r, k) => b.el('R', `R${k + 2}`, String(r), [8 + 8 * k, 0], [8 + 8 * k, 8]));
  b.wire([8, 0], [24, 0]);
  b.wire([0, 8], [24, 8]);
  b.gnd([0, 8]);
  return b.build();
}
/** Red con un Δ que no se reduce con serie‑paralelo (puente no balanceado alimentado) */
export const puenteNoBalanceado = () => bridgeCircuit(12, 10, 20, 30, 40, 50);
export const puenteBalanceado = () => bridgeCircuit(10, 100, 200, 150, 300, 50);
/** Escalera serie‑paralelo */
export function escalera(): Circuit {
  const b = cb();
  b.el('V', 'E', '24', [0, 0], [0, 8]);
  b.el('R', 'R1', '2', [0, 0], [8, 0]);
  b.el('R', 'R2', '6', [8, 0], [8, 8]);
  b.el('R', 'R3', '1', [8, 0], [16, 0]);
  b.el('R', 'R4', '4', [16, 0], [16, 8]);
  b.el('R', 'R5', '4', [16, 0], [24, 0]);
  b.wire([24, 0], [24, 8]);
  b.wire([0, 8], [24, 8]);
  b.gnd([0, 8]);
  return b.build();
}
/** Cuaderno: divisor en cascada 28 V; 10 y 4 Ω; luego 2 y 4 Ω */
export const CUADERNO_CASCADA: { E: number; stages: CascadeStage[] } = { E: 28, stages: [{ Ra: 10, Rb: 4 }, { Ra: 2, Rb: 4 }] };
