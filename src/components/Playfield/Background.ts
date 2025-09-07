import {Dimensions} from "../../utils/Utils";
import Camera from "../Camera/Camera";
import Vector from "../../utils/Vector";

export interface ParallaxLayer {
    img: HTMLImageElement;
    size: Dimensions;
    z: number;
    offset: Vector;
    cropSize: Dimensions;
    scale?: number; // default 1
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
        
        // Create a properly scaled tile canvas for each layer
        this.layers = [];
        props.layers.map(layer => {
            // Determine source tile rectangle
            const srcW = layer.cropSize?.width ?? layer.img.width;
            const srcH = layer.cropSize?.height ?? layer.img.height;
            const srcX = layer.offset?.x ?? 0;
            const srcY = layer.offset?.y ?? 0;
            
            // Determine scale factor
            let scale: number;
            if (layer.scale !== undefined) {
                // Prefer explicit scale if provided
                scale = layer.scale;
            } else if (layer.size) {
                // Backward compatibility: infer scale from size
                scale = layer.size.width / srcW;
            } else {
                // Default scale
                scale = 1;
            }
            
            // Compute destination tile size (rounded to avoid subpixel issues)
            const tileW = Math.round(srcW * scale);
            const tileH = Math.round(srcH * scale);
            
            // Create canvas with exact tile dimensions
            const canvas = document.createElement('canvas');
            canvas.width = tileW;
            canvas.height = tileH;
            const ctx = canvas.getContext('2d')!;
            
            // Draw the scaled tile into the canvas once
            ctx.drawImage(layer.img, srcX, srcY, srcW, srcH, 0, 0, tileW, tileH);
            
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
        // Use the tile canvas dimensions for consistent tiling
        const tileW = layer.canvas!.width;
        const tileH = layer.canvas!.height;
        
        // Positive modulo to handle negative camera positions
        const mod = (n: number, m: number) => ((n % m) + m) % m;
        const offsetX = mod(cameraPos.x * layer.z, tileW);
        const offsetY = mod(cameraPos.y * layer.z, tileH);

        // Set canvas state once before loops
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - (layer.z / 2);

        // Use integer stepping and positions to avoid seams
        const startX = -Math.floor(offsetX) - tileW;
        const startY = -Math.floor(offsetY) - tileH;
        
        for (let x = startX; x < MapSize.width + canvasSize.width / 2; x += tileW) {
            for (let y = startY; y < MapSize.height + canvasSize.height / 2; y += tileH) {
                // Draw the pre-scaled tile directly (no per-draw scaling)
                ctx.drawImage(layer.canvas!, x | 0, y | 0);
            }
        }
        
        // Reset canvas state once after loops
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

}
