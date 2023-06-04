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
    }

    updateScores(scores: { playerName: string, score: Score }[]) {
        // Create a set of player names for easy lookup
        const playerNames = new Set(scores.map(s => s.playerName));

        // Update or add scores for each player
        scores.forEach(s => {
            if (s.playerName) this.updateScore(s.playerName, s.score);
        });

        // Remove players from the scores array if they are not in the playerNames set
        this.scores = this.scores.filter(s => playerNames.has(s.name));

        // Sort the scores array
        this.scores.sort((a, b) => b.score.highScore - a.score.highScore);
    }

    updateScore(playerName, score) {
        let playerScore = this.scores.find(s => s.name === playerName);
        if (playerScore) {
            playerScore.score = score;
            playerScore.name = playerName;
        } else {
            this.addScore(playerName, score);
        }
        this.scores.sort((a, b) => b.score.highScore - a.score.highScore);
    }

    displayScores(ctx: CanvasRenderingContext2D) {
        // console.log("Displaying scores", this.scores)
        // ctx.save();
        // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // Clear the canvas
        ctx.fillStyle = 'white'; // Set the text color
        ctx.font = '20px Arial'; // Set the font
        ctx.fillText("High Scores:", 10, 180); // Draw the title

        for (let i = 0; i < this.scores.length; i++) {
            let y = 210 + i * 30; // Calculate the y position for each score
            let text = `${i + 1}. ${this.scores[i].name.slice(0, 8)} - Current: ${~~this.scores[i].score.driftScore}, Best: ${~~this.scores[i].score.highScore}`;
            ctx.fillText(text, 10, y); // Draw the score
        }
        // ctx.restore();
    }
}

export default HighScoreTable;