import { DEFAULT_BINDINGS, isActionDown, Action } from './input/Controls';

export enum InputType {
    KEYBOARD,
}

export class InputController {
    private codesDown: Set<string> = new Set();
    private onKeyDown: (e: KeyboardEvent) => void;
    private onKeyUp: (e: KeyboardEvent) => void;
    private keyHandlers: Map<string, Function> = new Map();

    constructor(type: InputType) {
        switch (type) {
            case InputType.KEYBOARD:
                this.onKeyDown = (e: KeyboardEvent) => {
                    const code = e.code || '';
                    if (code) {
                        this.codesDown.add(code);
                    }
                    if (code === 'Space') {
                        e.preventDefault();
                    }

                    // Check for registered handlers
                    const handler = this.keyHandlers.get(code);
                    if (handler) {
                        handler();
                    }
                };

                this.onKeyUp = (e: KeyboardEvent) => {
                    const code = e.code || '';
                    if (code) {
                        this.codesDown.delete(code);
                    }
                    if (code === 'Space') {
                        e.preventDefault();
                    }
                };

                window.addEventListener('keydown', this.onKeyDown);
                window.addEventListener('keyup', this.onKeyUp);
        }
    }

    handleKey(name: string, handler: Function) {
        this.keyHandlers.set(name, handler);
    }

    destroy() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    getCodesDown(): Set<string> {
        return new Set(this.codesDown);
    }

    getActions(): { ACCELERATE: boolean; BRAKE: boolean; LEFT: boolean; RIGHT: boolean; HANDBRAKE: boolean; BOOST: boolean } {
        const d = this.getCodesDown();
        return {
            ACCELERATE: isActionDown(d, 'ACCELERATE'),
            BRAKE: isActionDown(d, 'BRAKE'),
            LEFT: isActionDown(d, 'LEFT'),
            RIGHT: isActionDown(d, 'RIGHT'),
            HANDBRAKE: isActionDown(d, 'HANDBRAKE'),
            BOOST: isActionDown(d, 'BOOST'),
        };
    }

    getCompatKeysFromActions(actions: { ACCELERATE: boolean; BRAKE: boolean; LEFT: boolean; RIGHT: boolean; HANDBRAKE: boolean; BOOST: boolean }): Record<string, boolean> {
        return {
            'ArrowUp': actions.ACCELERATE,
            'ArrowDown': actions.BRAKE,
            'ArrowLeft': actions.LEFT,
            'ArrowRight': actions.RIGHT,
            'Space': actions.HANDBRAKE,
        };
    }

    // Legacy compatibility methods
    setKey(key: string, value: boolean) {
        // This method is kept for compatibility but may not work as expected with the new system
    }

    getKeys() {
        // Legacy method - convert current actions to old format
        const actions = this.getActions();
        return this.getCompatKeysFromActions(actions);
    }
}


// Listen for keydown event and update the state of the corresponding key

