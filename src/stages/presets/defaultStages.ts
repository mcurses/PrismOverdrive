import { StageRegistry, StageRegistryBuilder } from "../StageRegistry";
import { entryTrail, spectrumTrail, cyclesTrail, centerpieceTrail } from "../traits/trails";
import { entrySparks, spectrumSparks, cycleSparks, centerpieceSparks } from "../traits/sparks";
import { entrySmoke, cycleSmoke, darkSmoke } from "../traits/smoke";

export function buildDefaultStageRegistry(): StageRegistry {
    const builder = new StageRegistryBuilder();

    builder.registerStage('stage1', {
        score: { min: 0, max: 80_000 },
        traits: {
            trail: entryTrail,
            spark: entrySparks,
            smoke: entrySmoke,
        },
    });

    builder.registerStage('stage2', {
        score: { min: 80_000, max: 140_000 },
        traits: {
            trail: spectrumTrail,
            spark: spectrumSparks,
        },
    });

    builder.registerStage('stage3', {
        score: { min: 140_000, max: 240_000 },
        traits: {
            trail: cyclesTrail,
            spark: cycleSparks,
            smoke: cycleSmoke,
        },
    });

    builder.registerStage('stage4', {
        score: { min: 240_000, max: 400_000 },
        traits: {
            trail: centerpieceTrail,
            spark: centerpieceSparks,
        },
    });

    builder.registerStage('stage5', {
        score: { min: 400_000, max: 600_000 },
        traits: {
            trail: centerpieceTrail,
            spark: centerpieceSparks,
            smoke: darkSmoke,
        },
    });

    builder.registerStage('stage6', {
        score: { min: 600_000, max: 4_400_000 },
        traits: {
            trail: centerpieceTrail,
            spark: centerpieceSparks,
            smoke: darkSmoke,
        },
    });

    return builder.build();
}
