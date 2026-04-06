/**
 * Invert a hex color by flipping each RGB channel (255 - channel).
 * Accepts "#RGB" or "#RRGGBB". Always returns "#RRGGBB".
 */
export const invertColor = (hex: string): string => {
  const cleaned = hex.replace("#", "");

  let r: number;
  let g: number;
  let b: number;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0]! + cleaned[0], 16);
    g = parseInt(cleaned[1]! + cleaned[1], 16);
    b = parseInt(cleaned[2]! + cleaned[2], 16);
  } else {
    r = parseInt(cleaned.substring(0, 2), 16);
    g = parseInt(cleaned.substring(2, 4), 16);
    b = parseInt(cleaned.substring(4, 6), 16);
  }

  const toHex = (v: number): string => v.toString(16).padStart(2, "0");

  return `#${toHex(255 - r)}${toHex(255 - g)}${toHex(255 - b)}`;
};

/**
 * Generate a CSS text-shadow string that produces an inverted-color outer glow.
 * Combines 4-directional 1px hard outline with a soft blur for readability.
 */
export const getInvertedGlowShadow = (textColor: string): string => {
  const inv = invertColor(textColor);

  return [
    `0 0 3px ${inv}`,
    `-1px -1px 0 ${inv}`,
    `1px -1px 0 ${inv}`,
    `-1px 1px 0 ${inv}`,
    `1px 1px 0 ${inv}`,
  ].join(", ");
};
