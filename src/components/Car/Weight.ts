import Vector from "../../utils/Vector";

class Weight {
    mass: number;
    frictionCoefficient: number;
    velocity: Vector;
    position: Vector;

    constructor(mass, frictionCoefficient, position) {
        this.mass = mass;
        this.frictionCoefficient = frictionCoefficient;
        this.velocity = new Vector(0, 0);
        this.position = new Vector(position.x, position.y);
        this.position.y -= 60
        console.log(this.position, position)

    }

    update(deltaTime, tensionVector: Vector, carPosition: Vector) {
        // Calculate the spring force
        let desiredDistance = 60; // The desired distance from the car
        let distanceVector = Vector.sub(this.position, carPosition);
        let distance = distanceVector.mag();
        let springConstant = .5; // The spring constant (adjust as needed)
        let springForce = (distance - desiredDistance) * springConstant;
        let springVector = distanceVector.normalize().mult(-springForce); // The spring force is applied in the opposite direction of the distanceVector

        // Only apply the spring force if the actual distance is different from the desired distance
        // console.log(distance, desiredDistance)
        if (distance < desiredDistance) {
            springVector = springVector.mult(1); // The spring force pushes the weight away from the car
            // console.log(distanceVector,springVector)
        } else if (distance > desiredDistance) {
            springVector = springVector.mult(1); // The spring force pulls the weight towards the car
        } else {
            springVector = new Vector(0, 0); // No spring force is applied if the actual distance equals the desired distance
        }

        // Update velocity
        this.velocity = this.velocity.add(springVector);
        this.velocity = this.velocity.mult(0.99);

        // Update position
        this.position.x += this.velocity.x * deltaTime;
        this.position.y += this.velocity.y * deltaTime;

        return springVector;
    }


}

export default Weight;
