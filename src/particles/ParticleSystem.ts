import { SparkBurst } from "./SparkEmitter";
import { SparkStageConfig } from "./SparkConfig";
import { HSLColor } from "../utils/HSLColor";
import { clamp } from "../utils/Utils";

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    ageMs: number;
    ttlMs: number;
    h: number;
    s: number;
    b: number;
    a0: number;
    dragPerSecond: number;
    followFactor: number;
    active: boolean;
}

interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export class ParticleSystem {
    private particles: Particle[] = [];
    private maxParticles: number = 2000;
    private maxPerPlayer: number = 150;
    private playerParticleCounts: Map<string, number> = new Map();

    constructor(maxParticles: number = 2000, maxPerPlayer: number = 150) {
        this.maxParticles = maxParticles;
        this.maxPerPlayer = maxPerPlayer;
        
        // Pre-allocate particle pool
        for (let i = 0; i < maxParticles; i++) {
            this.particles.push({
                x: 0, y: 0, vx: 0, vy: 0, size: 1,
                ageMs: 0, ttlMs: 1000, h: 0, s: 0, b: 0, a0: 1,
                dragPerSecond: 0.7, followFactor: 0.1, active: false
            });
        }
    }

    spawnFromBurst(burst: SparkBurst, stageResolver: (stageId: string) => SparkStageConfig | null, playerId?: string): void {
        const stage = stageResolver(burst.stageId);
        if (!stage) return;

        // Check per-player limits
        if (playerId) {
            const currentCount = this.playerParticleCounts.get(playerId) || 0;
            if (currentCount >= this.maxPerPlayer) {
                // Reduce burst count if over limit
                burst.count = Math.floor(burst.count * 0.5);
            }
        }

        // Check global limits
        const activeCount = this.particles.filter(p => p.active).length;
        if (activeCount >= this.maxParticles) {
            // Shorten TTL and reduce count
            burst.ttlMs = Math.floor(burst.ttlMs * 0.7);
            burst.count = Math.floor(burst.count * 0.5);
        }

        // Initialize PRNG with burst seed
        const rng = this.mulberry32(burst.seed);

        // Spawn particles
        for (let i = 0; i < burst.count; i++) {
            const particle = this.getInactiveParticle();
            if (!particle) break;

            // Sample properties using deterministic RNG
            const speed = stage.speedRange[0] + rng() * (stage.speedRange[1] - stage.speedRange[0]);
            const spreadRad = (stage.spreadDeg * Math.PI / 180);
            const angleOffset = (rng() - 0.5) * spreadRad;
            const jitterOffset = (rng() - 0.5) * stage.jitter;
            const angle = burst.dirAngle + angleOffset + jitterOffset;
            
            const size = stage.sizeRange[0] + rng() * (stage.sizeRange[1] - stage.sizeRange[0]);
            const ttl = stage.ttlRangeMs[0] + rng() * (stage.ttlRangeMs[1] - stage.ttlRangeMs[0]);
            
            // Get color from stage style
            const progress = 0.5; // Could be derived from burst properties
            const color = stage.style({ score: { frameScore: 10, driftScore: burst.slip * 1000 } } as any, progress);
            
            // Initialize particle
            particle.x = burst.x;
            particle.y = burst.y;
            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.size = size;
            particle.ageMs = 0;
            particle.ttlMs = Math.min(ttl, 1500); // Hard cap at 1500ms
            particle.h = color.h;
            particle.s = color.s;
            particle.b = color.b;
            particle.a0 = color.a || 1.0;
            particle.dragPerSecond = stage.dragPerSecond;
            particle.followFactor = stage.followFactor;
            particle.active = true;
        }

        // Update player particle count
        if (playerId) {
            const newCount = (this.playerParticleCounts.get(playerId) || 0) + burst.count;
            this.playerParticleCounts.set(playerId, newCount);
        }
    }

    update(dtMs: number, carVelNearFn?: (x: number, y: number) => { vx: number, vy: number } | null, viewRect?: ViewRect): void {
        const dtSec = dtMs / 1000;
        const margin = 100; // Cull margin

        // Reset player counts
        this.playerParticleCounts.clear();

        for (const particle of this.particles) {
            if (!particle.active) continue;

            // Age the particle
            particle.ageMs += dtMs;
            if (particle.ageMs >= particle.ttlMs) {
                particle.active = false;
                continue;
            }

            // Cull particles outside view
            if (viewRect) {
                if (particle.x < viewRect.x - margin || 
                    particle.x > viewRect.x + viewRect.w + margin ||
                    particle.y < viewRect.y - margin || 
                    particle.y > viewRect.y + viewRect.h + margin) {
                    continue; // Skip update but keep active for when it comes back into view
                }
            }

            // Apply drag
            const dragFactor = Math.pow(particle.dragPerSecond, dtSec);
            particle.vx *= dragFactor;
            particle.vy *= dragFactor;

            // Apply follow advection
            if (carVelNearFn && particle.followFactor > 0) {
                const carVel = carVelNearFn(particle.x, particle.y);
                if (carVel) {
                    const followStrength = particle.followFactor * dtSec;
                    particle.vx += (carVel.vx - particle.vx) * followStrength;
                    particle.vy += (carVel.vy - particle.vy) * followStrength;
                }
            }

            // Update position
            particle.x += particle.vx * dtSec;
            particle.y += particle.vy * dtSec;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // Additive blending

        for (const particle of this.particles) {
            if (!particle.active) continue;

            // Calculate alpha based on age
            const ageRatio = particle.ageMs / particle.ttlMs;
            const alpha = particle.a0 * (1 - ageRatio);
            
            if (alpha <= 0.01) continue; // Skip nearly transparent particles

            // Ease-in/out brightness
            let brightnessMult = 1;
            if (ageRatio < 0.2) {
                brightnessMult = ageRatio / 0.2; // Ease in
            } else if (ageRatio > 0.8) {
                brightnessMult = (1 - ageRatio) / 0.2; // Ease out
            }

            const color = new HSLColor(particle.h, particle.s, particle.b * brightnessMult, alpha);
            ctx.fillStyle = color.toCSS();

            // Draw as small quad
            const halfSize = particle.size / 2;
            ctx.fillRect(particle.x - halfSize, particle.y - halfSize, particle.size, particle.size);
        }

        ctx.restore(); // Restore composite operation
    }

    private getInactiveParticle(): Particle | null {
        for (const particle of this.particles) {
            if (!particle.active) return particle;
        }
        return null;
    }

    // Simple deterministic PRNG (mulberry32)
    private mulberry32(seed: number): () => number {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    getActiveParticleCount(): number {
        return this.particles.filter(p => p.active).length;
    }
}
