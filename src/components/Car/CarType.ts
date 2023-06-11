import {Dimensions} from "../../utils/Utils";
import {HSLColor} from "../../utils/HSLColor";

interface TurnRate {
    drifting: number;
    gripping: number;
}

interface Grip {
    drifting: number;
    gripping: number;
}
export interface CarType {
    turnRate: TurnRate;
    grip: Grip;
    driftThreshold: number;
    mass: number;
    dimensions: Dimensions
    engineForce: number;
    baseColor: HSLColor;

}
