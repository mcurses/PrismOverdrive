import Score from "../Score/Score";
import CarData from "../Car/CarData";
import {CarType} from "../Car/CarType";
import TrackData from "../Playfield/TrackData";

class Session {
    sessionId: string;
    playerName: string;
    scores: { [name: string]: Score };
    carType: string;
    trackName: string

    constructor(name: string) {
        this.playerName = name;
        this.sessionId = this.generateSessionId();
        this.carType = CarData.types[0].name;
        this.trackName = 'bounds2'
        this.scores = {}
    }

    saveToLocalStorage() {
        localStorage.setItem("sessionId", this.sessionId);
        localStorage.setItem("playerName", this.playerName);
        localStorage.setItem("carType", this.carType);
        localStorage.setItem("track", this.trackName);
        localStorage.setItem("scores", JSON.stringify(this.scores));


    }

    static loadFromLocalStorage() {
        const sessionId = localStorage.getItem("sessionId");
        const playerName = localStorage.getItem("playerName");
        const carType = localStorage.getItem("carType");
        const track = localStorage.getItem("track");
        const scores = localStorage.getItem("scores");
        if (sessionId && playerName && carType && track) {
            const session = new Session(playerName);
            session.carType = carType
            session.trackName = track
            session.playerName = playerName
            let parsedScores = JSON.parse(scores)

            for (let key in parsedScores) {
                let score = parsedScores[key]
                session.scores[key] = new Score(score.trackName, score.carType, score.playerName)
                session.scores[key].frameScore = score.frameScore
                session.scores[key].highScore = score.highScore
                session.scores[key].driftScore = score.driftScore

            }
            return session;
        } else {
            return null;
        }
    }

    private generateSessionId() {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 16; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;

    }
}

export default Session;