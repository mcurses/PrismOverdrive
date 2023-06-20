import Score from "./Score";

class HighScoreTable {
    scores: { name: string, score: Score }[];
    private tableElement: HTMLTableElement;
    private oldScores: { name: string; score: Score }[] = [];

    constructor() {
        this.scores = [];
        // this.tableElement = this.createTable();
        // document.body.appendChild(this.tableElement);
    }

    private createTable() {
        let tableElement
        tableElement = document.createElement('table');
        tableElement.id = 'highscore-table';
        tableElement.style.position = 'absolute';
        tableElement.style.top = '0';
        tableElement.style.right = '0';
        tableElement.style.width = '200px';
        tableElement.style.height = '30%';
        tableElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        tableElement.style.color = 'white';
        tableElement.style.borderCollapse = 'collapse';
        tableElement.style.border = 'none';
        tableElement.style.borderRadius = '5px';
        tableElement.style.padding = '15px';
        tableElement.style.fontSize = '20px';

        let header = document.createElement('tr');
        let rankHeader = document.createElement('th');
        let nameHeader = document.createElement('th');
        let currentScoreHeader = document.createElement('th');
        let bestScoreHeader = document.createElement('th');

        rankHeader.textContent = 'Rank';
        nameHeader.textContent = 'Name';
        currentScoreHeader.textContent = 'Current Score';
        bestScoreHeader.textContent = 'Best Score';

        header.appendChild(rankHeader);
        header.appendChild(nameHeader);
        header.appendChild(currentScoreHeader);
        header.appendChild(bestScoreHeader);

        tableElement.appendChild(header);

        return tableElement;
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
        ctx.fillText("High Scores:", 10, 240); // Draw the title

        for (let i = 0; i < this.scores.length; i++) {
            let y = 270 + i * 30; // Calculate the y position for each score
            let text = `${i + 1}. ${this.scores[i].name.slice(0, 8)} - Current: ${~~this.scores[i].score.driftScore}, Best: ${~~this.scores[i].score.highScore}`;
            ctx.fillText(text, 10, y); // Draw the score
        }
        // ctx.restore();
    }

    displayScoresTable() {

        let updatedScores = this.scores.filter(s => {
            let oldScore = this.oldScores.find(os => os.name === s.name);
            if (!oldScore) return true;
            return s.score.highScore !== oldScore.score.highScore || s.score.driftScore !== oldScore.score.driftScore;
        });
        this.oldScores = this.scores;
        // Clear outdated scores
        for (let i = 0; i < updatedScores.length; i++) {
            if (updatedScores[i]) {
                if (this.tableElement.childNodes[i + 1])
                    this.tableElement.removeChild(this.tableElement.childNodes[i + 1]);

                let row = document.createElement('tr');
                let rank = document.createElement('td');
                let name = document.createElement('td');
                let currentScore = document.createElement('td');
                let bestScore = document.createElement('td');

                rank.textContent = i + 1 + "";
                name.textContent = updatedScores[i].name.slice(0, 8);
                currentScore.textContent = "" + ~~updatedScores[i].score.driftScore;
                bestScore.textContent = "" + ~~updatedScores[i].score.highScore;

                row.appendChild(rank);
                row.appendChild(name);
                row.appendChild(currentScore);
                row.appendChild(bestScore);

                this.tableElement.appendChild(row);
            }
        }
    }

}

export default HighScoreTable;