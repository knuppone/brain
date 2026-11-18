/** Teaching text and data for the Cells level. */

export type CellGroup = 'excite' | 'inhibit' | 'glia' | 'special';

export type CellTypeId =
  | 'pyramidal' | 'stellate'
  | 'basket' | 'martinotti' | 'chandelier'
  | 'astrocyte' | 'oligodendrocyte' | 'microglia'
  | 'purkinje' | 'granule' | 'msn' | 'dopaminergic';

/** keys of the anatomical landmarks the 3D specimen can label */
export type LandmarkKey =
  | 'dendrites' | 'tuft' | 'spines' | 'soma' | 'hillock' | 'axon' | 'myelin' | 'node' | 'terminals'
  | 'basket' | 'cartridge' | 'endfoot' | 'process' | 'claw' | 'parallel' | 'arbor' | 'sheath';

export interface PartLabel {
  key: LandmarkKey;
  /** short name on the 3D tag */
  title: string;
  /** what it does, a few words */
  note: string;
}

export interface Transmitter {
  name: string;
  effect: 'excitatory' | 'inhibitory' | 'modulatory';
  note: string;
}

export interface CellType {
  id: CellTypeId;
  name: string;
  /** one line */
  tagline: string;
  group: CellGroup;
  color: string;
  /** where it lives */
  where: string;
  /** does it appear in the cortical column scene (otherwise specimen only) */
  inColumn: boolean;
  isNeuron: boolean;
  does: string[];
  transmitter?: Transmitter;
  /** a size / number fact */
  numbers: string;
  fact: string;
  clinical?: string;
  /** where we knowingly simplified */
  simplified?: string;
  labels: PartLabel[];
}

/** colours used when "Label parts" is on (shared by the shader and the panel key) */
export const PART_COLORS = {
  dendrite: '#5fd6a0',
  soma: '#ffd27a',
  axon: '#ff7f9c',
  myelin: '#f1ead6',
  terminal: '#b9a2ff',
} as const;

/** signal colours in the live circuit */
export const SIGNAL_COLORS = {
  excite: '#ffb35c',
  inhibit: '#5cc8ff',
} as const;

const NEURON_PARTS: PartLabel[] = [
  { key: 'dendrites', title: 'Dendrites', note: 'receive' },
  { key: 'soma', title: 'Cell body (soma)', note: 'adds it all up' },
  { key: 'hillock', title: 'Axon hillock', note: 'spike starts here' },
  { key: 'axon', title: 'Axon', note: 'sends' },
  { key: 'terminals', title: 'Axon terminals', note: 'hand over' },
];

