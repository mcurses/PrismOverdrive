export function polylineLength(points: number[][]): number {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1][0] - points[i][0];
        const dy = points[i + 1][1] - points[i][1];
        length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
}

export function cumulativeArcLength(points: number[][]): number[] {
    const lengths = [0];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1][0] - points[i][0];
        const dy = points[i + 1][1] - points[i][1];
        total += Math.sqrt(dx * dx + dy * dy);
        lengths.push(total);
    }
    return lengths;
}

export function resampleClosedPolyline(points: number[][], N: number): number[][] {
    if (points.length < 2) return points;
    
    // Close the polyline if not already closed
    const closed = [...points];
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        closed.push([first[0], first[1]]);
    }
    
    const totalLength = polylineLength(closed);
    const segmentLength = totalLength / N;
    const cumLengths = cumulativeArcLength(closed);
    
    const resampled: number[][] = [];
    
    for (let i = 0; i < N; i++) {
        const targetLength = i * segmentLength;
        
        // Find the segment containing this target length
        let segmentIndex = 0;
        while (segmentIndex < cumLengths.length - 1 && cumLengths[segmentIndex + 1] < targetLength) {
            segmentIndex++;
        }
        
        if (segmentIndex >= closed.length - 1) {
            // Handle edge case - use last point
            resampled.push([closed[closed.length - 1][0], closed[closed.length - 1][1]]);
            continue;
        }
        
        const segmentStart = cumLengths[segmentIndex];
        const segmentEnd = cumLengths[segmentIndex + 1];
        const segmentProgress = segmentEnd > segmentStart ? 
            (targetLength - segmentStart) / (segmentEnd - segmentStart) : 0;
        
        // Interpolate between the two points
        const p0 = closed[segmentIndex];
        const p1 = closed[segmentIndex + 1];
        const x = p0[0] + segmentProgress * (p1[0] - p0[0]);
        const y = p0[1] + segmentProgress * (p1[1] - p0[1]);
        
        resampled.push([x, y]);
    }
    
    return resampled;
}
