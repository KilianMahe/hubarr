// SPDX-License-Identifier: AGPL-3.0-or-later
// Conversions de couleurs pures (`ColorMath` d'origine) : HSL → RGB et hex.
// Aucune dépendance, pour être testées seules et servir au serveur comme au front.

/** Couleur HSL : teinte en degrés, saturation et luminosité en pourcentage. */
export type Hsl = readonly [h: number, s: number, l: number];

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s) / 100;
  const light = clamp(l) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** `#rrggbb` en minuscules. */
export function hslToHex(h: number, s: number, l: number): string {
  return `#${hslToRgb(h, s, l)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** `"r, g, b"`, pour un `rgba()`. */
export function hslToRgbTuple(h: number, s: number, l: number): string {
  return hslToRgb(h, s, l).join(', ');
}

/**
 * Mélange de deux couleurs `#rrggbb` : `weight` de `color`, le reste de `base`.
 * Donne la couleur opaque équivalente à `color` posée sur `base` avec une
 * opacité `weight`.
 */
export function mixHex(color: string, base: string, weight: number): string {
  const channel = (hex: string, index: number) =>
    parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const w = clamp(weight, 0, 1);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(color, i) * w + channel(base, i) * (1 - w))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Luminance relative WCAG 2.x d'une couleur `#rrggbb` (0 : noir, 1 : blanc). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = [0, 1, 2].map((i) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG entre deux couleurs `#rrggbb` (de 1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * `color` rapprochée du blanc ou du noir (le plus contrasté avec le fond) par petits pas
 * jusqu'à atteindre `min` de contraste sur `background`. Inchangée si elle
 * l'atteint déjà.
 */
export function ensureContrast(color: string, background: string, min = 4.5): string {
  const target =
    contrastRatio('#ffffff', background) > contrastRatio('#000000', background)
      ? '#ffffff'
      : '#000000';
  for (let weight = 0; weight <= 1; weight += 0.05) {
    const candidate = mixHex(target, color, weight);
    if (contrastRatio(candidate, background) >= min) return candidate;
  }
  return target;
}

/** Texte lisible sur `background` : quasi-noir ou blanc, le plus contrasté des deux. */
export function readableOn(background: string): string {
  return contrastRatio('#141414', background) >= contrastRatio('#ffffff', background)
    ? '#141414'
    : '#ffffff';
}
