import WheelGestures from 'wheel-gestures';
import { Dimensions } from '../utils/Utils';

export interface ViewTransform {
    x: number;
    y: number;
    scale: number;
}

export class EditorViewport {
    private canvas: HTMLCanvasElement;
    private transform: ViewTransform = { x: 0, y: 0, scale: 1 };
    private wheelGestures: any;
    private momentum = { vx: 0, vy: 0 };
    private lastFrameTime = 0;
    private animationId?: number;
    private readonly MOMENTUM_DECAY = 0.95;
    private readonly MOMENTUM_THRESHOLD = 0.1;
    private isDragging = false;
    private lastMousePos = { x: 0, y: 0 };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.setupWheelGestures();
        this.setupMouseEvents();
        this.startMomentumLoop();
    }

    private setupWheelGestures(): void {
        // Use wheel-gestures for trackpad support
        try {
            this.wheelGestures = WheelGestures();
            this.wheelGestures.on(this.canvas);
            
            this.canvas.addEventListener('wheel', (event: WheelEvent) => {
                // Two-finger pan
                if (event.deltaX || event.deltaY) {
                    this.transform.x -= event.deltaX;
                    this.transform.y -= event.deltaY;
                    
                    // Update momentum velocity
                    this.momentum.vx = -event.deltaX * 0.1;
                    this.momentum.vy = -event.deltaY * 0.1;
                }
                event.preventDefault();
            });
        } catch (error) {
            console.warn('WheelGestures not available, falling back to basic wheel events');
            this.setupFallbackWheel();
        }
    }

    private setupFallbackWheel(): void {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            // Basic wheel scrolling
            this.transform.x -= e.deltaX;
            this.transform.y -= e.deltaY;
            
            // Update momentum
            this.momentum.vx = -e.deltaX * 0.1;
            this.momentum.vy = -e.deltaY * 0.1;
        });
    }

    private setupMouseEvents(): void {
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.metaKey)) { // Middle mouse or Cmd+click
                this.isDragging = true;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                e.preventDefault();
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMousePos.x;
                const deltaY = e.clientY - this.lastMousePos.y;
                
                this.transform.x += deltaX;
                this.transform.y += deltaY;
                
                this.momentum.vx = deltaX * 0.1;
                this.momentum.vy = deltaY * 0.1;
                
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                e.preventDefault();
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 1 || e.button === 0) {
                this.isDragging = false;
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
        });
    }

    private startMomentumLoop(): void {
        const loop = (time: number) => {
            if (this.lastFrameTime > 0) {
                const dt = Math.min(time - this.lastFrameTime, 16.67); // Cap at 60fps
                this.updateMomentum(dt);
            }
            this.lastFrameTime = time;
            this.animationId = requestAnimationFrame(loop);
        };
        this.animationId = requestAnimationFrame(loop);
    }

    private updateMomentum(dt: number): void {
        const speed = Math.sqrt(this.momentum.vx * this.momentum.vx + this.momentum.vy * this.momentum.vy);
        
        if (speed > this.MOMENTUM_THRESHOLD) {
            this.transform.x += this.momentum.vx;
            this.transform.y += this.momentum.vy;
            
            this.momentum.vx *= this.MOMENTUM_DECAY;
            this.momentum.vy *= this.MOMENTUM_DECAY;
        } else {
            this.momentum.vx = 0;
            this.momentum.vy = 0;
        }
    }

    public getTransform(): ViewTransform {
        return { ...this.transform };
    }

    public setTransform(transform: Partial<ViewTransform>): void {
        Object.assign(this.transform, transform);
    }

    public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
        return {
            x: (worldX * this.transform.scale) + this.transform.x,
            y: (worldY * this.transform.scale) + this.transform.y
        };
    }

    public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        return {
            x: (screenX - this.transform.x) / this.transform.scale,
            y: (screenY - this.transform.y) / this.transform.scale
        };
    }

    public applyTransform(ctx: CanvasRenderingContext2D): void {
        ctx.setTransform(
            this.transform.scale, 0, 0, this.transform.scale,
            this.transform.x, this.transform.y
        );
    }

    public resetTransform(ctx: CanvasRenderingContext2D): void {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    public fitToView(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding: number = 50): void {
        const canvasRect = this.canvas.getBoundingClientRect();
        const boundsWidth = bounds.maxX - bounds.minX;
        const boundsHeight = bounds.maxY - bounds.minY;
        
        if (boundsWidth === 0 || boundsHeight === 0) return;
        
        const scaleX = (canvasRect.width - padding * 2) / boundsWidth;
        const scaleY = (canvasRect.height - padding * 2) / boundsHeight;
        const scale = Math.min(scaleX, scaleY, 2); // Cap max zoom
        
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        
        this.transform.scale = scale;
        this.transform.x = canvasRect.width / 2 - centerX * scale;
        this.transform.y = canvasRect.height / 2 - centerY * scale;
    }

    public destroy(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.wheelGestures && typeof this.wheelGestures.destroy === 'function') {
            this.wheelGestures.destroy();
        }
    }
}
