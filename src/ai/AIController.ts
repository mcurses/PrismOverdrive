export class AIController {
    private action: number[] = [0, 0, 0, 0, 0]; // [steer, throttle, brake, handbrake, boost]
    private readonly STEER_DEADZONE = 0.05;
    private readonly THROTTLE_DEADZONE = 0.05;
    private readonly BRAKE_DEADZONE = 0.05;

    setAction(action: number[]): void {
        if (action.length !== 5) {
            console.warn('AIController: expected 5 action values, got', action.length);
            return;
        }
        this.action = [...action];
    }

    getActions(): { ACCELERATE: boolean; BRAKE: boolean; LEFT: boolean; RIGHT: boolean; HANDBRAKE: boolean; BOOST: boolean } {
        const steer = this.action[0]; // [-1, 1]
        const throttle = this.action[1]; // [0, 1]
        const brake = this.action[2]; // [0, 1]
        const handbrake = this.action[3]; // {0, 1}
        const boost = this.action[4]; // {0, 1}

        return {
            ACCELERATE: throttle > this.THROTTLE_DEADZONE,
            BRAKE: brake > this.BRAKE_DEADZONE,
            LEFT: steer < -this.STEER_DEADZONE,
            RIGHT: steer > this.STEER_DEADZONE,
            HANDBRAKE: handbrake > 0.5,
            BOOST: boost > 0.5
        };
    }

    reset(): void {
        this.action = [0, 0, 0, 0, 0];
    }
}
