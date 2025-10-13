# Stage Configuration Unification Proposal

## Goals
- Define each scoring stage once while keeping trail, spark, and smoke behaviours configurable.
- Make it easy to answer "what happens in stage X?" without jumping across multiple files.
- Reduce copy/paste of boundary calculations and gradient helpers.
- Keep runtime code fast by preparing stage lookups at load time.

## Current Pain Points
- The numeric boundaries live in `TrailConfig.ts`, but every particle module re-imports helpers and rewrites per-stage logic.
- Stage ids are duplicated (`stage1-tires`, `stage1-sparks`, `stage1-smoke`, …) which makes cross-feature synchronisation manual.
- Sparks and smoke share a `SparkStageConfig` type even though smoke needs extra fields. That makes intent unclear.
- Adding a new stage requires edits in at least three files and careful manual consistency checks.

## Proposed Structure

```
src/stages/
  StageRegistry.ts
  presets/
    defaultStages.ts
  traits/
    trails.ts
    sparks.ts
    smoke.ts
```

### `StageRegistry`
- Owns the canonical `StageDefinition` describing score window, activation conditions, and metadata.
- Provides typed slots for each effect family (`trail`, `spark`, `smoke`). Each slot references a **trait** function that turns a base stage definition into runtime config for that subsystem.
- Exports helpers like `getStage(id)` and `getAllStages()` plus narrow selectors (`getTrailStages()` etc.) to keep emitters unchanged.

### Traits
- Move effect-specific logic (colour gradients, particle ranges) into composable trait factories. Example:
  ```ts
  export const rainbowTrails = (stage: StageDefinition) => ({
      id: stage.id + '-trail',
      when: stage.when,
      progress: stage.progress,
      ...
  });
  ```
- Trails, sparks, and smoke stop duplicating boundary lookups because the stage argument already contains them.
- Traits can be re-used across multiple stages (e.g. "basic smoke", "high-energy sparks"), making the palette easier to evolve.

### Presets
- `defaultStages.ts` becomes the single place to list all stages and assign traits:
  ```ts
  registerStage('stage1', {
      score: { min: 0, max: 80_000 },
      traits: {
          trail: entryTrail,
          spark: mellowSparks,
          smoke: lightSmoke,
      }
  });
  ```
- Preset file exports `buildDefaultStageRegistry()` which the `ServerConnection` can call to seed emitters.

## Type Improvements
- Split the current `SparkStageConfig` into `SparkStageConfig` and `SmokeStageConfig` so each system uses explicit fields.
- Introduce shared base types (`EffectStageConfig`) to capture the `id`, `enabled`, `when`, and `progress` contract.
- Add literal union ids (`'stage1' | 'stage2' | …`) derived from the registry so tooling can autocomplete.

## Runtime Flow
1. On startup, call `buildDefaultStageRegistry()`.
2. Registry builds ordered arrays for each subsystem (`registry.getTrailStages()` etc.).
3. Emitters consume those arrays unchanged, but future emitters can request stage data by logical id (`registry.findStage('stage4')`).
4. When adding or modifying a stage, only `defaultStages.ts` needs changes unless a brand-new trait is needed.

## Migration Steps
1. Create the new folder structure and move boundary helpers (`bounds`, gradients) into shared utilities under `stages/`.
2. Define trait factories mirroring existing behaviour (start with direct copies of current stage configs).
3. Add `StageRegistry` and a builder that wires traits to stage definitions.
4. Update emitters (`TrailEmitter`, `SparkEmitter`, `SmokeEmitter`) to consume registry outputs instead of calling disparate `getDefault…` functions.
5. Remove legacy config files once parity is confirmed.
6. Optional: write tests that ensure every registered stage declares all required traits and score ranges are non-overlapping.

## Benefits
- Single source of truth for stage lifecycle and score windows.
- Clear mapping of gameplay stages to visual/audio effects.
- Easier experimentation: swap traits or add temporary variants in one place.
- Stronger TypeScript types reduce runtime checks and mistakes.
- Precomputed registry keeps runtime overhead minimal.

## Future Extensions
- Allow feature flags or themes by exporting different presets (`default`, `retro`, `neon`), each produced from the same trait library.
- Add tooling to preview a stage by calling `registry.simulate('stage5')` in dev UIs.
- Persist last-used stage configuration to remote storage for analytics/testing.

