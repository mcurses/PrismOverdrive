import { clamp, lerp } from "../utils/Utils";

export class ZoomController {
    private baseline: number;
    private minRelative: number;
    private speedForMin: number;
    private smooth: number;
    public value: number;

    constructor(config: { 
        baseline: number; 
        minRelative: number; 
        speedForMin: number; 
        smooth: number; 
    }) {
        this.baseline = config.baseline;
        this.minRelative = config.minRelative;
        this.speedForMin = config.speedForMin;
        this.smooth = config.smooth;
        this.value = config.baseline;
    }

    setBaseline(v: number): void {
        this.baseline = v;
        this.value = v;
    }

    update(speed: number): number {
        const t = clamp(0, speed / this.speedForMin, 1);
        const target = this.baseline * lerp(1.0, this.minRelative, t);
        this.value = lerp(this.value, target, this.smooth);
        return this.value;
    }
}
