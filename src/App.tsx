import React from 'react';
import { sendPreset, Shell } from './core/ui/basic';
import { sendTemplate } from './core/ui/DCMode';
import { LearnView, PracticeView } from './core/ui/Practice';
import { CircuitPreview } from './core/ui/CircuitPreview';
import { BridgeMode, DeltaYMode, IDividerMode, ReduceMode, VDividerMode } from './sim/modes';
import { GENS, GLOSSARY, LEARN, TEMPLATES } from './sim/content';

const PRESETS = [
  { name: 'Cuaderno: divisor en cascada', desc: '28 V; 10 Ω y 4 Ω; luego 2 Ω y 4 Ω ⇒ V_ab = 8 V; V_bc = 5,33 V; P ≈ 7,1 W.', key: 'u3-vdiv', mode: 'vdiv', value: { E: '15', R: '1k 166,67', out: 1, mode: 'cascada', stages: '28 | 10 4 | 2 4', loaded: false, RL: '' } },
  { name: 'Cuaderno: Δ → Y con 10, 65 y 25 Ω', desc: 'Da 6,5; 2,5 y 16,25 Ω.', key: 'u3-dy', mode: 'dy', value: { dir: 'DY', R1: '10', R2: '65', R3: '25', Rx: '6,5', Ry: '2,5', Rz: '16,25' } },
  { name: 'Δ de 9 Ω → Y de 3 Ω', desc: 'Caso de resistencias iguales: R_Y = R_Δ/3.', key: 'u3-dy', mode: 'dy', value: { dir: 'DY', R1: '9', R2: '9', R3: '9', Rx: '3', Ry: '3', Rz: '3' } },
];

export default function App() {
  return (
    <Shell
      number={3}
      title="Circuitos Resistivos"
      modes={[
        { id: 'reducir', title: 'Armar y reducir (R_eq, redes no reducibles)', render: () => <ReduceMode /> },
        { id: 'vdiv', title: '3.3 Divisor de voltaje', render: () => <VDividerMode /> },
        { id: 'idiv', title: '3.4 Divisor de corriente', render: () => <IDividerMode /> },
        { id: 'dy', title: '3.5 Δ ↔ Y', render: () => <DeltaYMode /> },
        { id: 'puente', title: 'Puente de Wheatstone', render: () => <BridgeMode /> },
      ]}
      learn={<LearnView sections={LEARN} glossary={GLOSSARY} />}
      practice={<PracticeView gens={GENS} storageKey="sim3" />}
      templates={() => (
        <div className="grid2">
          {PRESETS.map((p, i) => (
            <div key={`p${i}`} className="card">
              <b>{p.name}</b>
              <p className="small">{p.desc}</p>
              <button className="primary" onClick={() => sendPreset(p.key, p.value, p.mode)}>
                Cargar en la ventanilla 1
              </button>
            </div>
          ))}
          {TEMPLATES.map((t, i) => (
            <div key={i} className="card">
              <b>{t.name}</b>
              <p className="small">{t.desc}</p>
              <CircuitPreview circuit={t.circuit()} height={150} showNodes={false} />
              <button className="primary" onClick={() => sendTemplate('u3-reducir', t.circuit(), 'reducir')}>
                Cargar en la ventanilla 1
              </button>
            </div>
          ))}
        </div>
      )}
    />
  );
}
