/**
 * Systems level: how regions are wired together.
 * Two families: slow, broadcast "chemical" (neuromodulator) systems and fast, point-to-point functional pathways.
 * Geometry (waypoints, nuclei positions) lives in src/scene/procedural/systemsAnatomy.ts, keyed by the ids used here.
 */

export type SystemKind = 'chemical' | 'pathways';

export interface SystemNucleus {
  id: string;
  name: string;
  tagline: string;
}

/** one named projection of a chemical system ("river") */
export interface SystemRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  role: string;
}

/** one numbered station of a functional pathway */
export interface SystemStep {
  /** short label used for the 3D tag */
  label: string;
  title: string;
  explain: string;
}

export interface BrainSystem {
  id: string;
  kind: SystemKind;
  name: string;
  /** small line above the title in the detail view */
  eyebrow: string;
  tagline: string;
  lede: string;
  color: string;
  does: string[];
  /** chemical systems: where the cell bodies sit */
  nuclei?: SystemNucleus[];
  routes?: SystemRoute[];
  steps?: SystemStep[];
  clinical: string;
  fact: string;
  simplified?: string;
  /** deep structures (ids from regions.ts) that stay lit in the glass brain */
  lit: string[];
}

export const SYSTEMS: BrainSystem[] = [
  // ------------------------------------------------------------------ chemical
  {
    id: 'dopamine', kind: 'chemical', name: 'Dopamine', eyebrow: 'Neuromodulator',
    color: '#ffc247',
    tagline: 'Motivation, learning from surprise, and starting movement.',
    lede: 'Three golden rivers leave two tiny clusters in the midbrain. Each river does a different job.',
    does: [
      'Signals "better or worse than I expected" (a reward prediction error), which teaches the brain what is worth repeating.',
      'Drives wanting and effort: the push to go and get something, more than the pleasure of having it.',
      'Lets the basal ganglia release a movement you have chosen, so actions start smoothly.',
    ],
    nuclei: [
      { id: 'vta', name: 'Ventral tegmental area (VTA)', tagline: 'Midbrain source of the motivation and planning rivers.' },
      { id: 'snc', name: 'Substantia nigra (pars compacta)', tagline: 'Midbrain source of the movement river. Dark with pigment.' },
    ],
    routes: [
      { id: 'nigrostriatal', name: 'Nigrostriatal', from: 'Substantia nigra', to: 'caudate and putamen', role: 'Movement: lets chosen actions start.' },
      { id: 'mesolimbic', name: 'Mesolimbic', from: 'VTA', to: 'nucleus accumbens, amygdala', role: 'Motivation: "wanting" and learning from reward.' },
      { id: 'mesocortical', name: 'Mesocortical', from: 'VTA', to: 'prefrontal cortex', role: 'Planning: focus and working memory.' },
    ],
    clinical:
      'Parkinson\'s disease: the nigrostriatal river dries up, so movement becomes slow, stiff and shaky. L-DOPA, a building block of dopamine, refills it. Addictive drugs flood the mesolimbic river; most antipsychotic drugs block dopamine D2 receptors.',
    fact:
      'Dopamine is not the "pleasure chemical". In classic experiments the neurons fire for an unexpected reward, then shift to the cue that predicts it, and go quiet when a promised reward fails to arrive.',
    simplified:
      'Simplified: a fourth, short pathway from the hypothalamus to the pituitary uses dopamine to hold back the hormone prolactin.',
    lit: ['midbrain', 'accumbens', 'caudate', 'putamen'],
  },
  {
    id: 'serotonin', kind: 'chemical', name: 'Serotonin', eyebrow: 'Neuromodulator',
    color: '#ff5fa8',
    tagline: 'Mood, patience, sleep and appetite, from the brainstem midline.',
    lede: 'A thin seam of cells along the midline of the brainstem reaches almost every part of the brain and spinal cord.',
    does: [
      'Steadies mood and helps you wait for a later reward instead of acting on impulse.',
      'Shapes the sleep–wake cycle, appetite and body temperature.',
      'Turns pain signals up or down through fibres that run down into the spinal cord.',
    ],
    nuclei: [
      { id: 'dorsalraphe', name: 'Dorsal raphe nucleus', tagline: 'Largest serotonin source: sends fibres up to the cortex.' },
      { id: 'medianraphe', name: 'Median raphe nucleus', tagline: 'Serotonin for the hippocampus and limbic system.' },
      { id: 'caudalraphe', name: 'Caudal raphe nuclei', tagline: 'Serotonin sent down to the spinal cord.' },
    ],
    routes: [
      { id: 'ascending', name: 'Ascending', from: 'Dorsal and median raphe', to: 'the whole cortex, limbic system, thalamus, basal ganglia', role: 'Mood, patience, sleep.' },
      { id: 'cerebellar', name: 'Cerebellar', from: 'Raphe', to: 'cerebellum', role: 'Tunes movement circuits.' },
      { id: 'descending', name: 'Descending', from: 'Caudal raphe', to: 'spinal cord', role: 'Dampens pain, sets muscle tone.' },
    ],
    clinical:
      'SSRIs (such as fluoxetine and sertraline), widely used for depression and anxiety, block the re-uptake pump so serotonin lingers at synapses. The benefit builds over weeks, so slower changes in the brain must be involved. Depression is not simply "low serotonin".',
    fact:
      'About 90% of the body\'s serotonin is made in the gut, where it controls bowel movement. It cannot cross the blood–brain barrier, so the brain makes its own from the amino acid tryptophan.',
    lit: ['midbrain', 'pons', 'medulla'],
  },
  {
    id: 'noradrenaline', kind: 'chemical', name: 'Noradrenaline', eyebrow: 'Neuromodulator',
    color: '#3fc4ff',
    tagline: 'The brain\'s alarm bell: alertness, attention, fight-or-flight.',
    lede: 'One pinhead-sized "blue spot" in the pons wires into nearly the entire brain, so it can wake everything at once.',
    does: [
      'Raises alertness: it fires when something new or important happens and falls silent in dream sleep.',
      'Sharpens attention by boosting strong signals and quieting background noise.',
      'Readies brain and body for action under stress, together with adrenaline in the blood.',
    ],
    nuclei: [
      { id: 'lc', name: 'Locus coeruleus', tagline: 'The "blue spot" of the pons: source of nearly all the brain\'s noradrenaline.' },
    ],
    routes: [
      { id: 'ascending', name: 'Ascending', from: 'Locus coeruleus', to: 'the entire cortex, thalamus, hippocampus, amygdala', role: 'Alertness and attention.' },
      { id: 'cerebellar', name: 'Cerebellar', from: 'Locus coeruleus', to: 'cerebellum', role: 'Readiness of movement circuits.' },
      { id: 'descending', name: 'Descending', from: 'Locus coeruleus', to: 'spinal cord', role: 'Arousal of the body, pain control.' },
    ],
    clinical:
      'Several ADHD medicines (atomoxetine, methylphenidate) raise noradrenaline to steady attention. Beta-blockers blunt its effects in the body. The locus coeruleus is one of the first places to show damage in Alzheimer\'s and Parkinson\'s disease.',
    fact:
      'Each locus coeruleus holds only about 15–20 thousand neurons, a few millimetres of tissue. Yet a single one of its axons can branch to reach cortex, cerebellum and spinal cord. Also called norepinephrine.',
    lit: ['pons'],
  },
  {
    id: 'acetylcholine', kind: 'chemical', name: 'Acetylcholine', eyebrow: 'Neuromodulator',
    color: '#56dd8a',
    tagline: 'Attention, learning and memory, from the basal forebrain.',
    lede: 'Cells just under the front of the brain bathe the cortex and hippocampus in the chemical that says "this matters, record it".',
    does: [
      'Focuses attention: it makes the cortex respond more strongly to what you are concentrating on.',
      'Opens the gate for learning, helping the hippocampus store new memories.',
      'From the brainstem, switches the thalamus into its awake (and dreaming) mode.',
    ],
    nuclei: [
      { id: 'nbm', name: 'Nucleus basalis of Meynert', tagline: 'Basal forebrain source of acetylcholine for the whole cortex.' },
      { id: 'septum', name: 'Medial septum', tagline: 'Sends acetylcholine to the hippocampus through the fornix.' },
      { id: 'ppt', name: 'Brainstem cholinergic nuclei (PPT/LDT)', tagline: 'Wake up the thalamus; active in waking and REM sleep.' },
    ],
    routes: [
      { id: 'cortical', name: 'Basal forebrain → cortex', from: 'Nucleus basalis', to: 'the whole cortex and amygdala', role: 'Attention.' },
      { id: 'septohippocampal', name: 'Septum → hippocampus', from: 'Medial septum', to: 'hippocampus', role: 'Forming new memories.' },
      { id: 'brainstem', name: 'Brainstem → thalamus', from: 'PPT/LDT', to: 'thalamus', role: 'Waking and REM sleep.' },
    ],
    clinical:
      'Alzheimer\'s disease: nucleus basalis neurons are lost early, and attention and memory fade. Donepezil slows the breakdown of acetylcholine and eases symptoms for a while. Drugs that block it (such as scopolamine) cause confusion and memory gaps.',
    fact:
      'Outside the brain the same molecule is the "go" signal at every nerve–muscle junction: each voluntary movement you make ends with acetylcholine. It was the first neurotransmitter ever discovered.',
    lit: ['hippocampus', 'thalamus'],
  },
  {
    id: 'histamine', kind: 'chemical', name: 'Histamine', eyebrow: 'Neuromodulator',
    color: '#ff8a3c',
    tagline: 'A wakefulness signal from the hypothalamus.',
    lede: 'A small nucleus at the back of the hypothalamus keeps the whole brain awake during the day.',
    does: [
      'Promotes wakefulness: these neurons fire steadily while you are awake and stop when you sleep.',
      'Supports vigilance and attention together with noradrenaline and acetylcholine.',
      'Helps regulate appetite and body temperature.',
    ],
    nuclei: [
      { id: 'tmn', name: 'Tuberomammillary nucleus', tagline: 'The brain\'s only histamine source, in the posterior hypothalamus.' },
    ],
    routes: [
      { id: 'ascending', name: 'Ascending', from: 'Tuberomammillary nucleus', to: 'the whole cortex, thalamus, basal forebrain', role: 'Staying awake.' },
      { id: 'descending', name: 'Descending', from: 'Tuberomammillary nucleus', to: 'brainstem and spinal cord', role: 'Arousal.' },
    ],
    clinical:
      'Older allergy tablets (such as diphenhydramine) cross into the brain and block histamine H1 receptors, which is why they make you drowsy. Newer ones mostly stay out of the brain. Pitolisant treats narcolepsy by boosting brain histamine.',
    fact:
      'The histamine that makes your nose run in hay fever comes from immune cells, not neurons. Same molecule, completely different job: the brain\'s supply comes from roughly 64,000 neurons.',
    lit: ['hypothalamus'],
  },
  {
    id: 'fast', kind: 'chemical', name: 'Glutamate & GABA', eyebrow: 'Fast transmitters',
    color: '#e8ecff',
    tagline: 'The fast "go" and "stop" signals used by almost every pathway.',
    lede: 'Not a broadcast but a precise wire: nearly every point-to-point pathway in the brain speaks glutamate or GABA.',
    does: [
      'Glutamate is the main "go" signal: it excites the next neuron within a millisecond. Most long pathways (vision, touch, movement) use it.',
      'GABA is the main "stop" signal: it quiets the next neuron just as quickly, shaping and timing activity.',
      'Neuromodulators such as dopamine work differently: slowly (seconds to minutes) and broadly, changing how strongly these fast signals count.',
    ],
    routes: [
      { id: 'glutamate', name: 'Glutamate', from: 'Excitatory neurons everywhere', to: 'their specific targets', role: '"Go": fast excitation. About 80% of cortical neurons.' },
      { id: 'gaba', name: 'GABA', from: 'Mostly local interneurons', to: 'their neighbours', role: '"Stop": fast inhibition. About 20% of cortical neurons.' },
    ],
    clinical:
      'An epileptic seizure is runaway excitation that inhibition fails to contain. Benzodiazepines, alcohol and many anaesthetics boost GABA receptors; ketamine blocks one type of glutamate receptor.',
    fact:
      'GABA is made from glutamate in a single chemical step, so the brain builds its main brake directly out of its main accelerator.',
    simplified:
      'Simplified: glutamate and GABA also have slower receptors, and a few neuromodulator receptors are fast. Shown here: the functional pathways, all of which rely on these two transmitters.',
    lit: ['thalamus'],
  },

  // ------------------------------------------------------------------ pathways
  {
    id: 'vision', kind: 'pathways', name: 'Vision', eyebrow: 'Functional pathway',
    color: '#b79bff',
    tagline: 'From the eye to the back of the brain, then on to "where" and "what".',
    lede: 'Light lands on the retina at the front of the head, but you see with the very back of your brain.',
    does: [
      'Carries a point-by-point map of the retina to the primary visual cortex.',
      'Each half of the brain sees the opposite half of the world, from both eyes.',
      'After V1 the signal splits into two streams: where things are, and what they are.',
    ],
    steps: [
      { label: 'Retina', title: 'Retina and optic nerve', explain: 'Light-sensitive cells turn the image into nerve signals; about a million axons leave each eye as the optic nerve.' },
      { label: 'Optic chiasm', title: 'Optic chiasm', explain: 'Fibres from the nose-side half of each retina cross over, so each side of the brain receives the opposite half of the visual world.' },
      { label: 'Thalamus (LGN)', title: 'Thalamus: lateral geniculate nucleus', explain: 'A relay station in the thalamus sorts the signals and passes them on, layer by layer.' },
      { label: 'Visual cortex (V1)', title: 'Primary visual cortex (V1)', explain: 'The optic radiation fans back to the occipital lobe, where neurons pick out edges, orientation and contrast.' },
      { label: '"Where" stream', title: 'Dorsal stream: where and how', explain: 'Up into the parietal lobe: where things are, how they move and how to reach for them.' },
      { label: '"What" stream', title: 'Ventral stream: what', explain: 'Along the underside of the temporal lobe: recognising objects, written words and faces.' },
    ],
    clinical:
      'Where vision is lost tells a doctor where the damage is. A pituitary tumour pressing on the chiasm removes the outer half of both visual fields; a stroke in the left visual cortex blinds the right half of the world in both eyes.',
    fact:
      'The lower fibres of the optic radiation swing forward into the temporal lobe before heading back (Meyer\'s loop), so temporal lobe surgery can cost a slice of the upper visual field.',
    simplified: 'Simplified: the two streams exchange information constantly, and about a tenth of optic nerve fibres go to other targets, such as the midbrain centre for eye movements.',
    lit: ['thalamus'],
  },
  {
    id: 'movement', kind: 'pathways', name: 'Voluntary movement', eyebrow: 'Functional pathway',
    color: '#ff7461',
    tagline: 'From a plan in the frontal lobe to a muscle on the opposite side.',
    lede: 'A decision becomes a command, the command runs down a single long cable, and two side loops polish it on the way.',
    does: [
      'Turns an intention into a precisely timed pattern of muscle contractions.',
      'The left half of the brain moves the right half of the body, and the other way round.',
      'The basal ganglia decide which movement gets released; the cerebellum makes it smooth and accurate.',
    ],
    steps: [
      { label: 'Plan (premotor)', title: 'Prefrontal and premotor cortex', explain: 'The goal is chosen in prefrontal cortex and turned into a movement plan in the premotor areas.' },
      { label: 'Basal ganglia loop', title: 'Side loop: basal ganglia', explain: 'Cortex → putamen → globus pallidus → thalamus → cortex: this loop releases the chosen movement and holds back competing ones.' },
      { label: 'Motor cortex (M1)', title: 'Primary motor cortex', explain: 'Neurons in the precentral gyrus, laid out as a map of the body, send the final command.' },
      { label: 'Internal capsule', title: 'Internal capsule', explain: 'Fibres from the whole motor map funnel into a narrow band between the thalamus and the basal ganglia.' },
      { label: 'Crossing (medulla)', title: 'Brainstem: crossing in the medulla', explain: 'The tract runs down through midbrain and pons; at the bottom of the medulla about 90% of fibres cross to the other side.' },
      { label: 'Spinal cord', title: 'Spinal cord and muscle', explain: 'The fibres end on motor neurons in the spinal cord, whose axons leave for the muscles.' },
      { label: 'Cerebellum loop', title: 'Side loop: cerebellum', explain: 'A copy of the command goes through the pons to the opposite cerebellum, which compares plan with result and sends corrections back through the thalamus.' },
    ],
    clinical:
      'A small stroke in the internal capsule can paralyse the entire opposite side of the body, because all the fibres are packed together there. Parkinson\'s disease disturbs the basal ganglia loop; cerebellar damage makes movement clumsy and shaky.',
    fact:
      'The corticospinal tract holds about a million axons on each side. The longest run from the top of the brain to the base of the spinal cord without a single relay.',
    lit: ['putamen', 'pallidum', 'thalamus'],
  },
  {
    id: 'touch', kind: 'pathways', name: 'Touch', eyebrow: 'Functional pathway',
    color: '#2fd6a8',
    tagline: 'Three neurons carry a fingertip touch to the opposite side of the cortex.',
    lede: 'Fine touch, vibration and the sense of where your limbs are travel up the back of the spinal cord.',
    does: [
      'Carries fine touch, vibration and body position (proprioception).',
      'Crosses the midline in the medulla, so the left cortex feels the right side of the body.',
      'Keeps a map of the body all the way up: neighbouring skin stays neighbouring in the cortex.',
    ],
    steps: [
      { label: 'Spinal cord', title: 'Skin to spinal cord', explain: 'A sensory neuron\'s axon enters the spinal cord and climbs on the same side, in the dorsal columns.' },
      { label: 'Crossing (medulla)', title: 'Medulla: relay and crossing', explain: 'The first synapse is in the medulla; the second neuron crosses the midline straight away.' },
      { label: 'Thalamus (VPL)', title: 'Thalamus: ventral posterior nucleus', explain: 'The crossed fibres climb through the brainstem to the thalamus, the second relay.' },
      { label: 'Somatosensory cortex', title: 'Primary somatosensory cortex', explain: 'The third neuron reaches the postcentral gyrus, where the body surface is mapped out.' },
    ],
    clinical:
      'Damage to one side of the spinal cord gives a strange split: touch is lost on the same side below the injury, but pain and temperature on the opposite side, because those fibres cross at different levels.',
    fact:
      'The first neuron in this chain can be the longest cell in your body: one axon from the big toe to the medulla, well over a metre in a tall person.',
    simplified: 'Simplified: pain and temperature use a separate pathway that crosses in the spinal cord itself.',
    lit: ['thalamus', 'medulla'],
  },
  {
    id: 'hearing', kind: 'pathways', name: 'Hearing & language', eyebrow: 'Functional pathway',
    color: '#ffd166',
    tagline: 'From the ear to the temporal lobe, then on to understanding and speech.',
    lede: 'Sound climbs the brainstem through several relays; in most people the left hemisphere then turns it into words.',
    does: [
      'Compares the two ears in the brainstem to work out where a sound comes from.',
      'Sorts sound by pitch on a map in the primary auditory cortex.',
      'Links hearing words (Wernicke\'s area) to producing them (Broca\'s area).',
    ],
    steps: [
      { label: 'Cochlear nucleus', title: 'Ear and cochlear nuclei', explain: 'Hair cells in the cochlea turn vibration into signals that enter the brainstem at the cochlear nuclei.' },
      { label: 'Inferior colliculus', title: 'Midbrain: inferior colliculus', explain: 'Most fibres cross and some stay, so from here on each side carries both ears; timing differences reveal direction.' },
      { label: 'Thalamus (MGN)', title: 'Thalamus: medial geniculate nucleus', explain: 'The thalamic relay for hearing passes the signal to the cortex.' },
      { label: 'Auditory cortex', title: 'Primary auditory cortex', explain: 'Hidden in the fold on top of the temporal lobe, it maps sounds from low to high pitch.' },
      { label: 'Wernicke\'s area', title: 'Wernicke\'s area (left)', explain: 'At the back of the left temporal lobe, speech sounds are matched to words and meaning.' },
      { label: 'Broca\'s area', title: 'Arcuate fasciculus to Broca\'s area (left)', explain: 'An arching bundle links comprehension to the left frontal area that plans the movements of speech.' },
    ],
    clinical:
      'Damage to Broca\'s area leaves speech halting and effortful while understanding is fairly good; damage to Wernicke\'s area leaves it fluent but jumbled, with poor understanding. A stroke in one auditory cortex does not make an ear deaf, because both ears reach both sides.',
    fact:
      'Language sits mainly in the left hemisphere in about 95% of right-handed people, and in most left-handers too.',
    simplified: 'Simplified: this is the classic textbook model. Modern studies show a wider language network with several parallel routes.',
    lit: ['thalamus'],
  },
  {
    id: 'memory', kind: 'pathways', name: 'Memory circuit', eyebrow: 'Functional pathway',
    color: '#8fd16a',
    tagline: 'The loop through the hippocampus that turns experiences into memories.',
    lede: 'Experiences from all over the cortex funnel into the hippocampus, circle through a deep loop, and return to the cortex for storage.',
    does: [
      'Binds the sights, sounds and feelings of one moment into a single memory of an event.',
      'Replays recent events, especially in sleep, so the cortex can store them for the long term.',
      'Also builds your mental map of places and routes.',
    ],
    steps: [
      { label: 'Entorhinal cortex', title: 'Cortex to entorhinal cortex', explain: 'Processed information from all the senses converges on this gateway on the inner side of the temporal lobe.' },
      { label: 'Hippocampus', title: 'Hippocampus', explain: 'The hippocampus links the pieces together as one episode: what happened, where and when.' },
      { label: 'Fornix', title: 'Fornix', explain: 'Its output leaves through an arching bundle that curves up and forward beneath the corpus callosum.' },
      { label: 'Mammillary bodies', title: 'Mammillary bodies', explain: 'The fornix ends in two small bumps at the back of the hypothalamus.' },
      { label: 'Anterior thalamus', title: 'Anterior thalamus', explain: 'A short tract relays the signal to the front of the thalamus.' },
      { label: 'Cingulate cortex', title: 'Cingulate cortex', explain: 'From the thalamus the signal reaches the cingulate gyrus on the inner face of the hemisphere.' },
      { label: 'Loop closes', title: 'Cingulum back to the hippocampus', explain: 'The cingulum bundle carries it back around to the entorhinal cortex, closing the loop.' },
    ],
    clinical:
      'In 1953 a patient known as H.M. had both hippocampi removed to treat epilepsy and could never form new long-term memories again. Alzheimer\'s disease usually begins in the entorhinal cortex; severe vitamin B1 deficiency damages the mammillary bodies (Korsakoff syndrome).',
    fact:
      'James Papez proposed this loop in 1937 as the brain\'s circuit for emotion. It turned out to matter far more for memory, but it still carries his name: the Papez circuit.',
    simplified: 'Simplified: the hippocampus also sends its results straight back to the cortex through the entorhinal cortex.',
    lit: ['hippocampus', 'thalamus'],
  },
  {
    id: 'fear', kind: 'pathways', name: 'Fear', eyebrow: 'Functional pathway',
    color: '#ff4f7b',
    tagline: 'A fast rough alarm, a slower accurate check, and a brake from the frontal lobe.',
    lede: 'You jump at the shape on the path before you know whether it is a snake or a stick. Two routes to the amygdala explain why.',
    does: [
      'Detects possible danger and triggers the body\'s alarm reaction within a fraction of a second.',
      'Learns which sights and sounds predict harm.',
      'Can be calmed by the prefrontal cortex once the situation turns out to be safe.',
    ],
    steps: [
      { label: 'Thalamus', title: 'Senses reach the thalamus', explain: 'Sights and sounds arrive at the thalamus, the relay for almost all the senses.' },
      { label: 'Amygdala (low road)', title: 'Low road: thalamus to amygdala', explain: 'A short direct route gives the amygdala a quick, blurry first impression: possible danger.' },
      { label: 'Cortex (high road)', title: 'High road: thalamus to cortex to amygdala', explain: 'The sensory cortex analyses the details and reports to the amygdala a little later: snake, or just a stick?' },
      { label: 'Body alarm', title: 'Hypothalamus and brainstem', explain: 'The amygdala triggers the body response: racing heart, stress hormones, freezing.' },
      { label: 'Prefrontal brake', title: 'Prefrontal brake', explain: 'The lower inner prefrontal cortex can quiet the amygdala when the threat is not real. This is how fears are unlearned.' },
    ],
    clinical:
      'In anxiety disorders and post-traumatic stress the amygdala over-reacts and the prefrontal brake is weak. Exposure therapy works by strengthening that brake. A patient known as S.M., whose amygdalae were destroyed by a rare disease, feels almost no fear.',
    fact:
      'The amygdala is named after the Greek word for almond, and it is about that size. It responds to other strong emotions as well as fear.',
    simplified: 'Simplified: the low road is well mapped in rodents; how much it carries in humans is still debated.',
    lit: ['amygdala', 'thalamus', 'hypothalamus'],
  },
];

export const systemById = new Map(SYSTEMS.map((s) => [s.id, s]));
export const systemsOf = (kind: SystemKind) => SYSTEMS.filter((s) => s.kind === kind);

export const SEARCH_ITEMS: { id: string; name: string; tagline: string }[] = SYSTEMS.map((s) => ({
  id: s.id, name: s.name, tagline: s.tagline,
}));
