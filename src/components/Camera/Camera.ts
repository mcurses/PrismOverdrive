import {Dimensions, lerp, constrain} from "../../utils/Utils";
import Vector from "../../utils/Vector";

export default class Camera {
    private readonly canvasSize: Dimensions;
    // private readonly mapSize: Dimensions;
    position: Vector;
    target: Vector;

    constructor(props) {
        this.canvasSize = props.canvasSize;
        // this.mapSize = props.mapSize;
        this.position = new Vector(0, 0);
        this.target = new Vector(0, 0);
    }

    moveTowards(playerPos: Vector) {
        // Calculate the desired camera position
        this.target.x = -playerPos.x + this.canvasSize.width / 2
        this.target.y = -playerPos.y + this.canvasSize.height / 2
        this.position.x = lerp(this.position.x, this.target.x, 0.2)
        this.position.y = lerp(this.position.y, this.target.y, 0.2)

        // Limit the camera to not go outside the map
        // newCam.x = constrain(newCam.x, this.mapSize.width - this.canvasSize.width, 0);
        // newCam.y = constrain(newCam.y, this.mapSize.height - this.canvasSize.height, 0);


    }


}