export const CELL_TYPES: CellType[] = [
  {
    id: 'pyramidal', name: 'Pyramidal neuron', group: 'excite', color: '#f2b25c', inColumn: true, isNeuron: true,
    tagline: 'The cortex’s main excitatory cell — it sends the messages out.',
    where: 'Cerebral cortex, layers II–VI (small in II/III, giants in V), and the hippocampus.',
    does: [
      'Collects thousands of inputs on two sets of dendrites: a skirt near the cell body and one tall “apical” dendrite that reaches the surface.',
      'If enough inputs arrive together it fires, exciting every cell its axon touches.',
      'Layer II/III cells talk to other cortical areas; layer V cells carry the cortex’s output down to the brainstem and spinal cord.',
    ],
    transmitter: { name: 'Glutamate', effect: 'excitatory', note: 'the brain’s main “go” signal' },
    numbers: 'About 2 in every 3 cortical neurons. Cell body 10–30 µm; a single cell can receive around 10,000 synapses, most of them on tiny dendritic spines.',
    fact: 'The largest, the Betz cells of the motor cortex, have cell bodies up to 0.1 mm across and axons that run all the way down the spinal cord — up to a metre long.',
    clinical: 'In motor neurone disease (ALS) the big layer V pyramidal cells of the motor cortex die together with the spinal motor neurons they command, causing progressive weakness.',
    simplified: 'Cell bodies and branches are drawn thicker than life, and a real pyramidal cell has far more branches and tens of thousands of spines.',
    labels: [
      { key: 'tuft', title: 'Apical tuft', note: 'listens in layer I' },
      { key: 'dendrites', title: 'Basal dendrites', note: 'receive' },
      { key: 'spines', title: 'Dendritic spines', note: 'one synapse each' },
      { key: 'soma', title: 'Cell body (soma)', note: 'adds it all up' },
      { key: 'hillock', title: 'Axon hillock', note: 'spike starts here' },
      { key: 'myelin', title: 'Myelin', note: 'speeds the spike' },
      { key: 'node', title: 'Node of Ranvier', note: 'spike renewed here' },
      { key: 'terminals', title: 'Axon terminals', note: 'hand over' },
    ],
  },
  {
    id: 'stellate', name: 'Spiny stellate cell', group: 'excite', color: '#f58a66', inColumn: true, isNeuron: true,
    tagline: 'Layer IV’s receptionist: takes input from the thalamus and passes it up.',
    where: 'Layer IV of sensory cortex — the layer where signals from the thalamus arrive.',
    does: [
      'Receives the incoming sensory message from thalamic fibres.',
      'Amplifies it by exciting its neighbours, then relays it up to the pyramidal cells of layers II/III.',
      'Its star-shaped dendrites stay local, so it samples one small patch of input.',
    ],
    transmitter: { name: 'Glutamate', effect: 'excitatory', note: 'excites the cells it contacts' },
    numbers: 'Small: cell body about 10–15 µm, dendrites spreading only ~0.2–0.3 mm.',
    fact: 'Fibres from the thalamus make up only about one in ten of the synapses in layer IV — yet they drive it. Most of what the cortex hears is the cortex talking to itself.',
    simplified: 'The path “thalamus → IV → II/III → V” is the classic textbook loop; real cortex has many shortcuts and feedback routes.',
    labels: NEURON_PARTS,
  },
  {
    id: 'basket', name: 'Basket cell', group: 'inhibit', color: '#4fc1f0', inColumn: true, isNeuron: true,
    tagline: 'Fast brake: wraps “baskets” of synapses around neighbours’ cell bodies.',
    where: 'Throughout the cortex and hippocampus (the parvalbumin-containing, fast-spiking kind is shown).',
    does: [
      'Its axon weaves a basket of inhibitory synapses around the cell bodies of nearby pyramidal cells — right next to where their spikes begin.',
      'Excited by the very cells it inhibits, it shuts them down a few milliseconds after they fire: feedback inhibition.',
      'This fast on–off timing sets the beat of rapid brain rhythms (gamma waves, 30–80 per second).',
    ],
    transmitter: { name: 'GABA', effect: 'inhibitory', note: 'the brain’s main “stop” signal' },
    numbers: 'Can fire several hundred spikes per second without tiring. One basket cell contacts hundreds of pyramidal cells.',
    fact: 'Only about 1 in 5 cortical neurons is inhibitory, but without them the other four would excite each other without limit. Switch “Inhibition” off and watch.',
    clinical: 'In Dravet syndrome, a faulty sodium-channel gene (SCN1A) cripples fast inhibitory cells like these. With the brakes weakened, children suffer severe epileptic seizures.',
    labels: [
      { key: 'dendrites', title: 'Dendrites', note: 'smooth, no spines' },
      { key: 'soma', title: 'Cell body (soma)', note: 'adds it all up' },
      { key: 'axon', title: 'Axon', note: 'dense, local' },
      { key: 'basket', title: 'Basket', note: 'synapses round a cell body' },
    ],
  },
  {
    id: 'martinotti', name: 'Martinotti cell', group: 'inhibit', color: '#8f8cf5', inColumn: true, isNeuron: true,
    tagline: 'Sends its axon up to layer I to quieten the tips of pyramidal dendrites.',
    where: 'Cortex, mostly layers II–VI (these cells contain the peptide somatostatin).',
    does: [
      'Its axon climbs to layer I and spreads sideways, inhibiting the apical tufts of many pyramidal cells.',
      'That controls how much the distant, “top-down” inputs arriving in layer I can influence a pyramidal cell.',
      'It responds best when a neighbour fires a rapid burst — so a very active pyramidal cell ends up damping the cells around it.',
    ],
    transmitter: { name: 'GABA', effect: 'inhibitory', note: 'acts on dendrites rather than the cell body' },
    numbers: 'Roughly a third of cortical inhibitory neurons belong to the somatostatin family.',
    fact: 'Named after Carlo Martinotti, a student of Camillo Golgi, who described the upward-running axon in 1889.',
    simplified: 'Basket and Martinotti cells are two of dozens of interneuron types; each targets a different part of its neighbours.',
    labels: [
      { key: 'dendrites', title: 'Dendrites', note: 'receive' },
      { key: 'soma', title: 'Cell body (soma)', note: 'adds it all up' },
      { key: 'axon', title: 'Ascending axon', note: 'climbs to layer I' },
      { key: 'terminals', title: 'Terminals', note: 'spread through layer I' },
    ],
  },
  {
    id: 'chandelier', name: 'Chandelier cell', group: 'inhibit', color: '#3fd4c2', inColumn: true, isNeuron: true,
    tagline: 'Places rows of synapses exactly on the trigger zone of pyramidal axons.',
    where: 'Cortex, especially layers II/III. Also called the axo-axonic cell.',
    does: [
      'Its axon ends in vertical rows of boutons — “cartridges” — that look like the candles of a chandelier.',
      'Each cartridge sits on the first stretch of a pyramidal cell’s axon, the very spot where spikes are launched.',
      'No other cell type has a veto so close to the trigger.',
    ],
    transmitter: { name: 'GABA', effect: 'inhibitory', note: 'though its exact effect at this spot is still debated' },
    numbers: 'One chandelier cell can contact a few hundred pyramidal cells.',
    fact: 'It is the only neuron known to make all of its synapses onto other cells’ axons.',
    simplified: 'We show it as purely inhibitory; some experiments suggest it can also excite, depending on the state of the target cell.',
    labels: [
      { key: 'dendrites', title: 'Dendrites', note: 'receive' },
      { key: 'soma', title: 'Cell body (soma)', note: 'adds it all up' },
      { key: 'axon', title: 'Axon', note: 'branches widely' },
      { key: 'cartridge', title: 'Cartridge', note: 'synapses on an axon’s start' },
    ],
  },
  {
    id: 'astrocyte', name: 'Astrocyte', group: 'glia', color: '#86d88f', inColumn: true, isNeuron: false,
    tagline: 'Star-shaped caretaker: feeds neurons and mops up around synapses.',
    where: 'Everywhere in the brain and spinal cord, each one ruling its own small territory.',
    does: [
      'Wraps synapses and soaks up used transmitter (glutamate) and excess potassium, so signals stay crisp.',
      'Its “end-feet” cover the brain’s capillaries, take up glucose and pass fuel on to neurons.',
      'The end-feet also help maintain the blood–brain barrier and match local blood flow to activity.',
    ],
    numbers: 'A single human astrocyte may touch over a million synapses. It does not fire spikes — it signals with slow waves of calcium.',
    fact: 'The extra blood that astrocytes help summon to busy regions is what an fMRI scan picks up.',
    clinical: 'Most primary brain tumours (gliomas) grow from glial-type cells, not neurons. After an injury, astrocytes wall off the damage with a glial scar.',
    simplified: 'Real astrocytes are far bushier — a sponge of thousands of ultra-fine leaflets.',
    labels: [
      { key: 'soma', title: 'Cell body', note: 'centre of the star' },
      { key: 'process', title: 'Processes', note: 'wrap synapses' },
      { key: 'endfoot', title: 'End-foot', note: 'grips a capillary' },
    ],
  },
  {
    id: 'oligodendrocyte', name: 'Oligodendrocyte', group: 'glia', color: '#efe7cf', inColumn: true, isNeuron: false,
    tagline: 'Wraps axons in myelin so spikes travel fast.',
    where: 'Mostly in white matter — which is white because of the fatty myelin these cells make.',
    does: [
      'Each arm wraps a stretch of axon in many layers of fatty membrane: myelin.',
      'Myelin insulates the axon, so the spike jumps from gap to gap (nodes of Ranvier) instead of creeping along.',
      'It also feeds the axon it wraps.',
    ],
    numbers: 'One oligodendrocyte can myelinate up to about 50 different axon segments. Myelin raises spike speed from about 1 m/s to as much as 100 m/s.',
    fact: 'Myelination is not finished until your mid-twenties — the frontal lobes are wired up last.',
    clinical: 'In multiple sclerosis the immune system attacks myelin and oligodendrocytes. Spikes slow down or fail, causing problems with vision, sensation, movement and balance.',
    simplified: 'Myelin is drawn as plain sleeves; in reality each sleeve is a spiral of dozens of membrane layers.',
    labels: [
      { key: 'soma', title: 'Cell body', note: 'small and round' },
      { key: 'process', title: 'Processes', note: 'one arm per sheath' },
      { key: 'sheath', title: 'Myelin sheath', note: 'insulates an axon' },
      { key: 'node', title: 'Node of Ranvier', note: 'bare gap' },
    ],
  },
  {
    id: 'microglia', name: 'Microglia', group: 'glia', color: '#ee7fbf', inColumn: true, isNeuron: false,
    tagline: 'The brain’s resident immune cell — always surveying.',
    where: 'Scattered evenly through the whole brain, each patrolling its own patch.',
    does: [
      'Its fine branches never rest: they extend and retract all the time, feeling the surroundings for damage or infection.',
      'When it finds trouble it changes shape, moves in and eats debris and dead cells.',
      'During development it prunes away unused synapses, sculpting circuits.',
    ],
    numbers: 'About 1 in 10 brain cells. Together they scan the whole brain every few hours.',
    fact: 'Microglia are not born in the brain. They migrate in from the yolk sac in the early embryo — before the blood–brain barrier closes — and renew themselves for life.',
    clinical: 'Long-lasting microglial activation means inflammation of brain tissue. Several genes that raise Alzheimer’s risk (for example TREM2) act mainly in microglia.',
    simplified: 'The movement of the branch tips is sped up here; in life it takes minutes.',
    labels: [
      { key: 'soma', title: 'Cell body', note: 'tiny' },
      { key: 'process', title: 'Processes', note: 'moving feelers' },
    ],
  },
  {
    id: 'purkinje', name: 'Purkinje cell', group: 'special', color: '#f27d8f', inColumn: false, isNeuron: true,
    tagline: 'The cerebellum’s giant: a flat fan of dendrites with one output line.',
    where: 'Cerebellar cortex, lined up in a single row.',
    does: [
      'Its enormous dendritic tree is perfectly flat — like a pressed fan — and the fans are stacked side by side like pages of a book.',
      'Thousands of thin “parallel fibres” pass straight through the stack, each touching fan after fan.',
      'It is the only cell that carries signals out of the cerebellar cortex, and it does so by inhibiting: it sculpts movement by holding back.',
    ],
    transmitter: { name: 'GABA', effect: 'inhibitory', note: 'the sole output of the cerebellar cortex is a brake' },
    numbers: 'Each one receives 100,000–200,000 synapses from parallel fibres — more than any other neuron — plus a single, powerful climbing fibre.',
    fact: 'Described by Jan Purkyně in 1837, they were among the first neurons ever identified. Rotate the specimen to see how thin the fan is.',
    clinical: 'Purkinje cells are fragile. When they are lost — in inherited ataxias or after long-term heavy drinking — movements become clumsy and unsteady (ataxia).',
    labels: [
      { key: 'dendrites', title: 'Dendritic fan', note: 'flat and dense' },
      { key: 'soma', title: 'Cell body (soma)', note: 'adds it all up' },
      { key: 'hillock', title: 'Axon hillock', note: 'spike starts here' },
      { key: 'myelin', title: 'Myelin', note: 'speeds the spike' },
      { key: 'axon', title: 'Axon', note: 'the only output' },
    ],
  },
  {
    id: 'granule', name: 'Cerebellar granule cell', group: 'special', color: '#d8b07c', inColumn: false, isNeuron: true,
    tagline: 'Tiny and countless: the most numerous neuron in the brain.',
    where: 'Granular layer of the cerebellar cortex, packed tightly beneath the Purkinje cells.',
    does: [
      'Receives input on just four short dendrites, each ending in a little claw.',
      'Its axon rises, then splits like a “T” into a parallel fibre that runs through hundreds of Purkinje fans.',
      'By mixing inputs in countless combinations, granule cells give the cerebellum a huge vocabulary of patterns to learn from.',
    ],
    transmitter: { name: 'Glutamate', effect: 'excitatory', note: 'excites Purkinje cells' },
    numbers: 'About 50 billion — more than half of all your neurons — in a structure that is a tenth of the brain’s volume. Cell body only 5–8 µm across.',
    fact: 'Most of the neurons in your head belong to the cerebellum, not to the “thinking” cerebral cortex.',
    clinical: 'Medulloblastoma, the most common malignant brain tumour of childhood, often arises from the precursors of granule cells.',
    simplified: 'The axon and its parallel fibre are cut short here; a real parallel fibre runs for several millimetres.',
    labels: [
      { key: 'claw', title: 'Claw', note: 'grips an input fibre' },
      { key: 'dendrites', title: 'Dendrites', note: 'only four' },
      { key: 'soma', title: 'Cell body (soma)', note: 'tiny' },
      { key: 'axon', title: 'Axon', note: 'rises' },
      { key: 'parallel', title: 'Parallel fibre', note: 'T-shaped split' },
    ],
  },
  {
    id: 'msn', name: 'Medium spiny neuron', group: 'special', color: '#6fa9ee', inColumn: false, isNeuron: true,
    tagline: 'The striatum’s main cell — and dopamine’s main target.',
    where: 'Striatum (caudate nucleus and putamen), the input stage of the basal ganglia.',
    does: [
      'Its spine-covered dendrites collect commands from almost the whole cortex.',
      'Each spine gets glutamate from the cortex on its head and dopamine close by: dopamine decides how strongly the cortex’s message counts.',
      'Two families work as partners: one helps release a chosen action, the other helps hold competing actions back.',
    ],
    transmitter: { name: 'GABA', effect: 'inhibitory', note: 'the striatum’s output is inhibitory' },
    numbers: 'About 95 % of all neurons in the striatum. Mostly silent — it needs many inputs at once to fire.',
    fact: 'The “go / no-go” picture of the two families is a useful simplification; during a real movement both are active together.',
    clinical: 'In Huntington’s disease these cells die first. The result is involuntary, dance-like movements (chorea), followed by changes in thinking and mood.',
    labels: [
      { key: 'dendrites', title: 'Dendrites', note: 'input from cortex' },
      { key: 'spines', title: 'Spines', note: 'where dopamine acts' },
      { key: 'soma', title: 'Cell body (soma)', note: '“medium”: 12–20 µm' },
      { key: 'hillock', title: 'Axon hillock', note: 'spike starts here' },
      { key: 'axon', title: 'Axon', note: 'to the basal ganglia' },
    ],
  },
  {
    id: 'dopaminergic', name: 'Dopamine neuron', group: 'special', color: '#c58bff', inColumn: false, isNeuron: true,
    tagline: 'Few cells, enormous reach: one axon makes hundreds of thousands of synapses.',
    where: 'Substantia nigra and neighbouring midbrain; the axon travels forward to the striatum.',
    does: [
      'Fires steadily, like a slow clock, and changes its rate when something turns out better or worse than expected.',
      'Its dopamine does not simply excite or inhibit: it tunes how target cells respond and what they learn.',
      'In the striatum it is needed to start and scale movements.',
    ],
    transmitter: { name: 'Dopamine', effect: 'modulatory', note: 'a teaching and “how much effort” signal, not simply a pleasure chemical' },
    numbers: 'Only about half a million of them among 86 billion neurons. One cell’s axon tree, laid end to end, is estimated to measure metres, with hundreds of thousands of release sites.',
    fact: 'Substantia nigra means “black substance”: the cells store a dark pigment, neuromelanin, visible to the naked eye.',
    clinical: 'Parkinson’s disease: these neurons slowly die. Movement symptoms appear once roughly half are gone. Their gigantic, energy-hungry axon may be part of why they are so vulnerable.',
    simplified: 'The long trip to the striatum (centimetres) is cut short, and only a small part of the axon tree is drawn.',
    labels: [
      { key: 'dendrites', title: 'Dendrites', note: 'few and long' },
      { key: 'soma', title: 'Cell body (soma)', note: 'large, pigmented' },
      { key: 'axon', title: 'Axon', note: 'thin, unmyelinated' },
      { key: 'arbor', title: 'Axon tree', note: 'dopamine release sites' },
    ],
  },
];

