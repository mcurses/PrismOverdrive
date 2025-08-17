import Score from "./Score";

function formatScore(score: number): string {
    if (score < 1000) {
        return Math.floor(score).toString();
    } else if (score < 1000000) {
        const k = score / 1000;
        if (k >= 100) {
            return Math.floor(k) + 'k';
        } else {
            return (Math.floor(k * 10) / 10) + 'k';
        }
    } else {
        const m = score / 1000000;
        if (m >= 100) {
            return Math.floor(m) + 'M';
        } else {
            return (Math.floor(m * 10) / 10) + 'M';
        }
    }
}

class HighScoreTable {
    scores: { name: string, score: Score }[];
    private tableElement: HTMLTableElement;
    private oldScores: { name: string; score: Score }[] = [];
    position: { x: number, y: number };

    constructor(props?: { position?: { x: number, y: number } }) {
        this.scores = [];
        this.position = props?.position || { x: 0, y: 0 };
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
        ctx.fillStyle = 'white'; // Set the text color
        ctx.font = '16px Arial'; // Set the font
        
        // Draw title
        ctx.fillText("High Scores", this.position.x + 10, this.position.y + 25);
        
        // Draw table header
        const headerY = this.position.y + 50;
        ctx.fillText("Rank", this.position.x + 10, headerY);
        ctx.fillText("Name", this.position.x + 60, headerY);
        ctx.fillText("Best", this.position.x + 140, headerY);
        ctx.fillText("Current", this.position.x + 200, headerY);
        ctx.fillText("Multi", this.position.x + 280, headerY);

        // Draw table rows
        for (let i = 0; i < this.scores.length; i++) {
            let y = headerY + 25 + i * 25; // Calculate the y position for each score row
            
            // Rank
            ctx.fillText(`${i + 1}.`, this.position.x + 10, y);
            
            // Name
            ctx.fillText(this.scores[i].name.slice(0, 8), this.position.x + 60, y);
            
            // Best score
            ctx.fillText(formatScore(this.scores[i].score.highScore), this.position.x + 140, y);
            
            // Current score
            ctx.fillText(formatScore(this.scores[i].score.driftScore), this.position.x + 200, y);
            
            // Multiplier
            const multiplier = this.scores[i].score.multiplier || 1;
            ctx.fillText(`${multiplier.toFixed(1)}x`, this.position.x + 280, y);
        }
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
                currentScore.textContent = formatScore(updatedScores[i].score.driftScore);
                bestScore.textContent = formatScore(updatedScores[i].score.highScore);

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
