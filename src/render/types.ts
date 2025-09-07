export type ViewRect = { x: number; y: number; w: number; h: number };

export type CanvasDeps = { 
    main: CanvasRenderingContext2D; 
    track: CanvasRenderingContext2D; 
    miniMap: CanvasRenderingContext2D; 
};
