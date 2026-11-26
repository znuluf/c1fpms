import { PRICE_METHODS, applyTerms, baseAbwPrice, priceWorking, pricingBody, referencePrice, savedTableLine } from './pricing';

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

    describe('a saved price-table line', () => {
        const saved = {
            harvestGradeLineId: 'grade-1', priceMethod: 4, priceTableId: 'table-1', priceCountPerKg: 90,
            priceTableName: 'Old name', priceTableRowLabel: '81-100', formulaPricePerKg: 250,
        };
        const sale = { buyerId: 'buyer-1', lines: [saved] };
        const line = { harvestGradeLineId: 'grade-1', priceMethod: 4, priceTableId: 'table-1' };
        const edited = [{ id: 'table-1', name: 'New name', rows: [{ minCountPerKg: 81, maxCountPerKg: 100, pricePerKg: 275, label: '81-100' }] }];

        it('keeps its saved price and row after the table is edited', () => {
            const kept = savedTableLine(line, 90, 'buyer-1', sale);
            expect(kept).toBe(saved);
            expect(referencePrice(line, null, 90, edited, kept)).toBe(250);
            expect(priceWorking(line, null, 90, edited, kept)).toBe('Old name, 81-100 (count 90)');
            expect(referencePrice(line, null, 90, [], kept)).toBe(250);
        });

        it('uses the current table when the buyer, grade, table or count changes, or the sale is new', () => {
            expect(savedTableLine(line, 90, 'buyer-2', sale)).toBeNull();
            expect(savedTableLine({ ...line, harvestGradeLineId: 'grade-2' }, 90, 'buyer-1', sale)).toBeNull();
            expect(savedTableLine({ ...line, priceTableId: 'table-2' }, 90, 'buyer-1', sale)).toBeNull();
            expect(savedTableLine(line, 91, 'buyer-1', sale)).toBeNull();
            expect(savedTableLine(line, 90, 'buyer-1', null)).toBeNull();
            expect(referencePrice(line, null, 90, edited)).toBe(275);
        });

        it('gives no price to compare with when none was saved', () => {
            const kept = savedTableLine(line, 90, 'buyer-1', { ...sale, lines: [{ ...saved, formulaPricePerKg: null }] });
            expect(referencePrice(line, null, 90, edited, kept)).toBeNull();
        });
    });

    it('defines all supported pricing method values for existing sale lines', () => {
        expect(PRICE_METHODS.map((x) => x.value)).toEqual([1, 2, 3, 4]);
    });
});
