import { SECTIONS, activeTab, effectiveUrl, pathOf, sectionOfUrl } from './sections';

describe('FPMS section navigation', () => {
    it('keeps harvest and sale detail pages in their parent sections', () => {
        expect(sectionOfUrl('/app/harvests/harvest-1')).toBe(SECTIONS.find((x) => x.key === 'harvest'));
        expect(sectionOfUrl('/app/sales/sale-1')).toBe(SECTIONS.find((x) => x.key === 'harvest'));
        expect(activeTab(SECTIONS.find((x) => x.key === 'harvest')!, '/app/harvests/harvest-1')?.tab.label).toBe('Harvests');
        expect(activeTab(SECTIONS.find((x) => x.key === 'harvest')!, '/app/sales/sale-1')?.tab.label).toBe('Sales');
    });

    it('resolves the Setup child page rather than the parent tab route', () => {
        const section = SECTIONS.find((x) => x.key === 'harvest')!;
        const match = activeTab(section, '/app/sales/price-tables');
        expect(match?.tab.label).toBe('Setup');
        expect(match?.child?.label).toBe('Price tables');
    });

    it('keeps trace reports under the section they were opened from', () => {
        expect(effectiveUrl('/app/reports/trace/batch-1?from=harvests')).toBe('/app/harvests');
        expect(effectiveUrl('/app/reports/trace/batch-1?from=sales')).toBe('/app/sales');
        expect(effectiveUrl('/app/reports/trace/batch-1?from=reports')).toBe('/app/reports');
        expect(effectiveUrl('/app/reports/trace/lot/LOT-1')).toBe('/app/reports');
    });

    it('strips query strings and fragments when resolving a page path', () => {
        expect(pathOf('/app/harvests/harvest-1?from=reports#details')).toBe('/app/harvests/harvest-1');
    });

    it('leaves standalone pages outside grouped sections', () => {
        expect(sectionOfUrl('/app/ponds')).toBeUndefined();
        expect(sectionOfUrl('/app/dashboard')).toBeUndefined();
    });
});
