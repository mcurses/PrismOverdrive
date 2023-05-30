// Update the score
import Vector from "../../utils/Vector";

class Score {

    totalScore: number;
    driftScore: number;
    frameScore: number;

    constructor() {
        this.frameScore = 0;
        this.totalScore = 0;
        this.driftScore = 0;
    }

    update(velocity: Vector, angle: number  ){
        let angleDifference = Vector.angleVectorDifference(angle, velocity);

        // Calculate the score based on the angle difference and the velocity
        this.frameScore = (1 - Math.sin(angleDifference)) * velocity.mag();
        this.driftScore += this.frameScore;

    }

    endDrift() {
        this.totalScore += this.driftScore;
        this.driftScore = 0;
    }
    resetScore() {
        this.totalScore = 0;
    }
}
export default Score;