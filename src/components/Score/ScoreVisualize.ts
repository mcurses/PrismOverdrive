import {HSLColor} from "../../utils/HSLColor";
import Score from "./Score";
import {clamp} from "../../utils/Utils";

// let prevHue = 0

export function driftColor(score: Score) {
    // console.log(score)
    // if (!score.getFrameScoreAverage) return new HSLColor(0, 0, 0)

    const {driftScore, frameScore} = score
    let hue = (driftScore / 10) % 360
    // a sine wave that oscillates between 0 and 1 once per second and gets faster with higher frameScore
    let sine = .5 + .5 * Math.sin(Date.now() / 1000 / 5 /
        clamp(1, 1 + score.getFrameScoreAverage(20) / 100, 4))


    // console.log(sine)


    let saturation = (driftScore / 2 + 50 * frameScore)// * sine
    // console.log(Math.floor(prevHue-hue))
    // prevHue = hue
    // let factor = 1 + Math.floor(driftScore / 360)
    // hue = (hue * factor) % 360
    if (driftScore > 30000) {
        // console.log("over 30000")
        let overScore = ((driftScore - 30000) / 1000)
        saturation = saturation / 800
        // console.log(saturation)
        // hue *= Math.max(1, 1 + frameScore / 10)
        // console.log(~~frameScore, ~~hue)
        // hue = hue % 360
    }
    saturation = saturation > 100 ? 100 : saturation
    // console.log(hue)
    return new HSLColor(
        hue,
        saturation,
        driftScore / 1000 + frameScore * frameScore / 10,
        // score / 20,
        // score / 100
    )
}

export function driftWeight(driftScore: number, frameScore: number) {
    let weight = frameScore * .1 * Math.max(1, driftScore / 1000);
    return weight > 50 ? 50 : weight
}