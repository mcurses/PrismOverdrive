import { SparkBurst } from "./SparkEmitter";
import { SparkStageConfig } from "./SparkConfig";
import { SmokeStageConfig } from "./SmokeConfig";
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
    type: 'spark' | 'smoke';
    composite: GlobalCompositeOperation | null;
    growthRate: number;
    anisotropy: number;
    turbulenceAmp: number;
    turbulenceFreq: number;
    swirlPerSecond: number;
    noisePhase: number;
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
                dragPerSecond: 0.7, followFactor: 0.1, active: false,
                type: 'spark', composite: null, growthRate: 0, anisotropy: 1,
                turbulenceAmp: 0, turbulenceFreq: 0, swirlPerSecond: 0, noisePhase: 0
            });
        }
    }

    spawnFromBurst(burst: SparkBurst, stageResolver: (stageId: string) => SparkStageConfig | SmokeStageConfig | null, player: any, playerId?: string): void {
        const stage = stageResolver(burst.stageId);
        if (!stage) return;

        const isSmoke = isSmokeStage(stage);
        const renderType = isSmoke ? 'smoke' : stage.render || 'spark';

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

        const sampleRange = (range: [number, number]) => range[0] + rng() * (range[1] - range[0]);

        // Spawn particles
        for (let i = 0; i < burst.count; i++) {
            const particle = this.getInactiveParticle();
            if (!particle) break;

            // Sample properties using deterministic RNG
            const speed = sampleRange(stage.speedRange);
            const spreadRad = (stage.spreadDeg * Math.PI / 180);
            const angleOffset = (rng() - 0.5) * spreadRad;
            const jitterOffset = (rng() - 0.5) * stage.jitter;
            const angle = burst.dirAngle + angleOffset + jitterOffset;

            const sampledSize = sampleRange(stage.sizeRange);
            const size = renderType === 'smoke' ? sampledSize : 1 + sampledSize; // No bump for smoke
            const ttl = sampleRange(stage.ttlRangeMs);

            // Get color from stage style using real player data and progress
            const color = stage.style(player, burst.progress, burst.targetTag);

            // Sample smoke-specific properties
            const growthRate = isSmoke ? sampleRange(stage.growthRange) : 0;
            const anisotropy = isSmoke ? sampleRange(stage.anisotropyRange) : 1;
            const turbulenceAmp = isSmoke ? sampleRange(stage.turbulenceAmpRange) : 0;
            const turbulenceFreq = isSmoke ? sampleRange(stage.turbulenceFreqRange) : 0;
            const swirlPerSecond = isSmoke ? sampleRange(stage.swirlPerSecondRange) : 0;
            
            // Initialize particle
            particle.x = burst.x;
            particle.y = burst.y;
            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.size = size;
            particle.ageMs = 0;
            particle.ttlMs = renderType === 'smoke' ? Math.min(ttl, 3000) : Math.min(ttl, 1500);
            particle.h = color.h;
            particle.s = color.s;
            particle.b = color.b;
            particle.a0 = color.a || 1.0;
            particle.dragPerSecond = stage.dragPerSecond;
            particle.followFactor = stage.followFactor;
            particle.type = renderType;
            particle.composite = isSmoke ? stage.composite : null;
            particle.growthRate = growthRate;
            particle.anisotropy = anisotropy;
            particle.turbulenceAmp = turbulenceAmp;
            particle.turbulenceFreq = turbulenceFreq;
            particle.swirlPerSecond = swirlPerSecond;
            particle.noisePhase = rng() * Math.PI * 2;
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

            // Apply smoke-specific effects
            if (particle.type === 'smoke') {
                // Apply swirl
                if (particle.swirlPerSecond > 0) {
                    const swirlAngle = particle.swirlPerSecond * dtSec * 0.25; // subtle factor
                    const cos = Math.cos(swirlAngle);
                    const sin = Math.sin(swirlAngle);
                    const newVx = particle.vx * cos - particle.vy * sin;
                    const newVy = particle.vx * sin + particle.vy * cos;
                    particle.vx = newVx;
                    particle.vy = newVy;
                }

                // Apply turbulence
                if (particle.turbulenceAmp > 0 && particle.turbulenceFreq > 0) {
                    particle.noisePhase += particle.turbulenceFreq * dtSec;
                    const turbX = Math.sin(particle.noisePhase) * particle.turbulenceAmp * dtSec;
                    const turbY = Math.cos(particle.noisePhase * 1.3) * particle.turbulenceAmp * dtSec;
                    particle.x += turbX;
                    particle.y += turbY;
                }

                // Apply growth
                if (particle.growthRate > 0) {
                    particle.size += particle.growthRate * dtSec;
                }
            }

            // Update position
            particle.x += particle.vx * dtSec;
            particle.y += particle.vy * dtSec;
        }
    }

    draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        // Pass 1: Draw smoke particles with source-over
        ctx.globalCompositeOperation = 'source-over';
        for (const particle of this.particles) {
            if (!particle.active || particle.type !== 'smoke') continue;

            const ageRatio = particle.ageMs / particle.ttlMs;
            let alpha: number;

            // Apply alpha profile for smoke (tail profile)
            if (ageRatio < 0.15) {
                alpha = particle.a0 * (ageRatio / 0.15);
            } else {
                alpha = particle.a0 * ((1 - ageRatio) * 0.9 + 0.1);
            }
            
            if (alpha <= 0.01) continue;

            // Draw smoke as elliptical radial gradient
            this.drawSmokeParticle(ctx, particle, alpha);
        }

        // Pass 2: Draw spark particles with overlay (existing behavior)
        ctx.globalCompositeOperation = 'overlay';
        for (const particle of this.particles) {
            if (!particle.active || particle.type !== 'spark') continue;

            // Calculate alpha based on age (with minimum for visibility)
            const ageRatio = particle.ageMs / particle.ttlMs;
            const alpha = Math.max(0.25, particle.a0 * (1 - ageRatio));
            
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

    private drawSmokeParticle(ctx: CanvasRenderingContext2D, particle: Particle, alpha: number): void {
        ctx.save();

        // Calculate velocity angle for anisotropy
        const velAngle = Math.atan2(particle.vy, particle.vx);
        
        // Create radial gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, particle.size);
        
        // Three stops: inner, mid, edge
        const innerColor = new HSLColor(particle.h, particle.s, particle.b, alpha * 0.6);
        const midColor = new HSLColor(particle.h, particle.s, particle.b, alpha * 0.35);
        const edgeColor = new HSLColor(particle.h, particle.s, particle.b, 0);
        
        gradient.addColorStop(0.0, innerColor.toCSS());
        gradient.addColorStop(0.5, midColor.toCSS());
        gradient.addColorStop(1.0, edgeColor.toCSS());

        // Transform to particle position and orientation
        ctx.translate(particle.x, particle.y);
        ctx.rotate(velAngle);
        ctx.scale(particle.anisotropy, 1); // Stretch along velocity direction

        // Draw the gradient circle
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
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

function isSmokeStage(stage: SparkStageConfig | SmokeStageConfig): stage is SmokeStageConfig {
    return (stage as SmokeStageConfig).composite !== undefined;
}
