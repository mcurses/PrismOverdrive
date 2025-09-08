import { Dimensions } from '../utils/Utils';

interface TrackData {
  bounds: number[][][];
  mapSize?: Dimensions;
}

const THUMB_CACHE_PREFIX = 'thumb:';
const THUMB_SIZE = { width: 240, height: 180 };
const PADDING = 12;

export async function getTrackThumb(
  idOrName: string, 
  track: TrackData, 
  cacheKeyExtra?: string
): Promise<string> {
  const cacheKey = `${THUMB_CACHE_PREFIX}${idOrName}:${cacheKeyExtra || 'default'}`;
  
  try {
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (error) {
    console.warn('Failed to read thumbnail cache:', error);
  }

  // Generate thumbnail
  const dataURL = await generateThumbnail(track);
  
  try {
    // Cache the result
    localStorage.setItem(cacheKey, dataURL);
  } catch (error) {
    console.warn('Failed to cache thumbnail:', error);
  }
  
  return dataURL;
}

async function generateThumbnail(track: TrackData): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE.width;
    canvas.height = THUMB_SIZE.height;
    const ctx = canvas.getContext('2d')!;
    
    // Clear with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Add subtle background pattern for contrast
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    if (!track.bounds || track.bounds.length === 0) {
      // Empty track - just show a placeholder
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(PADDING, PADDING, canvas.width - PADDING * 2, canvas.height - PADDING * 2);
      resolve(canvas.toDataURL());
      return;
    }
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const ring of track.bounds) {
      for (const point of ring) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    }
    
    if (minX === Infinity) {
      resolve(canvas.toDataURL());
      return;
    }
    
    // Calculate scale to fit in canvas with padding
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const availableWidth = canvas.width - PADDING * 2;
    const availableHeight = canvas.height - PADDING * 2;
    
    const scale = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);
    
    // Center the drawing
    const offsetX = PADDING + (availableWidth - boundsWidth * scale) / 2;
    const offsetY = PADDING + (availableHeight - boundsHeight * scale) / 2;
    
    // Draw bounds
    for (let ringIndex = 0; ringIndex < track.bounds.length; ringIndex++) {
      const ring = track.bounds[ringIndex];
      if (ring.length < 2) continue;
      
      // Outer ring (track boundary) in white, inner rings (holes) in grey
      ctx.strokeStyle = ringIndex === 0 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(128, 128, 128, 0.7)';
      ctx.lineWidth = ringIndex === 0 ? 2 : 1.5;
      ctx.setLineDash([]);
      
      ctx.beginPath();
      const firstPoint = ring[0];
      ctx.moveTo(
        offsetX + (firstPoint[0] - minX) * scale,
        offsetY + (firstPoint[1] - minY) * scale
      );
      
      for (let i = 1; i < ring.length; i++) {
        const point = ring[i];
        ctx.lineTo(
          offsetX + (point[0] - minX) * scale,
          offsetY + (point[1] - minY) * scale
        );
      }
      
      ctx.closePath();
      ctx.stroke();
    }
    
    resolve(canvas.toDataURL());
  });
}

export function clearThumbnailCache(idOrName?: string): void {
  try {
    if (idOrName) {
      // Clear specific track thumbnails
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(`${THUMB_CACHE_PREFIX}${idOrName}:`)
      );
      keys.forEach(key => localStorage.removeItem(key));
    } else {
      // Clear all thumbnails
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(THUMB_CACHE_PREFIX)
      );
      keys.forEach(key => localStorage.removeItem(key));
    }
  } catch (error) {
    console.warn('Failed to clear thumbnail cache:', error);
  }
}
