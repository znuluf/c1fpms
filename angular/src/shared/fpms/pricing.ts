/**
 * Sale pricing methods (DEC-80, DEC-82), the same arithmetic as the server's SaleLine helpers, so a form shows the price
 * the server will check. The server stays the authority: it recomputes and warns when the agreed price differs.
 *
 * 1 Fixed · 2 Base ABW (base price at a base ABW + step per gram) · 3 Base count (base price at a base count + step per
 * piece fewer) · 4 Price table (the row covering the count).
 */
export const PRICE_METHODS = [
    { value: 1, label: 'Fixed price' },
    { value: 2, label: 'Base ABW pricing' },
    { value: 3, label: 'Base count pricing' },
    { value: 4, label: 'Price table' },
];

const money = (v: number) => Math.round(v * 100) / 100;

export function num(v: any): number | null {
    return v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
}

export function wholeCount(count: number): number {
    return Math.round(count);
}

/** Pieces per kg from ABW, whole: 1000 ÷ 12.08 g = 82.8 → 83. */
export function countFromAbw(abwG: number | null): number | null {
    return abwG && abwG > 0 ? wholeCount(1000 / (Math.round(abwG * 100) / 100)) : null;
}

export function baseAbwPrice(base: number, baseAbwG: number, stepPerG: number, abwG: number): number {
    return money(base + (Math.round(abwG * 100) / 100 - baseAbwG) * stepPerG);
}

/** Fewer pieces per kg (bigger shrimp) pay more. */
export function baseCountPrice(base: number, baseCount: number, stepPerCount: number, count: number): number {
    return money(base + (baseCount - wholeCount(count)) * stepPerCount);
}

/** The table row covering a whole count, or null. Rows: { minCountPerKg, maxCountPerKg, pricePerKg, label }. */
export function tableRow(table: any, count: number | null): any {
    if (!table || count == null) {
        return null;
    }
    const c = wholeCount(count);
    return (
        [...(table.rows ?? [])]
            .sort((a, b) => (a.minCountPerKg ?? 0) - (b.minCountPerKg ?? 0))
            .find((r) => (r.minCountPerKg == null || c >= r.minCountPerKg) && (r.maxCountPerKg == null || c <= r.maxCountPerKg)) ?? null
    );
}

/**
 * The saved sale line whose price-table price still applies, or null when the table is looked up again. The server's rule:
 * a saved line keeps its price and row while its grade, table, count and the sale's buyer are unchanged, even if the table
 * has been edited or deactivated since. `sale` is the saved sale (Sale/Get), null for a new one.
 */
export function savedTableLine(t: any, countPerKg: number | null, buyerId: string, sale: any): any {
    if (t.priceMethod !== 4 || countPerKg == null || !sale || sale.buyerId !== buyerId) {
        return null;
    }
    const line = (sale.lines ?? []).find((l: any) => l.harvestGradeLineId === t.harvestGradeLineId);
    return line && line.priceMethod === 4 && line.priceTableId === t.priceTableId && line.priceCountPerKg === countPerKg ? line : null;
}

/**
 * The price a line's method gives, or null while a term is missing (and for Fixed). `abwG` and `countPerKg` are the values
 * the line uses (typed, else the harvest's ABW or the grade's middle count); `tables` are the price tables loaded; `saved`
 * is the result of `savedTableLine`.
 */
export function referencePrice(t: any, abwG: number | null, countPerKg: number | null, tables: any[], saved: any = null): number | null {
    const base = num(t.basePricePerKg);
    switch (t.priceMethod) {
        case 2: {
            const baseAbw = num(t.baseAbwG), step = num(t.stepPerG);
            return base == null || baseAbw == null || step == null || abwG == null ? null : baseAbwPrice(base, baseAbw, step, abwG);
        }
        case 3: {
            const baseCount = num(t.baseCountPerKg), step = num(t.stepPerCount);
            return base == null || baseCount == null || step == null || countPerKg == null ? null : baseCountPrice(base, baseCount, step, countPerKg);
        }
        case 4: {
            if (saved) {
                return num(saved.formulaPricePerKg);
            }
            const row = tableRow(tables.find((x) => x.id === t.priceTableId), countPerKg);
            return row ? Number(row.pricePerKg) : null;
        }
        default:
            return null;
    }
}

