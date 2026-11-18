import type { DrugId, ReceptorKind, TransmitterId } from '../sim/synapse';
import { DRUG_TRANSMITTERS } from '../sim/synapse';

/** colours shared by the 3D scene, the chart and the panel */
export const COLORS = {
  pre: '#7f9bd6',
  post: '#b497c9',
  astro: '#5fae9d',
  ca: '#ffe95e',
  na: '#ff7a5c',
  cl: '#7dffcf',
  mito: '#d98a62',
  spike: '#fff2c4',
  messenger: '#ff9de0',
};

export interface TransmitterInfo {
  id: TransmitterId;
  name: string;
  tagline: string;
  color: string;
  /** one-word role shown on the chooser */
  role: string;
  /** what the receptors on this synapse are called */
  receptors: string;
  /** label for the 3D receptor tag */
  receptorTag: string;
  /** what happens when it binds */
  effect: string;
  ion: 'Na⁺' | 'Cl⁻' | null;
  /** label for the main clearance machine in the 3D view */
  clearanceTag: string;
  clearance: string;
  bullets: string[];
  fact: string;
  clinical: string;
  simplified: string;
  /** what the response chart shows */
  responseLabel: string;
}

export const TRANSMITTERS: TransmitterInfo[] = [
  {
    id: 'glutamate', name: 'Glutamate', color: '#ffa53d', role: 'Excites',
    tagline: 'The brain\'s main "go" signal — used by most of its synapses.',
    receptors: 'AMPA and NMDA receptors', receptorTag: 'AMPA + NMDA receptors',
    effect: 'Opens channels that let Na⁺ rush in, nudging the next neuron towards firing (an EPSP).',
    ion: 'Na⁺', clearanceTag: 'Glutamate transporter (EAAT)',
    clearance: 'Mopped up mostly by the astrocyte next door, which recycles it back to the neuron as harmless glutamine.',
    bullets: [
      'AMPA receptors are the fast workers: glutamate binds, the pore opens, Na⁺ flows in, and it is over in milliseconds.',
      'NMDA receptors are plugged by a magnesium ion (Mg²⁺) at rest. Only if the spine is already depolarised does the plug pop out — so they open when sender and receiver are active together. A "coincidence detector".',
      'Open NMDA receptors also let Ca²⁺ in, which tells the spine to add more AMPA receptors. The synapse gets stronger: long-term potentiation (LTP), a cellular basis of learning.',
    ],
    fact: 'Try it: one spike barely opens the NMDA receptors. Fire a burst and watch them join in — then count the AMPA receptors afterwards.',
    clinical: 'Too much glutamate is toxic. During a stroke, starved cells dump glutamate, over-excited neighbours flood with Ca²⁺ and die — "excitotoxicity".',
    simplified: 'Real LTP takes minutes and many molecular steps; here a few strong bursts insert receptors within seconds. The Mg²⁺ block is shown as a smooth switch around −60 mV.',
    responseLabel: 'EPSP — a push towards threshold',
  },
  {
    id: 'gaba', name: 'GABA', color: '#58b7ff', role: 'Inhibits',
    tagline: 'The brain\'s main "stop" signal — it keeps excitation in check.',
    receptors: 'GABA-A receptors', receptorTag: 'GABA-A receptors (Cl⁻ channels)',
    effect: 'Opens channels for chloride (Cl⁻). Negative charge flows in and pulls the cell away from threshold (an IPSP).',
    ion: 'Cl⁻', clearanceTag: 'GABA transporter (GAT)',
    clearance: 'Pumped back into the terminal (GAT-1) and into astrocytes (GAT-3) by GABA transporters.',
    bullets: [
      'The GABA-A receptor is a chloride channel. When it opens, the membrane is pinned near −70 to −85 mV, so excitatory inputs arriving at the same time achieve less.',
      'About one in five cortical neurons is a GABA-releasing interneuron. They sculpt timing and rhythm, and stop activity running away.',
      'Turn on "Other inputs" below: the cell hovers near threshold and fires now and then. Now fire GABA and watch the firing stop.',
    ],
    fact: 'GABA is made from glutamate in a single step — the brain\'s main brake is built out of its main accelerator.',
    clinical: 'Too little inhibition lets neurons fire in runaway synchrony: a seizure. Many anti-seizure and anti-anxiety drugs work by boosting GABA signalling.',
    simplified: 'The IPSP is drawn larger than life. Near rest, real GABA-A currents barely move the voltage — they work mostly by short-circuiting excitation.',
    responseLabel: 'IPSP — a pull away from threshold',
  },
  {
    id: 'dopamine', name: 'Dopamine', color: '#ff5fa8', role: 'Modulates',
    tagline: 'A modulator: it does not say "fire" or "stop" — it changes how the cell listens.',
    receptors: 'D1-like and D2-like receptors', receptorTag: 'D1 / D2 receptors (G-protein-coupled)',
    effect: 'No pore opens. The receptor activates a G-protein inside the cell, which changes a second messenger (cAMP) — a slow signal that retunes the neuron for seconds.',
    ion: null, clearanceTag: 'Dopamine transporter (DAT)',
    clearance: 'Pumped back into the terminal by the dopamine transporter, DAT, and repackaged into vesicles.',
    bullets: [
      'Dopamine receptors are not channels. Watch the response: the voltage stays flat while a slow glow builds inside the spine and outlasts the dopamine.',
      'D1-like receptors raise cAMP; D2-like receptors lower it. The same transmitter can turn a cell\'s sensitivity up or down depending on which receptor it carries.',
      'Dopamine neurons fire when something is better than expected — a teaching signal ("that was worth repeating") more than a pleasure signal.',
    ],
    fact: 'Only about one neuron in 200,000 makes dopamine, but each one branches enormously, forming hundreds of thousands of release sites.',
    clinical: 'In Parkinson\'s disease the dopamine neurons of the substantia nigra die and movements become slow and hard to start. The drug L-DOPA is a building block the remaining cells turn into dopamine.',
    simplified: 'Real dopamine terminals often release into the surrounding space rather than a tight cleft, and act over seconds to minutes. With "Other inputs" on, the internal signal makes those inputs count for more.',
    responseLabel: 'No direct voltage change — a slow internal signal',
  },
  {
    id: 'serotonin', name: 'Serotonin', color: '#b08cff', role: 'Modulates',
    tagline: 'A modulator made by a few thousand brainstem cells that reach the whole brain.',
    receptors: 'serotonin (5-HT) receptors', receptorTag: '5-HT receptors (mostly G-protein-coupled)',
    effect: 'Mostly G-protein-coupled receptors: no pore, but a slow internal signal that changes how the neuron responds to its other inputs.',
    ion: null, clearanceTag: 'Serotonin transporter (SERT)',
    clearance: 'Pumped back into the terminal by the serotonin transporter, SERT.',
    bullets: [
      'There are at least 14 kinds of serotonin receptor. All but one are G-protein-coupled; different kinds push cells in different directions.',
      'Serotonin neurons sit in the raphe nuclei of the brainstem and send fibres almost everywhere. They influence mood, sleep, appetite and patience.',
      'Like dopamine it works slowly: the internal signal lingers after the serotonin itself has been cleared.',
    ],
    fact: 'Roughly 90% of the body\'s serotonin is in the gut, not the brain, where it helps drive digestion. It cannot cross from blood to brain.',
    clinical: 'The idea that depression is simply "low serotonin" is not supported by the evidence. SSRIs do help many people, but how is still being worked out.',
    simplified: 'One receptor type stands in for the whole family, and its internal signal is drawn as a single glow.',
    responseLabel: 'No direct voltage change — a slow internal signal',
  },
  {
    id: 'acetylcholine', name: 'Acetylcholine', color: '#b6e84f', role: 'Excites (here)',
    tagline: 'The transmitter that makes muscles move — and sharpens attention in the brain.',
    receptors: 'nicotinic receptors', receptorTag: 'Nicotinic receptors (cation channels)',
    effect: 'At nicotinic receptors it opens a fast channel for Na⁺: a quick, strong excitation.',
    ion: 'Na⁺', clearanceTag: 'Acetylcholinesterase (enzyme)',
    clearance: 'Not pumped back whole. An enzyme in the cleft, acetylcholinesterase, snips it in two within a millisecond; the terminal then takes up the choline half to make more.',
    bullets: [
      'This is the synapse between nerve and muscle (the neuromuscular junction) and many synapses of the autonomic nervous system.',
      'Watch the little "pac-men" in the cleft: each acetylcholinesterase enzyme can destroy thousands of molecules a second, so the signal is crisp.',
      'Acetylcholine also has slow G-protein-coupled receptors (muscarinic) — the ones that slow your heart.',
    ],
    fact: 'It was the first neurotransmitter ever discovered. In 1921 Otto Loewi showed that fluid from one stimulated frog heart could slow a second heart — proof that nerves talk with chemicals.',
    clinical: 'In myasthenia gravis the immune system attacks the nicotinic receptors on muscle, causing weakness that worsens with use. Blocking the enzyme a little leaves more acetylcholine around and helps.',
    simplified: 'A real neuromuscular junction is far bigger than this synapse and releases enough to fire the muscle fibre every time.',
    responseLabel: 'EPSP — a push towards threshold',
  },
];
export const transmitterById = new Map(TRANSMITTERS.map((t) => [t.id as string, t]));

