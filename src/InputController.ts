
export enum InputType {
    KEYBOARD,
}
export class InputController {
    private keys: { [key: string]: boolean };

    constructor(type: InputType) {
        switch (type) {
            case InputType.KEYBOARD:
                this.keys = {
                    'ArrowUp': false,
                    'ArrowDown': false,
                    'ArrowLeft': false,
                    'ArrowRight': false
                };
                window.addEventListener('keydown', (e) => {
                    if (this.keys.hasOwnProperty(e.key)) {
                        this.keys[e.key] = true;
                    }
                });

                window.addEventListener('keyup', (e) => {
                    if (this.keys.hasOwnProperty(e.key)) {
                        this.keys[e.key] = false;
                    }
                });
        }
    }

    destroy() {
        window.removeEventListener('keydown', () => {});
        window.removeEventListener('keyup', () => {});
    }

    setKey(key: string, value: boolean) {
        this.keys[key] = value;
    }

    getKeys() {
        return this.keys;
    }
}


// Listen for keydown event and update the state of the corresponding key

