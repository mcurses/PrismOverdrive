import {CarType} from "./CarType";
import {HSLColor} from "../../utils/HSLColor";

export default class CarData {

    static getByName(name: string): CarType {
        for (let type of CarData.types) {
            if (type.name === name) {
                return type;
            }
        }
        throw new Error("Car type not found: " + name);
    }

    static types: CarType[] = [
        {
            name: 'default',
            turnRate: {
                drifting: 0.012,
                gripping: 0.008
            },
            grip: {
                drifting: 0.2,
                gripping: 1.4
            },
            driftThreshold: 8.,
            mass: 29,
            dimensions: {width: 18, length: 30},
            engineForce: 0.19,
            baseColor: new HSLColor(100, 20, 50)
        },
        {
            name: 'speedy',
            turnRate: {
                drifting: 0.012,
                gripping: 0.008
            },
            grip: {
                drifting: 0.2,
                gripping: 1.4
            },
            driftThreshold: 10,
            mass: 29,
            dimensions: {width: 18, length: 30},
            engineForce: 0.25,
            baseColor: new HSLColor(180, 100, 50)
        },
        {
            name: 'hoonivan',
            turnRate: {
                drifting: 0.012,
                gripping: 0.008
            },
            grip: {
                drifting: 0.2,
                gripping: 1.4
            },
            driftThreshold: 10,
            mass: 29,
            dimensions: {width: 23, length: 30},
            engineForce: 0.35,
            baseColor: new HSLColor(10, 100, 30)
        }
    ];
}