export const RECEPTOR_NAMES: Record<ReceptorKind, { name: string; note: string }> = {
  ampa: { name: 'AMPA receptor', note: 'Fast Na⁺ channel — opens whenever glutamate binds.' },
  nmda: { name: 'NMDA receptor', note: 'Needs glutamate AND a depolarised spine to expel its Mg²⁺ plug. Lets Ca²⁺ in.' },
  gabaa: { name: 'GABA-A receptor', note: 'Chloride channel — opens when GABA binds.' },
  d1: { name: 'D1-like dopamine receptor', note: 'G-protein-coupled: raises cAMP inside the cell.' },
  d2: { name: 'D2-like dopamine receptor', note: 'G-protein-coupled: lowers cAMP. The target of antipsychotics.' },
  '5ht': { name: 'Serotonin (5-HT) receptor', note: 'G-protein-coupled: starts a slow internal signal.' },
  nachr: { name: 'Nicotinic acetylcholine receptor', note: 'Fast cation channel — five subunits around a pore.' },
};

export interface DrugInfo {
  id: DrugId;
  name: string;
  /** short label for the toggle */
  short: string;
  tagline: string;
  color: string;
  /** where it acts — shown as eyebrow */
  target: string;
  mechanism: string;
  /** what to look for in the 3D view */
  watch: string;
  note: string;
  transmitters: TransmitterId[];
}

