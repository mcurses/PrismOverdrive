import CarData from "../Car/CarData";
import TrackData from "../Playfield/TrackData";
import Session from "../Session/Session";

interface MenuProps {
    session: Session,
    loadTrack: (trackName: string) => void,
    setCarType: (carType: string) => void
    setPlayerName: (name: string) => void
}

class Menu {
    private nameInput: HTMLInputElement;
    private carSelector: HTMLSelectElement;
    private trackSelector: HTMLSelectElement;
    private session: Session;
    private loadTrack: (trackName: string) => void;
    private setCarType: (carType: string) => void;
    private setPlayerName: (name: string) => void;

    constructor(props: MenuProps) {
        this.session = props.session;
        this.loadTrack = props.loadTrack;
        this.setCarType = props.setCarType;
        this.setPlayerName = props.setPlayerName;
        this.createMenuElements()
    }

    private createMenuElements() {
        // create a input wrapper
        let inputWrapper = document.createElement('div');
        inputWrapper.style.position = 'absolute';
        inputWrapper.style.top = '10px';
        inputWrapper.style.left = '200px';
        inputWrapper.style.display = 'flex';
        document.body.appendChild(inputWrapper);

        // Create the input field
        this.nameInput = document.createElement('input');
        this.nameInput.style.position = 'relative';
        // this.nameInput.style.display = 'none';  // Initially hidden
        this.nameInput.style.top = '10px';
        this.nameInput.value = this.session.playerName.slice(0, 8);
        this.nameInput.addEventListener('input', () => this.setPlayerName(this.nameInput.value));
        inputWrapper.appendChild(this.nameInput);

        // create a select dropdown menu
        this.carSelector = document.createElement('select');
        this.carSelector.style.position = 'relative';
        this.carSelector.style.left = '180px';
        this.carSelector.style.top = '10px';
        // this.carSelector.style.display = 'none';  // Initially hidden
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
        this.trackSelector.style.position = 'relative';
        this.trackSelector.style.left = '280px';
        this.trackSelector.style.top = '10px';
        // this.trackSelector.style.display = 'none';  // Initially hidden
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


        // // make visible
        // this.toggleNameInput();
        // this.toggleCarSelector();
        // this.toggleTrackSelector();

        // this.inputController.handleKey('Enter', () => this.nameInput.style.display = 'none');
    }

    toggleCarSelector() {
        this.carSelector.style.display = this.carSelector.style.display === 'none' ? 'block' : 'none';
    }

    toggleTrackSelector() {
        this.trackSelector.style.display = this.trackSelector.style.display === 'none' ? 'block' : 'none';
    }

    toggleNameInput() {
        this.nameInput.value = this.session.playerName;
        this.nameInput.style.display = this.nameInput.style.display === 'none' ? 'block' : 'none';
        if (this.nameInput.style.display === 'block') {
            this.nameInput.focus();
        } else {
            this.nameInput.blur();
        }
    }

}

export default Menu;