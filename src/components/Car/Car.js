"use strict";
Object.defineProperty(exports, "__esModule", {value: true});
const Utils_1 = require("../../utils/Utils");
const {Dimensions} = require("../../utils/Utils");
const Vector = require("../../utils/Vector");
let keys = {
    'ArrowUp': false,
    'ArrowDown': false,
    'ArrowLeft': false,
    'ArrowRight': false
};
// Listen for keydown event and update the state of the corresponding key
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
});
// Listen for keyup event and update the state of the corresponding key
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

class Car {
    constructor(posX = window.innerWidth / 2, posY = window.innerHeight / 2, angle = 0) {
        this.turnRateStatic = 0.06;
        this.turnRateDynamic = 0.05;
        this.turnRate = this.turnRateStatic;
        this.gripStatic = .8;
        this.gripDynamic = 0.1;
        this.DRIFT_CONSTANT = 1.7;
        this.pos = new Utils_1.Vector(posX, posY);
        this.velocity = new Utils_1.Vector(0, 0);
        this.acceleration = new Utils_1.Vector(0, 0);
        this.angle = angle;
        this.mass = 13;
        this.width = 18;
        this.length = 30;
        this.force = 0.09;
        this.isDrifting = false;
        this.color = new Utils_1.HSLColor(0, 100, 50);
        this.id = "";
        this.trail = [];
        this.trailCounter = 0;
        this.targetPosition = null;
        this.targetAngle = null;
        this.score = 0;
        this.frameScore = 0;
        this.lastDriftTime = 0;
        this.driftScore = 0;
        this.idleTime = 0;
    }

    /*******************************************************************************
     *  Safely read car variables
     ******************************************************************************/
    getPos() {
        return {x: this.position.x, y: this.position.y};
    }

    isDrift() {
        return this.isDrifting;
    }

    getAngle() {
        return this.angle;
    }

    setAngle(angle) {
        this.angle = angle;
    }

    setTrail(trail) {
        this.trail = trail;
    }

    getTrail() {
        return this.trail;
    }

