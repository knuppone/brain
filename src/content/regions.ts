export type StructureKind = 'lobe' | 'area' | 'deep' | 'stem' | 'cerebellum' | 'fiber';

export interface Structure {
  id: string;
  name: string;
  kind: StructureKind;
  /** lobe id for cortical areas, group label for others */
  parent?: string;
  color: string;
  tagline: string;
  does: string[];
  damage: string;
  fact: string;
  /** ids of structures it works closely with */
  connects?: string[];
  /** mesh name stems (without hemisphere), e.g. "ctx-precentral" or "sub-thalamus" */
  meshes: string[];
}

const A = (
  id: string, name: string, parent: string, tagline: string, does: string[], damage: string, fact: string,
  connects: string[] = [],
): Structure => ({ id, name, kind: 'area', parent, color: '', tagline, does, damage, fact, connects, meshes: [`ctx-${id}`] });

export const LOBES: Structure[] = [
  {
    id: 'frontal', name: 'Frontal lobe', kind: 'lobe', color: '#5b8def',
    tagline: 'Plans, decides, speaks and moves.',
    does: [
      'Executive control: planning, holding goals in mind, resisting impulses.',
      'Voluntary movement — the motor cortex at its back edge sends the commands.',
      'Speech production (Broca\'s area, usually on the left) and much of personality.',
    ],
    damage: 'Trouble planning and controlling behaviour, personality change, weakness on the opposite side of the body, or halting speech.',
    fact: 'It is the last part of the brain to finish maturing — wiring keeps being refined into your mid-twenties.',
    connects: ['thalamus', 'caudate', 'parietal', 'cingulate'], meshes: [],
  },
  {
    id: 'parietal', name: 'Parietal lobe', kind: 'lobe', color: '#f2b84b',
    tagline: 'Feels the body and maps space.',
    does: [
      'Touch, temperature, pain and body position arrive at the somatosensory cortex.',
      'Builds a map of space around you and guides reaching and eye movements.',
      'Supports number sense, attention and combining the senses.',
    ],
    damage: 'Numbness, getting lost, difficulty with arithmetic, or "neglect" — ignoring one whole side of the world.',
    fact: 'Your lips and fingertips get far more parietal cortex than your whole back: sensitivity, not size, decides the map.',
    connects: ['frontal', 'occipital', 'thalamus'], meshes: [],
  },
  {
    id: 'temporal', name: 'Temporal lobe', kind: 'lobe', color: '#4cc38a',
    tagline: 'Hears, understands and remembers.',
    does: [
      'Hearing: sound reaches the auditory cortex on its upper surface.',
      'Understanding language and recognising objects and faces.',
      'Its inner edge houses the hippocampus and amygdala — memory and emotion.',
    ],
    damage: 'Difficulty understanding speech, recognising faces or forming new memories; a common origin of seizures.',
    fact: 'A patch on its underside responds so strongly to faces that damage there can leave a person unable to recognise their own family.',
    connects: ['hippocampus', 'amygdala', 'frontal', 'occipital'], meshes: [],
  },
  {
    id: 'occipital', name: 'Occipital lobe', kind: 'lobe', color: '#e5647c',
    tagline: 'Turns light into sight.',
    does: [
      'Primary visual cortex receives signals from the eyes via the thalamus.',
      'Extracts edges, colour, motion and depth, then passes them forward.',
      'Feeds two streams: "what is it?" (to temporal) and "where is it?" (to parietal).',
    ],
    damage: 'Blind spots or loss of half the visual field — even though the eyes themselves are healthy.',
    fact: 'You see with the back of your head: about a third of the cortex is involved in vision in some way.',
    connects: ['thalamus', 'temporal', 'parietal'], meshes: [],
  },
  {
    id: 'cingulate', name: 'Cingulate cortex', kind: 'lobe', color: '#a97be8',
    tagline: 'Links feeling, attention and action.',
    does: [
      'Monitors conflict and errors — the "something is off" signal.',
      'Gives pain and effort their emotional weight; helps regulate mood.',
      'Its rear part is a hub of the default mode network, active when the mind wanders.',
    ],
    damage: 'Apathy, reduced response to pain, or difficulty switching attention.',
    fact: 'It wraps around the corpus callosum like a belt — "cingulum" is Latin for girdle.',
    connects: ['frontal', 'amygdala', 'hippocampus', 'thalamus'], meshes: [],
  },
  {
    id: 'insular', name: 'Insula', kind: 'lobe', color: '#2fc4c9',
    tagline: 'Senses the inside of your body.',
    does: [
      'Interoception: heartbeat, hunger, breathlessness, temperature.',
      'Taste, disgust and the bodily feeling of emotions.',
      'Helps decide what is important enough to notice (salience).',
    ],
    damage: 'Altered taste, loss of cravings (some smokers lose the urge to smoke) and blunted emotional awareness.',
    fact: 'It is hidden: you must pull the frontal and temporal lobes apart to see it. Use the explode slider.',
    connects: ['cingulate', 'amygdala', 'thalamus', 'frontal'], meshes: [],
  },
];

