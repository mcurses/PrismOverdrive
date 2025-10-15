import Score from "../../components/Score/Score";
import Session from "../../components/Session/Session";
import { GameEventBus } from "../events/GameEvents";

export interface GameStateOptions {
  defaultPlayerName?: string;
}

export class GameState {
  private session: Session | null = null;
  private readonly bus: GameEventBus;
  private readonly options: GameStateOptions;

  constructor(bus: GameEventBus, options: GameStateOptions = {}) {
    this.bus = bus;
    this.options = options;
  }

  ensureSession(): Session {
    if (!this.session) {
      const stored = Session.loadFromLocalStorage();
      if (stored) {
        this.session = stored;
      } else {
        this.session = new Session(this.options.defaultPlayerName ?? "Player");
      }
      this.bus.emit("session:updated", { session: this.session });
      this.bus.emit("session:trackChanged", { trackName: this.session.trackName, session: this.session });
      this.bus.emit("session:carChanged", { carType: this.session.carType, session: this.session });
    }
    return this.session;
  }

  getSession(): Session {
    return this.ensureSession();
  }

  updatePlayerName(name: string): void {
    const session = this.ensureSession();
    const trimmed = name.slice(0, 8);
    session.playerName = trimmed;
    this.publishSession();
  }

  updateCarType(carType: string): void {
    const session = this.ensureSession();
    session.carType = carType;
    this.bus.emit("session:carChanged", { carType, session });
    this.publishSession();
  }

  updateTrack(trackName: string): void {
    const session = this.ensureSession();
    session.trackName = trackName;
    this.bus.emit("session:trackChanged", { trackName, session });
    this.publishSession();
  }

  setSession(session: Session): void {
    this.session = session;
    this.publishSession();
    this.bus.emit("session:trackChanged", { trackName: session.trackName, session });
    this.bus.emit("session:carChanged", { carType: session.carType, session });
  }

  setScore(trackName: string, score: Score): void {
    const session = this.ensureSession();
    session.scores[trackName] = score;
    this.publishSession();
  }

  persist(): void {
    const session = this.session;
    if (session) {
      session.saveToLocalStorage();
    }
  }

  private publishSession(): void {
    if (this.session) {
      this.bus.emit("session:updated", { session: this.session });
    }
  }
}

export default GameState;