export const cellTypeById = new Map<string, CellType>(CELL_TYPES.map((c) => [c.id, c]));

export const CELL_GROUPS: { id: CellGroup; title: string; blurb: string }[] = [
  { id: 'excite', title: 'Neurons that excite', blurb: 'They release glutamate and push their targets toward firing.' },
  { id: 'inhibit', title: 'Neurons that inhibit', blurb: 'They release GABA and hold their targets back.' },
  { id: 'glia', title: 'Glia: the support crew', blurb: 'They do not fire spikes, but neurons cannot work without them.' },
  { id: 'special', title: 'Special cells elsewhere in the brain', blurb: 'Shown as single specimens.' },
];

export interface LayerInfo {
  id: string;
  /** short label on the 3D tag */
  label: string;
  /** depth of the top and bottom of the layer below the pia, in micrometres */
  top: number;
  bottom: number;
}

/** Approximate layer depths for a 2.5 mm slab of human-like neocortex. */
export const LAYERS: LayerInfo[] = [
  { id: 'L1', label: 'I · Molecular', top: 0, bottom: 200 },
  { id: 'L23', label: 'II/III', top: 200, bottom: 900 },
  { id: 'L4', label: 'IV · Input from thalamus', top: 900, bottom: 1180 },
  { id: 'L5', label: 'V · Output', top: 1180, bottom: 1640 },
  { id: 'L6', label: 'VI', top: 1640, bottom: 2180 },
  { id: 'WM', label: 'White matter', top: 2180, bottom: 2500 },
];

