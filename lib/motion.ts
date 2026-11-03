// One source of truth for motion, so the JS animation and the CSS transitions agree.
//
// Durations and distances are small on purpose: this is a trading terminal, and motion should
// read as "considered", never as "look at me". The single spring is used for anything that
// follows the pointer or opens a panel.

export const DUR = {
    fast: 0.14,
    base: 0.22,
    slow: 0.34,
} as const;

/** Matches `--ui-ease` in globals.css. */
export const EASE: [number, number, number, number] = [0.2, 0, 0, 1];

export const SPRING = {
    type: 'spring' as const,
    stiffness: 260,
    damping: 30,
    mass: 0.9,
};

/** Enter distance for a fade-up, in px. */
export const RISE = 10;
/** The larger distance for a hero-scale reveal. */
export const RISE_LG = 18;
