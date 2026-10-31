import React, { useMemo, useState } from 'react';
import { analyze, Analysis } from '../core/engine/analyze';
import { deltaToY, reduceNetwork, yToDelta } from '../core/engine/methods/reduce';
import { fmtEng, fmtNum, parseSI, texNum, texQ } from '../core/engine/units';
import { Kpi, Tex, ThreePanels, usePalette, usePreset } from '../core/ui/basic';
import { DCMode, Tabs } from '../core/ui/DCMode';
import { CircuitPreview } from '../core/ui/CircuitPreview';
import { BetterDoc, BetterView, BOX, H, L, P, StepDoc, StepsView, T } from '../core/ui/panels';
import { resistorEdges } from '../core/solutions/dc';
import { nodalAnalysis } from '../core/engine/methods/nodal';
import { integerize, texEq, texSystem } from '../core/engine/methods/symbolic';
import { reqBetween, cascade, cascadeCircuit, currentDivider, currentDividerCircuit, escalera, voltageDivider, voltageDividerCircuit, wheatstone, bridgeCircuit } from './calc';
import { nodePositions, ReductionAnimation } from './stages';
import { isCurrentSourceLike, isVoltageSourceLike } from '../core/engine/types';

const parseList = (s: string) =>
  s
    .split(/[;\s]+|,(?=\s)/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseSI(x, 'Ω'));

function ErrBox({ errs }: { errs: string[] }) {
  return errs.length ? (
    <div className="issue box-err" role="alert">
      <b className="tag">✖ Error</b> {errs.join(' ')}
    </div>
  ) : null;
}

// =============== Armar, reducir y R_eq entre terminales ===============
export function ReduceMode() {
  const [terms, setTerms] = useState<number[] | null>(null);
  const [picking, setPicking] = useState(false);
  return (
    <DCMode
      storageKey="u3-reducir"
      palette={['R', 'V', 'I', 'AM', 'VM', 'GND']}
      initial={escalera()}
      methods={['reduccion', 'nodos', 'mallas']}
      defaultMethod="reduccion"
      pick={picking ? { kind: 'node', count: 2, prompt: 'Toque los dos nodos (terminales A y B) entre los que quiere R_eq', onPick: (ids) => { setTerms(ids as number[]); setPicking(false); } } : null}
      editorProps={{ highlightNodes: terms ?? [] }}
      p1Extra={(a) => <ReqTool a={a} terms={terms} onPick={() => setPicking(true)} onClear={() => setTerms(null)} />}
    />
  );
}

function ReqTool({ a, terms, onPick, onClear }: { a: Analysis; terms: number[] | null; onPick: () => void; onClear: () => void }) {
  const src = a.net.elements.filter((e) => isVoltageSourceLike(e.kind) || isCurrentSourceLike(e.kind));
  const st = terms ?? (src.length === 1 ? [src[0].n1, src[0].n2] : null);
  const badVals = a.net.valueErrors.length > 0 || a.net.elements.some((e) => (e.kind === 'R' || e.kind === 'G') && !(e.value > 0));
  const red = useMemo(() => (!st || badVals ? null : reqBetween(a, st[0], st[1])), [a, st?.[0], st?.[1], badVals]);
  const hasDep = a.net.elements.some((e) => e.kind === 'VCVS' || e.kind === 'VCCS' || e.kind === 'CCVS' || e.kind === 'CCCS');
  const pos = useMemo(() => nodePositions(a), [a]);
  return (
    <div className="card">
      <h4>Resistencia equivalente entre dos terminales</h4>
      <div className="row">
        <button className="primary" onClick={onPick}>
          🎯 Elegir terminales A y B
        </button>
        {terms && <button onClick={onClear}>Usar los terminales de la fuente</button>}
      </div>
      {!st && <p className="hint">Elija dos nodos del dibujo (o deje una sola fuente: se usan sus terminales).</p>}
      <p className="hint">Para hallar R_eq se APAGAN las fuentes independientes: las de voltaje se reemplazan por un cortocircuito y las de corriente por un circuito abierto.{hasDep ? ' Hay fuentes dependientes: R_eq debe hallarse con una fuente de prueba (Simulador 4, Thévenin).' : ''}</p>
      {badVals && <div className="issue box-err">Corrija primero los valores de las resistencias (panel de errores).</div>}
      {red && st && !hasDep && (
        <>
          <p>
            Entre {st[0] === 0 ? 'la referencia' : `(${a.net.nodeNames[st[0]]})`} y {st[1] === 0 ? 'la referencia' : `(${a.net.nodeNames[st[1]]})`}:{' '}
            <b>{red.ok ? `R_eq = ${fmtEng(red.Req, 'Ω', 6)}` : red.message}</b>
            {red.ok && red.message && <span className="small"> ({red.message})</span>}
          </p>
          {red.usedDeltaY && <div className="issue box-info">La red NO se puede reducir solo con serie y paralelo. Propuesta: {red.proposal}</div>}
          <ReductionAnimation red={red} pos={pos} s={st[0]} t={st[1]} />
        </>
      )}
    </div>
  );
}

