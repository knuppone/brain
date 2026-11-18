export interface HeadLayer {
  id: string;
  name: string;
  color: string;
  thickness: string;
  tagline: string;
  does: string[];
  fact: string;
}

/** outside → inside */
export const HEAD_LAYERS: HeadLayer[] = [
  {
    id: 'scalp', name: 'Scalp', color: '#c98f7a', thickness: '5–7 mm',
    tagline: 'Skin, fat and a tough fibrous sheet over the skull.',
    does: [
      'Five layers (remembered as S-C-A-L-P) cushion blows and carry a rich blood supply.',
      'Hair and sweat glands help regulate temperature.',
    ],
    fact: 'Scalp cuts bleed dramatically because its vessels are held open by fibrous tissue and cannot clamp shut.',
  },
  {
    id: 'skull', name: 'Skull', color: '#ddd2b4', thickness: '≈ 6.5 mm (2–10 mm)',
    tagline: 'A rigid helmet of 22 fused bones.',
    does: [
      'Eight cranial bones form the braincase; fourteen form the face.',
      'Each bone is a sandwich: two hard plates around a spongy core that absorbs impact.',
      'Openings (foramina) let nerves and vessels pass; the largest lets the spinal cord exit.',
    ],
    fact: 'A newborn\'s skull bones are not yet fused — soft gaps called fontanelles let the brain grow and the head squeeze through birth.',
  },
  {
    id: 'dura', name: 'Dura mater', color: '#b9857c', thickness: '≈ 1 mm',
    tagline: '"Tough mother" — a leathery sheet lining the skull.',
    does: [
      'The outermost of three membranes (meninges) that wrap the brain.',
      'Folds of dura dip between the hemispheres and over the cerebellum, holding the brain steady.',
      'Channels inside it (venous sinuses) drain blood from the brain.',
    ],
    fact: 'The brain itself cannot feel pain. Many headaches come from pain fibres in the dura and its blood vessels.',
  },
  {
    id: 'arachnoid', name: 'Arachnoid & cerebrospinal fluid', color: '#8fc6e6', thickness: '2–4 mm of fluid',
    tagline: 'A spider-web membrane over a moat of clear fluid.',
    does: [
      'Beneath the arachnoid lies the subarachnoid space, filled with cerebrospinal fluid (CSF).',
      'CSF lets the brain float, cushions it against knocks and carries away waste.',
      'Major arteries run through this space before diving into the brain.',
    ],
    fact: 'You make about 500 ml of CSF a day, replacing the whole 150 ml supply three to four times.',
  },
  {
    id: 'pia', name: 'Pia mater & cortex', color: '#e0aaa0', thickness: 'a few cells',
    tagline: '"Tender mother" — a film clinging to every fold of the brain.',
    does: [
      'The pia follows each ridge (gyrus) and groove (sulcus) of the cortex like cling film.',
      'It carries the small vessels that feed the outer brain.',
      'Under it lies the cerebral cortex: 2–4 mm of grey matter folded to fit about 2,000 cm² into the skull.',
    ],
    fact: 'Unfolded, your cortex would be roughly the size of a large pizza — the folds are how it fits.',
  },
];

export const headLayerById = new Map(HEAD_LAYERS.map((l) => [l.id, l]));
