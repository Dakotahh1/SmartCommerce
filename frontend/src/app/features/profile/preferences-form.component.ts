import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { IonIcon, IonRange, IonToggle } from '@ionic/angular';
import type { Criterion, Diet, Preferences } from '../../core/models';
import {
  ALLERGEN_LABELS,
  CRITERION_COLORS,
  CRITERION_ICONS,
  CRITERION_LABELS,
  DIET_LABELS,
  weightLevel,
} from '../../shared/labels';

const CRITERIA: Criterion[] = ['nutrition', 'price', 'processing', 'environment', 'availability'];
const DIETS: Diet[] = ['gluten_free', 'lactose_free', 'vegan', 'vegetarian'];
const ALLERGENS = Object.keys(ALLERGEN_LABELS);

export const DEFAULT_PREFERENCES: Preferences = {
  weights: { nutrition: 30, price: 25, processing: 20, environment: 15, availability: 10 },
  diets: [],
  excludedAllergens: [],
  avoidHighIn: false,
  preferredStores: [],
  personalizationEnabled: true,
};

/**
 * Pantalla M03 del prototipo: el usuario declara qué le importa (pesos 0–100),
 * sus restricciones y si quiere personalización. SmartMatch usa exactamente estos valores.
 */
@Component({
  selector: 'app-preferences-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IonRange, IonToggle, IonIcon],
  template: `
    <form [formGroup]="form" (ngSubmit)="emit()" class="prefs" novalidate>
      <fieldset formGroupName="weights">
        <legend>¿Qué es importante para ti?</legend>
        @for (criterion of criteria; track criterion) {
          <div class="weight">
            <div class="weight-head">
              <span class="icon" [style.color]="colors[criterion]" aria-hidden="true"
                ><ion-icon [name]="icons[criterion]"></ion-icon
              ></span>
              <label [attr.for]="'w-' + criterion">{{ labels[criterion] }}</label>
              <span class="level"
                >{{ level(criterion) }} ·
                {{ form.controls.weights.controls[criterion].value }}%</span
              >
            </div>
            <ion-range
              [id]="'w-' + criterion"
              [formControlName]="criterion"
              [min]="0"
              [max]="100"
              [step]="5"
              [style.--bar-background-active]="colors[criterion]"
              [style.--knob-background]="'#fff'"
              [attr.aria-label]="'Importancia de ' + labels[criterion]"
            ></ion-range>
          </div>
        }
      </fieldset>

      <fieldset>
        <legend>Dieta</legend>
        <div class="chips" role="group" aria-label="Dietas">
          @for (diet of diets; track diet) {
            <button
              type="button"
              class="chip"
              [class.on]="hasDiet(diet)"
              [attr.aria-pressed]="hasDiet(diet)"
              (click)="toggleDiet(diet)"
            >
              @if (hasDiet(diet)) {
                <ion-icon name="checkmark" aria-hidden="true"></ion-icon>
              }
              {{ dietLabels[diet] }}
            </button>
          }
        </div>
      </fieldset>

      <fieldset>
        <legend>Alérgenos a evitar</legend>
        <div class="chips" role="group" aria-label="Alérgenos a evitar">
          @for (allergen of allergens; track allergen) {
            <button
              type="button"
              class="chip"
              [class.on]="hasAllergen(allergen)"
              [attr.aria-pressed]="hasAllergen(allergen)"
              (click)="toggleAllergen(allergen)"
            >
              @if (hasAllergen(allergen)) {
                <ion-icon name="checkmark" aria-hidden="true"></ion-icon>
              }
              {{ allergenLabels[allergen] }}
            </button>
          }
        </div>
      </fieldset>

      <div class="switch">
        <span class="seal" aria-hidden="true">ALTO<br />EN</span>
        <div>
          <strong id="avoid-label">Evitar sellos “ALTO EN”</strong>
          <small>Ley 20.606 · calculado desde los nutrientes</small>
        </div>
        <ion-toggle formControlName="avoidHighIn" aria-labelledby="avoid-label"></ion-toggle>
      </div>

      <div class="switch">
        <span class="spark" aria-hidden="true"><ion-icon name="sparkles-outline"></ion-icon></span>
        <div>
          <strong id="perso-label">Recomendaciones personalizadas</strong>
          <small>Si la desactivas verás un ranking general, igual para todos.</small>
        </div>
        <ion-toggle
          formControlName="personalizationEnabled"
          aria-labelledby="perso-label"
        ></ion-toggle>
      </div>

      @if (allZero()) {
        <p class="warn" role="alert">Asigna importancia a al menos un criterio.</p>
      }

      <ng-content />
    </form>
  `,
  styles: `
    .prefs {
      display: grid;
      gap: 18px;
    }
    fieldset {
      border: 0;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }
    legend {
      margin-bottom: 8px;
      font-size: 16px;
      font-weight: 800;
    }
    .weight {
      display: grid;
      gap: 2px;
    }
    .weight-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: var(--sc-bg);
      font-size: 16px;
    }
    label {
      flex: 1;
      font-size: 14px;
      font-weight: 600;
    }
    .level {
      padding: 3px 9px;
      border-radius: 99px;
      background: var(--sc-bg);
      font-size: 11px;
      font-weight: 600;
    }
    ion-range {
      --bar-height: 6px;
      --bar-border-radius: 3px;
      --knob-size: 22px;
      padding: 0 4px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 38px;
      padding: 0 13px;
      border-radius: 99px;
      border: 1px solid var(--sc-line);
      background: #fff;
      color: var(--sc-slate);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .chip.on {
      border-color: transparent;
      background: var(--sc-gradient-button);
      color: #fff;
      font-weight: 600;
    }
    .switch {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 16px;
      background: var(--sc-bg);
    }
    .switch div {
      flex: 1;
      display: grid;
      gap: 2px;
    }
    .switch strong {
      font-size: 14px;
    }
    .switch small {
      font-size: 11px;
      color: var(--sc-slate);
    }
    .seal {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      clip-path: polygon(29% 0, 71% 0, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0 71%, 0 29%);
      background: #111;
      color: #fff;
      font-size: 7px;
      font-weight: 800;
      text-align: center;
      line-height: 1.1;
    }
    .spark {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 11px;
      background: var(--sc-soft-violet);
      color: var(--sc-primary);
      font-size: 20px;
    }
    .warn {
      margin: 0;
      color: #b42318;
      font-size: 13px;
    }
  `,
})
export class PreferencesFormComponent {
  readonly value = input<Preferences>(DEFAULT_PREFERENCES);
  readonly save = output<Preferences>();