// =============== Divisor de voltaje ===============
export function VDividerMode() {
  const [s, set] = usePreset('u3-vdiv', { E: '15', R: '1k 166,67', out: 1, mode: 'simple' as 'simple' | 'cascada', stages: '28 | 10 4 | 2 4', loaded: false, RL: '' });
  const [tab, setTab] = useState<'simple' | 'cascada'>(s.mode);
  const E = parseSI(s.E, 'V');
  const Rs = parseList(s.R);
  const errs: string[] = [];
  if (tab === 'simple') {
    if (!E.ok) errs.push(`E: ${E.error}`);
    if (Rs.length < 2) errs.push('El divisor necesita al menos dos resistencias en serie (escríbalas separadas por espacios).');
    Rs.forEach((r, i) => (!r.ok ? errs.push(`R${i + 1}: ${r.error}`) : r.value! <= 0 ? errs.push(`R${i + 1} debe ser positiva.`) : null));
  }
  // cascada: "E | Ra Rb | Ra Rb"
  const parts = s.stages.includes('|') ? s.stages.split('|').map((x) => x.trim()) : (() => {
    const tok = s.stages.trim().split(/\s+/);
    const out = [tok[0] ?? ''];
    for (let i = 1; i < tok.length; i += 2) out.push(`${tok[i]} ${tok[i + 1] ?? ''}`.trim());
    return out;
  })();
  const cE = parseSI(parts[0] ?? '', 'V');
  const stages = parts.slice(1).map((p) => p.split(/\s+/).map((x) => parseSI(x, 'Ω')));
  const RL = s.RL.trim() ? parseSI(s.RL, 'Ω') : null;
  if (tab === 'cascada') {
    if (!cE.ok) errs.push(`E: ${cE.error}`);
    if (!stages.length) errs.push('Escriba al menos una etapa: E | Ra Rb | Ra Rb …');
    stages.forEach((st, k) => (st.length !== 2 || !st.every((x) => x.ok && x.value! > 0) ? errs.push(`Etapa ${k + 1}: escriba dos resistencias positivas (Ra Rb).`) : null));
    if (RL && (!RL.ok || RL.value! <= 0)) errs.push('R_L debe ser un valor positivo (o deje vacío).');
  }
  const ok = !errs.length;
  const vd = ok && tab === 'simple' ? voltageDivider(E.value!, Rs.map((r) => r.value!)) : null;
  const stg = ok && tab === 'cascada' ? stages.map((st) => ({ Ra: st[0].value!, Rb: st[1].value! })) : [];
  const casc = ok && tab === 'cascada' ? cascade(cE.value!, stg, RL?.value ?? null, s.loaded) : null;
  const cascLoaded = ok && tab === 'cascada' ? cascade(cE.value!, stg, RL?.value ?? null, true) : null;
  const k = Math.min(Math.max(0, s.out), Rs.length - 1);
  const circ = useMemo(() => (vd ? voltageDividerCircuit(E.value!, Rs.map((r) => r.value!)) : casc ? cascadeCircuit(cE.value!, stg, RL?.value ?? null) : null), [s, tab]);
  const circA = useMemo(() => (circ ? analyze(circ) : null), [circ]);
  const p1 = (
    <div className="col">
      <Tabs value={tab} onChange={(v) => { setTab(v); set({ ...s, mode: v }); }} items={[{ id: 'simple', label: 'n resistencias en serie' }, { id: 'cascada', label: 'En cascada / efecto de carga' }]} />
      {tab === 'simple' ? (
        <div className="col">
          <label className="row">
            E [V] <input value={s.E} onChange={(e) => set({ ...s, E: e.target.value })} style={{ width: 80 }} aria-label="voltaje de entrada" />
          </label>
          <label className="row">
            Resistencias en serie [Ω] <input value={s.R} onChange={(e) => set({ ...s, R: e.target.value })} style={{ flex: 1 }} aria-label="resistencias" />
          </label>
          <label className="row">
            Salida sobre
            <select value={k} onChange={(e) => set({ ...s, out: Number(e.target.value) })}>
              {Rs.map((_, i) => (
                <option key={i} value={i}>
                  R{i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="col">
          <label className="row">
            E y etapas (E | Ra Rb | Ra Rb …) <input value={s.stages} onChange={(e) => set({ ...s, stages: e.target.value })} style={{ flex: 1 }} aria-label="etapas" />
          </label>
          <label className="row">
            R_L (carga final, opcional) [Ω] <input value={s.RL} onChange={(e) => set({ ...s, RL: e.target.value })} style={{ width: 90 }} />
          </label>
          <label className="row">
            <input type="checkbox" checked={s.loaded} onChange={(e) => set({ ...s, loaded: e.target.checked })} /> considerar el efecto de carga entre etapas (circuito real conectado)
          </label>
        </div>
      )}
      <ErrBox errs={errs} />
      {circ && <CircuitPreview circuit={circ} values={circA?.dc?.el ?? null} height={230} />}
      {vd && <Kpi items={[{ l: 'ΣR', v: fmtEng(vd.S, 'Ω', 5) }, { l: 'I', v: fmtEng(vd.I, 'A', 5) }, { l: `V_R${k + 1}`, v: fmtEng(vd.V[k], 'V', 5) }]} />}
      {casc && cascLoaded && (
        <table className="data">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>V salida sin efecto de carga</th>
              <th>V salida real (circuito conectado)</th>
            </tr>
          </thead>
          <tbody>
            {stg.map((_, i) => (
              <tr key={i} style={s.loaded ? undefined : { fontWeight: 600 }}>
                <td>{i + 1}</td>
                <td>{fmtEng(cascade(cE.value!, stg, null, false).vout[i], 'V', 4)}</td>
                <td style={s.loaded ? { fontWeight: 600 } : undefined}>{fmtEng(cascLoaded.vout[i], 'V', 4)}</td>
              </tr>
            ))}
            {RL?.value && (
              <tr>
                <td>Sobre R_L</td>
                <td>{fmtEng(cascade(cE.value!, stg, RL.value, false).vL, 'V', 4)}</td>
                <td>{fmtEng(cascLoaded.vL, 'V', 4)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
  let doc: StepDoc | null = null;
  if (vd) {
    const S = vd.S;
    doc = {
      title: 'Divisor de voltaje',
      concept: 'Condiciones de uso: (1) resistencias o cargas conectadas en SERIE y (2) un voltaje de entrada al serie. El voltaje sobre una resistencia es esa misma resistencia sobre la suma, por el voltaje de entrada.',
      identification: [L([`$E_{entrada} = ${texQ(E.value!, 'V')}$`, ...Rs.map((r, i) => `$R_${i + 1} = ${texQ(r.value!, 'Ω')}$`)])],
      laws: [T('V_{R_k} = \\frac{R_k}{R_1 + R_2 + \\dots + R_n}\\,E_{entrada}'), P('Con dos resistencias (forma del material): $V_{R1} = \\frac{R_1}{R_1+R_2}E$.')],
      development: [T(`\\sum R = ${Rs.map((r) => texNum(r.value!)).join(' + ')} = ${texQ(S, 'Ω')}`, '(1)'), ...Rs.map((r, i) => T(`V_{R${i + 1}} = \\frac{${texNum(r.value!)}}{${texNum(S)}}\\cdot ${texNum(E.value!)} = ${texQ(vd.V[i], 'V')}`, `(${i + 2})`))],
      results: [BOX(`V_{R${k + 1}} = ${texQ(vd.V[k], 'V')}`), T(`I = E/\\sum R = ${texQ(vd.I, 'A')}`)],
      verification: [P(`LVK: $${vd.V.map((v) => texNum(v)).join(' + ')} = ${texNum(vd.V.reduce((a, b) => a + b, 0))} = E$ ✓. Con Ohm: $V_{R${k + 1}} = R\\,I = ${texNum(Rs[k].value! * vd.I)}$ ✓.`)],
      tip: 'Usa la MISMA resistencia en el numerador. Si hay paralelos, redúzcalos primero para que quede un serie.',
    };
  } else if (casc && cascLoaded) {
    const ideal = cascade(cE.value!, stg, null, false);
    const used = s.loaded ? cascLoaded : ideal;
    doc = {
      title: 'Divisor de voltaje en cascada',
      concept: 'En cascada, la salida de un divisor alimenta al siguiente. Si cada etapa se considera alimentada por una fuente ideal (sin efecto de carga) se aplica la fórmula del divisor etapa por etapa; en el circuito real la segunda etapa «carga» a la primera y baja su voltaje.',
      identification: [L([`$E = ${texQ(cE.value!, 'V')}$`, ...stg.map((x, i) => `Etapa ${i + 1}: $R_a = ${texQ(x.Ra, 'Ω')}$, $R_b = ${texQ(x.Rb, 'Ω')}$`)])],
      laws: [T('V_{out} = \\frac{R_b}{R_a + R_b}\\,V_{in}\\qquad P = \\frac{V^2}{R}')],
      development: [
        H('Sin efecto de carga (cada etapa con entrada ideal)'),
        ...stg.map((x, i) => T(`V_{${i + 1}} = \\frac{${texNum(x.Rb)}}{${texNum(x.Ra)} + ${texNum(x.Rb)}}\\cdot ${texNum(ideal.vin[i])} = ${texQ(ideal.vout[i], 'V')}`, `(${i + 1})`)),
        T(`P_{R_b} = \\frac{V^2}{R_b} = \\frac{(${texNum(ideal.vout[ideal.vout.length - 1])})^2}{${texNum(stg[stg.length - 1].Rb)}} = ${texQ(ideal.P, 'W')}`, `(${stg.length + 1})`),
        H('Con efecto de carga (circuito real conectado)'),
        P(`Resolviendo el circuito completo: ${cascLoaded.vout.map((v, i) => `$V_{${i + 1}} = ${texQ(v, 'V')}$`).join(', ')}. La diferencia muestra el efecto de carga: la etapa siguiente queda en paralelo con $R_b$ de la anterior.`),
      ],
      results: [...used.vout.map((v, i) => BOX(`V_{${i + 1}} = ${texQ(v, 'V')}\\ (\\text{${s.loaded ? 'con efecto de carga' : 'sin efecto de carga'}})`)), BOX(`P_{R_b} = ${texQ(used.P, 'W')}`), ...(RL?.value ? [BOX(`V_{R_L} = ${texQ(used.vL, 'V')}`)] : [])],
      verification: [P(stg.length > 1 ? `Condición para despreciar el efecto de carga: la etapa siguiente debe ser mucho mayor que $R_b$ (al menos 10 veces). Aquí la etapa 2 presenta ${fmtEng(stg[1].Ra + stg[1].Rb, 'Ω')} frente a ${fmtEng(stg[0].Rb, 'Ω')}: ${stg[1].Ra + stg[1].Rb >= 10 * stg[0].Rb ? 'se cumple ✓' : 'NO se cumple, por eso los valores reales difieren'}.` : `Una sola etapa: ${RL?.value ? 'R_L queda en paralelo con R_b.' : 'sin carga, el divisor es exacto ✓.'}`)],
      tip: 'Para despreciar el efecto de carga, la resistencia de la etapa siguiente debe ser ≥ 10·R_b. Si no, reduzca el paralelo antes de aplicar el divisor.',
    };
  }
  const better: BetterDoc = {
    method: 'Divisor de voltaje directo (sin calcular la corriente)',
    why: 'Con una sola fuente y cargas en serie, la proporción R_k/ΣR da el voltaje en un paso.',
    savings: 'Evita: I = E/ΣR y luego V = R·I (dos pasos).',
    formulas: [{ tex: 'V_k = \\frac{R_k}{\\sum R}E', meaning: 'Misma resistencia arriba.' }, { tex: 'R_b \\parallel R_L = \\frac{R_bR_L}{R_b+R_L}', meaning: 'Efecto de carga: reemplace R_b por su paralelo con la carga.' }],
    tricks: ['Si dos resistencias son iguales, cada una toma la mitad.', 'La resistencia mayor toma el mayor voltaje.'],
    mistakes: ['Usar el divisor cuando las resistencias NO están en serie (hay una derivación con carga).', 'Poner en el numerador la otra resistencia (eso es el divisor de corriente).'],
    compare: { long: 'Calcular I = E/ΣR y luego V = R·I.', short: 'V_k = R_k/ΣR · E.', result: vd ? `$V_{R${k + 1}} = ${texQ(vd.V[k], 'V')}$.` : casc ? `$V = ${texQ(casc.vout[casc.vout.length - 1], 'V')}$.` : '—' },
  };
  return <ThreePanels titles={['Datos', 'Solución', 'Cómo resolverlo de una mejor manera']} p1={p1} p2={doc ? <StepsView doc={doc} /> : <div className="card box-err">Corrija los datos de la ventanilla 1.</div>} p3={<BetterView doc={better} />} />;
}

// =============== Divisor de corriente ===============
export function IDividerMode() {
  const [s, set] = usePreset('u3-idiv', { I: '2', R: '100 500 1,5k', out: 1 });
  const I = parseSI(s.I, 'A');
  const Rs = parseList(s.R);
  const errs: string[] = [];
  if (!I.ok) errs.push(`I: ${I.error}`);
  if (Rs.length < 2) errs.push('El divisor de corriente necesita al menos dos ramas en paralelo.');
  Rs.forEach((r, i) => (!r.ok ? errs.push(`R${i + 1}: ${r.error}`) : r.value! <= 0 ? errs.push(`R${i + 1} debe ser positiva.`) : null));
  const cd = errs.length ? null : currentDivider(I.value!, Rs.map((r) => r.value!));
  const k = Math.min(Math.max(0, s.out), Rs.length - 1);
  const circ = useMemo(() => (cd ? currentDividerCircuit(I.value!, Rs.map((r) => r.value!)) : null), [s]);
  const circA = useMemo(() => (circ ? analyze(circ) : null), [circ]);
  const others = cd ? Rs.filter((_, i) => i !== k).map((r) => r.value!) : [];
  const Rother = others.length ? 1 / others.reduce((a, b) => a + 1 / b, 0) : 0;
  const p1 = (
    <div className="col">
      <label className="row">
        I entrada [A] <input value={s.I} onChange={(e) => set({ ...s, I: e.target.value })} style={{ width: 80 }} aria-label="corriente de entrada" />
      </label>
      <label className="row">
        Resistencias en paralelo [Ω] <input value={s.R} onChange={(e) => set({ ...s, R: e.target.value })} style={{ flex: 1 }} aria-label="resistencias en paralelo" />
      </label>
      <label className="row">
        Corriente pedida en
        <select value={k} onChange={(e) => set({ ...s, out: Number(e.target.value) })}>
          {Rs.map((_, i) => (
            <option key={i} value={i}>
              R{i + 1}
            </option>
          ))}
        </select>
      </label>
      <ErrBox errs={errs} />
      {circ && <CircuitPreview circuit={circ} values={circA?.dc?.el ?? null} height={210} />}
      {cd && <Kpi items={[{ l: 'R_eq', v: fmtEng(cd.Req, 'Ω', 5) }, { l: 'V común', v: fmtEng(cd.V, 'V', 5) }, { l: `I_R${k + 1}`, v: fmtEng(cd.I[k], 'A', 5) }]} />}
    </div>
  );
  const doc: StepDoc | null = cd
    ? {
        title: 'Divisor de corriente',
        concept: 'Condiciones de uso: (1) exactamente DOS resistencias en paralelo (si hay más, se reducen a dos) y (2) una corriente de entrada al paralelo. La corriente por una resistencia es la OTRA resistencia sobre la suma de las dos, por la corriente de entrada.',
        identification: [L([`$I_{entrada} = ${texQ(I.value!, 'A')}$`, ...Rs.map((r, i) => `$R_${i + 1} = ${texQ(r.value!, 'Ω')}$`)])],
        laws: [T('I_{R1} = \\frac{R_2}{R_1 + R_2}\\,I_{entrada}'), P('Para n ramas: $I_k = \\frac{G_k}{\\sum G}I$ con $G = 1/R$.')],
        development: [
          ...(Rs.length > 2 ? [P(`Se reducen las demás ramas a una sola: $R_{eq} = ${others.map((r) => texNum(r)).join(' \\parallel ')} = ${texQ(Rother, 'Ω')}$.`)] : []),
          T(`I_{R${k + 1}} = \\frac{${texNum(Rother)}}{${texNum(Rs[k].value!)} + ${texNum(Rother)}}\\cdot ${texNum(I.value!)} = ${texQ(cd.I[k], 'A')}`, '(1)'),
          T(`I_{${Rs.length === 2 ? `R${k === 0 ? 2 : 1}` : 'R_{eq}'}} = \\frac{${texNum(Rs[k].value!)}}{${texNum(Rs[k].value!)} + ${texNum(Rother)}}\\cdot ${texNum(I.value!)} = ${texQ(I.value! - cd.I[k], 'A')}`, '(2)'),
          ...cd.I.map((x, i) => T(`I_{R${i + 1}} = ${texQ(x, 'A')}`)),
        ],
        results: [BOX(`I_{R${k + 1}} = ${texQ(cd.I[k], 'A')}`)],
        verification: [P(`LCK: $${cd.I.map((x) => texNum(x)).join(' + ')} = ${texNum(cd.I.reduce((a, b) => a + b, 0))} = I_{entrada}$ ✓. Voltaje común: $V = R_{eq}\\,I = ${texQ(cd.V, 'V')}$ y cada $I_k = V/R_k$ ✓.`)],
        tip: '¡OJO! En el divisor de corriente va la resistencia OPUESTA en el numerador. Por la resistencia menor pasa la mayor corriente.',
      }
    : null;
  const better: BetterDoc = {
    method: 'Voltaje común V = I·R_eq y luego Ohm en cada rama',
    why: 'Con más de dos ramas, es más rápido calcular el voltaje común una vez y dividir por cada R.',
    savings: 'Evita reducir a dos ramas cada vez que pide una corriente distinta.',
    formulas: [{ tex: 'V = I\\cdot R_{eq},\\quad I_k = V/R_k', meaning: 'Todas las ramas en paralelo tienen el mismo voltaje.' }, { tex: 'I_1 = \\frac{R_2}{R_1+R_2}I', meaning: 'Dos ramas: resistencia opuesta arriba.' }],
    tricks: ['Dos resistencias iguales: la corriente se reparte a la mitad.', 'Si una rama es 10 veces menor, lleva ~91 % de la corriente.'],
    mistakes: ['Poner la misma resistencia en el numerador (eso es el divisor de voltaje).', 'Aplicarlo con una resistencia en serie dentro de una rama sin sumarla primero.'],
    compare: { long: 'Reducir a dos ramas y aplicar la fórmula para cada corriente.', short: 'V común y Ohm.', result: cd ? `$I_{R${k + 1}} = ${texQ(cd.I[k], 'A')}$.` : '—' },
  };
  return <ThreePanels titles={['Datos', 'Solución', 'Cómo resolverlo de una mejor manera']} p1={p1} p2={doc ? <StepsView doc={doc} /> : <div className="card box-err">Corrija los datos de la ventanilla 1.</div>} p3={<BetterView doc={better} />} />;
}

// =============== Δ ↔ Y ===============
export function DeltaYMode() {
  const [s, set] = usePreset('u3-dy', { dir: 'DY' as 'DY' | 'YD', R1: '10', R2: '65', R3: '25', Rx: '6,5', Ry: '2,5', Rz: '16,25' });
  const pal = usePalette();
  const v = (x: string) => parseSI(x, 'Ω');
  const ins = s.dir === 'DY' ? [v(s.R1), v(s.R2), v(s.R3)] : [v(s.Rx), v(s.Ry), v(s.Rz)];
  const errs = ins.map((r, i) => (!r.ok ? `${s.dir === 'DY' ? `R${i + 1}` : ['Rx', 'Ry', 'Rz'][i]}: ${r.error}` : r.value! <= 0 ? 'Todas las resistencias deben ser positivas.' : '')).filter(Boolean);
  const ok = !errs.length;
  const dy = ok && s.dir === 'DY' ? deltaToY(ins[0].value!, ins[1].value!, ins[2].value!) : null;
  const yd = ok && s.dir === 'YD' ? yToDelta(ins[0].value!, ins[1].value!, ins[2].value!) : null;
  const D = dy ? [ins[0].value!, ins[1].value!, ins[2].value!] : yd ? [yd.R1, yd.R2, yd.R3] : [0, 0, 0];
  const Y = dy ? [dy.Rx, dy.Ry, dy.Rz] : yd ? [ins[0].value!, ins[1].value!, ins[2].value!] : [0, 0, 0];
  const equal = ok && Math.abs(ins[0].value! - ins[1].value!) < 1e-12 && Math.abs(ins[1].value! - ins[2].value!) < 1e-12;
  const p1 = (
    <div className="col">
      <div className="row">
        <button className={s.dir === 'DY' ? 'active' : ''} onClick={() => set({ ...s, dir: 'DY' })}>
          Δ (Π) → Y (T)
        </button>
        <button className={s.dir === 'YD' ? 'active' : ''} onClick={() => set({ ...s, dir: 'YD' })}>
          Y (T) → Δ (Π)
        </button>
      </div>
      <div className="row">
        {(s.dir === 'DY' ? (['R1', 'R2', 'R3'] as const) : (['Rx', 'Ry', 'Rz'] as const)).map((k) => (
          <label key={k} className="row">
            {k} [Ω] <input value={(s as any)[k]} onChange={(e) => set({ ...s, [k]: e.target.value })} style={{ width: 70 }} aria-label={k} />
          </label>
        ))}
      </div>
      <ErrBox errs={errs} />
      {ok && (
        <svg viewBox="0 0 420 230" style={{ width: '100%' }} role="img" aria-label="triángulo y estrella superpuestos">
          <polygon points="210,20 60,200 360,200" fill="none" stroke={pal.sel} strokeWidth={3} />
          <line x1={210} y1={20} x2={210} y2={140} stroke={pal.ent} strokeWidth={3} />
          <line x1={60} y1={200} x2={210} y2={140} stroke={pal.ent} strokeWidth={3} />
          <line x1={360} y1={200} x2={210} y2={140} stroke={pal.ent} strokeWidth={3} />
          {[
            [110, 105, `R1 = ${fmtEng(D[0], 'Ω', 4)}`],
            [315, 105, `R2 = ${fmtEng(D[1], 'Ω', 4)}`],
            [210, 222, `R3 = ${fmtEng(D[2], 'Ω', 4)}`],
          ].map(([x, y, t], i) => (
            <text key={i} x={x as number} y={y as number} textAnchor="middle" fontSize={13} fill={pal.sel} fontWeight={700}>
              {t}
            </text>
          ))}
          {[
            [255, 70, `Rx = ${fmtEng(Y[0], 'Ω', 4)}`],
            [120, 160, `Ry = ${fmtEng(Y[1], 'Ω', 4)}`],
            [300, 160, `Rz = ${fmtEng(Y[2], 'Ω', 4)}`],
          ].map(([x, y, t], i) => (
            <text key={i} x={x as number} y={y as number} textAnchor="middle" fontSize={13} fill={pal.ent} fontWeight={700}>
              {t}
            </text>
          ))}
          <circle cx={210} cy={140} r={4} fill={pal.ent} />
        </svg>
      )}
      {equal && <div className="issue box-info">Caso de resistencias iguales: {s.dir === 'DY' ? `R_Y = R_Δ/3 = ${fmtEng(Y[0], 'Ω')}` : `R_Δ = 3·R_Y = ${fmtEng(D[0], 'Ω')}`}.</div>}
    </div>
  );
  const S = D[0] + D[1] + D[2];
  const N = Y[0] * Y[1] + Y[0] * Y[2] + Y[1] * Y[2];
  const doc: StepDoc | null = ok
    ? {
        title: s.dir === 'DY' ? 'Triángulo (Π) → estrella (T)' : 'Estrella (T) → triángulo (Π)',
        concept: s.dir === 'DY' ? 'Cada resistor de la estrella es igual al producto de los dos resistores del triángulo más cercanos dividido entre la suma de los tres del triángulo.' : 'Cada resistor del triángulo es la suma de los productos de la estrella tomados de dos en dos dividida entre el resistor de la estrella más lejano (opuesto).',
        identification: [L(s.dir === 'DY' ? [`$R_1 = ${texQ(D[0], 'Ω')}$, $R_2 = ${texQ(D[1], 'Ω')}$, $R_3 = ${texQ(D[2], 'Ω')}$ (R₁ y R₂ se juntan en el vértice de R_X)`] : [`$R_X = ${texQ(Y[0], 'Ω')}$, $R_Y = ${texQ(Y[1], 'Ω')}$, $R_Z = ${texQ(Y[2], 'Ω')}$`])],
        laws: s.dir === 'DY' ? [T('R_X = \\frac{R_1R_2}{R_1+R_2+R_3},\\ R_Y = \\frac{R_1R_3}{R_1+R_2+R_3},\\ R_Z = \\frac{R_2R_3}{R_1+R_2+R_3}')] : [T('R_1 = \\frac{R_XR_Y + R_XR_Z + R_YR_Z}{R_Z},\\ R_2 = \\frac{\\dots}{R_Y},\\ R_3 = \\frac{\\dots}{R_X}')],
        development:
          s.dir === 'DY'
            ? [T(`\\Sigma = ${texNum(D[0])} + ${texNum(D[1])} + ${texNum(D[2])} = ${texNum(S)}`, '(1)'), T(`R_X = \\frac{${texNum(D[0])}\\cdot ${texNum(D[1])}}{${texNum(S)}} = ${texQ(Y[0], 'Ω')}`, '(2)'), T(`R_Y = \\frac{${texNum(D[0])}\\cdot ${texNum(D[2])}}{${texNum(S)}} = ${texQ(Y[1], 'Ω')}`, '(3)'), T(`R_Z = \\frac{${texNum(D[1])}\\cdot ${texNum(D[2])}}{${texNum(S)}} = ${texQ(Y[2], 'Ω')}`, '(4)')]
            : [T(`N = R_XR_Y + R_XR_Z + R_YR_Z = ${texNum(N)}`, '(1)'), T(`R_1 = N/R_Z = ${texQ(D[0], 'Ω')}`, '(2)'), T(`R_2 = N/R_Y = ${texQ(D[1], 'Ω')}`, '(3)'), T(`R_3 = N/R_X = ${texQ(D[2], 'Ω')}`, '(4)')],
        results: s.dir === 'DY' ? [BOX(`R_X = ${texQ(Y[0], 'Ω')},\\ R_Y = ${texQ(Y[1], 'Ω')},\\ R_Z = ${texQ(Y[2], 'Ω')}`)] : [BOX(`R_1 = ${texQ(D[0], 'Ω')},\\ R_2 = ${texQ(D[1], 'Ω')},\\ R_3 = ${texQ(D[2], 'Ω')}`)],
        verification: [P(`Transformación inversa: ${s.dir === 'DY' ? `$R_1 = N/R_Z = ${texNum(yToDelta(Y[0], Y[1], Y[2]).R1)}$` : `$R_X = ${texNum(deltaToY(D[0], D[1], D[2]).Rx)}$`} ✓. Entre dos vértices: Δ da $R_1 \\parallel (R_2 + R_3) = ${texNum((D[0] * (D[1] + D[2])) / S)}$ y Y da $R_X + R_Y = ${texNum(Y[0] + Y[1])}$ ✓.`)],
        tip: 'Δ→Y: el denominador es el mismo para las tres (la suma). Y→Δ: el numerador es el mismo para las tres. Iguales: R_Y = R_Δ/3 y R_Δ = 3R_Y.',
      }
    : null;
  const better: BetterDoc = {
    method: 'Regla de oro: Δ→Y «producto de adyacentes sobre suma»; Y→Δ «suma de productos sobre el opuesto»',
    why: 'Recordar las dos reglas evita memorizar seis fórmulas.',
    savings: 'Calcule una vez Σ (o N) y reutilícelo en las tres.',
    formulas: [{ tex: 'R_Y = R_\\Delta/3,\\quad R_\\Delta = 3R_Y', meaning: 'Resistencias iguales.' }],
    tricks: ['Transforme el triángulo que deja al circuito en serie‑paralelo.', 'Verifique midiendo entre dos vértices en ambas formas.'],
    mistakes: ['Confundir qué resistencias son adyacentes al vértice.', 'Olvidar que la estrella agrega un nodo nuevo (el centro).'],
    compare: { long: 'Plantear nodos o mallas en el puente.', short: 'Δ→Y y reducir serie‑paralelo.', result: ok ? `$R_X = ${texQ(Y[0], 'Ω')}$.` : '—' },
  };
  return <ThreePanels titles={['Datos', 'Solución', 'Cómo resolverlo de una mejor manera']} p1={p1} p2={doc ? <StepsView doc={doc} /> : <div className="card box-err">Corrija los datos.</div>} p3={<BetterView doc={better} />} />;
}

// =============== Puente de Wheatstone ===============
export function BridgeMode() {
  const [s, set] = usePreset('u3-puente', { E: '10', R1: '100', R2: '200', R3: '150', R4: '300', Rg: '50' });
  const keys = ['E', 'R1', 'R2', 'R3', 'R4', 'Rg'] as const;
  const vals = keys.map((k) => parseSI((s as any)[k], k === 'E' ? 'V' : 'Ω'));
  const errs = vals.map((v, i) => (!v.ok ? `${keys[i]}: ${v.error}` : i > 0 && v.value! <= 0 ? `${keys[i]} debe ser positiva.` : '')).filter(Boolean);
  const r = errs.length ? null : wheatstone(vals[0].value!, vals[1].value!, vals[2].value!, vals[3].value!, vals[4].value!, vals[5].value!);
  const circ = useMemo(() => (errs.length ? null : bridgeCircuit(vals[0].value!, vals[1].value!, vals[2].value!, vals[3].value!, vals[4].value!, vals[5].value!)), [s]);
  const p1 = (
    <div className="col">
      <div className="row">
        {keys.map((k) => (
          <label key={k} className="row">
            {k} <input value={(s as any)[k]} onChange={(e) => set({ ...s, [k]: e.target.value })} style={{ width: 64 }} aria-label={k} />
          </label>
        ))}
      </div>
      <ErrBox errs={errs} />
      {circ && r && <CircuitPreview circuit={circ} values={r.a.dc!.el} height={260} />}
      {r && (
        <>
          <div className={`issue ${r.balanced ? 'box-ok' : 'box-warn'}`}>
            <b>{r.balanced ? 'Puente BALANCEADO' : 'Puente NO balanceado'}</b>: R1·R4 = {fmtNum(vals[1].value! * vals[4].value!)} y R2·R3 = {fmtNum(vals[2].value! * vals[3].value!)}. {r.balanced ? 'No circula corriente por el galvanómetro.' : `Para balancearlo, R4 debería valer ${fmtEng(r.Rx, 'Ω')}.`}
          </div>
          <Kpi items={[{ l: 'Corriente por el galvanómetro', v: fmtEng(r.Ig, 'A', 5) }, { l: 'V_ab', v: fmtEng(r.Vg, 'V', 5) }, { l: 'R_eq vista por E', v: fmtEng(r.Req, 'Ω', 5) }]} />
        </>
      )}
    </div>
  );
  const doc: StepDoc | null = r
    ? {
        title: 'Puente de Wheatstone',
        concept: 'Dos divisores de voltaje en paralelo (R1–R3 y R2–R4) unidos por un galvanómetro entre sus puntos medios a y b. Está balanceado cuando $V_a = V_b$: entonces no circula corriente por el galvanómetro y vale $R_1R_4 = R_2R_3$.',
        identification: [L(keys.map((k, i) => `$${k} = ${texQ(vals[i].value!, i === 0 ? 'V' : 'Ω')}$`))],
        laws: [T('V_a = \\frac{R_3}{R_1+R_3}E,\\quad V_b = \\frac{R_4}{R_2+R_4}E,\\quad \\text{balance: } R_1R_4 = R_2R_3'), P('Si NO está balanceado, la red no es serie‑paralelo: se usa Δ→Y o el método de nodos.')],
        development: [
          T(`V_a^{(sin\\ R_g)} = \\frac{${texNum(vals[3].value!)}}{${texNum(vals[1].value! + vals[3].value!)}}\\cdot ${texNum(vals[0].value!)} = ${texQ((vals[3].value! / (vals[1].value! + vals[3].value!)) * vals[0].value!, 'V')}`, '(1)'),
          T(`V_b^{(sin\\ R_g)} = \\frac{${texNum(vals[4].value!)}}{${texNum(vals[2].value! + vals[4].value!)}}\\cdot ${texNum(vals[0].value!)} = ${texQ((vals[4].value! / (vals[2].value! + vals[4].value!)) * vals[0].value!, 'V')}`, '(2)'),
          P(r.balanced ? 'Son iguales: puente balanceado, $I_g = 0$; $R_g$ puede quitarse y la red queda serie‑paralelo.' : 'Son distintos: circula corriente por el galvanómetro. Con $R_g$ conectado se resuelve por nodos (o Δ→Y):'),
          ...(r.balanced ? [] : bridgeEquations(r.a)),
          ...(r.balanced ? [] : [T(`I_g = \\frac{V_a - V_b}{R_g} = ${texQ(r.Ig, 'A')},\\quad V_{ab} = ${texQ(r.Vg, 'V')}`, '(3)')]),
          T(`R_{x}\\ (\\text{valor de } R_4 \\text{ que balancea}) = \\frac{R_2R_3}{R_1} = ${texQ(r.Rx, 'Ω')}`, '(4)'),
        ],
        results: [BOX(`I_g = ${texQ(r.Ig, 'A')}`), BOX(`R_{eq} = ${texQ(r.Req, 'Ω')}`)],
        verification: [P(`Balance de potencias del circuito completo: ΣP entregada = ${fmtEng(r.a.balance.delivered, 'W', 5)} = ΣP absorbida ✓.`)],
        tip: 'Antes de nada compruebe R1·R4 = R2·R3: si se cumple, borre el galvanómetro y el problema se vuelve serie‑paralelo.',
      }
    : null;
  const better: BetterDoc = {
    method: r?.balanced ? 'Quitar el galvanómetro (balanceado) y reducir serie‑paralelo' : 'Δ→Y en un triángulo del puente, o nodos con V_a y V_b',
    why: r?.balanced ? 'Sin corriente por R_g, la rama central no influye.' : 'El puente no balanceado es la red «no reducible» clásica.',
    savings: r?.balanced ? 'Con el atajo del balance no hace falta ningún sistema de ecuaciones.' : 'Por nodos solo hay 2 incógnitas (V_a y V_b) frente a 3 mallas.',
    formulas: [{ tex: 'R_1R_4 = R_2R_3', meaning: 'Condición de equilibrio.' }, { tex: 'R_x = \\frac{R_2R_3}{R_1}', meaning: 'Medición de una resistencia desconocida.' }],
    tricks: ['Nodos: solo 2 incógnitas (V_a y V_b) si la fuente va a la referencia.'],
    mistakes: ['Cruzar la condición: es producto de opuestos (R1R4 = R2R3).'],
    compare: { long: 'Mallas: 3 ecuaciones.', short: 'Nodos: 2 ecuaciones (V_a, V_b).', result: r ? `$I_g = ${texQ(r.Ig, 'A')}$.` : '—' },
  };
  return <ThreePanels titles={['Datos', 'Solución', 'Cómo resolverlo de una mejor manera']} p1={p1} p2={doc ? <StepsView doc={doc} /> : <div className="card box-err">Corrija los datos.</div>} p3={<BetterView doc={better} />} />;
}

function bridgeEquations(a: Analysis): StepDoc['development'] {
  const n = nodalAnalysis(a.net);
  if (!n.ok) return [];
  return [H('Planteo por nodos (V_a y V_b)'), ...n.eqs.map((e) => T(e.raw, `(${e.n})`)), T(texSystem(n.eqs.map((e) => texEq(integerize(e.lin).lin, n.unknowns))))];
}