    show(ctx) {
        // Save the current context
        ctx.save();
        // Translate and rotate the context
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);
        // Set stroke and fill styles
        ctx.lineWidth = this.isDrifting ? 3 : 2;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000'; // Assuming the stroke color to be black
        // Draw the car body and front side indicator
        ctx.fillRect(-this.width / 2, -this.length / 2, this.width, this.length);
        ctx.strokeRect(-this.width / 2, -this.length / 2, this.width, this.length);
        ctx.fillRect(-this.width / 2 + 1, 0, this.width - 2, 6);
        ctx.strokeRect(-this.width / 2 + 1, 0, this.width - 2, 6);
        // Restore the context to its original state
        ctx.restore();
    }

    update() {
        // Add input forces
        if (keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight']) {
            // ACCELERATING (BODY-FIXED to WORLD)
            if (keys['ArrowUp']) {
                let bodyAcc = new Utils_1.Vector(0, this.force);
                let worldAcc = this.vectBodyToWorld(bodyAcc, this.angle);
                this.acceleration.add(worldAcc);
            }
            // BRAKING (BODY-FIXED TO WORLD)
            if (keys['ArrowDown']) {
                let bodyAcc = new Utils_1.Vector(0, -this.force);
                let worldAcc = this.vectBodyToWorld(bodyAcc, this.angle);
                this.acceleration.add(worldAcc);
            }
            if (keys['ArrowLeft']) {
                this.angle -= this.turnRate;
            }
            if (keys['ArrowRight']) {
                this.angle += this.turnRate;
            }
        }
        // Car steering and drifting physics
        // Rotate the global velocity vector into a body-fixed one. x = sideways
        // velocity, y = forward/backwards
        let vB = this.vectWorldToBody(this.velocity, this.angle);
        let bodyFixedDrag;
        let grip;
        if (Math.abs(vB.x) < this.DRIFT_CONSTANT) {
            // Gripping
            grip = this.gripStatic;
            this.turnRate = this.turnRateStatic;
            this.isDrifting = false;
        } else {
            // Drifting
            grip = this.gripDynamic;
            this.turnRate = this.turnRateDynamic;
            this.isDrifting = true;
        }
        bodyFixedDrag = new Utils_1.Vector(vB.x * -grip, vB.y * 0.05);
        // Rotate body fixed forces into world fixed and add to acceleration
        let worldFixedDrag = this.vectBodyToWorld(bodyFixedDrag, this.angle);
        this.acceleration.add(worldFixedDrag.div(this.mass)); // Include inertia
        // Physics Engine
        this.angle = this.angle % (2 * Math.PI); // Restrict angle to one revolution
        this.velocity.add(this.acceleration);
        this.position.add(this.velocity);
        this.acceleration = new Utils_1.Vector(0, 0); // Reset acceleration for next frame
        // Update the score
        let score = this.calculateScore(this.velocity, this.angle);
        this.score += score;
        this.driftScore += score;
        this.frameScore = score;
        // Reset the score if not drifting for 3 seconds
        if (this.isDrifting) {
            this.lastDriftTime = Date.now();
        } else if (this.lastDriftTime !== null && Date.now() - this.lastDriftTime > 3000) {
            this.resetScore();
        } else {
            this.driftScore = 0;
        }
    }

    interpolatePosition() {
        if (this.targetPosition) {
            let distance = Utils_1.Vector.dist(this.position, this.targetPosition);
            // if difference is too large, just teleport
            if (distance > 500) {
                this.position = new Utils_1.Vector(this.targetPosition.x, this.targetPosition.y);
                this.targetPosition = null;
            } else {
                let targetPos = new Utils_1.Vector(this.targetPosition.x, this.targetPosition.y);
                this.position = Utils_1.Vector.lerp(this.position, targetPos, 0.1);
            }
            if (distance < 1) {
                this.targetPosition = null;
            }
        }
        if (this.targetAngle !== null) {
            let difference = this.targetAngle - this.angle;
            while (difference < -Math.PI)
                difference += Math.PI * 2;
            while (difference > Math.PI)
                difference -= Math.PI * 2;
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

    calculateScore(velocity, angle) {
        let score = 0;
        let angleDifference = this.getAngleDifference(angle, velocity);
        // Calculate the score based on the angle difference and the velocity
        score = (1 - Math.sin(angleDifference)) * velocity.mag();
        return score;
    }

    getAngleDifference(angle, velocity) {
        // Create a vector representing the car's direction
        let carDirection = new Utils_1.Vector(Math.cos(angle), Math.sin(angle));
        // Normalize the vectors
        let vNormalized = velocity.copy().normalize();
        let carDirectionNormalized = carDirection.normalize();
        // Calculate the dot product of the vectors
        let dotProduct = vNormalized.dot(carDirectionNormalized);
        // return the angle between the vectors
        return Math.acos(dotProduct);
    }

    resetScore() {
        this.score = 0;
    }

    /*******************************************************************************
     * Rotation Matrices
     *   Rotate a vector from one frame of reference to the other.
     ******************************************************************************/
    // Body to world rotation
    vectBodyToWorld(vect, ang) {
        let v = vect.copy();
        let vn = new Utils_1.Vector(v.x * Math.cos(ang) - v.y * Math.sin(ang), v.x * Math.sin(ang) + v.y * Math.cos(ang));
        return vn;
    }

    // World to body rotation
    vectWorldToBody(vect, ang) {
        let v = vect.copy();
        let vn = new Utils_1.Vector(v.x * Math.cos(ang) + v.y * Math.sin(ang), v.x * Math.sin(ang) - v.y * Math.cos(ang));
        return vn;
    }

    setPosition(position) {
        this.position = position;
    }

    setDrift(drifting) {
        this.isDrifting = drifting;
    }

    // Add a new method for collision detection
    checkCollision(boundaries) {
        // Iterate over each boundary line
        for (let i = 0; i < boundaries.length - 1; i++) {
            let start = new Utils_1.Vector(boundaries[i][0], boundaries[i][1]);
            let end = new Utils_1.Vector(boundaries[i + 1][0], boundaries[i + 1][1]);
            let carPos = this.position;
            // Calculate the distance from the car to the boundary line
            let lineDist = Utils_1.Vector.dist(carPos, this.closestPointOnLine(start, end, carPos));
            // Check if the distance is less than the car's size (assuming the car is a circle with diameter of car.l)
            if (lineDist < this.length / 2) {
                // Calculate the normal vector
                let boundaryVector = Utils_1.Vector.sub(end, start);
                let normalVector = new Utils_1.Vector(-boundaryVector.y, boundaryVector.x);
                normalVector = normalVector.normalize();
                // Push the car back
                let pushBack = normalVector.mult((this.length / 2 - lineDist) * .5);
                this.position.add(pushBack);
                this.velocity.mult(0.95);
                this.velocity.add(pushBack);
                this.resetScore();
                return true; // Collision detected
            }
        }
        return false; // No collision
    }

}

exports.default = Car;
