import Score from "./Score";

class HighScoreTable {
    scores: { name: string, score: Score }[];

    constructor() {
        this.scores = [];
    }

    addScore(playerName, score) {
        this.scores.push({
            name: playerName,
            score: score,
        });

        // Sort the scores in descending order
        this.scores.sort((a, b) => b.score.highscore - a.score.highscore);
    }

    updateScore(playerName: string, score: Score) {
        let playerScore = this.scores.find(s => s.name === playerName);
        if (playerScore) {
            playerScore.score = score;
        } else {
            this.addScore(playerName, score);
        }
    }

    displayScores(ctx: CanvasRenderingContext2D) {
        // ctx.save();
        // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // Clear the canvas
        ctx.fillStyle = 'white'; // Set the text color
        ctx.font = '20px Arial'; // Set the font
        ctx.fillText("High Scores:", 10, 180); // Draw the title

        for (let i = 0; i < this.scores.length; i++) {
            let y = 210 + i * 30; // Calculate the y position for each score
            let text = `${i + 1}. ${this.scores[i].name.slice(0,4)} - Current: ${~~this.scores[i].score.driftScore}, Best: ${~~this.scores[i].score.highscore}`;
            ctx.fillText(text, 10, y); // Draw the score
        }
        // ctx.restore();
    }
}

export default HighScoreTable;