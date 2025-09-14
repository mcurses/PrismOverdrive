import React from 'react';

interface HighscorePanelProps {
  scores: Array<{ name: string; best: number; current: number; multiplier: number }>;
}

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

export default function HighscorePanel(props: HighscorePanelProps) {
  return (
    <div style={{
      position: 'absolute',
      top: '16px',
      right: '16px',
      pointerEvents: 'auto',
      background: 'rgba(0, 0, 0, 0.3)',
      color: '#e0e0e0',
      padding: '8px 12px',
      borderRadius: '6px',
      font: '12px monospace'
    }}>
      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>High Scores</div>
      <table style={{ borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            <th style={{ padding: '2px 8px 2px 0', textAlign: 'left' }}>Rank</th>
            <th style={{ padding: '2px 8px 2px 0', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '2px 8px 2px 0', textAlign: 'left' }}>Best</th>
            <th style={{ padding: '2px 8px 2px 0', textAlign: 'left' }}>Current</th>
            <th style={{ padding: '2px 0', textAlign: 'left' }}>Multi</th>
          </tr>
        </thead>
        <tbody>
          {props.scores.map((score, index) => (
            <tr key={`${score.name}-${index}`}>
              <td style={{ padding: '2px 8px 2px 0' }}>{index + 1}.</td>
              <td style={{ padding: '2px 8px 2px 0' }}>{score.name}</td>
              <td style={{ padding: '2px 8px 2px 0' }}>{formatScore(score.best)}</td>
              <td style={{ padding: '2px 8px 2px 0' }}>{formatScore(score.current)}</td>
              <td style={{ padding: '2px 0' }}>{score.multiplier.toFixed(1)}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
