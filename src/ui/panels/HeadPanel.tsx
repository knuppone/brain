import { useCore } from '../../state/store';
import { useHead } from '../../state/headState';
import { HEAD_LAYERS, headLayerById } from '../../content/head';
import { Bullets, Callout, DiveCTA, Header, Section, Slider, Toggle } from '../kit';

export function HeadPanel() {
  const sel = useCore((s) => s.selection.head);
  const select = useCore((s) => s.select);
  const goTo = useCore((s) => s.goTo);
  const peel = useHead((s) => s.peel);
  const setHead = useHead((s) => s.set);
  const layer = sel ? headLayerById.get(sel) : null;

  if (layer) {
    return (
      <>
        <Header eyebrow={`Layer · ${layer.thickness}`} color={layer.color} title={layer.name} lede={layer.tagline}
          onBack={() => select('head', null)} backLabel="All layers" />
        <Section title="What it does"><Bullets items={layer.does} /></Section>
        <Section title="Remember this"><Callout kind="fact" label="Did you know">{layer.fact}</Callout></Section>
        <DiveCTA title="Peel down to this layer" sub="Fade away everything above it"
          onClick={() => setHead({ peel: HEAD_LAYERS.findIndex((l) => l.id === layer.id) })} />
      </>
    );
  }
  return (
    <>
      <Header eyebrow="Level 1 · Head" title="Five layers guard the brain"
        lede="The brain has the texture of soft tofu. Before we can look at it, we have to get through its armour." />
      <Section title="From outside to inside">
        <div className="stack">
          {HEAD_LAYERS.map((l, i) => (
            <button key={l.id} className={`row ${peel >= i + 1 ? 'peeled' : ''}`} onClick={() => select('head', l.id)}>
              <span className="num" style={{ background: l.color }}>{i + 1}</span>
              <span><b>{l.name}</b><small>{l.tagline}</small></span>
              <span className="go">›</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Try it">
        <Bullets items={[
          'Drag to rotate, scroll or pinch to zoom, right-drag to pan.',
          'Use the Peel slider below to remove one layer at a time.',
          'Click any layer in the 3D view to learn what it does.',
        ]} />
      </Section>
      <DiveCTA title="Go inside: the brain" sub="Lobes, deep structures and their jobs" onClick={() => goTo('brain')} />
    </>
  );
}

export function HeadDock() {
  const peel = useHead((s) => s.peel);
  const cutaway = useHead((s) => s.cutaway);
  const set = useHead((s) => s.set);
  const names = ['Intact', 'Scalp off', 'Skull off', 'Dura off', 'Fluid off', 'Brain map'];
  return (
    <>
      <Slider label="Peel layers" value={peel} min={0} max={5} step={0.01} onChange={(v) => set({ peel: v })}
        format={(v) => names[Math.round(v)]} />
      <span className="divider" />
      <Toggle label="Cutaway" on={cutaway} onChange={(v) => set({ cutaway: v })} />
    </>
  );
}
