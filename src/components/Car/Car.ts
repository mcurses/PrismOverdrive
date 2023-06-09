import {Dimensions, Coordinates, constrain} from "../../utils/Utils"
import Vector from "../../utils/Vector";
import {HSLColor} from "../../utils/HSLColor";
import {vectBodyToWorld, vectWorldToBody} from "./CarUtils";
import Trail from "../Trail/Trail";
import Weight from "./Weight";


class Car {
    turnRateStatic: number;
    turnRateDynamic: number;
    turnRate: number;
    gripStatic: number;
    gripDynamic: number;
    DRIFT_CONSTANT: number;
    position: Vector;
    velocity: Vector;
    acceleration: Vector;
    angle: number;
    mass: number;
    width: number;
    length: number;
    force: number;
    isDrifting: boolean;
    color: HSLColor;
    id: string;
    trail: Trail;
    trailCounter: number;
    targetPosition: Vector | null;
    targetAngle: number | null;
    lastDriftTime: number;
    idleTime: number;
    isColliding: boolean;
    weight: Weight;

    steeringForce: number;
    maxSteeringForce: number;
    steeringAcceleration: number;
    centerOfMass: number;
    handbrake: boolean;
    private angularVelocity: number;


    constructor(posX = window.innerWidth / 2, posY = window.innerHeight / 2, angle = 0) {
        let turnFactor = .2;
        this.turnRateStatic = 0.04 * turnFactor
        this.turnRateDynamic = 0.06 * turnFactor
        this.turnRate = this.turnRateStatic;
        this.gripStatic = 1.4;
        this.gripDynamic = .2;
        this.DRIFT_CONSTANT = 8.;
        this.position = new Vector(posX, posY);
        this.velocity = new Vector(0, 0);
        this.acceleration = new Vector(0, 0);
        this.angle = angle;
        this.mass = 29;
        this.width = 18;
        this.length = 30;
        this.force = 0.19;
        this.isDrifting = false;
        this.color = new HSLColor(0, 100, 50);
        this.id = "";
        this.trail = new Trail();
        this.trailCounter = 0;
        this.targetPosition = null;
        this.targetAngle = null;
        this.lastDriftTime = 0;
        this.idleTime = 0;

        this.steeringForce = 0;
        // Set the maximum steering force and the steering acceleration
        this.maxSteeringForce = 0.005; // Adjust as needed
        this.steeringAcceleration = 0.0005; // Adjust as needed
        this.centerOfMass = 0.5; // Adjust as needed, 0.5 is the middle, higher values towards the rear

        this.handbrake = false;

        this.angularVelocity = 0;


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
        this.acceleration = new Vector(0, 0); // Reset acceleration for next frame
        let timeFactor = .2;
        if (deltaTime > 100) {
            deltaTime = 100;
        }

        // let force = this.isDrifting ? this.force * 0.5 : this.force; // Reduce the force by half when drifting
        // if (this.isDrifting) {
        //     console.log("drifting")
        // }

        // deltaTime = deltaTime * timeFactor;
        // Add input forces
        if (keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) {
            // ACCELERATING (BODY-FIXED to WORLD)
            if (keys['ArrowUp']) {
                let bodyAcc = new Vector(0, this.force);
                // let bodyAcc = this.position.copy().sub(this.weight.position).normalize().mult(this.force);
                let worldAcc = vectBodyToWorld(bodyAcc, this.angle);
                this.acceleration.add(worldAcc);
            }
            // BRAKING (BODY-FIXED TO WORLD)
            if (keys['ArrowDown']) {
                let bodyAcc = new Vector(0, -this.force);
                let worldAcc = vectBodyToWorld(bodyAcc, this.angle);
                this.acceleration.add(worldAcc);
            }
            if (keys['ArrowLeft']) {
                this.angle -= this.turnRate * deltaTime * timeFactor;
            }
            if (keys['ArrowRight']) {
                this.angle += this.turnRate * deltaTime * timeFactor;
            }
        }
        this.handbrake = keys['Space'];
        // if all arrow keys are pressed

        // If a direction key is pressed, increase the steeringForce
        // if (keys['ArrowLeft']) {
        //     this.steeringForce = Math.max(this.steeringForce - this.steeringAcceleration * deltaTime, -this.maxSteeringForce);
        // } else if (keys['ArrowRight']) {
        //     this.steeringForce = Math.min(this.steeringForce + this.steeringAcceleration * deltaTime, this.maxSteeringForce);
        // } else {
        //     // If no direction key is pressed, gradually reduce the steeringForce
        //     if (this.steeringForce > 0) {
        //         this.steeringForce = Math.max(this.steeringForce - this.steeringAcceleration * deltaTime, 0);
        //     } else if (this.steeringForce < 0) {
        //         this.steeringForce = Math.min(this.steeringForce + this.steeringAcceleration * deltaTime, 0);
        //     }
        // }
        //
        // // Modify the car's angle based on the steeringForce
        // this.angle += this.steeringForce * deltaTime;

        // If there's no steering input, gradually align the car with its direction of travel.

        // Car steering and drifting physics

        // Rotate the global velocity vector into a body-fixed one. x = sideways
        // velocity, y = forward/backwards
        let vB = vectWorldToBody(this.velocity, this.angle);
        // this.velAngleDiff(vB, keys, deltaTime, timeFactor);

        let bodyFixedDrag;
        let grip;
        if (Math.abs(vB.x) < this.DRIFT_CONSTANT && !this.handbrake) {
            // Gripping
            grip = this.gripStatic
            this.turnRate = this.turnRateStatic;
            this.isDrifting = false;
            // bodyFixedDrag = new Vector(vB.x * -this.gripStatic, vB.y * 0.05);

        } else {
            // Drifting
            grip = this.gripDynamic;
            this.turnRate = this.turnRateDynamic;
            this.isDrifting = true;
            // let frontGrip = this.gripDynamic;
            // let rearGrip = this.gripDynamic * (1 - this.centerOfMass);
            // bodyFixedDrag = new Vector(vB.x * -frontGrip, vB.y * -rearGrip);
        }
        bodyFixedDrag = new Vector(vB.x * -grip, vB.y * 0.10);

        // Rotate body fixed forces into world fixed and add to acceleration
        let worldFixedDrag =
            vectBodyToWorld(bodyFixedDrag, this.angle)
        this.acceleration.add(
            worldFixedDrag.div(this.mass)); // Include inertia


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
            let tensionForce = this.force;
            // console.log(this.position.sub(this.weight.position).mag())
            let springVector = this.weight.update(deltaTime, this.position.sub(this.weight.position), this.position);
            this.velocity.add(springVector.mult(2));


            // // Calculate the torque exerted by the weight on the car
            // // The torque is proportional to the cross product of the distance vector and the spring force vector
            // let distanceVector = Vector.sub(this.weight.position, this.position);
            // let torque = Vector.cross(distanceVector, springVector);
            //
            // // Apply the torque to the car's angular velocity
            // // The angular velocity is proportional to the torque divided by the car's moment of inertia
            // // For simplicity, we can assume the car's moment of inertia is a constant
            // let momentOfInertia = this.mass * (this.width * this.width + this.length * this.length) / 2;
            // this.angularVelocity += torque / momentOfInertia * deltaTime;
            //
            // let targetWeightPos = this.position.copy().sub(Vector.up.mult(100))
            // let weightDistanceVector = Vector.sub(this.weight.position, targetWeightPos);
            // weightDistanceVector.normalize()
            // this.weight.velocity.add(weightDistanceVector.mult(this.angularVelocity * deltaTime * 0.7))


            // Apply the opposite torque to the weight's angular velocity
            // let momentOfInertiaWeight = this.weight.mass * (this.weight.width * this.weight.width + this.weight.height * this.weight.height) / 12;
            // this.weight.angularVelocity -= torque / momentOfInertiaWeight * deltaTime;


            // Update the car's angle based on its angular velocity
            // this.angle += this.angularVelocity * deltaTime;
            // this.angularVelocity *= 0.9; // Dampen angular velocity
        }
        this.targetPosition = this.position.copy().add(this.velocity.mult(deltaTime * timeFactor));


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
        if (this.targetAngle !== null) {
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

        let curCar = this
        let id = curCar.id;

        curCar.interpolatePosition();

        // Set color
        if (!curCar.isDrifting) {
            curCar.color = new HSLColor(0, 0, 100);
        }
        if (curCar.isColliding) {
            curCar.color = new HSLColor(255, 255, 255);
        }

        // Save the current context
        ctx.save();

        // Translate and rotate the context
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);

        // Set stroke and fill styles
        ctx.lineWidth = this.isDrifting ? 3 : 2;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000';  // Assuming the stroke color to be black

        // Draw the car body and front side indicator
        ctx.fillRect(-this.width / 2, -this.length / 2, this.width, this.length);
        ctx.strokeRect(-this.width / 2, -this.length / 2, this.width, this.length);

        ctx.fillRect(-this.width / 2 + 1, 0, this.width - 2, 6);
        ctx.strokeRect(-this.width / 2 + 1, 0, this.width - 2, 6);


        // Restore the context to its original state
        ctx.restore();
        if (this.weight) {
            // console.log("rendering weight", this.weight.position.x, this.weight.position.y)
            ctx.fillStyle = '#777'; // Set the fill color to black
            ctx.fillRect(this.weight.position.x, this.weight.position.y, 10, 10); // Draw the weight as a 10x10 square
        }

    }

    getCorners() {

        let width = this.width;
        let height = this.length;
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