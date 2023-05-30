import {HSLColor} from "../../utils/HSLColor";

export function driftColor(driftScore: number, frameScore: number, score: number) {
    return new HSLColor(
        driftScore / 12,
        score / 20,
        score / 10
    )
}