const drug = (d: Omit<DrugInfo, 'transmitters'>): DrugInfo => ({ ...d, transmitters: DRUG_TRANSMITTERS[d.id] });

export const DRUGS: DrugInfo[] = [
  drug({
    id: 'ssri', name: 'SSRI (e.g. fluoxetine)', short: 'SSRI', color: '#7fe3d2', target: 'Blocks the serotonin transporter',
    tagline: 'Plugs SERT, so serotonin stays in the cleft longer.',
    mechanism: 'A selective serotonin reuptake inhibitor sits in the serotonin transporter (SERT) and stops it pumping serotonin back into the terminal.',
    watch: 'Plugs appear on the transporters. Fire a spike: serotonin now lingers until it drifts out of the cleft, and the internal signal lasts longer.',
    note: 'The block happens within hours, but mood usually improves only after weeks — so the benefit must come from slower changes in the brain, not simply "more serotonin". The low-serotonin story of depression is incomplete.',
  }),
  drug({
    id: 'cocaine', name: 'Cocaine', short: 'Cocaine', color: '#f4f4f4', target: 'Blocks the dopamine transporter',
    tagline: 'Plugs DAT, so released dopamine piles up.',
    mechanism: 'Cocaine jams the dopamine transporter (DAT). Dopamine that is released by spikes cannot be pumped back, so each spike\'s signal is bigger and lasts longer.',
    watch: 'Plugs on the transporters; dopamine lingers and the internal signal stays high. Note that it still needs spikes — no firing, no dopamine.',
    note: 'By exaggerating dopamine\'s "that was worth repeating" teaching signal, it trains the brain to seek the drug. It also blocks noradrenaline and serotonin transporters.',
  }),
  drug({
    id: 'amphetamine', name: 'Amphetamine', short: 'Amphetamine', color: '#ffd24a', target: 'Reverses the dopamine transporter',
    tagline: 'Runs DAT backwards and empties vesicles — dopamine floods out with no spike.',
    mechanism: 'Amphetamine enters the terminal through DAT, pushes dopamine out of the vesicles into the cytoplasm, and makes the transporter run in reverse.',
    watch: 'Transporters glow and spit dopamine into the cleft continuously, without any spike. Vesicles pale as they empty, so a spike itself now releases less.',
    note: 'In low, slow oral doses this is an effective ADHD medicine; in large fast doses it is a drug of abuse. Dose and speed of delivery matter enormously.',
  }),
  drug({
    id: 'antipsychotic', name: 'Antipsychotic (e.g. haloperidol)', short: 'Antipsychotic', color: '#9fb4ff', target: 'Blocks D2 receptors',
    tagline: 'Sits on D2 receptors so dopamine cannot activate them.',
    mechanism: 'Haloperidol and related drugs occupy D2-like dopamine receptors without switching them on (an antagonist), so dopamine finds them already taken.',
    watch: 'Half the receptors (the D2 type) get plugs. Dopamine still binds D1 receptors, so the internal signal changes rather than vanishes.',
    note: 'Blocking D2 in one pathway eases hallucinations and delusions; blocking it in the movement pathway can cause stiffness and tremor that resemble Parkinson\'s disease.',
  }),
  drug({
    id: 'benzo', name: 'Benzodiazepine (e.g. diazepam)', short: 'Benzodiazepine', color: '#ffe27a', target: 'Boosts GABA-A receptors',
    tagline: 'Makes GABA-A receptors open more readily — but only when GABA is there.',
    mechanism: 'It binds a separate site on the GABA-A receptor. Alone it does nothing; when GABA binds, the channel opens more often and GABA stays on longer, so more Cl⁻ flows.',
    watch: 'A small helper marker sits on each receptor. Nothing changes at rest. Fire a spike and the IPSP is clearly larger and longer.',
    note: 'Calming, sleep-inducing and anti-seizure. Because it only amplifies the brain\'s own GABA it is safer than older sedatives — but mixed with alcohol or opioids it can stop breathing, and it is habit-forming.',
  }),
  drug({
    id: 'alcohol', name: 'Alcohol (ethanol)', short: 'Alcohol', color: '#e6c79a', target: 'Boosts GABA-A · dampens NMDA',
    tagline: 'Turns the brake up and the accelerator down at the same time.',
    mechanism: 'Ethanol is not tidy: among many targets it enhances GABA-A receptors (more inhibition) and inhibits NMDA receptors (less excitation, less plasticity).',
    watch: 'With GABA: a larger IPSP. With glutamate: NMDA receptors pass less current, so bursts struggle to reach threshold and fewer AMPA receptors are added.',
    note: 'Dampened NMDA receptors in the hippocampus are one reason heavy drinking causes memory blackouts — the "save" signal for new memories is weakened.',
  }),
  drug({
    id: 'ketamine', name: 'Ketamine', short: 'Ketamine', color: '#c9a3ff', target: 'Blocks the NMDA receptor pore',
    tagline: 'Plugs the open NMDA channel, much as Mg²⁺ does — but without letting go.',
    mechanism: 'Ketamine lodges inside the NMDA receptor\'s pore. Glutamate can still bind, but no current and no Ca²⁺ get through.',
    watch: 'Plugs appear on the NMDA receptors only. Bursts no longer recruit them: the response is smaller, the next neuron may not fire, and no AMPA receptors are added.',
    note: 'An anaesthetic, and at low doses a fast-acting antidepressant. The natural blocker of this pore is the Mg²⁺ ion, pushed out only when the spine is depolarised.',
  }),
  drug({
    id: 'nicotine', name: 'Nicotine', short: 'Nicotine', color: '#ffc27a', target: 'Activates nicotinic receptors',
    tagline: 'Fits the acetylcholine receptor and opens it — no acetylcholine required.',
    mechanism: 'Nicotine is an agonist: it binds the same site as acetylcholine and opens the channel. The enzyme that clears acetylcholine cannot break it down.',
    watch: 'Receptors flicker open at random with a nicotine marker on them, and the voltage sits above rest — with no spike at all.',
    note: 'The receptor is named after the drug. In the brain these receptors sit on dopamine neurons, among others, which is why nicotine is so reinforcing. With long exposure receptors stop responding (desensitise) — not modelled here.',
  }),
  drug({
    id: 'donepezil', name: 'Donepezil (Alzheimer\'s medicine)', short: 'Donepezil', color: '#4fc3f0', target: 'Partly blocks acetylcholinesterase',
    tagline: 'Slows the enzyme, so each pulse of acetylcholine lasts a little longer.',
    mechanism: 'Donepezil reversibly inhibits acetylcholinesterase. Most enzyme molecules are held up at any moment, so acetylcholine survives longer and reaches more receptors.',
    watch: 'Most enzyme "pac-men" get a plug. Acetylcholine lingers for longer and the response is bigger — but it is still cleared.',
    note: 'In Alzheimer\'s disease acetylcholine-releasing neurons are lost early. Making the remaining acetylcholine last longer gives a modest, temporary benefit; it does not stop the disease.',
  }),
  drug({
    id: 'nerveagent', name: 'Nerve agent / organophosphate', short: 'Nerve agent', color: '#ff6a5c', target: 'Shuts down acetylcholinesterase',
    tagline: 'The same target as donepezil — but total and permanent.',
    mechanism: 'Sarin and organophosphate pesticides bond chemically to acetylcholinesterase and disable it. Acetylcholine is no longer destroyed at all.',
    watch: 'Every enzyme is plugged. Acetylcholine only leaves by drifting out of the cleft, so receptors stay activated far too long.',
    note: 'At a nerve–muscle junction this means muscles cannot relax — including the breathing muscles. Same mechanism as a medicine; the dose and the permanence make it a poison. Atropine is part of the antidote.',
  }),
  drug({
    id: 'botox', name: 'Botulinum toxin (Botox)', short: 'Botox', color: '#ff8ad1', target: 'Stops vesicle fusion',
    tagline: 'Cuts the proteins that let vesicles fuse — the spike arrives but nothing is released.',
    mechanism: 'The toxin enters the terminal and cuts SNARE proteins, the machinery that pulls a vesicle into the membrane. Ca²⁺ still enters; the vesicles simply cannot fuse.',
    watch: 'Markers appear at the release sites. Fire a spike: Ca²⁺ flows in, the docked vesicles sit there, the cleft stays empty and the trace stays flat.',
    note: 'The most poisonous substance known — yet in tiny, local doses it safely relaxes overactive muscles (spasms, squints, migraines and wrinkles). The muscle recovers as new SNAREs are made over months.',
  }),
  drug({
    id: 'curare', name: 'Curare', short: 'Curare', color: '#c7b6ff', target: 'Blocks nicotinic receptors',
    tagline: 'Sits on the receptor so acetylcholine cannot — release is normal, the message is not received.',
    mechanism: 'Curare (tubocurarine) competes with acetylcholine for the nicotinic receptor and holds it shut.',
    watch: 'Every receptor is plugged. Vesicles fuse and acetylcholine crosses the cleft as usual — and nothing happens on the other side.',
    note: 'An arrow poison of South American hunters: the animal is paralysed but its meat is safe to eat. Its modern relatives relax muscles during surgery, while a ventilator does the breathing.',
  }),
];
export const drugById = new Map(DRUGS.map((d) => [d.id as string, d]));
export const drugsFor = (t: TransmitterId) => DRUGS.filter((d) => d.transmitters.includes(t));

