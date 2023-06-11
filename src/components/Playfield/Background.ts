import {Dimensions} from "../../utils/Utils";
import Camera from "../Camera/Camera";
import Vector from "../../utils/Vector";

interface ParallaxLayer {
    img: HTMLImageElement;
    size: Dimensions;
    z: number;
    offset: Vector;
    cropSize: Dimensions;
    canvas?: HTMLCanvasElement;
}

export default class Background {
    private readonly mapSize: Dimensions;
    private readonly layers: ParallaxLayer[];

    constructor(props: {
        mapSize: Dimensions,
        layers: ParallaxLayer[]
    }) {
        this.mapSize = props.mapSize;
        // // image resizing (consider using CSS)
        // for (let layer of props.layers) {
        //
        //     layer.img.width = layer.size.width;
        //     layer.img.height = layer.size.height;
        // }
        // this.layers = props.layers;
        // create a canvas for each layer
        this.layers = [];
        console.log(props.layers)
        props.layers[0].img.onload = () => {
            props.layers.map(layer => {
                let canvas = document.createElement('canvas');
                canvas.width = layer.size.width;
                canvas.height = layer.size.height;
                let ctx = canvas.getContext('2d');
                ctx.drawImage(layer.img, 0, 0);
                layer.canvas = canvas;
                this.layers.push(layer);
            });
            console.log(this.layers)
        }
    }

    draw(ctx: CanvasRenderingContext2D, cameraPos: Vector) {
        let parallaxFactor = 0;
        for (let layer of this.layers) {
            parallaxFactor += layer.z
            this.drawParallaxLayer(ctx, layer, cameraPos, this.mapSize);
        }
    }

    drawParallaxLayer(ctx: CanvasRenderingContext2D, layer: ParallaxLayer,
                      cameraPos: Vector, MapSize: Dimensions) {
        // Calculate the offset for this layer
        let offsetX = cameraPos.x * layer.z % layer.canvas.width;
        let offsetY = cameraPos.y * layer.z % layer.canvas.height;

        // Otherwise replace Map.width and Map.height with appropriate values
        for (let x = -offsetX - layer.canvas.width; x < MapSize.width; x += layer.canvas.width) {
            for (let y = -offsetY - layer.canvas.height; y < MapSize.height; y += layer.canvas.height) {
                ctx.globalCompositeOperation = 'lighter'
                ctx.drawImage(layer.canvas,
                    layer.offset.x, layer.offset.y,
                    layer.cropSize.width, layer.cropSize.height,
                    x, y,
                    layer.size.width, layer.size.height,
                );
                ctx.globalCompositeOperation = 'source-over'
            }
        }
    }

}
