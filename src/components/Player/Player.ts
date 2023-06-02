import Car from "../Car/Car";
import Score from "../Score/Score";
import {driftColor} from "../Score/ScoreVisualize";
import {HSLColor} from "../../utils/HSLColor";
import car from "../Car/Car";

export default class Player {
    name: string;
    car: Car;
    score: Score;
    idleTime: number;
    lastDriftTime: number;
    id: string;

    constructor(name: string, car: Car, score: Score) {
        this.name = name;
        this.car = car;
        this.score = score;
        this.idleTime = 0;
        this.lastDriftTime = 0;
    }

    handleServerUpdate(player: Player) {

        // update all properties of the player
        this.car.targetPosition = player.car.targetPosition;
        this.car.targetAngle = player.car.targetAngle;
        this.car.isDrifting = player.car.isDrifting;
        this.score = player.score;
        this.name = player.name;
    }

    update() {
        // TODO: Ultimately move all score logic to the server
        // Reset the score if not drifting for 3 seconds
        if (this.car.isDrifting) {
            this.lastDriftTime = Date.now();
        } else if (this.car.lastDriftTime !== null && Date.now() - this.lastDriftTime > 3000) {
            this.score.resetScore();
        } else {
            this.score.driftScore = 0;
        }

        let carColor = driftColor(this.score.driftScore, this.score.frameScore, this.score.totalScore);
        this.car.color = new HSLColor(carColor.h, carColor.s + 20, 80);

    }

    incrementIdleTime() {
        this.idleTime++;
    }
}