export interface PartInfo {
  id: string;
  name: string;
  tagline: string;
  color: string;
  eyebrow: string;
  bullets: string[];
  fact: string;
  clinical?: string;
  simplified?: string;
}

export const PARTS: PartInfo[] = [
  {
    id: 'terminal', name: 'Axon terminal', color: COLORS.pre, eyebrow: 'Presynaptic · the sender',
    tagline: 'The swollen end of an axon, packed with transmitter ready to release.',
    bullets: [
      'The axon carries the spike here from the cell body — which may be a metre away.',
      'Everything needed to turn the electrical spike into a chemical message is concentrated in this bulb, about one thousandth of a millimetre across.',
      'Its membrane is cut open here so you can see inside.',
    ],
    fact: 'One axon can branch to form thousands of terminals, and release is unreliable on purpose: many terminals release on only a fraction of spikes.',
  },
  {
    id: 'vesicle', name: 'Synaptic vesicle', color: '#dfe8ff', eyebrow: 'Presynaptic · the package',
    tagline: 'A membrane bubble 40 nm wide holding a few thousand transmitter molecules.',
    bullets: [
      'A few vesicles are "docked" at the membrane, primed and ready. The rest wait in a reserve pool.',
      'When Ca²⁺ arrives, a docked vesicle fuses with the membrane and spills its contents into the cleft (exocytosis) in under a millisecond.',
      'The membrane is then pinched back off and the empty vesicle is refilled and reused.',
    ],
    fact: 'Transmitter is released in whole packets, never half a vesicle. Bernard Katz saw these "quanta" as tiny identical blips in muscle recordings in the 1950s.',
    clinical: 'Botulinum and tetanus toxins both cut the SNARE proteins that fuse vesicles — the same mechanism, at different synapses, with opposite symptoms (limp versus rigid paralysis).',
  },
  {
    id: 'cachannel', name: 'Voltage-gated Ca²⁺ channel', color: COLORS.ca, eyebrow: 'Presynaptic · the trigger',
    tagline: 'Opens when the spike arrives and lets calcium ions in.',
    bullets: [
      'These channels sense voltage. At rest they are shut; the spike\'s depolarisation swings them open for about a millisecond.',
      'Ca²⁺ is 10,000 times more concentrated outside the cell than inside, so it rushes in.',
      'Calcium binds a sensor protein on the vesicle (synaptotagmin), which triggers fusion. The channels sit right beside docked vesicles so the signal is fast and local.',
    ],
    fact: 'Release rises with roughly the fourth power of calcium: double the Ca²⁺ and you get about sixteen times the release.',
    clinical: 'In Lambert–Eaton syndrome antibodies attack these channels, less Ca²⁺ enters, and muscles are weak — but grow stronger with repeated effort as calcium builds up.',
  },
  {
    id: 'cleft', name: 'Synaptic cleft', color: '#9fc4ff', eyebrow: 'The gap',
    tagline: 'A fluid-filled gap of 20–30 nm that the signal must cross as a chemical.',
    bullets: [
      'The two neurons do not touch. Transmitter crosses by diffusion — random jostling — which over such a tiny distance takes well under a millisecond.',
      'The gap is drawn about four times too wide here so you can see into it, and molecules are drawn far too large.',
      'What gets cleared, and how fast, sets how long the message lasts — which is why so many drugs act on clearance.',
    ],
    fact: 'The cleft is about 5,000 times thinner than a human hair — too small to see with a light microscope. It was first seen with electron microscopes in the 1950s.',
  },
  {
    id: 'receptor', name: 'Receptor', color: '#e9c8ff', eyebrow: 'Postsynaptic · the lock',
    tagline: 'A protein that recognises one transmitter and turns it into a response.',
    bullets: [
      'Ion-channel receptors (AMPA, NMDA, GABA-A, nicotinic) are a ring of subunits around a pore. Transmitter binds, the pore opens, ions flow: fast.',
      'G-protein-coupled receptors (dopamine, most serotonin) have no pore. They switch on a G-protein inside the cell that starts a slower chemical cascade.',
      'The transmitter is only a key. What it does depends entirely on which receptor it meets — the same molecule can excite one cell and inhibit another.',
    ],
    fact: 'Receptors are not fixed in place: they drift in the membrane and are added or removed in minutes. Changing their number is one way a synapse stores a memory.',
    simplified: 'Real channel receptors usually need two transmitter molecules to open; here one is enough.',
  },
  {
    id: 'transporter', name: 'Reuptake transporter', color: '#ffd9a3', eyebrow: 'Clean-up · the pump',
    tagline: 'A membrane pump that pulls transmitter back out of the cleft.',
    bullets: [
      'Each transmitter has its own: DAT for dopamine, SERT for serotonin, GAT for GABA, EAAT for glutamate.',
      'It ends the signal and recycles the transmitter, powered by the sodium gradient across the membrane.',
      'Blocking it makes the transmitter linger — the mechanism of SSRIs and of cocaine.',
    ],
    fact: 'Acetylcholine is the odd one out: it is destroyed in the cleft by an enzyme, and only the choline fragment is taken back up.',
  },
  {
    id: 'enzyme', name: 'Acetylcholinesterase', color: '#d9f08f', eyebrow: 'Clean-up · the enzyme',
    tagline: 'An enzyme anchored in the cleft that cuts acetylcholine in two.',
    bullets: [
      'One of the fastest enzymes known: each molecule splits thousands of acetylcholine molecules per second.',
      'It splits acetylcholine into acetate and choline; the terminal takes the choline back up to make more.',
      'Shown only when the transmitter is acetylcholine.',
    ],
    fact: 'Slow it slightly and you have an Alzheimer\'s medicine; stop it completely and you have a nerve agent.',
  },
  {
    id: 'astrocyte', name: 'Astrocyte process', color: COLORS.astro, eyebrow: 'Glia · the third partner',
    tagline: 'A star-shaped glial cell wraps the synapse, mops up transmitter and listens in.',
    bullets: [
      'Its transporters soak up most of the brain\'s released glutamate, stopping it spilling over to neighbouring synapses.',
      'It converts glutamate into glutamine and hands it back to the neuron for reuse — the glutamate–glutamine cycle.',
      'Astrocytes also sense transmitters and respond with their own calcium signals, which is why many scientists speak of a "tripartite synapse".',
    ],
    fact: 'A single human astrocyte can touch up to two million synapses.',
    clinical: 'When astrocytes fail to clear glutamate — as happens after a stroke or in ALS — neurons are damaged by over-excitation.',
  },
  {
    id: 'mitochondrion', name: 'Mitochondrion', color: COLORS.mito, eyebrow: 'Presynaptic · the power supply',
    tagline: 'Supplies the energy (ATP) that keeps the terminal running.',
    bullets: [
      'Refilling vesicles, recycling membrane and pumping Ca²⁺ back out all cost energy.',
      'Mitochondria also soak up some of the incoming Ca²⁺, helping to shape how long it lingers.',
      'They are made in the cell body and ferried down the axon on molecular motors.',
    ],
    fact: 'The brain is 2% of body weight but uses about 20% of its energy — and most of that pays for signalling at synapses.',
  },
  {
    id: 'spine', name: 'Dendritic spine', color: COLORS.post, eyebrow: 'Postsynaptic · the receiver',
    tagline: 'A tiny mushroom-shaped bud on a dendrite that receives one synapse.',
    bullets: [
      'Just under its membrane lies the postsynaptic density, a protein scaffold that holds receptors opposite the release sites.',
      'The thin neck keeps chemical signals such as Ca²⁺ inside, so each spine can change its own strength independently.',
      'Small voltage changes from thousands of spines add up in the dendrite. If the sum reaches threshold (about −55 mV) the neuron fires.',
    ],
    fact: 'Spines change shape: learning can make a spine swell within minutes, and a single cortical neuron carries around 10,000 of them.',
    clinical: 'Unusual spine numbers or shapes are found in several conditions, including fragile X syndrome and schizophrenia.',
  },
];
export const partById = new Map(PARTS.map((p) => [p.id, p]));

