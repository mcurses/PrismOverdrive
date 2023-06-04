// Update the score
import Vector from "../../utils/Vector";

class Score {

    highscore: number;
    driftScore: number;
    driftBoard: number[];
    frameScore: number;
    driftCount: number;

    constructor(frameScore = 0, totalScore = 0, driftScore = 0) {
        this.frameScore = 0;
        this.highscore = 0;
        this.driftScore = 0;

    }

    update(velocity: Vector, angle: number) {
        let angleDifference = Vector.angleVectorDifference(angle, velocity);

        // Calculate the score based on the angle difference and the velocity
        this.frameScore = (1 - Math.sin(angleDifference)) * velocity.mag();
        this.driftScore += this.frameScore;
    }

    endDrift() {
        if (this.driftScore > this.highscore)
            this.highscore += this.driftScore;
        this.driftScore = 0;
    }

    resetScore() {
        this.endDrift()
        this.highscore = 0;
    }
}

export default Score;