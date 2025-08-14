
export enum InputType {
    KEYBOARD,
}
export class InputController {
    private keys: { [key: string]: boolean };
    private onKeyDown: (e: KeyboardEvent) => void;
    private onKeyUp: (e: KeyboardEvent) => void;
    private keyHandlers: Map<string, Function> = new Map();

    constructor(type: InputType) {
        switch (type) {
            case InputType.KEYBOARD:
                this.keys = {
                    'ArrowUp': false,
                    'ArrowDown': false,
                    'ArrowLeft': false,
                    'ArrowRight': false,
                    'Space': false,
                    'Escape': false,
                    'Enter': false,
                    'Shift': false,
                };

                this.onKeyDown = (e: KeyboardEvent) => {
                    if (this.keys.hasOwnProperty(e.key)) {
                        this.keys[e.key] = true;
                    }
                    if (e.key === ' ') {
                        e.preventDefault();
                        this.keys['Space'] = true;
                    }
                    if (e.key === 'Shift') {
                        this.keys['Shift'] = true;
                    }
                    // Always mirror the modifier state
                    this.keys['Shift'] = e.shiftKey;

                    // Check for registered handlers
                    const handlerKey = e.key === ' ' ? 'Space' : e.key;
                    const handler = this.keyHandlers.get(handlerKey);
                    if (handler) {
                        handler();
                    }
                };

                this.onKeyUp = (e: KeyboardEvent) => {
                    if (this.keys.hasOwnProperty(e.key)) {
                        this.keys[e.key] = false;
                    }
                    if (e.key === ' ') {
                        e.preventDefault();
                        this.keys['Space'] = false;
                    }
                    if (e.key === 'Shift') {
                        this.keys['Shift'] = false;
                    }
                    // Always mirror the modifier state
                    this.keys['Shift'] = e.shiftKey;
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

    setKey(key: string, value: boolean) {
        this.keys[key] = value;
    }

    getKeys() {
        return this.keys;
    }
}


// Listen for keydown event and update the state of the corresponding key

