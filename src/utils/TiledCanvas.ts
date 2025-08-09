export default class TiledCanvas {
    private tiles: HTMLCanvasElement[][];
    private tileSize: number;
    private tilesX: number;
    private tilesY: number;
    private width: number;
    private height: number;

    constructor(width: number, height: number, tileSize: number = 1024) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
        this.tilesX = Math.ceil(width / tileSize);
        this.tilesY = Math.ceil(height / tileSize);
        
        // Initialize 2D array of tiles
        this.tiles = [];
        for (let y = 0; y < this.tilesY; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.tilesX; x++) {
                const canvas = document.createElement('canvas');
                const tileW = Math.min(tileSize, width - x * tileSize);
                const tileH = Math.min(tileSize, height - y * tileSize);
                canvas.width = tileW;
                canvas.height = tileH;
                this.tiles[y][x] = canvas;
            }
        }
    }

    paint(bounds: {x: number, y: number, w: number, h: number}, painter: (ctx: CanvasRenderingContext2D) => void): void {
        // Compute tile index range overlapped by bounds
        const startTileX = Math.max(0, Math.floor(bounds.x / this.tileSize));
        const endTileX = Math.min(this.tilesX - 1, Math.floor((bounds.x + bounds.w) / this.tileSize));
        const startTileY = Math.max(0, Math.floor(bounds.y / this.tileSize));
        const endTileY = Math.min(this.tilesY - 1, Math.floor((bounds.y + bounds.h) / this.tileSize));

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.tiles[tileY][tileX];
                const ctx = tile.getContext('2d');
                const tileOriginX = tileX * this.tileSize;
                const tileOriginY = tileY * this.tileSize;

                ctx.save();
                
                // Set world-space transform so existing world coordinates can be used unchanged
                ctx.setTransform(1, 0, 0, 1, -tileOriginX, -tileOriginY);
                
                painter(ctx);
                
                ctx.restore();
            }
        }
    }

    drawTo(ctx: CanvasRenderingContext2D, viewX: number, viewY: number, viewW: number, viewH: number): void {
        // Find intersecting tiles and blit them to ctx at their world positions
        const startTileX = Math.max(0, Math.floor(viewX / this.tileSize));
        const endTileX = Math.min(this.tilesX - 1, Math.floor((viewX + viewW) / this.tileSize));
        const startTileY = Math.max(0, Math.floor(viewY / this.tileSize));
        const endTileY = Math.min(this.tilesY - 1, Math.floor((viewY + viewH) / this.tileSize));

        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const tile = this.tiles[tileY][tileX];
                const tileOriginX = tileX * this.tileSize;
                const tileOriginY = tileY * this.tileSize;
                
                ctx.drawImage(tile, tileOriginX, tileOriginY);
            }
        }
    }

    overlayImage(imageCanvas: HTMLCanvasElement, globalAlpha: number = 1): void {
        for (let tileY = 0; tileY < this.tilesY; tileY++) {
            for (let tileX = 0; tileX < this.tilesX; tileX++) {
                const tile = this.tiles[tileY][tileX];
                const ctx = tile.getContext('2d');
                const tileOriginX = tileX * this.tileSize;
                const tileOriginY = tileY * this.tileSize;
                const tileW = tile.width;
                const tileH = tile.height;

                ctx.save();
                ctx.globalAlpha = globalAlpha;
                ctx.drawImage(imageCanvas, tileOriginX, tileOriginY, tileW, tileH, 0, 0, tileW, tileH);
                ctx.restore();
            }
        }
    }
}