/** things in the scene that can be hovered but are not cell types */
export const SCENE_NOTES = {
  thalamic: { name: 'Fibre from the thalamus', tagline: 'Brings sensory input up into layer IV.' },
  capillary: { name: 'Capillary', tagline: 'Blood supply. Astrocyte end-feet wrap it to form the blood–brain barrier.' },
  whiteMatter: { name: 'Myelinated axons', tagline: 'White matter: cables linking this patch to the rest of the brain.' },
};

export const OVERVIEW = {
  title: 'Two kinds of cells run the brain',
  lede: 'About 86 billion neurons carry the signals, and a roughly equal number of glia keep them alive and fast. You are inside 1 mm of cortex.',
  density: 'A real block this size holds tens of thousands of neurons, about as many glia and several kilometres of wiring. We show about 35 cells so you can tell them apart — the faint dots hint at the rest.',
  myth: 'You may have read that glia outnumber neurons ten to one. Careful counting shows it is closer to one to one.',
  readNeuron: [
    { part: 'dendrite' as const, text: 'Dendrites receive: thousands of synapses from other cells land here.' },
    { part: 'soma' as const, text: 'The cell body adds everything up — pushes (excitation) minus brakes (inhibition).' },
    { part: 'axon' as const, text: 'If the sum crosses a threshold, a spike starts at the axon hillock and runs down the axon — all or nothing, one direction.' },
    { part: 'terminal' as const, text: 'Terminals pass the message across a synapse to the next cell.' },
  ],
};

