import React from 'react';

interface LapHUDProps {
  best: number | null;
  last: number | null;
  current: number | null;
}

function formatLapTime(ms: number | null): string {
  if (ms === null) return "—";
  
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor(ms % 1000);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

export default function LapHUD(props: LapHUDProps) {
  return (
    <div style={{
      position: 'absolute',
      left: '10px',
      top: '100px',
      pointerEvents: 'none',
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: '14px',
      fontFamily: 'Arial',
      lineHeight: '20px'
    }}>
      <div>Best Lap: {formatLapTime(props.best)}</div>
      <div>Last Lap: {formatLapTime(props.last)}</div>
      <div>Current Lap: {formatLapTime(props.current)}</div>
    </div>
  );
}
