import {HSLColor} from "../../utils/HSLColor";

export function driftColor(driftScore: number, frameScore: number, score: number) {
    let hue = (driftScore / 12) % 360
    let factor = 1 + Math.floor(driftScore / 12 / 360)
    hue = (hue * factor) % 360
    if (driftScore > 30000) {
        hue *= 1 + Math.floor(frameScore / 100 * driftScore / 12 / 360)
    }
    return new HSLColor(
        hue,
        driftScore / 2 + 50 * frameScore,
        driftScore / 1000 + frameScore * frameScore / 10,
        // score / 20,
        // score / 100
    )
}
