import React from 'react';

interface BoostBarProps {
  charge: number;
  max: number;
  active: boolean;
}

export default function BoostBar(props: BoostBarProps) {
  const fillWidth = (props.charge / props.max) * 100;
  
  return (
    <div style={{
      position: 'absolute',
      left: '320px',
      bottom: '50px',
      pointerEvents: 'none'
    }}>
      <div style={{
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: '12px',
        fontFamily: 'Arial',
        marginBottom: '4px'
      }}>
        BOOST
      </div>
      <div style={{
        width: '160px',
        height: '12px',
        border: '1px solid rgba(255, 255, 255, 0.6)',
        position: 'relative',
        background: 'transparent'
      }}>
        {fillWidth > 0 && (
          <div style={{
            width: `${fillWidth}%`,
            height: '100%',
            background: props.active ? 'rgba(0, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.6)',
            transition: 'background-color 0.1s ease'
          }} />
        )}
      </div>
    </div>
  );
}
