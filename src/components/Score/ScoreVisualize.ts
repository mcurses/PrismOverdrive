import {HSLColor} from "../../utils/HSLColor";

export function driftColor(driftScore: number, frameScore: number, score: number) {
    let hue = (driftScore / 12) % 360
    hue = (hue * (1 + Math.floor(driftScore / 12 / 360))) % 360
    return new HSLColor(
        hue,
        driftScore / 2 + 50 * frameScore,
        driftScore / 1000 + frameScore * frameScore /10,
        // score / 20,
        // score / 100
    )
}
