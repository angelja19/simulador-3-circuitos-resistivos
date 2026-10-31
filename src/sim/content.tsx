import React from 'react';
import { analyze } from '../core/engine/analyze';
import { pick, randomGridCircuit, randR } from '../core/engine/generate';
import { deltaToY, reduceNetwork, yToDelta } from '../core/engine/methods/reduce';
import { texNum, texQ } from '../core/engine/units';
import { resistorEdges } from '../core/solutions/dc';
import { Tex } from '../core/ui/basic';
import { CircuitPreview } from '../core/ui/CircuitPreview';
import { ExerciseGen, LearnSection } from '../core/ui/Practice';
import { BOX, P, T } from '../core/ui/panels';
import { currentDivider, escalera, material1150, materialDivisor, materialDivisorI, puenteBalanceado, puenteNoBalanceado, voltageDivider } from './calc';

export const LEARN: LearnSection[] = [
  {
    title: '3.1 Resistencias en serie',
    body: (
      <>
        <Tex block tex="R_{total} = R_1 + R_2 + R_3 + \dots + R_n" />
        <p>Ejemplo del material: 1 k + 5 k + 22 k + 10 k = 38 kΩ. La resistencia total siempre es MAYOR que la mayor de ellas.</p>
      </>
    ),
  },
  {
    title: '3.2 Resistencias en paralelo',
    body: (
      <>
        <Tex block tex="\frac{1}{R_{total}} = \frac{1}{R_1} + \frac{1}{R_2} + \dots + \frac{1}{R_n}" />
        <p>Dos: «producto sobre suma» <Tex tex="R_{eq} = \frac{R_1R_2}{R_1+R_2}" />. Tres: <Tex tex="R_{eq} = \frac{R_1R_2R_3}{R_1R_2+R_1R_3+R_2R_3}" />. La equivalente siempre es MENOR que la menor.</p>
        <CircuitPreview circuit={material1150()} height={170} />
        <p className="small">Material: 1 kΩ + (250 ∥ 500 ∥ 1500) = 1 kΩ + 150 Ω = 1150 Ω.</p>
      </>
    ),
  },
  {
    title: '3.3 Divisor de voltaje',
    body: (
      <>
        <Tex block tex="V_{R1} = \frac{R_1}{R_1+R_2}\,E_{entrada}" />
        <p><b>Condiciones de uso:</b> dos (o más) resistencias en SERIE y un voltaje de entrada. Usa la MISMA resistencia arriba. Sirve en CC y en CA.</p>
        <CircuitPreview circuit={materialDivisor()} height={170} />
        <p className="small">Material: 15 V; 1 kΩ en serie con 250 ∥ 500 = 166,67 Ω ⇒ V_ab = 2,14 V; V_R1 = 12,86 V.</p>
      </>
    ),
  },
  {
    title: '3.4 Divisor de corriente',
    body: (
      <>
        <Tex block tex="I_{R1} = \frac{R_2}{R_1+R_2}\,I_{entrada}" />
        <p><b>Condiciones:</b> exactamente dos resistencias en paralelo (reduzca si hay más) y una corriente de entrada. ¡Use la resistencia OPUESTA!</p>
        <CircuitPreview circuit={materialDivisorI()} height={170} />
        <p className="small">Material: 2 A en 100 ∥ 500 ∥ 1500 ⇒ I_R2 = 0,32 A; I_R3 = 0,105 A.</p>
      </>
    ),
  },
  {
    title: '3.5–3.6 Δ (Π) ↔ Y (T)',
    body: (
      <>
        <p>Cuando una red no se reduce con serie y paralelo (como un puente), se transforma su geometría.</p>
        <Tex block tex="R_X = \frac{R_1R_2}{R_1+R_2+R_3},\ R_Y = \frac{R_1R_3}{R_1+R_2+R_3},\ R_Z = \frac{R_2R_3}{R_1+R_2+R_3}" />
        <Tex block tex="R_1 = \frac{R_XR_Y+R_XR_Z+R_YR_Z}{R_Z},\ R_2 = \frac{\dots}{R_Y},\ R_3 = \frac{\dots}{R_X}" />
        <p>Iguales: <Tex tex="R_Y = R_\Delta/3" />, <Tex tex="R_\Delta = 3R_Y" />.</p>
      </>
    ),
  },
  {
    title: 'Puente de Wheatstone',
    body: (
      <>
        <p>Balanceado si <Tex tex="R_1R_4 = R_2R_3" />: no pasa corriente por el galvanómetro.</p>
        <CircuitPreview circuit={puenteBalanceado()} height={200} />
      </>
    ),
  },
];

