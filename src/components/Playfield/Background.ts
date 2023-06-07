import {Dimensions} from "../../utils/Utils";
import Camera from "../Camera/Camera";
import Vector from "../../utils/Vector";

interface ParallaxLayer {
    img: HTMLImageElement;
    size: Dimensions;
    z: number;
}
export default class Background {
    private readonly mapSize: Dimensions;
    private readonly layers: ParallaxLayer[];

    constructor(props: {
        mapSize: Dimensions,
        layers: ParallaxLayer[]
    }) {
        this.mapSize = props.mapSize;
        // image resizing (consider using CSS)
        for (let layer of props.layers) {
            layer.img.width = layer.size.width;
            layer.img.height = layer.size.height;
        }
        this.layers = props.layers;
    }

    draw(ctx: CanvasRenderingContext2D, cameraPos: Vector, MapSize: Dimensions) {
       let parallaxFactor = 0;
        for (let layer of this.layers) {
            parallaxFactor += layer.z
            this.drawParallaxLayer(ctx, layer.img, cameraPos, parallaxFactor, this.mapSize); // Nearest layer, moves the most
        }
    }

    drawParallaxLayer(ctx: CanvasRenderingContext2D, imageObj: HTMLImageElement,
                      cameraPos: Vector, parallaxFactor: number, MapSize: Dimensions) {
        // Calculate the offset for this layer
        let offsetX = cameraPos.x * parallaxFactor % imageObj.width;
        let offsetY = cameraPos.y * parallaxFactor % imageObj.height;

        // Otherwise replace Map.width and Map.height with appropriate values
        for (let x = -offsetX - imageObj.width; x < MapSize.width; x += imageObj.width) {
            for (let y = -offsetY - imageObj.height; y < MapSize.height; y += imageObj.height) {
                ctx.drawImage(imageObj, x, y);
            }
        }
    }

}
