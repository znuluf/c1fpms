/** The count range of a size grade; the ungraded grade has neither end. */
export interface GradeCount {
    minCountPerKg?: number | null;
    maxCountPerKg?: number | null;
}

/**
 * DEC-140: the shrimp in a harvest estimated from its weight and ABW, as the server counts them
 * (IndicatorCalculator.HarvestedPieces): graded kg × the grade's middle count per kg, and all other kg × 1,000 ÷ ABW.
 * A real count is not applied here; the screen shows it beside the estimate. Null until there is enough to work from.
 */
export function estimatedPieces(totalKg: number, abwG: number, lines: (GradeCount & { kg: number })[] = []): number | null {
    const total = Number(totalKg) || 0;
    if (total <= 0) {
        return null;
    }
    let gradedKg = 0;
    let graded = 0;
    for (const line of lines) {
        const min = line.minCountPerKg ?? line.maxCountPerKg;
        const max = line.maxCountPerKg ?? line.minCountPerKg;
        if (min != null && max != null) {
            const kg = Number(line.kg) || 0;
            gradedKg += kg;
            graded += (kg * (min + max)) / 2;
        }
    }
    const otherKg = Math.max(0, total - gradedKg);
    const abw = Number(abwG) || 0;
    if (otherKg > 0 && abw <= 0) {
        return null;
    }
    return Math.round(graded + (otherKg > 0 ? (otherKg * 1000) / abw : 0));
}
