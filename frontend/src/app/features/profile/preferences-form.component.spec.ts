import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import type { Preferences } from '../../core/models';
import { registerIcons } from '../../icons';
import { DEFAULT_PREFERENCES, PreferencesFormComponent } from './preferences-form.component';

const conPesos = (weights: Partial<Preferences['weights']>): Preferences => ({
  ...DEFAULT_PREFERENCES,
  weights: { ...DEFAULT_PREFERENCES.weights, ...weights },
});

describe('PreferencesFormComponent', () => {
  beforeAll(() => registerIcons());

  async function render(value: Preferences = DEFAULT_PREFERENCES) {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(PreferencesFormComponent);
    fixture.componentRef.setInput('value', value);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const saved = vi.fn();
    fixture.componentInstance.save.subscribe(saved);

    const chip = (group: string, label: string) =>
      Array.from(
        element.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] button`),
      ).find((b) => b.textContent?.trim() === label)!;
    const click = async (button: HTMLButtonElement) => {
      button.click();
      await fixture.whenStable();
    };

    return { fixture, element, saved, chip, click };
  }

  it('entrega los pesos como enteros entre 0 y 100, como exige la API', async () => {
    const { fixture, saved } = await render(
      conPesos({ nutrition: 33.7, price: 150, processing: -5 }),
    );

    const result = fixture.componentInstance.emit();

    expect(result?.weights).toEqual({
      nutrition: 34,
      price: 100,
      processing: 0,
      environment: 15,
      availability: 10,
    });
    expect(saved).toHaveBeenCalledWith(result);
  });

  it('no guarda si todos los criterios quedan sin importancia y avisa al usuario', async () => {
    const { fixture, element, saved } = await render(
      conPesos({ nutrition: 0, price: 0, processing: 0, environment: 0, availability: 0 }),
    );

    const result = fixture.componentInstance.emit();
    await fixture.whenStable();

    expect(result).toBeNull();
    expect(saved).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Asigna importancia a al menos un criterio.',
    );
  });

  it('marca y desmarca dietas y alérgenos con un clic', async () => {
    const { fixture, chip, click } = await render();

    await click(chip('Dietas', 'Vegano'));
    await click(chip('Alérgenos a evitar', 'Maní'));
    expect(chip('Dietas', 'Vegano').getAttribute('aria-pressed')).toBe('true');
    expect(fixture.componentInstance.emit()).toMatchObject({
      diets: ['vegan'],
      excludedAllergens: ['peanuts'],
    });

    await click(chip('Dietas', 'Vegano'));
    await click(chip('Alérgenos a evitar', 'Maní'));
    expect(chip('Dietas', 'Vegano').getAttribute('aria-pressed')).toBe('false');
    expect(fixture.componentInstance.emit()).toMatchObject({ diets: [], excludedAllergens: [] });
  });

  it('se reinicia con las preferencias nuevas cuando cambian desde afuera', async () => {
    const { fixture } = await render();
    const guardadas: Preferences = {
      ...conPesos({ nutrition: 80, price: 5 }),
      diets: ['gluten_free'],
      avoidHighIn: true,
    };

    fixture.componentRef.setInput('value', guardadas);
    await fixture.whenStable();

    expect(fixture.componentInstance.emit()).toMatchObject({
      weights: guardadas.weights,
      diets: ['gluten_free'],
      avoidHighIn: true,
    });
  });
});