export const CIRCUIT_TEXT = {
  title: 'Watch the circuit think',
  how: [
    'Press Stimulate: a volley arrives from the thalamus into layer IV.',
    'Follow the glowing spikes: IV → II/III → V, then out through the white matter.',
    'Warm flash = the target was excited (EPSP). Cool flash = it was inhibited (IPSP).',
    'A few milliseconds later the basket cells answer and the activity is switched off again.',
  ],
  slowmo: 'Slow motion: one second here is about 15 thousandths of a second in the brain.',
  inhibitionOff: 'Inhibition is off. With the interneurons silent, every excitatory cell keeps re-exciting its neighbours and one small input explodes into a storm of firing. Excitation that escapes its brakes and sweeps through the network is, in essence, what an epileptic seizure is.',
  inhibitionOn: 'Excitation and inhibition are balanced: each wave of activity recruits the interneurons that end it.',
  simplified: 'Simplified: 26 model neurons with hand-picked connections stand in for tens of thousands, and synapses are stronger than in life so that a handful of cells can drive each other.',
};

/** traces shown in the membrane-potential strip chart: id of a circuit neuron -> label */
export const TRACE_CELLS: { neuron: string; label: string; color: string }[] = [
  { neuron: 'S1', label: 'Layer IV stellate', color: '#f58a66' },
  { neuron: 'A3', label: 'Layer II/III pyramidal', color: '#f2b25c' },
  { neuron: 'B1', label: 'Layer V pyramidal', color: '#ffd9a0' },
  { neuron: 'K1', label: 'Basket cell (inhibitory)', color: '#4fc1f0' },
];

/** everything a user can search for and select on this level */
export const SEARCH_ITEMS: { id: string; name: string; tagline: string }[] = CELL_TYPES.map((c) => ({
  id: c.id, name: c.name, tagline: c.tagline,
}));
