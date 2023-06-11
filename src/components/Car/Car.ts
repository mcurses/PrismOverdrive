import {Coordinates, Dimensions} from "../../utils/Utils"
import Vector from "../../utils/Vector";
import {HSLColor} from "../../utils/HSLColor";
import {vectBodyToWorld, vectWorldToBody} from "./CarUtils";
import Trail from "../Trail/Trail";
import Weight from "./Weight";
import {CarType} from "./CarType";
import CarTypePresets from "./CarTypePresets";


class Car {
    // dynamic state
    turnRate: number;

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


    constructor(posX = window.innerWidth / 2, posY = window.innerHeight / 2, angle = 0, carType = CarTypePresets.DefaultCarType) {
        let turnFactor = .2;
        this.carType = carType;

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
        this.acceleration.x = 0;
        this.acceleration.y = 0;

        let timeFactor = .2;
        if (deltaTime > 100) {
            deltaTime = 100;
        }
        let changes = this.handleInput(keys, deltaTime, timeFactor);
        // this.updatePhysics(deltaTime, timeFactor, changes);
        this.acceleration.add(changes.acceleration);
        this.angle += changes.angle;
        let vB = vectWorldToBody(this.velocity, this.angle);

        let bodyFixedDrag;
        let grip;
        if (Math.abs(vB.x) < this.carType.driftThreshold && !this.handbrake) {
            // Gripping
            grip = this.carType.grip.gripping
            this.turnRate = this.carType.turnRate.gripping
            this.isDrifting = false;
            // bodyFixedDrag = new Vector(vB.x * -this.model.gripStatic, vB.y * 0.05);

        } else {
            // Drifting
            grip = this.carType.grip.drifting
            this.turnRate = this.carType.turnRate.drifting;
            this.isDrifting = true;
        }
        bodyFixedDrag = new Vector(vB.x * -grip, vB.y * 0.10);

        // Rotate body fixed forces into world fixed and add to acceleration
        let worldFixedDrag =
            vectBodyToWorld(bodyFixedDrag, this.angle)
        this.acceleration.add(
            worldFixedDrag.div(this.carType.mass)); // Include inertia


        // Physics Engine
        this.angle = this.angle % (2 * Math.PI); // Restrict angle to one revolution
        this.velocity.add(this.acceleration);
        if (this.handbrake)
            this.velocity = this.isDrifting ? this.velocity.mult(0.99) : this.velocity.mult(0.95);
        //
        if (this.velocity.mag() > 50) {
            console.log("velocity: ", this.velocity.mag())
        }
        if (this.weight) {
            let tensionForce = this.carType.engineForce;
            // console.log(this.position.sub(this.weight.position).mag())
            let springVector = this.weight.update(deltaTime, this.position.sub(this.weight.position), this.position);
            this.velocity.add(springVector.mult(2));
        }
        this.targetPosition = this.position.copy().add(this.velocity.mult(deltaTime * timeFactor));
        // this.interpolatePosition();


    }

    private handleInput(keys, deltaTime, timeFactor: number) {
        let changes = {acceleration: new Vector(0, 0), angle: 0};

        if (keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) {
            // ACCELERATING (BODY-FIXED to WORLD)
            if (keys['ArrowUp']) {
                let bodyAcc = new Vector(0, this.carType.engineForce);
                // let bodyAcc = this.position.copy().sub(this.weight.position).normalize().mult(this.model.force);
                let worldAcc = vectBodyToWorld(bodyAcc, this.angle);
                changes.acceleration.add(worldAcc);
            }
            // BRAKING (BODY-FIXED TO WORLD)
            if (keys['ArrowDown']) {
                let bodyAcc = new Vector(0, -this.carType.engineForce);
                let worldAcc = vectBodyToWorld(bodyAcc, this.angle);
                changes.acceleration.add(worldAcc);
            }
            if (keys['ArrowLeft']) {
                this.angle -= this.turnRate * deltaTime * timeFactor;
            }
            if (keys['ArrowRight']) {
                this.angle += this.turnRate * deltaTime * timeFactor;
            }
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

        let width = this.carType.dimensions.width;
        let height = this.carType.dimensions.length;
        let corners = [];

        // Calculate the corners relative to the car's center point
        let frontLeft = new Vector(this.position.x - width / 2, this.position.y - height / 2);
        let frontRight = new Vector(this.position.x + width / 2, this.position.y - height / 2);
        let backLeft = new Vector(this.position.x - width / 2, this.position.y + height / 2);
        let backRight = new Vector(this.position.x + width / 2, this.position.y + height / 2);

        corners.push(frontLeft);
        corners.push(frontRight);
        corners.push(backLeft);
        corners.push(backRight);

        let rotatedCorners = [];
        for (let i = 0; i < corners.length; i++) {
            let corner = corners[i];
            let rotatedCorner = Vector.rotatePoint(corner, this.position, this.angle);
            rotatedCorners.push(rotatedCorner);
        }
        return rotatedCorners;
    }

}

export default Car;