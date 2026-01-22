export interface SpinnerStyle {
  frames: string[];
  interval: number;
}

export const SPINNER_STYLES: Record<string, SpinnerStyle> = {
  dots: {
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    interval: 80,
  },
  bouncingBall: {
    frames: [
      "( ●    )",
      "(  ●   )",
      "(   ●  )",
      "(    ● )",
      "(     ●)",
      "(    ● )",
      "(   ●  )",
      "(  ●   )",
      "( ●    )",
      "(●     )",
    ],
    interval: 180,
  },
};

export type SpinnerVariant = keyof typeof SPINNER_STYLES;

/**
 * Gets the spinner style for a given variant.
 */
export function getSpinnerStyle(variant: SpinnerVariant = "dots"): SpinnerStyle {
  return SPINNER_STYLES[variant] as SpinnerStyle;
}

/**
 * Gets the current frame of a spinner based on an index.
 */
export function getSpinnerFrame(index: number, variant: SpinnerVariant = "dots"): string {
  const style = getSpinnerStyle(variant);
  return style.frames[index % style.frames.length] as string;
}