export const GLOSSARY = [
  { term: 'Resistencia equivalente', def: 'Una sola resistencia que, vista desde dos terminales, se comporta igual que la red.' },
  { term: 'Efecto de carga', def: 'Al conectar una carga a la salida de un divisor, esta queda en paralelo con R_b y baja el voltaje de salida.' },
  { term: 'Red no reducible', def: 'Red que no se simplifica solo con serie y paralelo (p. ej. un puente no balanceado).' },
  { term: 'Galvanómetro', def: 'Instrumento muy sensible que detecta corrientes pequeñas en el puente.' },
];

export const GENS: ExerciseGen[] = [
  {
    id: 'Serie y paralelo',
    subtopic: '3.1–3.2 Equivalentes',
    gen: (r) => {
      const R1 = randR(r);
      const R2 = randR(r);
      const R3 = randR(r);
      const Req = R1 + (R2 * R3) / (R2 + R3);
      return { prompt: `Halle la resistencia equivalente de $R_1 = ${R1}$ Ω en serie con el paralelo de $R_2 = ${R2}$ Ω y $R_3 = ${R3}$ Ω.`, answers: [{ label: 'R_{eq}', value: Req, unit: 'Ω' }], hints: ['Primero el paralelo: producto sobre suma.', 'Luego súmele R1.'], solution: [T(`R_{eq} = ${R1} + \\frac{${R2}\\cdot${R3}}{${R2}+${R3}} = ${texQ(Req, 'Ω')}`)] };
    },
  },
  {
    id: 'Divisor de voltaje',
    subtopic: '3.3 Divisores',
    gen: (r) => {
      const E = pick(r, [10, 12, 15, 24, 28]);
      const R = [randR(r), randR(r), randR(r)];
      const d = voltageDivider(E, R);
      const k = Math.floor(r() * 3);
      return { prompt: `Tres resistencias en serie (${R.join(', ')} Ω) se conectan a ${E} V. Halle el voltaje sobre R${k + 1}.`, answers: [{ label: `V_{R${k + 1}}`, value: d.V[k], unit: 'V' }], hints: ['$V_k = R_k/\\Sigma R\\cdot E$'], solution: [T(`V_{R${k + 1}} = \\frac{${R[k]}}{${d.S}}\\cdot ${E} = ${texQ(d.V[k], 'V')}`)] };
    },
  },
  {
    id: 'Divisor de corriente',
    subtopic: '3.4 Divisores',
    gen: (r) => {
      const I = pick(r, [1, 2, 3, 5]);
      const R = [randR(r), randR(r)];
      const d = currentDivider(I, R);
      return { prompt: `Una corriente de ${I} A entra a dos resistencias en paralelo de ${R[0]} Ω y ${R[1]} Ω. Halle la corriente por la de ${R[0]} Ω.`, answers: [{ label: 'I_1', value: d.I[0], unit: 'A' }], hints: ['Resistencia OPUESTA en el numerador.'], solution: [T(`I_1 = \\frac{${R[1]}}{${R[0]}+${R[1]}}\\cdot${I} = ${texQ(d.I[0], 'A')}`)] };
    },
  },
  {
    id: 'Δ → Y',
    subtopic: '3.5 Δ ↔ Y',
    gen: (r) => {
      const R = [randR(r), randR(r), randR(r)];
      const y = deltaToY(R[0], R[1], R[2]);
      return { prompt: `Convierta el triángulo $R_1 = ${R[0]}$, $R_2 = ${R[1]}$, $R_3 = ${R[2]}$ Ω en estrella.`, answers: [{ label: 'R_X', value: y.Rx, unit: 'Ω' }, { label: 'R_Y', value: y.Ry, unit: 'Ω' }, { label: 'R_Z', value: y.Rz, unit: 'Ω' }], hints: ['Producto de los adyacentes sobre la suma.'], solution: [T(`\\Sigma = ${R[0] + R[1] + R[2]};\\ R_X = ${texNum(y.Rx)},\\ R_Y = ${texNum(y.Ry)},\\ R_Z = ${texNum(y.Rz)}`)] };
    },
  },
  {
    id: 'Y → Δ',
    subtopic: '3.5 Δ ↔ Y',
    gen: (r) => {
      const R = [randR(r), randR(r), randR(r)];
      const d = yToDelta(R[0], R[1], R[2]);
      return { prompt: `Convierta la estrella $R_X = ${R[0]}$, $R_Y = ${R[1]}$, $R_Z = ${R[2]}$ Ω en triángulo.`, answers: [{ label: 'R_1', value: d.R1, unit: 'Ω' }, { label: 'R_2', value: d.R2, unit: 'Ω' }, { label: 'R_3', value: d.R3, unit: 'Ω' }], hints: ['Suma de productos sobre la resistencia opuesta.'], solution: [T(`R_1 = ${texNum(d.R1)},\\ R_2 = ${texNum(d.R2)},\\ R_3 = ${texNum(d.R3)}`)] };
    },
  },
  {
    id: 'Puente: resistencia de equilibrio',
    subtopic: 'Puente de Wheatstone',
    gen: (r) => {
      const R1 = randR(r);
      const R2 = randR(r);
      const R3 = randR(r);
      return { prompt: `En un puente con $R_1 = ${R1}$, $R_2 = ${R2}$, $R_3 = ${R3}$ Ω, ¿qué valor de $R_4$ lo balancea?`, answers: [{ label: 'R_4', value: (R2 * R3) / R1, unit: 'Ω' }], hints: ['$R_1R_4 = R_2R_3$'], solution: [T(`R_4 = \\frac{${R2}\\cdot${R3}}{${R1}} = ${texQ((R2 * R3) / R1, 'Ω')}`)] };
    },
  },
  {
    id: 'R_eq de una red',
    subtopic: '3.1–3.2 Equivalentes',
    gen: (r, l) => {
      const c = randomGridCircuit(r, { cols: l === 'basico' ? 2 : 3, rows: l === 'examen' ? 2 : 1, vSources: 1, iSources: 0 });
      const a = analyze(c);
      const s = a.net.elements.find((e) => e.kind === 'V')!;
      const red = reduceNetwork(resistorEdges(a), s.n1, s.n2);
      const I = -a.dc!.el.get(s.id)!.i;
      const Req = red.ok ? red.Req : s.value / I;
      return { prompt: `Halle la resistencia equivalente vista por la fuente ${s.label} y la corriente que entrega.`, circuit: c, answers: [{ label: 'R_{eq}', value: Req, unit: 'Ω' }, { label: 'I', value: Math.abs(I), unit: 'A' }], hints: ['Reduzca desde lo más alejado de la fuente.', 'Si no se puede, busque un triángulo (Δ→Y).'], solution: [...red.steps.map((st) => T(st.tex)), BOX(`R_{eq} = ${texQ(Req, 'Ω')},\\ I = ${texQ(Math.abs(I), 'A')}`)] };
    },
  },
];

export const TEMPLATES = [
  { name: 'Escalera serie‑paralelo', desc: 'Se reduce paso a paso y se regresa al original.', circuit: escalera },
  { name: 'Material: divisor 15 V con 1 kΩ y 250 ∥ 500', desc: 'V_ab = 2,14 V; V_R1 = 12,86 V.', circuit: materialDivisor },
  { name: 'Material: 1 kΩ + 250 ∥ 500 ∥ 1500 = 1150 Ω', desc: 'Tres en paralelo con la fórmula del producto.', circuit: material1150 },
  { name: 'Material: divisor de corriente 2 A', desc: 'I_R2 = 0,32 A; I_R3 = 0,105 A.', circuit: materialDivisorI },
  { name: 'Puente no balanceado (necesita Δ→Y)', desc: 'El simulador detecta que no es reducible y propone el triángulo a transformar.', circuit: puenteNoBalanceado },
  { name: 'Puente balanceado', desc: 'R1·R4 = R2·R3: no circula corriente por el galvanómetro.', circuit: puenteBalanceado },
];
export const P_ = P;
