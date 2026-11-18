import type { PhaseId } from '../state/membraneState';

/** one colour language for the whole level: 3D scene, chart and panel */
export const MEM_COLORS = {
  na: '#ffb02e',
  k: '#45d4ff',
  naChannel: '#e2703a',
  kChannel: '#3d7fe6',
  leak: '#35b9a5',
  pump: '#a673e8',
  lipid: '#8f89ad',
  myelin: '#e9dfc8',
  node: '#ffd966',
  axon: '#5b6aa0',
  ball: '#ff4d6d',
  ttx: '#7dff9b',
  tea: '#ff8ad8',
  threshold: '#ff7a8a',
} as const;

export interface MembraneItem {
  id: string;
  name: string;
  tagline: string;
  color: string;
  /** which of the two views shows it */
  view: 'channels' | 'axon';
  eyebrow: string;
  what: string[];
  how: string[];
  fact: string;
  clinical?: string;
  simplified?: string;
}

export const MEMBRANE_ITEMS: MembraneItem[] = [
  {
    id: 'na-channel', name: 'Voltage-gated Na⁺ channel', color: MEM_COLORS.naChannel, view: 'channels',
    eyebrow: 'Ion channel · the igniter',
    tagline: 'Snaps open when the voltage rises, then plugs itself within a millisecond.',
    what: [
      'A protein tunnel through the membrane that lets only sodium ions (Na⁺) pass.',
      'It has two gates: a fast activation gate that opens when the inside of the cell becomes less negative, and a slower inactivation plug (the red ball) that then blocks the pore.',
    ],
    how: [
      'Closed → open: depolarisation opens the gate; Na⁺ rushes in, which depolarises the membrane further and opens more channels. That positive feedback is the explosive rising phase.',
      'Open → inactivated: about a millisecond later the ball swings in and plugs the pore, even though the gate is still open. Na⁺ entry stops — this is why the spike has a peak.',
      'Inactivated → closed: the plug only comes out after the voltage has gone back down. Until then the channel cannot reopen: the refractory period.',
    ],
    fact: 'Pufferfish poison (tetrodotoxin, TTX) fits the outer mouth of this channel like a cork. A milligram or two can stop nerves firing — try the TTX switch.',
    clinical: 'Local anaesthetics such as lidocaine block the same channel from the inside, so pain fibres cannot fire. Several epilepsy and heart-rhythm drugs also work by holding it in the inactivated state.',
    simplified: 'Simplified: the plug is drawn as a ball on a chain. In real Na⁺ channels it is a short hinged loop of the protein. Even at rest roughly 40 % of the channels in this (squid) model are already inactivated — you can see their plugs in.',
  },
  {
    id: 'k-channel', name: 'Voltage-gated K⁺ channel', color: MEM_COLORS.kChannel, view: 'channels',
    eyebrow: 'Ion channel · the reset',
    tagline: 'Opens late, lets K⁺ out, and brings the voltage back down.',
    what: [
      'A tunnel that lets only potassium ions (K⁺) pass. It is made of four identical subunits around a central pore.',
      'It senses the same depolarisation as the Na⁺ channel but its gate is several times slower — so it opens just as the Na⁺ channels are shutting.',
    ],
    how: [
      'K⁺ is concentrated inside the cell, so when the gate opens K⁺ flows out, carrying positive charge with it: the falling phase.',
      'The gate is also slow to close, so K⁺ keeps leaving for a moment after the spike and the voltage dips below rest — the undershoot.',
      'Block it (TEA switch) and the membrane cannot reset.',
    ],
    fact: 'The pore\'s selectivity filter lets K⁺ through at least a thousand times more readily than the smaller Na⁺ ion, at up to a hundred million ions per second. Working out how earned Roderick MacKinnon the 2003 Nobel Prize in Chemistry.',
    clinical: 'A K⁺-channel blocker (fampridine) is used in multiple sclerosis: it helps damaged, demyelinated axons keep conducting by stopping K⁺ leaking out through exposed channels.',
    simplified: 'Simplified: neurons have dozens of kinds of K⁺ channel; this is the classic "delayed rectifier" of the squid axon. TEA blocks squid K⁺ channels from the inside, so the plug is drawn at the inner mouth.',
  },
  {
    id: 'leak-channel', name: 'K⁺ leak channel', color: MEM_COLORS.leak, view: 'channels',
    eyebrow: 'Ion channel · always open',
    tagline: 'A small, always-open exit for K⁺ that sets the resting voltage.',
    what: [
      'A channel with no voltage gate: it is open at rest and lets a trickle of K⁺ leave the cell.',
      'Each K⁺ that leaves takes one positive charge with it, leaving the inside negative.',
    ],
    how: [
      'K⁺ keeps leaking out until the growing negative charge inside pulls it back as hard as the concentration gradient pushes it out. That balance point is close to the resting potential: about −65 mV here, −70 mV in a typical mammalian neuron.',
      'Because the membrane at rest is mostly permeable to K⁺, the resting voltage sits near the K⁺ equilibrium potential (E_K, the blue dashed line on the chart).',
    ],
    fact: 'Only a tiny imbalance is needed: in a typical cell body, fewer than one in every 100,000 K⁺ ions has to leave to set up the whole resting potential.',
    clinical: 'Blood potassium matters. Too much K⁺ outside the cells (hyperkalaemia) weakens the gradient, depolarises nerve and heart cells, and can stop the heart.',
    simplified: 'Simplified: the Hodgkin–Huxley equations lump all resting leaks into one "leak" current; here it is drawn as K⁺ leak channels, which carry most of it in real neurons.',
  },
  {
    id: 'pump', name: 'Na⁺/K⁺ pump', color: MEM_COLORS.pump, view: 'channels',
    eyebrow: 'Transporter · the battery charger',
    tagline: 'Burns ATP to push 3 Na⁺ out and pull 2 K⁺ in — rebuilding the gradients.',
    what: [
      'Not a channel but a machine (an ATPase): it changes shape to carry ions uphill, against their gradients.',
      'Each cycle moves three Na⁺ out and two K⁺ in, and costs one ATP.',
    ],
    how: [
      'The pump does not make the spike — the channels do. It keeps the batteries charged: Na⁺ high outside, K⁺ high inside.',
      'It is slow: roughly a hundred cycles per second, against millions of ions per second through one open channel. It works steadily in the background.',
      'Because so few ions cross during one spike, a neuron could still fire many hundreds of times if the pump stopped.',
    ],
    fact: 'Your brain runs on about 20 watts, and by many estimates around half of that is spent by Na⁺/K⁺ pumps restoring the ions moved by signalling.',
    clinical: 'In a stroke, neurons lose their ATP supply, the pumps stop, the gradients run down and the cells depolarise and swell — one reason minutes matter.',
    simplified: 'Simplified: the cycle is shown as a two-jaw rocking motion; the real protein passes through many intermediate shapes.',
  },
  {
    id: 'bilayer', name: 'Lipid bilayer', color: MEM_COLORS.lipid, view: 'channels',
    eyebrow: 'The membrane itself',
    tagline: 'Two layers of fat molecules, 5 nm thick, that ions cannot cross.',
    what: [
      'Each phospholipid has a water-loving head and two oily tails. In water they line up tail-to-tail, forming a double sheet.',
      'Charged ions cannot dissolve in the oily middle, so the bilayer is an excellent insulator. Ions can only cross through proteins.',
    ],
    how: [
      'An insulator separating two salty, conducting fluids is a capacitor: it stores charge. The + and − symbols on the two faces show that stored charge.',
      'Changing the voltage means moving charge on or off this capacitor, and it takes only a few thousand ions per square micrometre to do it.',
    ],
    fact: 'A resting potential of 70 mV across 5 nm is an electric field of about 14 million volts per metre — stronger than the field that makes lightning. The voltage sensors of the channels sit in that field.',
    simplified: 'Simplified: water, Cl⁻ and other ions are not drawn, and real membranes are crowded with many other proteins.',
  },
  {
    id: 'na-ion', name: 'Sodium ion (Na⁺)', color: MEM_COLORS.na, view: 'channels',
    eyebrow: 'Ion · waiting outside',
    tagline: 'Crowded outside the cell and pulled in by both concentration and charge.',
    what: [
      'About 145 mM outside a neuron but only about 12 mM inside — a twelve-fold difference kept up by the pump.',
      'At rest the inside is also negative, so Na⁺ is pulled inward twice over. It just has no open door.',
    ],
    how: [
      'When Na⁺ channels open, Na⁺ floods in and drives the voltage toward E_Na ≈ +50 mV (orange dashed line on the chart), where the two pulls would balance.',
      'The spike never quite gets there: the Na⁺ channels inactivate and K⁺ channels open first.',
    ],
    fact: 'One spike lets in so few Na⁺ ions that the concentration inside changes by far less than 1 %. The voltage changes enormously; the chemistry hardly at all.',
    simplified: 'Simplified: ions are drawn far larger and far fewer than in reality, and always surrounded by water (not shown).',
  },
  {
    id: 'k-ion', name: 'Potassium ion (K⁺)', color: MEM_COLORS.k, view: 'channels',
    eyebrow: 'Ion · waiting inside',
    tagline: 'Crowded inside the cell; its slow leak outward makes the inside negative.',
    what: [
      'About 140 mM inside a neuron and only 4–5 mM outside.',
      'The concentration gradient pushes K⁺ out; the negative interior pulls it back in. The two balance at E_K ≈ −77 mV (blue dashed line on the chart).',
    ],
    how: [
      'At rest, K⁺ leak channels hold the membrane near E_K.',
      'During the falling phase, voltage-gated K⁺ channels add many more exits, K⁺ pours out and the voltage is dragged back toward E_K — overshooting slightly below rest.',
    ],
    fact: 'About 98 % of the potassium in your body is inside cells. Surgeons stop the heart for bypass operations with a potassium-rich solution: raising K⁺ outside the cells cancels the gradient and silences excitable tissue.',
  },
  {
    id: 'axon', name: 'Axon', color: MEM_COLORS.axon, view: 'axon',
    eyebrow: 'The cable',
    tagline: 'The neuron\'s output wire: the spike is re-made at every point along it.',
    what: [
      'A thin tube of membrane, from under a millimetre to over a metre long, that carries action potentials from the cell body to the synapses.',
      'It is a poor wire: current leaks out through the membrane, so a passive signal would fade within a millimetre or two.',
    ],
    how: [
      'Na⁺ entering at one spot spreads sideways inside the axon and depolarises the next patch to threshold, which fires its own full-size spike — like a row of dominoes, the signal is regenerated rather than transmitted.',
      'The patch that has just fired is refractory (its Na⁺ channels are inactivated), so the wave can only move forward. Stimulate the middle and it spreads both ways.',
    ],
    fact: 'Bare axons are slow — about 1 m/s for thin ones. The squid\'s answer was to make one axon enormous (0.5 mm across); vertebrates found a better trick: myelin.',
    simplified: 'Simplified: 30 mm of a 10 µm axon is shown; its thickness is exaggerated about 175× so you can see it.',
  },
  {
    id: 'myelin', name: 'Myelin sheath', color: MEM_COLORS.myelin, view: 'axon',
    eyebrow: 'Insulation',
    tagline: 'Fatty wrapping that lets the spike jump from gap to gap — ten times faster.',
    what: [
      'Glial cells (oligodendrocytes in the brain, Schwann cells in nerves) wrap their membrane around the axon up to a hundred or more times.',
      'The many layers make the wrapped stretch leak very little and store very little charge.',
    ],
    how: [
      'Under myelin, current from one node shoots down the inside of the axon almost without loss and charges the next node within tens of microseconds.',
      'Only the nodes have to fire, so the spike appears to leap from node to node: saltatory conduction ("saltare" — to jump).',
      'It is also cheaper: far fewer ions cross, so the pumps have much less to do.',
    ],
    fact: 'Myelinated fibres conduct at up to about 100 m/s — a signal from toe to spine in a hundredth of a second. White matter is white because of myelin.',
    clinical: 'In multiple sclerosis the immune system attacks myelin in the brain and spinal cord. Stripped stretches slow or block spikes — try "Damage". Symptoms often worsen with heat, which makes borderline conduction fail.',
    simplified: 'Simplified: one sheath segment (internode) here is 1 mm long, as on a large fibre. Speeds are computed from the simulation at the squid\'s 6 °C; warm mammalian fibres are several times faster again.',
  },
  {
    id: 'node', name: 'Node of Ranvier', color: MEM_COLORS.node, view: 'axon',
    eyebrow: 'The relay station',
    tagline: 'A one-micrometre gap in the myelin, packed with Na⁺ channels.',
    what: [
      'A short stretch of bare axon between two myelin segments.',
      'Na⁺ channels are crowded here at over a thousand per square micrometre — far denser than on an unmyelinated axon.',
    ],
    how: [
      'Each node is a booster: it receives a slightly faded signal from the node before, fires a fresh full-size spike and passes it on.',
      'The safety margin is large — a healthy node supplies several times the current needed to fire the next one. Damaged myelin eats into that margin until conduction fails.',
    ],
    fact: 'The spike is so fast and nodes so close that many nodes are active at once: a travelling spike on a large fibre covers a couple of centimetres of axon at any instant.',
    simplified: 'Simplified: the gaps are drawn much wider than their real 1–2 µm.',
  },
];

