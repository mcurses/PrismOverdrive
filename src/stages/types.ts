import Player from "../components/Player/Player";

export interface EffectStageConfig {
    id: string;
    enabled: boolean;
    when(player: Player): boolean;
    progress(player: Player): number;
}

export type StageTraitKey = 'trail' | 'spark' | 'smoke';

export type StageId =
    | 'stage1'
    | 'stage2'
    | 'stage3'
    | 'stage4'
    | 'stage5'
    | 'stage6'
    | 'stage7'
    | 'stage8';

export interface StageScoreWindow {
    min: number;
    max: number | null;
}

export interface StageDefinition {
    id: StageId;
    score: StageScoreWindow;
}
