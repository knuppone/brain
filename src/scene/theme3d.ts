import * as THREE from 'three';
import { useTheme } from '../state/theme';

/** true when the light theme is showing */
export const isLight = () => useTheme.getState().theme === 'light';

/**
 * Run `cb` now and again whenever the theme changes. Returns an unsubscribe function —
 * call it from a level's exit() like any other subscription.
 */
export function onTheme(cb: (light: boolean) => void): () => void {
  cb(isLight());
  return useTheme.subscribe((s, p) => {
    if (s.theme !== p.theme) cb(s.theme === 'light');
  });
}

type BlendProps = Partial<Pick<THREE.Material, 'blending' | 'blendEquation' | 'blendSrc' | 'blendDst' | 'blendSrcAlpha' | 'blendDstAlpha' | 'premultipliedAlpha'>>;

/**
 * Glow materials add light, which only reads on a dark stage. On the light stage the same
 * material is drawn as translucent "ink" instead: ordinary alpha blending.
 * `additive` is whatever blend setup the material uses in the dark theme.
 * The shader (or material colour) must also switch to a darker, saturated colour and put
 * its intensity into alpha — see `ink()` and the `uLight` uniform convention.
 */
export function setGlowBlend(material: THREE.Material, light: boolean, additive: BlendProps = { blending: THREE.AdditiveBlending }) {
  if (light) {
    material.blending = THREE.NormalBlending;
  } else {
    Object.assign(material, additive);
  }
  material.needsUpdate = true;
}

const hsl = { h: 0, s: 0, l: 0 };

/** a colour that reads as ink on a pale background: same hue, more saturated, capped lightness */
export function ink(color: THREE.ColorRepresentation, maxLightness = 0.42, target = new THREE.Color()): THREE.Color {
  target.set(color).getHSL(hsl);
  return target.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + 0.05), Math.min(hsl.l, maxLightness));
}

/** pick a colour by theme, converting to ink on the light stage */
export const themed = (color: THREE.ColorRepresentation, light: boolean, maxLightness = 0.42) =>
  light ? ink(color, maxLightness) : new THREE.Color(color);

/** read a CSS custom property (design token) as a string usable in canvas 2D drawing */
export function token(name: string, fallback = '#888'): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