export const itemById = new Map(MEMBRANE_ITEMS.map((i) => [i.id, i]));

export const SEARCH_ITEMS: { id: string; name: string; tagline: string }[] = MEMBRANE_ITEMS.map(({ id, name, tagline }) => ({ id, name, tagline }));

export interface PhaseInfo {
  id: PhaseId;
  /** beat number in "the story in six beats" (0 = not one of the six) */
  beat: number;
  name: string;
  short: string;
  color: string;
  /** one sentence shown in the banner */
  now: string;
  /** one-sentence why for the panel */
  why: string;
}

export const PHASES: Record<PhaseId, PhaseInfo> = {
  rest: {
    id: 'rest', beat: 1, name: 'Resting', short: 'Rest', color: '#7f8bb0',
    now: 'Inside negative. Gated channels shut; K⁺ leaks slowly out.',
    why: 'K⁺ leaking out through always-open channels leaves the inside about 65 mV negative. Na⁺ channels are shut.',
  },
  stimulus: {
    id: 'stimulus', beat: 0, name: 'Stimulus', short: 'Stim', color: '#c8cede',
    now: 'Input current nudges the voltage up. Will it reach threshold?',
    why: 'An input pushes the voltage upward.',
  },
  rising: {
    id: 'rising', beat: 2, name: 'Rising phase', short: 'Rising', color: MEM_COLORS.na,
    now: 'Na⁺ channels snap open. Na⁺ rushes in → more channels open.',
    why: 'Past threshold (≈ −55 mV), Na⁺ channels open, Na⁺ rushes in and opens still more channels: a chain reaction.',
  },
  peak: {
    id: 'peak', beat: 3, name: 'Peak', short: 'Peak', color: MEM_COLORS.ball,
    now: 'Inside is now positive. Na⁺ channels plug themselves (inactivate).',
    why: 'Within a millisecond the Na⁺ channels plug themselves (inactivate), so the voltage stops short of E_Na.',
  },
  falling: {
    id: 'falling', beat: 4, name: 'Falling phase', short: 'Falling', color: MEM_COLORS.k,
    now: 'Slow K⁺ channels are open. K⁺ rushes out; voltage falls.',
    why: 'The slower K⁺ channels have now opened; K⁺ leaves and carries the positive charge back out.',
  },
  undershoot: {
    id: 'undershoot', beat: 5, name: 'Undershoot', short: 'Under', color: '#6f7cf0',
    now: 'K⁺ channels are slow to close: voltage dips below rest.',
    why: 'K⁺ channels close slowly, so the voltage briefly dips below rest, toward E_K.',
  },
  recovery: {
    id: 'recovery', beat: 6, name: 'Refractory recovery', short: 'Recovery', color: '#5fd6a0',
    now: 'Na⁺ channels are un-plugging. A new spike is hard to start.',
    why: 'Until the Na⁺ channels un-plug, a second spike is impossible (absolute) and then merely harder (relative) — the refractory period, which began at the peak.',
  },
  stuck: {
    id: 'stuck', beat: 0, name: 'Stuck depolarised', short: 'Stuck', color: MEM_COLORS.tea,
    now: 'Without K⁺ channels the membrane cannot reset. Na⁺ channels stay plugged.',
    why: 'With K⁺ channels blocked the membrane cannot repolarise.',
  },
};

