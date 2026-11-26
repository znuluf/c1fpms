import { PRICE_METHODS, applyTerms, baseAbwPrice, pricingBody } from './pricing';

describe('sale pricing helpers', () => {
    it('matches the farm base-ABW pricing formula', () => {
        expect(baseAbwPrice(210, 10, 5, 12.08)).toBe(220.4);
    });

    it('copies buyer base-ABW terms onto a matching line', () => {
        const line: any = { priceMethod: 2 };
        expect(applyTerms(line, { priceMethod: 2, basePricePerKg: 210, baseAbwG: 10, stepPerG: 5 })).toBeTrue();
        expect(line).toEqual({ priceMethod: 2, basePricePerKg: 210, baseAbwG: 10, stepPerG: 5 });
    });

    it('copies base-count and table terms when those methods are already selected', () => {
        const countLine: any = { priceMethod: 3 };
        expect(applyTerms(countLine, { priceMethod: 3, basePricePerKg: 300, baseCountPerKg: 100, stepPerCount: 2 })).toBeTrue();
        expect(countLine.baseCountPerKg).toBe(100);
        expect(countLine.stepPerCount).toBe(2);

        const tableLine: any = { priceMethod: 4 };
        expect(applyTerms(tableLine, { priceMethod: 4, priceTableId: 'table-1' })).toBeTrue();
        expect(tableLine.priceTableId).toBe('table-1');
    });

    it('does not copy terms when the pricing methods differ', () => {
        const line: any = { priceMethod: 1 };
        expect(applyTerms(line, { priceMethod: 2, basePricePerKg: 210 })).toBeFalse();
        expect(line).toEqual({ priceMethod: 1 });
    });

    it('preserves every supported method and its own terms in the save payload', () => {
        expect(pricingBody({ priceMethod: 1 })).toEqual(jasmine.objectContaining({ priceMethod: 1, basePricePerKg: null, priceTableId: null }));
        expect(pricingBody({ priceMethod: 2, basePricePerKg: 210, baseAbwG: 10, stepPerG: 5, priceAbwG: 12.08 }))
            .toEqual(jasmine.objectContaining({ priceMethod: 2, basePricePerKg: 210, baseAbwG: 10, stepPerG: 5, priceAbwG: 12.08 }));
        expect(pricingBody({ priceMethod: 3, basePricePerKg: 300, baseCountPerKg: 100, stepPerCount: 2, priceCountPerKg: 90 }))
            .toEqual(jasmine.objectContaining({ priceMethod: 3, basePricePerKg: 300, baseCountPerKg: 100, stepPerCount: 2, priceCountPerKg: 90 }));
        expect(pricingBody({ priceMethod: 4, priceTableId: 'table-1', priceCountPerKg: 90 }))
            .toEqual(jasmine.objectContaining({ priceMethod: 4, priceTableId: 'table-1', priceCountPerKg: 90 }));
    });

    it('defines all supported pricing method values for existing sale lines', () => {
        expect(PRICE_METHODS.map((x) => x.value)).toEqual([1, 2, 3, 4]);
    });
});