export const AREAS: Structure[] = [
  // ---- frontal
  A('precentral', 'Primary motor cortex', 'frontal', 'The final command post for voluntary movement.',
    ['Each strip controls a body part on the opposite side.', 'Sends long axons down the spinal cord (corticospinal tract).'],
    'Weakness or paralysis of the opposite side of the body.',
    'The hand and face take up most of it — a distorted body map called the motor homunculus.', ['postcentral', 'putamen', 'pons', 'cerebellum']),
  A('superiorfrontal', 'Superior frontal gyrus', 'frontal', 'Plans movement and holds thoughts online.',
    ['Contains supplementary motor areas that sequence actions.', 'Supports working memory and self-awareness.'],
    'Slowed initiation of movement and speech.',
    'Stimulating part of it during surgery has made patients burst out laughing.', ['precentral', 'caudate']),
  A('rostralmiddlefrontal', 'Dorsolateral prefrontal cortex', 'frontal', 'The brain\'s workbench for reasoning.',
    ['Keeps information in mind and manipulates it (working memory).', 'Plans, sets rules and switches between tasks.'],
    'Poor planning, distractibility and rigid thinking.',
    'It is especially vulnerable to sleep loss and stress — which is why tired decisions are worse.', ['caudate', 'thalamus', 'superiorparietal']),
  A('caudalmiddlefrontal', 'Premotor & frontal eye field', 'frontal', 'Prepares movements and aims the eyes.',
    ['Selects movements based on what you see.', 'The frontal eye field directs voluntary gaze.'],
    'Clumsy sequencing and difficulty looking toward the opposite side.',
    'Mirror-like neurons here respond both when you act and when you watch someone else act.', ['precentral', 'superiorparietal']),
  A('parsopercularis', 'Broca\'s area (opercular)', 'frontal', 'Turns thoughts into fluent speech.',
    ['Assembles the motor plan for words.', 'Handles grammar and sentence structure.'],
    'Broca\'s aphasia: slow, effortful speech with understanding largely intact.',
    'Paul Broca\'s 1861 patient could only say one syllable: "tan".', ['parstriangularis', 'superiortemporal', 'precentral']),
  A('parstriangularis', 'Broca\'s area (triangular)', 'frontal', 'Finds and selects the right word.',
    ['Retrieves word meanings.', 'Works with temporal language areas via the arcuate fasciculus.'],
    'Word-finding trouble and simplified grammar.',
    'In most people it is larger and more active on the left side.', ['parsopercularis', 'middletemporal']),
  A('parsorbitalis', 'Inferior frontal (orbital part)', 'frontal', 'Meaning, tone and self-control.',
    ['Processes the meaning of sentences.', 'Helps stop an action once started.'],
    'Impulsive responses and subtle language problems.',
    'It is part of the brain\'s "brake" — strongly active when you stop yourself mid-action.', ['parstriangularis', 'lateralorbitofrontal']),
  A('lateralorbitofrontal', 'Lateral orbitofrontal cortex', 'frontal', 'Updates what is worth wanting.',
    ['Links choices to their outcomes.', 'Signals when a reward is no longer worth it.'],
    'Persisting with choices that no longer pay off; socially inappropriate behaviour.',
    'It sits directly above the eye sockets ("orbits"), hence the name.', ['amygdala', 'accumbens', 'insula']),
  A('medialorbitofrontal', 'Ventromedial prefrontal cortex', 'frontal', 'Assigns value and gut feeling to options.',
    ['Computes how good something is for you right now.', 'Calms the amygdala once a threat has passed.'],
    'Risky decisions and blunted emotion — famously in Phineas Gage.',
    'An iron rod through this region in 1848 changed Gage\'s personality but left his intellect intact.', ['amygdala', 'accumbens', 'hippocampus']),
  A('paracentral', 'Paracentral lobule', 'frontal', 'Motor and sensory map for legs and feet.',
    ['Controls leg and foot movement.', 'Involved in bladder and bowel control.'],
    'Leg weakness and incontinence.',
    'It wraps over the top onto the inner surface, so the "legs" of the body map hang inside the midline.', ['precentral', 'postcentral']),
  A('frontalpole', 'Frontal pole', 'frontal', 'Thinking about the future and about thinking.',
    ['Juggles multiple goals at once.', 'Supports imagining future scenarios.'],
    'Difficulty multitasking and planning ahead.',
    'It has expanded more in humans, relative to other apes, than almost any other region.', ['rostralmiddlefrontal', 'medialorbitofrontal']),
  // ---- parietal
  A('postcentral', 'Primary somatosensory cortex', 'parietal', 'Where touch arrives.',
    ['Maps touch, pressure, temperature and pain for the opposite body side.', 'Tracks where your limbs are (proprioception).'],
    'Numbness and loss of fine touch on the opposite side.',
    'After an amputation its map reorganises — touching the face can be felt in the missing hand.', ['precentral', 'thalamus', 'superiorparietal']),
  A('superiorparietal', 'Superior parietal lobule', 'parietal', 'Guides the body through space.',
    ['Combines vision and touch to direct reaching.', 'Controls spatial attention.'],
    'Misreaching for objects you can see clearly (optic ataxia).',
    'Mentally rotating an object lights it up strongly.', ['caudalmiddlefrontal', 'lateraloccipital']),
  A('inferiorparietal', 'Inferior parietal lobule (angular gyrus)', 'parietal', 'A crossroads of senses and meaning.',
    ['Supports reading, arithmetic and understanding metaphors.', 'Integrates sight, sound and touch.'],
    'Trouble with writing, calculation and left–right confusion.',
    'Stimulating the right angular gyrus has triggered out-of-body experiences.', ['middletemporal', 'precuneus', 'rostralmiddlefrontal']),
  A('supramarginal', 'Supramarginal gyrus', 'parietal', 'Sound of words, shape of tools.',
    ['Holds speech sounds briefly in mind (phonological loop).', 'Stores how to use tools and make gestures.'],
    'Difficulty repeating words or miming tool use (apraxia).',
    'It helps you see the world from another person\'s viewpoint — and corrects your own egocentric bias.', ['superiortemporal', 'parsopercularis']),
  A('precuneus', 'Precuneus', 'parietal', 'The mind\'s eye and sense of self.',
    ['Visual imagery and recalling personal memories.', 'A core hub of the default mode network.'],
    'Impaired self-related memory and spatial navigation.',
    'It is among the most energy-hungry patches of cortex, and one of the first to quieten under anaesthesia.', ['posteriorcingulate', 'inferiorparietal', 'hippocampus']),
  // ---- temporal
  A('superiortemporal', 'Superior temporal gyrus', 'temporal', 'Hears sounds and decodes speech.',
    ['Analyses pitch, rhythm and speech sounds.', 'Its rear part (Wernicke\'s area, left) supports language comprehension.'],
    'Wernicke\'s aphasia: fluent but meaningless speech and poor understanding.',
    'It responds to speech even in sleeping newborns.', ['transversetemporal', 'parsopercularis', 'supramarginal']),
  A('transversetemporal', 'Primary auditory cortex (Heschl\'s gyrus)', 'temporal', 'The first cortical stop for sound.',
    ['Organised by pitch, like a piano keyboard (tonotopy).', 'Receives input from the ears via the thalamus.'],
    'Difficulty discriminating sounds; damage on both sides can cause cortical deafness.',
    'Musicians tend to have noticeably more grey matter here.', ['superiortemporal', 'thalamus']),
  A('middletemporal', 'Middle temporal gyrus', 'temporal', 'Word meanings and visual motion.',
    ['Stores and retrieves what words and objects mean.', 'Its rear part (area MT) analyses motion.'],
    'Word-meaning loss; rarely, the world appears as a series of still frames.',
    'A patient with MT damage could not pour tea — the liquid seemed frozen, then suddenly overflowing.', ['parstriangularis', 'inferiorparietal']),
  A('inferiortemporal', 'Inferior temporal gyrus', 'temporal', 'Recognises what you are looking at.',
    ['End of the visual "what" pathway.', 'Neurons respond to complex shapes and objects.'],
    'Visual agnosia: seeing an object clearly but not knowing what it is.',
    'Single neurons here can respond selectively to one particular familiar object.', ['lateraloccipital', 'fusiform', 'hippocampus']),
  A('bankssts', 'Superior temporal sulcus', 'temporal', 'Reads other people.',
    ['Detects gaze direction, lip movement and body motion.', 'Combines voices with faces.'],
    'Difficulty reading social cues.',
    'It can tell a walking person from a few moving dots — "biological motion".', ['superiortemporal', 'fusiform', 'amygdala']),
  A('fusiform', 'Fusiform gyrus', 'temporal', 'Faces and written words.',
    ['The fusiform face area specialises in faces.', 'On the left, the visual word form area recognises letters.'],
    'Prosopagnosia — face blindness.',
    'Reading is too recent for evolution, so literacy recycles part of this object-recognition cortex.', ['inferiortemporal', 'lateraloccipital', 'amygdala']),
  A('entorhinal', 'Entorhinal cortex', 'temporal', 'Gateway to the hippocampus — and your inner GPS.',
    ['Main input and output of the hippocampus.', 'Grid cells here tile space in a hexagonal map.'],
    'Early memory loss and disorientation.',
    'It is one of the very first regions damaged in Alzheimer\'s disease. Grid cells earned a 2014 Nobel Prize.', ['hippocampus', 'parahippocampal']),
  A('parahippocampal', 'Parahippocampal gyrus', 'temporal', 'Recognises places and scenes.',
    ['Encodes the layout of scenes and landmarks.', 'Feeds context into memory.'],
    'Difficulty recognising familiar places.',
    'It fires for a picture of a room, but barely for the furniture alone.', ['hippocampus', 'entorhinal', 'lingual']),
  A('temporalpole', 'Temporal pole', 'temporal', 'Knowledge about people and concepts.',
    ['Binds facts, names and emotions into concepts.', 'Supports social and emotional memory.'],
    'Semantic dementia: gradual loss of what things and words mean.',
    'It stores the link between a face and everything you know about that person.', ['amygdala', 'medialorbitofrontal']),
  // ---- occipital
  A('pericalcarine', 'Primary visual cortex (V1)', 'occipital', 'Where seeing begins in the cortex.',
    ['Holds a precise map of the visual field.', 'Detects edges and their orientation.'],
    'A blind patch in the matching part of the visual field.',
    'Half of it is devoted to the central 10° of vision — the part you are reading with now.', ['thalamus', 'lingual', 'cuneus', 'lateraloccipital']),
  A('cuneus', 'Cuneus', 'occipital', 'Lower half of your visual world.',
    ['Processes the lower visual field.', 'Passes visual information toward the parietal "where" stream.'],
    'Loss of vision in the lower quadrant on the opposite side.',
    'Images are flipped on the cortex: the lower world maps onto the upper bank.', ['pericalcarine', 'superiorparietal']),
  A('lingual', 'Lingual gyrus', 'occipital', 'Upper visual field, colour and letters.',
    ['Processes the upper visual field.', 'Contributes to colour vision and recognising letters.'],
    'Loss of the upper quadrant of vision; sometimes loss of colour (achromatopsia).',
    'It is active during dreaming — vivid visual dreams light it up.', ['pericalcarine', 'fusiform', 'parahippocampal']),
  A('lateraloccipital', 'Lateral occipital cortex', 'occipital', 'Assembles shapes into objects.',
    ['Recognises object shape regardless of size or position.', 'Bridges early vision and recognition.'],
    'Seeing lines and colours but not whole objects.',
    'It responds to the shape of an object whether you see it or feel it with your hands.', ['pericalcarine', 'inferiortemporal', 'superiorparietal']),
  // ---- cingulate
  A('rostralanteriorcingulate', 'Anterior cingulate (rostral)', 'cingulate', 'Emotion and mood regulation.',
    ['Evaluates emotional significance.', 'Helps regulate heart rate and stress responses.'],
    'Emotional blunting; implicated in depression.',
    'It contains unusual large "spindle" neurons found mainly in great apes, elephants and whales.', ['amygdala', 'medialorbitofrontal', 'insula']),
  A('caudalanteriorcingulate', 'Anterior cingulate (dorsal)', 'cingulate', 'The brain\'s error and conflict alarm.',
    ['Detects mistakes and competing responses.', 'Signals how much effort a task needs.'],
    'Loss of drive and failure to notice errors.',
    'It produces a measurable electrical blip about 80 ms after you make a mistake — often before you are aware of it.', ['rostralmiddlefrontal', 'precentral']),
  A('posteriorcingulate', 'Posterior cingulate cortex', 'cingulate', 'Hub of the resting, wandering mind.',
    ['Central node of the default mode network.', 'Supports autobiographical memory and self-reflection.'],
    'Memory and attention problems; reduced activity is an early sign of Alzheimer\'s disease.',
    'It uses about 40% more energy than the average for cortex.', ['precuneus', 'hippocampus', 'medialorbitofrontal']),
  A('isthmuscingulate', 'Isthmus of the cingulate', 'cingulate', 'Bridge between memory and navigation.',
    ['Links the cingulate with the hippocampal region.', 'Helps translate between a map view and your own viewpoint.'],
    'Getting lost in familiar surroundings.',
    'Also called retrosplenial cortex — it sits just behind the tail of the corpus callosum.', ['hippocampus', 'parahippocampal', 'precuneus']),
  // ---- insula
  A('insula', 'Insular cortex', 'insular', 'Feels the state of your body.',
    ['Maps heartbeat, breathing, hunger and pain.', 'Processes taste and disgust.', 'Turns bodily signals into conscious feelings.'],
    'Altered taste and craving; reduced awareness of bodily states.',
    'People who can count their own heartbeats more accurately have a larger right anterior insula.', ['amygdala', 'rostralanteriorcingulate', 'thalamus']),
];

