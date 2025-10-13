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
    multiplier: number = 1;
    readonly MULTIPLIER_MIN = 1;
    readonly MULTIPLIER_MAX = 50;
    readonly MULTIPLIER_DECAY_RATE = 0.98; // multiplier *= this each frame when not drifting
    readonly MULTIPLIER_GAIN_RATE = 0.0002; // how much frameScore contributes to multiplier growth

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
        this.pushFrameScore(this.frameScoreHistory, this.frameScore);
        
        // Update multiplier: increase when drifting (frameScore > 0), decay when not
        if (this.frameScore > 0) {
            // Increase multiplier based on current frameScore
            this.multiplier += this.frameScore * this.MULTIPLIER_GAIN_RATE;
            this.multiplier = Math.min(this.multiplier, this.MULTIPLIER_MAX);
        } else {
            // Decay multiplier slowly when not drifting
            this.multiplier *= this.MULTIPLIER_DECAY_RATE;
            this.multiplier = Math.max(this.multiplier, this.MULTIPLIER_MIN);
        }
        
        this.driftScore += this.frameScore * this.multiplier;
        this.curveScore += this.frameScore;
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
        this.multiplier = 1;
    }

    resetScore() {
        this.endDrift()
        this.highScore = 0;
        this.resetComboAndMultiplier();
    }

    resetComboAndMultiplier(): void {
        this.multiplier = 1;
        this.driftScore = 0;
        this.frameScore = 0;
        this.curveScore = 0;
    }
}

export default Score;
