import {Dimensions} from "../../utils/Utils";
import Camera from "../Camera/Camera";
import Vector from "../../utils/Vector";

export interface ParallaxLayer {
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
        props.layers.map(layer => {
            let canvas = document.createElement('canvas');
            canvas.width = layer.size.width;
            canvas.height = layer.size.height;
            let ctx = canvas.getContext('2d');


            ctx.drawImage(layer.img, 0, 0, layer.size.width, layer.size.height);

            // // Top-right quadrant
            // this.drawQuadrant(ctx, layer.img, layer.offset.x, layer.offset.y, layer.cropSize.width, layer.cropSize.height, layer.size.width, 0, layer.size.width / 2, layer.size.height / 2, -1, 1);
            // // Top-left quadrant
            // this.drawQuadrant(ctx, layer.img, layer.offset.x, layer.offset.y, layer.cropSize.width, layer.cropSize.height, 0, 0, layer.size.width / 2, layer.size.height / 2, 1, 1);
            // // Bottom-left quadrant
            // this.drawQuadrant(ctx, layer.img, layer.offset.x, layer.offset.y, layer.cropSize.width, layer.cropSize.height, 0, layer.size.height, layer.size.width / 2, layer.size.height / 2, 1, -1);
            // // Bottom-right quadrant
            // this.drawQuadrant(ctx, layer.img, layer.offset.x, layer.offset.y, layer.cropSize.width, layer.cropSize.height, layer.size.width, layer.size.height, layer.size.width / 2, layer.size.height / 2, -1, -1);

            layer.canvas = canvas;
            this.layers.push(layer);
        });
    }

    drawQuadrant(ctx, img, offsetX, offsetY, cropWidth, cropHeight, x, y, width, height, scaleX, scaleY) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scaleX, scaleY);
        ctx.drawImage(img,
            offsetX, offsetY,
            cropWidth, cropHeight,
            0, 0,
            width, height  // Use the size of the canvas here
        );
        ctx.restore();
    }

    draw(ctx: CanvasRenderingContext2D, cameraPos: Vector, canvasSize: Dimensions) {
        let parallaxFactor = 0;
        for (let layer of this.layers) {
            parallaxFactor += layer.z
            this.drawParallaxLayer(ctx, layer, cameraPos, canvasSize, this.mapSize);
        }
    }

    drawParallaxLayer(ctx: CanvasRenderingContext2D, layer: ParallaxLayer,
                      cameraPos: Vector, canvasSize: Dimensions, MapSize: Dimensions) {
        // Calculate the offset for this layer
        let offsetX = cameraPos.x * layer.z % layer.canvas.width;
        let offsetY = cameraPos.y * layer.z % layer.canvas.height;

        // Otherwise replace Map.width and Map.height with appropriate values
        for (let x = -offsetX - layer.canvas.width;
             x < MapSize.width + canvasSize.width / 2;
             x += layer.canvas.width) {
            for (let y = -offsetY - layer.canvas.height;
                 y < MapSize.height + canvasSize.height / 2;
                 y += layer.canvas.height) {
                ctx.globalCompositeOperation = 'lighter'
                ctx.globalAlpha = 1 - (layer.z / 2);
                ctx.drawImage(layer.canvas,
                    0, 0,
                    layer.cropSize.width, layer.cropSize.height,
                    x, y,
                    layer.size.width, layer.size.height,
                );
                ctx.globalCompositeOperation = 'source-over'
            }
        }
        ctx.globalAlpha = 1;
    }

}
