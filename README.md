# Brain Explorer

An interactive 3D journey through the human brain — from the whole organ down to a single ion channel.
Five levels, each roughly a thousand times smaller than the last, joined by one continuous zoom.

| Level | Scale | What you explore |
|-------|-------|------------------|
| **Brain** | ~15 cm | Lobes, 34 cortical areas and the deep structures; slice, explode, ghost the cortex |
| **Systems** | ~10 cm | Dopamine, serotonin and other chemical systems; pathways for vision, movement, memory, fear |
| **Cells** | ~1 mm | Neurons and glia in a cortical column, with a live excitatory/inhibitory microcircuit |
| **Synapse** | ~1 µm | Vesicle release, receptors, reuptake — and how drugs change them |
| **Membrane** | ~10 nm | Ion channels and the action potential, driven by the Hodgkin–Huxley equations |

Also included: a guided tour, search across every structure and concept (`/`), a short quiz per level,
and light and dark themes (the top-bar button cycles dark, light and follow-system).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ — host it anywhere
npm test           # simulation unit tests
```

Append `?level=brain` (or `systems`, `cells`, `synapse`, `membrane`) to open a level directly.

## Controls

- **Drag** rotate · **scroll / pinch** zoom · **right-drag** pan · **click** select · **double-click** focus / drill down
- Keep scrolling past the zoom limit to dive into the next level (or pull back to the previous one)
- `/` search · `1`–`5` levels · `[` `]` previous / next level · `R` reset view · `Esc` deselect

## How it is built

- **Vite + React + TypeScript + three.js.** React draws the panels; the 3D scene is driven
  imperatively by `src/scene/SceneManager.ts`, which owns the camera and flies between levels.
- Each level is a class in `src/scene/levels/` implementing `src/scene/Level.ts`, with its own
  small zustand store in `src/state/`, its teaching text in `src/content/`, and its panel in
  `src/ui/panels/`.
- Simulations (`src/sim/`) are plain TypeScript with unit tests in `tests/`.

### Anatomy pipeline

The brain meshes come from real imaging data (see [ATTRIBUTION.md](ATTRIBUTION.md)).
To rebuild them:

```bash
pip install nibabel numpy scipy scikit-image trimesh fast-simplification
scripts/fetch_sources.sh .sources
python3 scripts/build_models.py .sources public/models
```

Output is in "scene space": centimetres, +X = the subject's left, +Y = up, +Z = front.
`mni(x, y, z)` in `src/scene/BrainModel.ts` converts MNI millimetres into that space.

## A note on accuracy

Brain Explorer is a teaching tool. Region shapes come from an average brain template, cells and
molecules are procedural illustrations with sizes exaggerated where that helps, and the text
flags where a story has been simplified. It is not a medical reference.
