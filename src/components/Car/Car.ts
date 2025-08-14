import {Coordinates, Dimensions} from "../../utils/Utils"
import Vector from "../../utils/Vector";
import {HSLColor} from "../../utils/HSLColor";
import {vectBodyToWorld, vectWorldToBody} from "./CarUtils";
import Trail from "../Trail/Trail";
import Weight from "./Weight";
import {CarType} from "./CarType";
import CarData from "./CarData";


class Car {
    // dynamic state
    turnRate: number;
    boostFactor: number = 1.0;

    isDrifting: boolean;
    isColliding: boolean;
    id: string;
    trail: Trail;
    weight: Weight;
    trailCounter: number;

    position: Vector;
    acceleration: Vector;
    velocity: Vector;
    targetPosition: Vector | null;

    angle: number;
    targetAngle: number | null;
    color: HSLColor;

    handbrake: boolean;
    private angularVelocity: number;
    carType: CarType;

    // Corner caching
    cachedCorners: Vector[];
    lastCornerPosX: number;
    lastCornerPosY: number;
    lastCornerAngle: number;
    cacheDirty: boolean;


    constructor(posX = window.innerWidth / 2, posY = window.innerHeight / 2, angle = 0, carType?) {
        let turnFactor = .2;
        
        // Handle missing carType argument safely
        if (carType) {
            this.carType = carType;
        } else if (CarData.types && CarData.types[0]) {
            this.carType = CarData.types[0];
        } else {
            // Minimal inline default to prevent crashes before JSON loads
            const fallback: CarType = {
                name: "default",
                turnRate: { drifting: 0.012, gripping: 0.008 },
                grip: { gripping: 1.4, drifting: 0.2 },
                driftThreshold: 8,
                mass: 29,
                dimensions: { width: 18, length: 30 },
                engineForce: 0.19,
                baseColor: new HSLColor(100, 20, 50, 1)
            };
            this.carType = fallback;
        }

        this.turnRate = this.carType.turnRate.gripping;
        this.position = new Vector(posX, posY);
        this.targetPosition = null;
        this.targetAngle = null;
        this.velocity = new Vector(0, 0);
        this.acceleration = new Vector(0, 0);
        this.angle = angle;
        this.isDrifting = false;
        this.handbrake = false;
        this.color = this.carType.baseColor;
        this.trail = new Trail();

        // Initialize corner caching
        this.cachedCorners = [];
        this.lastCornerPosX = 0;
        this.lastCornerPosY = 0;
        this.lastCornerAngle = 0;
        this.cacheDirty = true;

        // this.weight = new Weight(this.mass, 0.6, this.position);
        // this.weight.position = this.position;
    }

    /*******************************************************************************
     *  Safely read car variables
     ******************************************************************************/
    getPos(): Coordinates {
        return {x: this.position.x, y: this.position.y}
    }

    getAngle(): number {
        return this.angle;
    }

    setDrift(drifting: boolean) {
        this.isDrifting = drifting;
    }


    update(keys, deltaTime) {
        if (!this.carType) {
            return;
        }

        this.acceleration.x = 0;
        this.acceleration.y = 0;

        let timeFactor = 0.2;
        if (deltaTime > 100) {
            deltaTime = 100;
        }
        let changes = this.handleInput(keys, deltaTime, timeFactor);
        this.acceleration = this.acceleration.add(changes.acceleration);
        this.angle += changes.angle;
        let vB = vectWorldToBody(this.velocity, this.angle);

        let bodyFixedDrag;
        let grip;
        if (Math.abs(vB.x) < this.carType.driftThreshold && !this.handbrake) {
            // Gripping
            grip = this.carType.grip.gripping
            this.turnRate = this.carType.turnRate.gripping
            this.isDrifting = false;

        } else {
            // Drifting
            grip = this.carType.grip.drifting
            this.turnRate = this.carType.turnRate.drifting;
            this.isDrifting = true;
        }

        const Cd_side = grip;   // your 'grip' value for lateral
        const Cd_long = this.isDrifting ? 0.06 : 0.10; // tune to taste
        const Q_side = 0.001; // tweak tiny
        const Q_long = 0.0005;

        bodyFixedDrag = new Vector(
            -vB.x * Cd_side - Math.sign(vB.x) * Q_side * vB.x * vB.x,
            -vB.y * Cd_long - Math.sign(vB.y) * Q_long * vB.y * vB.y
        );
        // Rotate body fixed forces into world fixed and add to acceleration
        let worldFixedDrag = vectBodyToWorld(bodyFixedDrag, this.angle);
        this.acceleration = this.acceleration.add(worldFixedDrag.div(this.carType.mass));

        // Physics Engine
        this.angle = this.angle % (2 * Math.PI); // Restrict angle to one revolution
        this.velocity = this.velocity.add(this.acceleration);
        if (this.handbrake) {
            this.velocity = this.isDrifting ? this.velocity.mult(0.99) : this.velocity.mult(0.95);
        }
        
        if (this.weight) {
            let springVector = this.weight.update(deltaTime, this.position.sub(this.weight.position), this.position);
            this.velocity = this.velocity.add(springVector.mult(2));
        }
        this.targetPosition = this.position.copy().add(this.velocity.mult(deltaTime * timeFactor));
        this.cacheDirty = true;
        
        // Reset boost factor at end of update
        this.boostFactor = 1.0;
    }

