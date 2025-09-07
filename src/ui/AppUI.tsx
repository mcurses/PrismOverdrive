import { MountDeps } from './mount';

export default function AppUI(props: MountDeps) {
  const handleNameChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = target.value.slice(0, 8);
    props.actions.setPlayerName(value);
  };

  const handleCarChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    props.actions.setCarType(target.value);
  };

  const handleTrackChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    props.actions.loadTrack(target.value);
  };

  return (
    <div style={{
      position: 'absolute',
      right: '16px',
      bottom: '16px',
      pointerEvents: 'auto',
      background: 'rgba(0, 0, 0, 0.3)',
      color: '#e0e0e0',
      padding: '8px 12px',
      borderRadius: '6px',
      font: '12px monospace',
      display: 'flex',
      gap: '8px'
    }}>
      <input
        type="text"
        value={props.session.playerName}
        placeholder="Player name"
        maxLength={8}
        onInput={handleNameChange}
        style={{
          background: 'rgba(20, 20, 20, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          color: '#e0e0e0',
          padding: '4px 8px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}
      />
      
      <select
        value={props.session.carType}
        onChange={handleCarChange}
        style={{
          background: 'rgba(20, 20, 20, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          color: '#e0e0e0',
          padding: '4px 8px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}
      >
        {props.carTypes.map(carType => (
          <option key={carType} value={carType}>
            {carType}
          </option>
        ))}
      </select>
      
      <select
        value={props.session.trackName}
        onChange={handleTrackChange}
        style={{
          background: 'rgba(20, 20, 20, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          color: '#e0e0e0',
          padding: '4px 8px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}
      >
        {props.tracks.map(track => (
          <option key={track.value} value={track.value}>
            {track.label}
          </option>
        ))}
      </select>
      
      <button
        onClick={props.actions.toggleEditor}
        style={{
          background: 'rgba(0, 120, 255, 0.8)',
          border: '1px solid rgba(0, 120, 255, 1)',
          borderRadius: '4px',
          color: 'white',
          padding: '4px 8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          cursor: 'pointer'
        }}
      >
        Editor
      </button>
    </div>
  );
}
