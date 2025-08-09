import { CarType } from "./CarType";
import { HSLColor } from "../../utils/HSLColor";

export default class CarData {
  static types: CarType[] = [];
  static loaded: boolean = false;

  static async loadFromJSON(url: string = 'assets/cars.json'): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load cars: ${res.status} ${res.statusText}`);
    const json = await res.json();
    const raw = Array.isArray(json?.types) ? json.types : [];
    CarData.types = raw.map((t: any) => ({
      name: t.name,
      turnRate: t.turnRate,
      grip: t.grip,
      driftThreshold: t.driftThreshold,
      mass: t.mass,
      dimensions: t.dimensions,
      engineForce: t.engineForce,
      baseColor: new HSLColor(t.baseColor.h, t.baseColor.s, t.baseColor.b, t.baseColor.a ?? 1),
    }));
    CarData.loaded = true;
  }

  static getByName(name: string): CarType {
    const type = CarData.types.find(t => t.name === name);
    if (!type) throw new Error("Car type not found: " + name);
    return type;
  }
}
