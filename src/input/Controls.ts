export type Action = 'ACCELERATE' | 'BRAKE' | 'LEFT' | 'RIGHT' | 'HANDBRAKE' | 'BOOST';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
    ACCELERATE: ['ArrowUp'],
    BRAKE: ['ArrowDown'],
    LEFT: ['ArrowLeft'],
    RIGHT: ['ArrowRight'],
    HANDBRAKE: ['Space'],
    BOOST: ['KeyW', 'ShiftRight']
};

export function isActionDown(codesDown: Set<string>, action: Action, bindings = DEFAULT_BINDINGS): boolean {
    const codes = bindings[action];
    return codes.some(code => codesDown.has(code));
}
