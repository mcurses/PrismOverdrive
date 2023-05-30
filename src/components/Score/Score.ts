// Update the score
import Vector from "../../utils/Vector";

export default class Score {

    totalScore: number;
    driftScore: number;
    frameScore: number;

    constructor() {
        this.frameScore = 0;
        this.totalScore = 0;
        this.driftScore = 0;
    }

    calculateScore(velocity: Vector, angle: number): number {
        let score = 0;
        let angleDifference = Vector.angleVectorDifference(angle, velocity);

        // Calculate the score based on the angle difference and the velocity
        score = (1 - Math.sin(angleDifference)) * velocity.mag();

        return score;
    }

    resetScore() {
        this.totalScore = 0;
    }
}
