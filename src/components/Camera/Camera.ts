import {Dimensions, lerp, constrain} from "../../utils/Utils";
import Vector from "../../utils/Vector";

export default class Camera {
    private readonly canvasSize: Dimensions;
    private readonly mapSize: Dimensions;
    private prevCam: Vector;

    constructor(props) {
        this.canvasSize = props.canvasSize;
        this.mapSize = props.mapSize;
        this.prevCam = new Vector(0, 0);
    }

    getOffset(playerPos: Vector) {
        // Calculate the desired camera position
        let targetCam = new Vector(
            -playerPos.x + this.canvasSize.width / 2,
            -playerPos.y + this.canvasSize.height / 2);
        let newCam = new Vector(
            lerp(this.prevCam.x, targetCam.x, 0.1),
            lerp(this.prevCam.y, targetCam.y, 0.1));

        // Limit the camera to not go outside the map
        // newCam.x = constrain(newCam.x, this.mapSize.width - this.canvasSize.width, 0);
        // newCam.y = constrain(newCam.y, this.mapSize.height - this.canvasSize.height, 0);

        this.prevCam = newCam;

        return newCam;
    }


}
