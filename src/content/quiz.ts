import type { LevelId } from '../state/store';

export interface QuizQuestion {
  level: LevelId;
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export const QUIZ: QuizQuestion[] = [
  // brain
  { level: 'brain', q: 'A person can no longer form new long-term memories. Which structure is most likely damaged?', options: ['Cerebellum', 'Hippocampus', 'Occipital lobe', 'Pons'], answer: 1,
    why: 'The hippocampus turns experiences into lasting memories — as shown by the famous patient H.M.' },
  { level: 'brain', q: 'Where does visual information first arrive in the cortex?', options: ['Frontal lobe', 'Temporal lobe', 'Occipital lobe, at the back', 'Insula'], answer: 2,
    why: 'Primary visual cortex (V1) sits at the very back of the brain, in the occipital lobe.' },
  { level: 'brain', q: 'The cerebellum holds roughly what share of the brain\'s neurons?', options: ['About 10%', 'About 25%', 'About 50%', 'About 80%'], answer: 3,
    why: 'It is only a tenth of the volume but packed with tiny granule cells — around 69 of the 86 billion neurons.' },
  { level: 'brain', q: 'Slow, effortful speech with good understanding points to damage in…', options: ['Broca\'s area (frontal lobe)', 'Wernicke\'s area (temporal lobe)', 'The thalamus', 'The amygdala'], answer: 0,
    why: 'Broca\'s area assembles speech. Wernicke\'s area damage gives the opposite picture: fluent but meaningless speech.' },
  { level: 'brain', q: 'Why does the left side of the brain control the right side of the body?', options: ['The hemispheres are mirrored at birth', 'Motor fibres cross over in the medulla', 'The corpus callosum swaps the signals', 'It does not — that is a myth'], answer: 1,
    why: 'Most motor fibres cross at the "pyramidal decussation" in the medulla on their way to the spinal cord.' },
  // systems
  { level: 'systems', q: 'Dopamine neurons in the midbrain mainly signal…', options: ['Pleasure itself', 'That something was better or worse than expected', 'Pain intensity', 'Sleep pressure'], answer: 1,
    why: 'Dopamine carries a "prediction error" and drives wanting and learning — it is not simply a pleasure chemical.' },
  { level: 'systems', q: 'Parkinson\'s disease is caused by loss of dopamine neurons in the…', options: ['Raphe nuclei', 'Locus coeruleus', 'Substantia nigra', 'Hippocampus'], answer: 2,
    why: 'The nigrostriatal pathway from the substantia nigra to the putamen and caudate degenerates, making movement hard to start.' },
  { level: 'systems', q: 'Nearly all senses pass through which relay on the way to the cortex?', options: ['Thalamus', 'Amygdala', 'Cerebellum', 'Corpus callosum'], answer: 0,
    why: 'The thalamus relays vision, hearing and touch. Smell is the exception — it reaches the cortex directly.' },
  { level: 'systems', q: 'The brain\'s main fast "stop" signal is…', options: ['Glutamate', 'GABA', 'Serotonin', 'Noradrenaline'], answer: 1,
    why: 'GABA is the main inhibitory transmitter; glutamate is the main excitatory one. The others are slower modulators.' },
  // cells
  { level: 'cells', q: 'Which part of a neuron usually receives incoming signals?', options: ['Axon', 'Myelin', 'Dendrites', 'Axon terminals'], answer: 2,
    why: 'Dendrites collect input, the cell body sums it, and the axon carries the output.' },
  { level: 'cells', q: 'Which cells wrap axons in myelin inside the brain?', options: ['Astrocytes', 'Microglia', 'Oligodendrocytes', 'Pyramidal cells'], answer: 2,
    why: 'Oligodendrocytes make myelin in the brain and spinal cord. In multiple sclerosis the immune system attacks it.' },
  { level: 'cells', q: 'What happens in a circuit if inhibitory interneurons fall silent?', options: ['Nothing changes', 'Activity dies away', 'Excitation runs away — as in a seizure', 'Neurons shrink'], answer: 2,
    why: 'Inhibition keeps excitation in check. Lose the balance and activity can spread uncontrollably.' },
  { level: 'cells', q: 'Roughly how many neurons are in a human brain?', options: ['86 million', '1 billion', '86 billion', '1 trillion'], answer: 2,
    why: 'About 86 billion neurons, with a roughly similar number of glial cells — not ten times more, as was long claimed.' },
  // synapse
  { level: 'synapse', q: 'What directly triggers vesicles to release their transmitter?', options: ['Sodium leaving the terminal', 'Calcium entering the terminal', 'Potassium entering the terminal', 'The receptor opening'], answer: 1,
    why: 'The arriving spike opens voltage-gated calcium channels; calcium makes docked vesicles fuse with the membrane.' },
  { level: 'synapse', q: 'An SSRI antidepressant works by…', options: ['Releasing more serotonin', 'Blocking serotonin reuptake', 'Destroying serotonin receptors', 'Blocking sodium channels'], answer: 1,
    why: 'It blocks the transporter (SERT) that takes serotonin back up, so serotonin lingers in the cleft.' },
  { level: 'synapse', q: 'Opening a chloride channel (as GABA does) usually makes the next neuron…', options: ['More likely to fire', 'Less likely to fire', 'Fire immediately', 'Release dopamine'], answer: 1,
    why: 'Chloride entering keeps the cell away from threshold — an inhibitory postsynaptic potential.' },
  { level: 'synapse', q: 'How does botulinum toxin (Botox) paralyse a muscle?', options: ['It blocks acetylcholine receptors', 'It stops vesicles from fusing, so nothing is released', 'It destroys the muscle', 'It blocks sodium channels'], answer: 1,
    why: 'It cuts the proteins that let vesicles fuse with the membrane, so no acetylcholine reaches the muscle.' },
  // membrane
  { level: 'membrane', q: 'What causes the rising phase of an action potential?', options: ['K⁺ rushing out', 'Na⁺ rushing in', 'The pump reversing', 'Cl⁻ rushing in'], answer: 1,
    why: 'Voltage-gated Na⁺ channels open and Na⁺ floods in, pushing the voltage up — which opens even more channels.' },
  { level: 'membrane', q: 'A stronger stimulus makes a neuron…', options: ['Fire bigger spikes', 'Fire spikes more often', 'Fire slower spikes', 'Fire backwards'], answer: 1,
    why: 'Spikes are all-or-none: always the same size. Strength is coded by how many spikes per second.' },
  { level: 'membrane', q: 'Why can\'t a second spike fire immediately after the first?', options: ['The cell has run out of sodium', 'Na⁺ channels are inactivated for a moment', 'The pump is too slow', 'Myelin blocks it'], answer: 1,
    why: 'After opening, Na⁺ channels are plugged by an inactivation gate until the membrane has recovered — the refractory period.' },
  { level: 'membrane', q: 'How does myelin speed up conduction?', options: ['It adds more ion channels', 'It lets the spike jump from node to node', 'It makes spikes taller', 'It warms the axon'], answer: 1,
    why: 'Myelin insulates the axon so current races to the next node of Ranvier — "saltatory" conduction, up to 100 m/s.' },
];
