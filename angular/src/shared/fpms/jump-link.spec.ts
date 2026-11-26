import { JumpLinkDirective } from './ui';

describe('same-page jump link', () => {
    let section: HTMLElement;
    let link: JumpLinkDirective;

    beforeEach(() => {
        section = document.createElement('div');
        section.id = 'jump-target';
        document.body.appendChild(section);
        link = new JumpLinkDirective();
        link.target = 'jump-target';
    });

    afterEach(() => section.remove());

    it('points at the section on the current page, not at the app root', () => {
        expect(link.href).toBe(`${location.pathname}${location.search}#jump-target`);
    });

    it('moves focus to the section without navigating', () => {
        const click = new MouseEvent('click', { cancelable: true });
        link.jump(click);
        expect(click.defaultPrevented).toBeTrue();
        expect(document.activeElement).toBe(section);
        expect(section.classList).toContain('fpms-jump-target');
    });
});