export const SIX_BEATS: PhaseId[] = ['rest', 'rising', 'peak', 'falling', 'undershoot', 'recovery'];

export const KEY_IDEAS: { title: string; text: string }[] = [
  {
    title: 'The battery',
    text: 'The pump builds the gradients (Na⁺ outside, K⁺ inside); leak channels turn them into a resting voltage. A spike only spends a tiny fraction of that store — the concentrations barely change.',
  },
  {
    title: 'All-or-none',
    text: 'Below threshold nothing happens; above it you always get the same full-size spike. Stronger input means more spikes per second, never bigger spikes.',
  },
  {
    title: 'One-way travel',
    text: 'The stretch of axon that has just fired has its Na⁺ channels plugged, so the spike cannot turn back.',
  },
  {
    title: 'Why myelin is fast',
    text: 'Insulated stretches pass the signal along almost instantly; only the small gaps (nodes) need to fire. See it in the Axon view.',
  },
];

export const HONESTY_NOTE =
  'The numbers are the classic Hodgkin–Huxley ones for the squid giant axon at 6 °C. Mammalian neurons work the same way but differ in detail: rest is nearer −70 mV, and at body temperature everything is several times faster (a spike lasts about 1 ms).';

export const BLOCKERS = {
  ttx: {
    name: 'TTX', full: 'Tetrodotoxin',
    text: 'Pufferfish toxin. Corks the outer mouth of Na⁺ channels: no Na⁺ entry, no spike. Lidocaine blocks the same channel.',
  },
  tea: {
    name: 'TEA', full: 'Tetraethylammonium',
    text: 'Blocks voltage-gated K⁺ channels: the membrane fires once and then cannot reset. In this model those channels also help hold the resting voltage, so the membrane drifts up and fires by itself.',
  },
};
