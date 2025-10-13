import React from 'react';

interface TrainingOverlayProps {
    connected: boolean;
    episode: number;
    step: number;
    reward: number;
    avgReward: number;
    bestLapMs: number | null;
    lastLapMs: number | null;
    collisions: number;
    rewardBreakdown?: {
        speed: number;
        frame: number;
        forward: number;
        antiCircle: number;
        wallScrape: number;
        collision: number;
        living: number;
        clamp: number;
        total: number;
    };
}

function formatLapTime(ms: number | null): string {
    if (ms === null) return "—";
    
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor(ms % 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function formatRewardValue(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return sign + value.toFixed(3);
}

export default function TrainingOverlay(props: TrainingOverlayProps) {
    return (
        <div style={{
            position: 'fixed',
            top: '10px',
            left: '10px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#00ff00',
            padding: '12px 16px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.6',
            pointerEvents: 'none',
            minWidth: '220px',
            border: '1px solid rgba(0, 255, 0, 0.3)'
        }}>
            <div style={{ 
                marginBottom: '8px', 
                paddingBottom: '8px', 
                borderBottom: '1px solid rgba(0, 255, 0, 0.2)',
                fontWeight: 'bold',
                color: props.connected ? '#00ff00' : '#ff4444'
            }}>
                AI TRAINING {props.connected ? '● CONNECTED' : '○ DISCONNECTED'}
            </div>
            
            <div>Episode: <span style={{ color: '#ffffff' }}>{props.episode}</span></div>
            <div>Step: <span style={{ color: '#ffffff' }}>{props.step}</span></div>
            <div>Reward: <span style={{ color: '#ffffff' }}>{props.reward.toFixed(3)}</span></div>
            <div>Avg Reward: <span style={{ color: '#ffffff' }}>{props.avgReward.toFixed(3)}</span></div>
            <div>Best Lap: <span style={{ color: '#ffff00' }}>{formatLapTime(props.bestLapMs)}</span></div>
            <div>Last Lap: <span style={{ color: '#ffffff' }}>{formatLapTime(props.lastLapMs)}</span></div>
            <div>Collisions: <span style={{ color: props.collisions > 0 ? '#ff4444' : '#ffffff' }}>{props.collisions}</span></div>

            {props.rewardBreakdown && (
                <div style={{
                    marginTop: '12px',
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(0, 255, 0, 0.2)',
                    fontSize: '11px'
                }}>
                    <div style={{ marginBottom: '4px', color: '#00ff00', fontWeight: 'bold' }}>
                        REWARD BREAKDOWN
                    </div>
                    <div>Speed: <span style={{ color: props.rewardBreakdown.speed >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.speed)}</span></div>
                    <div>Frame: <span style={{ color: props.rewardBreakdown.frame >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.frame)}</span></div>
                    <div>Progress: <span style={{ color: props.rewardBreakdown.forward >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.forward)}</span></div>
                    <div>Efficiency: <span style={{ color: props.rewardBreakdown.antiCircle >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.antiCircle)}</span></div>
                    <div>WallScrape: <span style={{ color: props.rewardBreakdown.wallScrape >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.wallScrape)}</span></div>
                    <div>Collision: <span style={{ color: props.rewardBreakdown.collision >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.collision)}</span></div>
                    <div>Living: <span style={{ color: props.rewardBreakdown.living >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.living)}</span></div>
                    <div>Clamp: <span style={{ color: props.rewardBreakdown.clamp >= 0 ? '#00ff00' : '#ff4444' }}>{formatRewardValue(props.rewardBreakdown.clamp)}</span></div>
                    <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
                        Total: <span style={{ color: props.rewardBreakdown.total >= 0 ? '#00ff00' : '#ff4444', fontWeight: 'bold' }}>{formatRewardValue(props.rewardBreakdown.total)}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