export const DEEP: Structure[] = [
  {
    id: 'corpuscallosum', name: 'Corpus callosum', kind: 'fiber', parent: 'White matter', color: '#ece4d2',
    tagline: 'The bridge between the two hemispheres.',
    does: ['About 200 million axons carry information left ↔ right.', 'Lets both halves share what each sees, feels and plans.'],
    damage: 'When cut ("split-brain"), each hemisphere can act and perceive on its own.',
    fact: 'Split-brain patients can name an object seen on the right, but only draw — not name — one seen on the left.',
    connects: ['frontal', 'parietal'], meshes: ['ctx-corpuscallosum', 'ctx-unknown'],
  },
  {
    id: 'thalamus', name: 'Thalamus', kind: 'deep', parent: 'Diencephalon', color: '#ff8a5c',
    tagline: 'The relay station to the cortex.',
    does: ['Nearly every sense (except smell) passes through it on the way to the cortex.', 'Gates what gets through, shaping attention and sleep.', 'Loops with the cortex and basal ganglia for movement and thought.'],
    damage: 'Sensory loss, pain syndromes, or loss of consciousness if both sides are affected.',
    fact: 'During deep sleep it largely closes the gate — which is why quiet sounds do not wake you.',
    connects: ['pericalcarine', 'postcentral', 'transversetemporal', 'frontal', 'pallidum'], meshes: ['sub-thalamus'],
  },
  {
    id: 'hypothalamus', name: 'Hypothalamus', kind: 'deep', parent: 'Diencephalon', color: '#ffb347',
    tagline: 'Keeps the body in balance.',
    does: ['Controls hunger, thirst, body temperature and the body clock.', 'Commands the pituitary gland — and through it, the body\'s hormones.', 'Drives stress, sex and sleep–wake behaviour.'],
    damage: 'Disturbed appetite, temperature, sleep and hormone levels.',
    fact: 'It is about the size of an almond, yet nothing in your body stays stable without it.',
    connects: ['amygdala', 'hippocampus', 'midbrain'], meshes: ['sub-hypothalamus'],
  },
  {
    id: 'hippocampus', name: 'Hippocampus', kind: 'deep', parent: 'Limbic system', color: '#b388ff',
    tagline: 'Makes new memories and maps places.',
    does: ['Turns experiences into lasting memories of events and facts.', 'Place cells fire at specific locations — a cognitive map.', 'Replays the day\'s events during sleep to consolidate them.'],
    damage: 'Inability to form new long-term memories, as in the famous patient H.M.',
    fact: 'London taxi drivers who memorise the city\'s streets have a larger posterior hippocampus.',
    connects: ['entorhinal', 'amygdala', 'posteriorcingulate', 'medialorbitofrontal'], meshes: ['sub-hippocampus'],
  },
  {
    id: 'amygdala', name: 'Amygdala', kind: 'deep', parent: 'Limbic system', color: '#ff5d73',
    tagline: 'Tags experiences with emotional importance.',
    does: ['Detects threats and triggers fear responses within milliseconds.', 'Strengthens memories of emotional events.', 'Also responds to reward and social signals — not just fear.'],
    damage: 'Reduced fear and difficulty reading fear in other faces.',
    fact: 'A woman known as S.M., with no working amygdala, handles snakes and walks through haunted houses unafraid.',
    connects: ['hippocampus', 'medialorbitofrontal', 'hypothalamus', 'insula'], meshes: ['sub-amygdala'],
  },
  {
    id: 'caudate', name: 'Caudate nucleus', kind: 'deep', parent: 'Basal ganglia', color: '#5fd0ff',
    tagline: 'Learns goals and habits of thought.',
    does: ['Part of the striatum, the input stage of the basal ganglia.', 'Supports goal-directed learning and planning.', 'Receives dense dopamine input signalling "better or worse than expected".'],
    damage: 'Degenerates in Huntington\'s disease, causing involuntary movements and cognitive decline.',
    fact: 'It curls in a long C-shape following the ventricle — its "tail" ends near the amygdala.',
    connects: ['rostralmiddlefrontal', 'putamen', 'pallidum', 'thalamus'], meshes: ['sub-caudate'],
  },
  {
    id: 'putamen', name: 'Putamen', kind: 'deep', parent: 'Basal ganglia', color: '#3aa0e8',
    tagline: 'Automates practised movements.',
    does: ['Receives motor and sensory cortex input.', 'Stores well-learned movement routines (habits, skills).', 'Depends on dopamine from the substantia nigra.'],
    damage: 'Loss of its dopamine supply causes the slowness and tremor of Parkinson\'s disease.',
    fact: 'Riding a bike after years away works because the routine lives here, not in conscious memory.',
    connects: ['precentral', 'caudate', 'pallidum', 'midbrain'], meshes: ['sub-putamen'],
  },
  {
    id: 'pallidum', name: 'Globus pallidus', kind: 'deep', parent: 'Basal ganglia', color: '#8fe3c0',
    tagline: 'The brake that releases chosen actions.',
    does: ['Main output of the basal ganglia.', 'Constantly inhibits the thalamus; pausing it lets a movement go.'],
    damage: 'Too much or too little movement, depending on which part is affected.',
    fact: 'Surgeons place deep-brain-stimulation electrodes here to treat Parkinson\'s disease and dystonia.',
    connects: ['putamen', 'caudate', 'thalamus'], meshes: ['sub-pallidum'],
  },
  {
    id: 'accumbens', name: 'Nucleus accumbens', kind: 'deep', parent: 'Basal ganglia', color: '#ffd24d',
    tagline: 'Turns wanting into doing.',
    does: ['Core of the reward circuit.', 'Dopamine here signals that something is worth pursuing.', 'Links motivation (limbic) to action (motor).'],
    damage: 'Loss of motivation; over-driven by addictive drugs.',
    fact: 'Dopamine here tracks wanting more than liking — the craving, not the pleasure itself.',
    connects: ['midbrain', 'medialorbitofrontal', 'amygdala', 'hippocampus'], meshes: ['sub-accumbens'],
  },
  {
    id: 'ventricles', name: 'Lateral ventricles', kind: 'deep', parent: 'Fluid spaces', color: '#6fb7d6',
    tagline: 'Fluid-filled chambers that cushion and clean.',
    does: ['Produce cerebrospinal fluid (CSF) — about half a litre a day.', 'CSF cushions the brain and carries away waste.'],
    damage: 'Blocked flow causes hydrocephalus: the ventricles swell and press on the brain.',
    fact: 'Floating in CSF, your 1.4 kg brain effectively weighs about 50 grams.',
    connects: [], meshes: ['sub-ventricle'],
  },
  {
    id: 'cerebellum', name: 'Cerebellum', kind: 'cerebellum', parent: 'Hindbrain', color: '#e09a6a',
    tagline: 'Fine-tunes movement — and thought.',
    does: ['Compares what you intended with what happened and corrects errors.', 'Coordinates timing, balance and precision.', 'Also contributes to language and attention.'],
    damage: 'Clumsy, staggering movement (ataxia), slurred speech and tremor when reaching.',
    fact: 'It is only 10% of the brain\'s volume but holds about 80% of its neurons — some 69 billion.',
    connects: ['pons', 'thalamus', 'precentral'], meshes: ['cb-lh', 'cb-rh', 'cb-vermis'],
  },
  {
    id: 'midbrain', name: 'Midbrain', kind: 'stem', parent: 'Brainstem', color: '#d9c7a3',
    tagline: 'Reflexes for eyes and ears; home of dopamine.',
    does: ['Orients eyes and head toward sights and sounds.', 'Contains the substantia nigra and VTA — the main dopamine sources.', 'Helps control alertness and pain.'],
    damage: 'Eye-movement problems; loss of its dopamine neurons causes Parkinson\'s disease.',
    fact: '"Substantia nigra" means black substance — its neurons contain a dark pigment visible to the naked eye.',
    connects: ['putamen', 'accumbens', 'thalamus'], meshes: ['bs-midbrain'],
  },
  {
    id: 'pons', name: 'Pons', kind: 'stem', parent: 'Brainstem', color: '#cdb48a',
    tagline: 'The bridge to the cerebellum.',
    does: ['Relays cortex signals to the cerebellum.', 'Controls facial movement, chewing and some eye movements.', 'Generates REM sleep and helps regulate breathing.'],
    damage: 'Can cause "locked-in syndrome": awake and aware but unable to move anything except the eyes.',
    fact: 'During REM sleep it paralyses your muscles so you do not act out your dreams.',
    connects: ['cerebellum', 'precentral', 'medulla'], meshes: ['bs-pons'],
  },
  {
    id: 'medulla', name: 'Medulla oblongata', kind: 'stem', parent: 'Brainstem', color: '#bfa27a',
    tagline: 'Keeps you alive without being asked.',
    does: ['Sets the rhythm of breathing and regulates heart rate and blood pressure.', 'Controls swallowing, coughing and vomiting reflexes.', 'Motor fibres cross sides here — why the left brain moves the right body.'],
    damage: 'Often fatal, because breathing and circulation fail.',
    fact: 'It is barely 3 cm long, yet it is the one part of the brain you cannot survive without for even minutes.',
    connects: ['pons', 'hypothalamus'], meshes: ['bs-medulla'],
  },
];

// shade cortical areas within their lobe's hue so neighbours stay distinguishable
function shade(hex: string, i: number, n: number): string {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const k = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, k > 0 ? v + (255 - v) * k * 0.34 : v * (1 + k * 0.3))));
  // small hue wobble
  const w = ((i * 37) % 5) - 2;
  r = f(r + w * 7); g = f(g - w * 5); b = f(b + w * 4);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
for (const lobe of LOBES) {
  const kids = AREAS.filter((a) => a.parent === lobe.id);
  kids.forEach((a, i) => (a.color = shade(lobe.color, i, kids.length)));
  lobe.meshes = kids.flatMap((k) => k.meshes);
}

export const STRUCTURES: Structure[] = [...LOBES, ...AREAS, ...DEEP];
export const structureById = new Map(STRUCTURES.map((s) => [s.id, s]));
export const areasOf = (lobeId: string) => AREAS.filter((a) => a.parent === lobeId);

/** aliases so links like "insula" resolve whichever granularity is shown */
export function resolveStructure(id: string): Structure | undefined {
  return structureById.get(id);
}
