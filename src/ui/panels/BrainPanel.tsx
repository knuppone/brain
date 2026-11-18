import { useCore } from '../../state/store';
import { useBrain } from '../../state/brainState';
import { areasOf, DEEP, LOBES, structureById } from '../../content/regions';
import { Bullets, Callout, Chip, DiveCTA, Divider, Header, Row, Section, Segmented, Slider, Toggle } from '../kit';

export function BrainPanel() {
  const sel = useCore((s) => s.selection.brain);
  const select = useCore((s) => s.select);
  const goTo = useCore((s) => s.goTo);
  const s = sel ? structureById.get(sel) : null;
  const pick = (id: string | null) => select('brain', id);

  if (s) {
    const parent = s.kind === 'area' ? structureById.get(s.parent!) : null;
    const kids = s.kind === 'lobe' ? areasOf(s.id) : [];
    const eyebrow =
      s.kind === 'lobe' ? 'Cortex · lobe' : s.kind === 'area' ? `${parent?.name ?? 'Cortex'} · area` : s.parent ?? 'Structure';
    return (
      <>
        <Header eyebrow={eyebrow} color={s.color} title={s.name} lede={s.tagline}
          onBack={() => pick(parent ? parent.id : null)} backLabel={parent ? parent.name : 'All structures'} />
        <Section title="What it does"><Bullets items={s.does} /></Section>
        <Section title="If it is damaged"><Callout kind="warn" label="Clinical clue">{s.damage}</Callout></Section>
        <Section title="Remember this"><Callout kind="fact" label="Did you know">{s.fact}</Callout></Section>
        {kids.length > 0 && (
          <Section title={`Areas inside the ${s.name.toLowerCase()}`}>
            <div className="chips">
              {kids.map((k) => <Chip key={k.id} label={k.name} color={k.color} onClick={() => pick(k.id)} />)}
            </div>
          </Section>
        )}
        {!!s.connects?.length && (
          <Section title="Works closely with">
            <div className="chips">
              {s.connects.map((id) => structureById.get(id)).filter(Boolean).map((c) => (
                <Chip key={c!.id} label={c!.name} color={c!.color} onClick={() => pick(c!.id)} />
              ))}
            </div>
          </Section>
        )}
        <DiveCTA title="See how regions are wired" sub="Pathways and chemical systems" onClick={() => goTo('systems')} />
      </>
    );
  }
  const groups = ['Diencephalon', 'Limbic system', 'Basal ganglia', 'Hindbrain', 'Brainstem', 'White matter', 'Fluid spaces'];
  return (
    <>
      <Header eyebrow="Level 2 · Brain" title="One organ, many specialists"
        lede="About 1.4 kg and 86 billion neurons. Different regions do different jobs — click any part to meet it." />
      <Section title="Cerebral cortex — the folded outer sheet">
        <div className="list">
          {LOBES.map((l) => <Row key={l.id} title={l.name} sub={l.tagline} color={l.color} onClick={() => pick(l.id)} />)}
        </div>
      </Section>
      {groups.map((g) => {
        const items = DEEP.filter((d) => d.parent === g);
        if (!items.length) return null;
        return (
          <Section key={g} title={g}>
            <div className="list">
              {items.map((d) => <Row key={d.id} title={d.name} sub={d.tagline} color={d.color} onClick={() => pick(d.id)} />)}
            </div>
          </Section>
        );
      })}
      <DiveCTA title="Next: systems" sub="See how these regions talk to each other" onClick={() => goTo('systems')} />
    </>
  );
}

export function BrainDock() {
  const b = useBrain();
  return (
    <>
      <Segmented label="Colour by" value={b.granularity} onChange={(v) => { useCore.getState().select('brain', null); b.set({ granularity: v }); }}
        options={[{ id: 'lobes', label: 'Lobes' }, { id: 'areas', label: 'Areas' }]} />
      <Divider />
      <Slider label="Cortex" value={b.cortexOpacity} onChange={(v) => b.set({ cortexOpacity: v })}
        format={(v) => (v < 0.05 ? 'hidden' : v > 0.97 ? 'solid' : `${Math.round(v * 100)}%`)} />
      <Slider label="Explode" value={b.explode} onChange={(v) => b.set({ explode: v })} />
      <Divider />
      <Toggle label="Left" on={b.showLeft} onChange={(v) => b.set({ showLeft: v })} />
      <Toggle label="Right" on={b.showRight} onChange={(v) => b.set({ showRight: v })} />
      <Divider />
      <Segmented label="Slice" value={b.clipAxis} onChange={(v) => b.set({ clipAxis: v, clipPos: 0 })}
        options={[{ id: 'none', label: 'Off' }, { id: 'sagittal', label: 'Side' }, { id: 'coronal', label: 'Front' }, { id: 'axial', label: 'Top' }]} />
      {b.clipAxis !== 'none' && (
        <Slider label="" value={b.clipPos} min={-1} max={1} onChange={(v) => b.set({ clipPos: v })} />
      )}
    </>
  );
}