export const CAFFEINE = {
  id: 'caffeine', name: 'Caffeine', color: '#c79a6b',
  tagline: 'Blocks receptors for adenosine, the brain\'s "sleep pressure" signal.',
  bullets: [
    'Adenosine builds up in the brain the longer you are awake and makes neurons less excitable — you feel sleepy.',
    'Caffeine fits the adenosine receptor without activating it (an antagonist, like curare at the nicotinic receptor). The sleepiness signal is still there; it just is not being heard.',
    'It does not add energy. When it wears off, the adenosine that kept accumulating is suddenly felt.',
  ],
  fact: 'Caffeine is the most widely used psychoactive drug in the world. Its half-life in the body is 5–6 hours, so an afternoon coffee is still about half there at bedtime.',
  note: 'Not simulated here — adenosine receptors are not on this model synapse. It is the same idea you can see with curare or haloperidol: a molecule that occupies a receptor and keeps the real signal out.',
};

export const STAGES: { n: number; title: string; text: string }[] = [
  { n: 1, title: 'A spike arrives', text: 'An action potential — a brief electrical pulse — races down the axon into the terminal.' },
  { n: 2, title: 'Calcium channels open', text: 'The voltage change opens Ca²⁺ channels. Calcium floods in next to the docked vesicles.' },
  { n: 3, title: 'Vesicles fuse', text: 'Ca²⁺ triggers docked vesicles to merge with the membrane and spill their transmitter.' },
  { n: 4, title: 'Transmitter crosses the gap', text: 'Molecules spread by random jostling (diffusion). The gap is so narrow it takes microseconds.' },
  { n: 5, title: 'Receptors respond', text: 'Molecules dock on receptors, which open and let ions through — an electrical signal again.' },
  { n: 6, title: 'Clean-up', text: 'Transmitter lets go and is pumped away, broken down or drifts off. Vesicles are refilled.' },
];

export const FACTS: { label: string; text: string }[] = [
  { label: 'How many?', text: 'A typical neuron receives several thousand synapses. The whole brain has roughly 100 trillion — hundreds of times the number of stars in our galaxy.' },
  { label: 'Not only chemical', text: 'Some neurons are joined directly by gap junctions — tiny pores that let current pass straight through. These electrical synapses are faster but cannot be tuned in as many ways.' },
  { label: 'The frog-heart experiment', text: 'In 1921 Otto Loewi stimulated the nerve to one frog heart, then moved its fluid to a second heart — which slowed too. A chemical, not electricity, carried the message. It was acetylcholine.' },
];

export const SEARCH_ITEMS: { id: string; name: string; tagline: string }[] = [
  ...TRANSMITTERS.map(({ id, name, tagline }) => ({ id, name, tagline })),
  ...PARTS.map(({ id, name, tagline }) => ({ id, name, tagline })),
  ...DRUGS.map(({ id, name, tagline }) => ({ id, name, tagline })),
  { id: CAFFEINE.id, name: CAFFEINE.name, tagline: CAFFEINE.tagline },
];
