import Vector from "../../utils/Vector";
import {ParallaxLayer} from "./Background";

export const BACKGROUND_IMAGE_SOURCES: Record<string, string> = {
    parallaxLayer1: "assets/starfield-tile.png",
    parallaxLayer2: "assets/starfield-tile-loDens.png",
    // parallaxLayer2: "assets/starfield-tile2.png",
    parallaxLayer3: "assets/starfield-tile-loDens.png",
    // parallaxLayer3: "assets/starfield-tile3.png",
    // parallaxLayer1: "assets/stars2.jpg",
    jungle_top: "assets/jungle_top_a.png",
    jungle_mid: "assets/jungle_med.png",
    jungle_bottom: "assets/jungle_bottom2.png",
};

class BackgroundData {
    // dict with image names as keys and HTMLImageElements as values
    private images: { [key: string]: HTMLImageElement } = {};

    constructor() {
        Object.entries(BACKGROUND_IMAGE_SOURCES).forEach(([key, src]) => {
            const image = new Image();
            image.src = src;
            this.images[key] = image;
        });
    }

    getLayers(name: string) {
        // wait for images to load
        return Promise.all(Object.values(this.images).map(img => new Promise(resolve => img.onload = resolve)))
            .then(() => {
                switch (name) {
                    case 'starField':
                        return this.starField()
                    case 'jungle':
                        return this.jungle()
                    default:
                        throw new Error(`Background not found: ${name}`);
                }
            });
    }

    private starField = (): ParallaxLayer[] => [
        {
            img: this.images.parallaxLayer3,
            z: .95,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 1.9,
        },
        {
            img: this.images.parallaxLayer2,
            z: .987,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 1.5,
        },
        {
            img: this.images.parallaxLayer1,
            z: .998,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 3.0,
        },
    ]

    private jungle = (): ParallaxLayer[] => [
        {
            img: this.images.jungle_bottom,
            z: .95,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 1,
        },
        {
            img: this.images.jungle_mid,
            z: .867,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 1.1,
        },
        {
            img: this.images.jungle_top,
            z: .785,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 1.2,
        },
    ]

    // private starField = (): ParallaxLayer[] => [
    //     {
    //         img: this.images.parallaxLayer1,
    //         z: 0.8,
    //         offset: new Vector(1000, 1000),
    //         cropSize: {width: 1200, height: 1200},
    //         size: {width: 1900, height: 1900},
    //     },
    //     {
    //         img: this.images.parallaxLayer1,
    //         z: 0.88,
    //         offset: new Vector(2000, 2000),
    //         cropSize: {width: 1800, height: 1800},
    //         size: {width: 1600, height: 1600},
    //     },
    //     {
    //         img: this.images.parallaxLayer1,
    //         z: 0.94,
    //         offset: new Vector(100, 100),
    //         cropSize: {width: 1900, height: 1900},
    //         size: {width: 1300, height: 1300},
    //     },
    // ]

}

export default BackgroundData;