    private handleInput(keys, deltaTime, timeFactor: number) {
        let changes = {acceleration: new Vector(0, 0), angle: 0};

        // ACCELERATING (BODY-FIXED to WORLD)
        if (keys['ArrowUp']) {
            let bodyAcc = new Vector(0, this.carType.engineForce * this.boostFactor);
            let worldAcc = vectBodyToWorld(bodyAcc, this.angle);
            changes.acceleration = changes.acceleration.add(worldAcc);
        }
        // BRAKING (BODY-FIXED TO WORLD)
        if (keys['ArrowDown']) {
            let bodyAcc = new Vector(0, -this.carType.engineForce * this.boostFactor);
            let worldAcc = vectBodyToWorld(bodyAcc, this.angle);
            changes.acceleration = changes.acceleration.add(worldAcc);
        }
        if (keys['ArrowLeft']) {
            changes.angle -= this.turnRate * deltaTime * timeFactor;
        }
        if (keys['ArrowRight']) {
            changes.angle += this.turnRate * deltaTime * timeFactor;
        }
        
        this.handbrake = keys['Space'];
        return changes;
    }

    private velAngleDiff(vB, keys, deltaTime, timeFactor: number) {
        if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
            let velocityAngle = -vB.x
            this.angle += this.turnRate * velocityAngle * deltaTime * timeFactor * .0003 * this.velocity.mag()
        }
    }

    interpolatePosition() {
        // This method is now only used for local cars
        // Remote cars get their position/angle set directly from interpolation in Game.ts
        if (this.targetPosition) {
            // console.log("interpolating position")
            let distance = Vector.dist(this.position, this.targetPosition);
            // if difference is too large, just teleport
            if (distance > 500) {
                this.position = new Vector(this.targetPosition.x, this.targetPosition.y);
                this.targetPosition = null;
            } else {
                let targetPos = new Vector(this.targetPosition.x, this.targetPosition.y);
                this.position = Vector.lerp(this.position, targetPos, 0.1);
            }
            if (distance < 1) {
                this.targetPosition = null;
            }
        }
        if (this.targetAngle) {
            let difference = this.targetAngle - this.angle;
            while (difference < -Math.PI) difference += Math.PI * 2;
            while (difference > Math.PI) difference -= Math.PI * 2;

            if (Math.abs(difference) > Math.PI / 2) {
                this.angle = this.targetAngle;
                this.targetAngle = null;
            } else {
                let turnDirection = difference > 0 ? 1 : -1;
                this.angle += this.turnRate * turnDirection;
                if (Math.abs(this.targetAngle - this.angle) < this.turnRate) {
                    this.angle = this.targetAngle;
                    this.targetAngle = null;
                }
            }
        }
    }


    render(ctx) {


        let id = this.id;


        // Set color
        // if (!curCar.isDrifting) {
        //     curCar.color = new HSLColor(0, 0, 100);
        // }

        if (this.isColliding) {
            this.color = new HSLColor(255, 255, 255);
        } else {
            this.color = this.carType.baseColor;
        }

        // Save the current context
        ctx.save();

        // Translate and rotate the context
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        // Set stroke and fill styles
        ctx.lineWidth = this.isDrifting ? 3 : 2;
        ctx.strokeStyle = '#000';  // Assuming the stroke color to be black

        ctx.fillStyle = this.color.toCSS();
        // Draw the car body and front side indicator
        ctx.fillRect(-this.carType.dimensions.width / 2, -this.carType.dimensions.length / 2, this.carType.dimensions.width, this.carType.dimensions.length);
        ctx.strokeRect(-this.carType.dimensions.width / 2, -this.carType.dimensions.length / 2, this.carType.dimensions.width, this.carType.dimensions.length);

        ctx.fillStyle = new HSLColor(100, 30, 60).toCSS();
        ctx.fillRect(-this.carType.dimensions.width / 2 + 1, 0, this.carType.dimensions.width - 2, 6);
        ctx.strokeRect(-this.carType.dimensions.width / 2 + 1, 0, this.carType.dimensions.width - 2, 6);


        // Restore the context to its original state
        ctx.restore();
        if (this.weight) {
            // console.log("rendering weight", this.weight.position.x, this.weight.position.y)
            ctx.fillStyle = '#777'; // Set the fill color to black
            ctx.fillRect(this.weight.position.x, this.weight.position.y, 10, 10); // Draw the weight as a 10x10 square
        }

    }

    getCorners() {
        // Check if cache is valid
        if (!this.cacheDirty && 
            this.position.x === this.lastCornerPosX && 
            this.position.y === this.lastCornerPosY && 
            this.angle === this.lastCornerAngle) {
            return this.cachedCorners;
        }

        let width = this.carType.dimensions.width;
        let height = this.carType.dimensions.length;
        let corners = [];

        // Calculate the corners relative to the car's center point
        // Corner order: 0=front-left, 1=front-right, 2=rear-left, 3=rear-right
        let frontLeft = new Vector(this.position.x - width / 2, this.position.y - height / 2);
        let frontRight = new Vector(this.position.x + width / 2, this.position.y - height / 2);
        let backLeft = new Vector(this.position.x - width / 2, this.position.y + height / 2);
        let backRight = new Vector(this.position.x + width / 2, this.position.y + height / 2);

        corners.push(frontLeft);   // 0: front-left
        corners.push(frontRight);  // 1: front-right
        corners.push(backLeft);    // 2: rear-left
        corners.push(backRight);   // 3: rear-right

        let rotatedCorners = [];
        for (let i = 0; i < corners.length; i++) {
            let corner = corners[i];
            let rotatedCorner = Vector.rotatePoint(corner, this.position, this.angle);
            rotatedCorners.push(rotatedCorner);
        }

        // Update cache
        this.cachedCorners = rotatedCorners;
        this.lastCornerPosX = this.position.x;
        this.lastCornerPosY = this.position.y;
        this.lastCornerAngle = this.angle;
        this.cacheDirty = false;

        return rotatedCorners;
    }

}

export default Car;
