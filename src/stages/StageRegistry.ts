import type Player from "../components/Player/Player";
import { clamp } from "../utils/Utils";
import { TrailStageConfig } from "../trails/TrailConfig";
import { SparkStageConfig } from "../particles/SparkConfig";
import { SmokeStageConfig } from "../particles/SmokeConfig";
import { StageDefinition, StageId, StageScoreWindow } from "./types";

export interface StageContext extends StageDefinition {
    index: number;
    score: StageScoreWindow;
    when(player: Player): boolean;
    progress(player: Player, opts?: ProgressOptions): number;
}

export interface ProgressOptions {
    padStart?: number;
    padEnd?: number;
    fallbackSpan?: number;
}

type StageTraitFactories = {
    trail: StageTraitFactory<TrailStageConfig>;
    spark: StageTraitFactory<SparkStageConfig>;
    smoke: StageTraitFactory<SmokeStageConfig>;
};

type StageTraitFactory<T> = (stage: StageContext) => T;

type StageRegistration = StageDefinition & {
    traits: Partial<StageTraitFactories>;
};

type StageEntry = {
    context: StageContext;
    traits: Partial<StageTraitFactories>;
};

export class StageRegistry {
    private readonly stages: StageContext[];
    private readonly stageMap: Map<StageId, StageContext>;
    private readonly trailStages: TrailStageConfig[];
    private readonly sparkStages: SparkStageConfig[];
    private readonly smokeStages: SmokeStageConfig[];

    constructor(entries: StageEntry[]) {
        this.stages = entries.map(entry => entry.context);
        this.stageMap = new Map(this.stages.map(stage => [stage.id, stage]));

        this.trailStages = entries
            .filter(entry => entry.traits.trail)
            .map(entry => entry.traits.trail!(entry.context));

        this.sparkStages = entries
            .filter(entry => entry.traits.spark)
            .map(entry => entry.traits.spark!(entry.context));

        this.smokeStages = entries
            .filter(entry => entry.traits.smoke)
            .map(entry => entry.traits.smoke!(entry.context));
    }

    getStageIds(): StageId[] {
        return this.stages.map(stage => stage.id);
    }

    getAllStages(): StageContext[] {
        return this.stages.slice();
    }

    findStage(id: StageId): StageContext | undefined {
        return this.stageMap.get(id);
    }

    getTrailStages(): TrailStageConfig[] {
        return this.trailStages.slice();
    }

    getSparkStages(): SparkStageConfig[] {
        return this.sparkStages.slice();
    }

    getSmokeStages(): SmokeStageConfig[] {
        return this.smokeStages.slice();
    }
}

export class StageRegistryBuilder {
    private readonly registrations: StageRegistration[] = [];

    registerStage(id: StageId, config: { score: StageScoreWindow; traits: Partial<StageTraitFactories> }) {
        if (this.registrations.some(reg => reg.id === id)) {
            throw new Error(`Stage '${id}' already registered`);
        }
        this.registrations.push({ id, score: config.score, traits: config.traits });
    }

    build(): StageRegistry {
        const sorted = this.registrations
            .slice()
            .sort((a, b) => a.score.min - b.score.min)
            .map((registration, index) => ({
                context: createContext(registration, index),
                traits: registration.traits,
            }));

        return new StageRegistry(sorted);
    }
}

function createContext(stage: StageRegistration, index: number): StageContext {
    return {
        id: stage.id,
        score: stage.score,
        index,
        when(player: Player) {
            const hi = stage.score.max ?? Number.POSITIVE_INFINITY;
            const score = player.score.driftScore;
            return player.car.isDrifting && score >= stage.score.min && score < hi;
        },
        progress(player: Player, opts?: ProgressOptions) {
            const padStart = opts?.padStart ?? 0;
            const padEnd = opts?.padEnd ?? 0;
            const fallbackSpan = opts?.fallbackSpan ?? 30000;
            const start = stage.score.min + padStart;
            const end = (stage.score.max ?? (stage.score.min + fallbackSpan)) - padEnd;
            const span = Math.max(1, end - start);
            return clamp((player.score.driftScore - start) / span, 0, 1);
        },
    };
}