  protected readonly criteria = CRITERIA;
  protected readonly diets = DIETS;
  protected readonly allergens = ALLERGENS;
  protected readonly labels = CRITERION_LABELS;
  protected readonly icons = CRITERION_ICONS;
  protected readonly colors = CRITERION_COLORS;
  protected readonly dietLabels = DIET_LABELS;
  protected readonly allergenLabels = ALLERGEN_LABELS;

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly form = this.fb.group({
    weights: this.fb.group({
      nutrition: [30],
      price: [25],
      processing: [20],
      environment: [15],
      availability: [10],
    }),
    diets: [[] as Diet[]],
    excludedAllergens: [[] as string[]],
    avoidHighIn: [false],
    preferredStores: [[] as string[]],
    personalizationEnabled: [true],
  });

  protected readonly allZero = signal(false);

  constructor() {
    effect(() => {
      const value = this.value();
      this.form.reset({ ...value, weights: { ...value.weights } });
    });
  }

  protected level(criterion: Criterion): string {
    return weightLevel(this.form.controls.weights.controls[criterion].value);
  }

  protected hasDiet(diet: Diet): boolean {
    return this.form.controls.diets.value.includes(diet);
  }

  protected toggleDiet(diet: Diet): void {
    const current = this.form.controls.diets.value;
    this.form.controls.diets.setValue(
      current.includes(diet) ? current.filter((d) => d !== diet) : [...current, diet],
    );
  }

  protected hasAllergen(allergen: string): boolean {
    return this.form.controls.excludedAllergens.value.includes(allergen);
  }

  protected toggleAllergen(allergen: string): void {
    const current = this.form.controls.excludedAllergens.value;
    this.form.controls.excludedAllergens.setValue(
      current.includes(allergen) ? current.filter((a) => a !== allergen) : [...current, allergen],
    );
  }

  /** Normaliza a enteros entre 0 y 100 (como exige la API) y emite. */
  emit(): Preferences | null {
    const raw = this.form.getRawValue();
    const weights = Object.fromEntries(
      CRITERIA.map((c) => [c, Math.round(Math.min(100, Math.max(0, Number(raw.weights[c]) || 0)))]),
    ) as Preferences['weights'];
    const empty = CRITERIA.every((c) => weights[c] === 0);
    this.allZero.set(empty);
    if (empty) return null;
    const preferences: Preferences = { ...raw, weights };
    this.save.emit(preferences);
    return preferences;
  }
}
