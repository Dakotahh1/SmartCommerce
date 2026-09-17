import { TestBed } from '@angular/core/testing';
import { GradeBadgeComponent } from './grade-badge.component';
import { MatchRingComponent } from './match-ring.component';
import { NutriScoreComponent } from './nutri-score.component';

describe('Componentes del design system', () => {
  it('MatchRing redondea, acota a 0–100 y describe el valor para lectores de pantalla', async () => {
    const fixture = TestBed.createComponent(MatchRingComponent);
    fixture.componentRef.setInput('score', 91.6);
    await fixture.whenStable();
    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('aria-label')).toBe('Coincidencia 92 por ciento');
    expect(fixture.nativeElement.textContent).toContain('92%');

    fixture.componentRef.setInput('score', 140);
    await fixture.whenStable();
    expect(svg.getAttribute('aria-label')).toBe('Coincidencia 100 por ciento');
  });

  it('GradeBadge muestra "?" cuando falta el dato y usa la escala NOVA', async () => {
    const fixture = TestBed.createComponent(GradeBadgeComponent);
    fixture.componentRef.setInput('label', 'NOVA');
    fixture.componentRef.setInput('kind', 'nova');
    fixture.componentRef.setInput('value', null);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('?');
    expect(fixture.nativeElement.querySelector('.badge').getAttribute('aria-label')).toBe(
      'NOVA: sin dato',
    );

    fixture.componentRef.setInput('value', 4);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.badge').getAttribute('aria-label')).toBe(
      'NOVA: 4',
    );
  });

  it('NutriScore destaca solo la letra del producto', async () => {
    const fixture = TestBed.createComponent(NutriScoreComponent);
    fixture.componentRef.setInput('grade', 'b');
    await fixture.whenStable();
    const active = fixture.nativeElement.querySelectorAll('.cell.active');
    expect(active).toHaveLength(1);
    expect(active[0].textContent.trim()).toBe('B');
  });
});
