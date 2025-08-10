import CarData from "../Car/CarData";
import TrackData from "../Playfield/TrackData";
import Session from "../Session/Session";

interface MenuProps {
    session: Session,
    loadTrack: (trackName: string) => void,
    setCarType: (carType: string) => void
    setPlayerName: (name: string) => void
    position?: { x: number, y: number }
}

class Menu {
    private nameInput: HTMLInputElement;
    private carSelector: HTMLSelectElement;
    private trackSelector: HTMLSelectElement;
    private session: Session;
    private loadTrack: (trackName: string) => void;
    private setCarType: (carType: string) => void;
    private setPlayerName: (name: string) => void;
    private position: { x: number, y: number };

    constructor(props: MenuProps) {
        this.session = props.session;
        this.loadTrack = props.loadTrack;
        this.setCarType = props.setCarType;
        this.setPlayerName = props.setPlayerName;
        this.position = props.position || { x: 200, y: 10 };
        this.injectStyles();
        this.createMenuElements()
    }

    private injectStyles() {
        // Check if styles are already injected
        if (document.querySelector('style[data-menu-styles]')) {
            return;
        }

        const style = document.createElement('style');
        style.setAttribute('data-menu-styles', 'true');
        style.textContent = `
            .ui-panel {
                position: absolute;
                display: flex;
                gap: 12px;
            }
            .hidden {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    private createMenuElements() {
        // create a input wrapper
        let inputWrapper = document.createElement('div');
        inputWrapper.className = 'ui-panel';
        inputWrapper.style.top = `${this.position.y}px`;
        inputWrapper.style.left = `${this.position.x}px`;
        document.body.appendChild(inputWrapper);

        // Create the input field
        this.nameInput = document.createElement('input');
        this.nameInput.value = this.session.playerName.slice(0, 8);
        this.nameInput.addEventListener('input', () => this.setPlayerName(this.nameInput.value));
        inputWrapper.appendChild(this.nameInput);

        // create a select dropdown menu
        this.carSelector = document.createElement('select');
        // set the options
        for (let carType of CarData.types) {
            let option = document.createElement('option');
            option.value = carType.name;
            option.text = carType.name;
            this.carSelector.appendChild(option);
        }
        this.carSelector.value = this.session.carType;
        this.carSelector.addEventListener('change', () => this.setCarType(this.carSelector.value));
        inputWrapper.appendChild(this.carSelector);

        // track selector
        this.trackSelector = document.createElement('select');
        // set the options
        for (let track of TrackData.tracks) {
            let option = document.createElement('option');
            option.value = track.name;
            option.text = track.name;
            this.trackSelector.appendChild(option);
        }
        this.trackSelector.value = this.session.trackName;

        this.trackSelector.addEventListener('change', () => this.loadTrack(this.trackSelector.value));
        inputWrapper.appendChild(this.trackSelector);
    }

    toggleCarSelector() {
        this.carSelector.classList.toggle('hidden');
    }

    toggleTrackSelector() {
        this.trackSelector.classList.toggle('hidden');
    }

    toggleNameInput() {
        this.nameInput.value = this.session.playerName;
        this.nameInput.classList.toggle('hidden');
        if (!this.nameInput.classList.contains('hidden')) {
            this.nameInput.focus();
        } else {
            this.nameInput.blur();
        }
    }

}

export default Menu;
