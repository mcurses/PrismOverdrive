// Update the score
import Vector from "../../utils/Vector";

class Score {

    highScore: number = 0;
    driftScore: number = 0;
    driftBoard: number[];
    frameScore: number = 0;
    driftCount: number;
    frameScoreHistory: number[] = [];
    curveScore: number = 0;

    constructor(frameScore = 0, totalScore = 0, driftScore = 0) {
        this.frameScore = frameScore;
        this.highScore = totalScore;
        this.driftScore = driftScore;
    }

    update(velocity: Vector, angle: number) {
        let angleDifference = Vector.angleVectorDifference(angle, velocity);

        // Calculate the score based on the angle difference and the velocity
        this.frameScore = (1 - Math.sin(angleDifference)) * velocity.mag();
        // console.log('frameScore', this.frameScore)
        this.driftScore += this.frameScore;
        this.curveScore += this.frameScore;
        this.pushFrameScore(this.frameScoreHistory, this.frameScore);
    }

    pushFrameScore(frameScoreHistory, frameScore: number) {
        frameScoreHistory.push(frameScore);
        if (frameScoreHistory.length > 10) {
            frameScoreHistory.shift();
        }
    }

    getFrameScoreAverage(range: number) {
        if (this.frameScoreHistory.length === 0) {
            return 0;
        }
        
        const actualRange = Math.min(range, this.frameScoreHistory.length);
        let sum = 0;
        for (let i = this.frameScoreHistory.length - actualRange; i < this.frameScoreHistory.length; i++) {
            sum += this.frameScoreHistory[i];
        }
        return sum / actualRange;
    }


    endDrift() {
        if (this.driftScore > this.highScore)
            this.highScore = this.driftScore;
        this.driftScore = 0;
    }

    resetScore() {
        this.endDrift()
        this.highScore = 0;
    }
}

export default Score;
