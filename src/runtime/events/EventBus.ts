export type EventPayloads = Record<string, any>;

export type EventListener<Payload> = Payload extends void
  ? () => void
  : (payload: Payload) => void;

export class EventBus<Events extends EventPayloads> {
  private listeners: Map<keyof Events, Set<EventListener<any>>> = new Map();

  on<EventName extends keyof Events>(event: EventName, listener: EventListener<Events[EventName]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as EventListener<any>);
    return () => this.off(event, listener);
  }

  once<EventName extends keyof Events>(event: EventName, listener: EventListener<Events[EventName]>): () => void {
    const wrapped: EventListener<Events[EventName]> = ((payload: Events[EventName]) => {
      this.off(event, wrapped);
      if (payload === undefined) {
        (listener as () => void)();
      } else {
        (listener as (payload: Events[EventName]) => void)(payload);
      }
    }) as EventListener<Events[EventName]>;

    this.on(event, wrapped);
    return () => this.off(event, wrapped);
  }

  off<EventName extends keyof Events>(event: EventName, listener: EventListener<Events[EventName]>): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    set.delete(listener as EventListener<any>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<EventName extends keyof Events>(event: EventName, payload: Events[EventName]): void;
  emit<EventName extends keyof Events>(event: EventName): void;
  emit<EventName extends keyof Events>(event: EventName, payload?: Events[EventName]): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const listener of Array.from(set)) {
      if (payload === undefined) {
        (listener as () => void)();
      } else {
        (listener as (payload: Events[EventName]) => void)(payload);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}

export default EventBus;