/** The fields to send for a method; the others are sent empty. */
export function pricingBody(t: any): any {
    const method = Number(t.priceMethod ?? 1);
    const isBaseAbw = method === 2;
    const isBaseCount = method === 3;
    const isTable = method === 4;
    return {
        priceMethod: method >= 1 && method <= 4 ? method : 1,
        basePricePerKg: isBaseAbw || isBaseCount ? num(t.basePricePerKg) : null,
        baseAbwG: isBaseAbw ? num(t.baseAbwG) : null,
        stepPerG: isBaseAbw ? num(t.stepPerG) : null,
        priceAbwG: isBaseAbw ? num(t.priceAbwG) : null,
        baseCountPerKg: isBaseCount ? num(t.baseCountPerKg) : null,
        stepPerCount: isBaseCount ? num(t.stepPerCount) : null,
        priceCountPerKg: isBaseCount || isTable ? num(t.priceCountPerKg) : null,
        priceTableId: isTable ? (t.priceTableId || null) : null,
    };
}

/** Copies a buyer's last terms (from Sale/GetBuyerPriceTerms) onto a line when the method matches and nothing is typed yet. */
export function applyTerms(target: any, terms: any): boolean {
    if (!terms || Number(terms.priceMethod) !== Number(target.priceMethod)) {
        return false;
    }
    switch (terms.priceMethod) {
        case 2:
            Object.assign(target, { basePricePerKg: terms.basePricePerKg, baseAbwG: terms.baseAbwG, stepPerG: terms.stepPerG });
            return true;
        case 3:
            Object.assign(target, { basePricePerKg: terms.basePricePerKg, baseCountPerKg: terms.baseCountPerKg, stepPerCount: terms.stepPerCount });
            return true;
        case 4:
            target.priceTableId = terms.priceTableId;
            return true;
    }
    return false;
}

/** True when nothing of the method's own terms has been typed. */
export function termsEmpty(t: any): boolean {
    switch (t.priceMethod) {
        case 2:
            return num(t.basePricePerKg) == null && num(t.baseAbwG) == null && num(t.stepPerG) == null;
        case 3:
            return num(t.basePricePerKg) == null && num(t.baseCountPerKg) == null && num(t.stepPerCount) == null;
        case 4:
            return !t.priceTableId;
        default:
            return false;
    }
}

/** The ABW a Base ABW price uses: typed on the line, else the harvest's sampled ABW; to 0.01 g. */
export function usedAbw(t: any, harvestAbwG: number | null): number | null {
    const v = num(t.priceAbwG) ?? harvestAbwG ?? null;
    return v == null ? null : Math.round(Number(v) * 100) / 100;
}

/** The count a count or table price uses: typed on the line, else the default (the grade's middle count or from the ABW). */
export function usedCount(t: any, defaultCountPerKg: number | null): number | null {
    const typed = num(t.priceCountPerKg);
    return typed != null ? wholeCount(typed) : (defaultCountPerKg ?? null);
}

/** How the method's price was worked out, as shown under the terms on every sale form (DEC-85). Empty for Fixed. */
export function priceWorking(t: any, abwG: number | null, countPerKg: number | null, tables: any[], saved: any = null): string {
    const php = (v: any) => '₱' + Number(v).toFixed(2);
    switch (t.priceMethod) {
        case 2:
            return `${php(t.basePricePerKg)} + (${Number(abwG).toFixed(2)} − ${Number(t.baseAbwG).toFixed(2)}) × ${php(t.stepPerG)}`;
        case 3:
            return `${php(t.basePricePerKg)} + (${t.baseCountPerKg} − ${countPerKg}) × ${php(t.stepPerCount)}`;
        case 4: {
            const table = (tables ?? []).find((x) => x.id === t.priceTableId);
            const name = saved ? saved.priceTableName : table?.name;
            const row = saved ? saved.priceTableRowLabel : tableRow(table, countPerKg)?.label;
            return `${name ?? ''}, ${row ?? ''} (count ${countPerKg})`;
        }
    }
    return '';
}

/** True when the agreed price differs from the price the method gives by a centavo or more. */
export function priceOverridden(pricePerKg: any, reference: number | null): boolean {
    return reference !== null && pricePerKg !== null && pricePerKg !== '' && pricePerKg !== undefined && Math.abs(Number(pricePerKg) - reference) >= 0.01;
}
