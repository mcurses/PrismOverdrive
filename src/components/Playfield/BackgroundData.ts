import Vector from "../../utils/Vector";
import {ParallaxLayer} from "./Background";

class BackgroundData {
    // dict with image names as keys and HTMLImageElements as values
    private images: { [key: string]: HTMLImageElement } = {};

    constructor() {
        this.images['parallaxLayer1'] = new Image();
        this.images['parallaxLayer1'].src = 'assets/starfield-tile-loDens.png';
        this.images['parallaxLayer2'] = new Image();
        this.images['parallaxLayer2'].src = 'assets/starfield-tile-loDens.png';
        // this.images['parallaxLayer2'].src = 'assets/starfield-tile2.png';
        this.images['parallaxLayer3'] = new Image();
        // this.images['parallaxLayer3'].src = 'assets/starfield-tile3.png';
        this.images['parallaxLayer3'].src = 'assets/starfield-tile-loDens.png';
        // this.images['parallaxLayer1'].src = 'assets/stars2.jpg';
    }

    getLayers(name: string) {
        // wait for images to load
        return Promise.all(Object.values(this.images).map(img => new Promise(resolve => img.onload = resolve)))
            .then(() => {
                switch (name) {
                    case 'starField':
                        return this.starField()
                }
            });
    }

    private starField = (): ParallaxLayer[] => [
        {
            img: this.images.parallaxLayer3,
            z: .85,
            offset: new Vector(0, 0),
            cropSize: {width: 1024, height: 1024},
            size: {width: 1024, height: 1024}, // kept for backward compatibility
            scale: 1.9,
        },
        {
            img: this.images.parallaxLayer2,
            z: .95,
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
            scale: 1.0,
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
