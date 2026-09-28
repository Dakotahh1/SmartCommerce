import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';
import type { ApiError } from '../../core/models';
import { registerIcons } from '../../icons';
import { RegisterPage } from './register.page';

const apiError = (code: string, details: ApiError['details'] = []): ApiError => ({
  status: code === 'EMAIL_TAKEN' ? 409 : 400,
  code,
  message: 'x',
  details,
  requestId: null,
});

describe('RegisterPage', () => {
  const auth = { register: vi.fn() };

  beforeAll(() => registerIcons());

  async function render() {
    auth.register.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(RegisterPage);
    await fixture.whenStable();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const element = fixture.nativeElement as HTMLElement;

    const type = async (selector: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    };
    const setConsent = async (checked: boolean) => {
      const box = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      box.checked = checked;
      box.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const fillValid = async () => {
      await type('#reg-name', ' Camila Vergara ');
      await type('#reg-email', 'Camila@Correo.CL');
      await type('#reg-password', 'Clave-segura-2026');
      await setConsent(true);
    };
    const submit = async () => {
      await fixture.componentInstance.submit();
      await fixture.whenStable();
    };
    const errors = () =>
      Array.from(element.querySelectorAll('.error')).map((e) => e.textContent?.trim() ?? '');

    return { element, navigate, type, setConsent, fillValid, submit, errors };
  }

  it('no envía un formulario vacío y marca cada campo con su error', async () => {
    const { element, submit, errors } = await render();

    await submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errors()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Ingresa entre 2 y 80 caracteres'),
        'Ingresa un correo válido.',
        'Necesitamos tu consentimiento para crear la cuenta.',
      ]),
    );
    expect(element.querySelector('#reg-password-hint')?.classList).toContain('error');
  });

  it('exige el consentimiento explícito aunque el resto esté bien', async () => {
    const { fillValid, setConsent, submit, errors } = await render();
    await fillValid();
    await setConsent(false);

    await submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errors()).toContain('Necesitamos tu consentimiento para crear la cuenta.');
  });

  it('rechaza contraseñas sin letras y números, igual que la API', async () => {
    const { element, fillValid, type, submit } = await render();
    await fillValid();

    for (const weak of ['solamenteletras', '1234567890']) {
      await type('#reg-password', weak);
      await submit();
      expect(auth.register).not.toHaveBeenCalled();
      expect(element.querySelector('#reg-password')?.getAttribute('aria-invalid')).toBe('true');
    }
  });

  it('rechaza nombres con los símbolos < o >', async () => {
    const { element, fillValid, type, submit } = await render();
    await fillValid();
    await type('#reg-name', '<script>');

    await submit();

    expect(auth.register).not.toHaveBeenCalled();
    expect(element.querySelector('#reg-name')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('crea la cuenta con los datos normalizados y lleva al onboarding', async () => {
    const { navigate, fillValid, submit } = await render();
    auth.register.mockResolvedValue({ id: 'u1' });
    await fillValid();

    await submit();

    expect(auth.register).toHaveBeenCalledWith(
      'camila@correo.cl',
      'Clave-segura-2026',
      'Camila Vergara',
    );
    expect(navigate).toHaveBeenCalledWith('/onboarding/preferencias');
  });

  it('avisa cuando el correo ya tiene una cuenta', async () => {
    const { element, navigate, fillValid, submit } = await render();
    auth.register.mockRejectedValue(apiError('EMAIL_TAKEN'));
    await fillValid();

    await submit();

    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Ya existe una cuenta con ese correo.',
    );
  });

  it('muestra los motivos cuando la API rechaza los datos', async () => {
    const { element, fillValid, submit } = await render();
    auth.register.mockRejectedValue(
      apiError('VALIDATION_ERROR', [
        { field: 'password', message: 'La contraseña debe incluir letras y números' },
      ]),
    );
    await fillValid();

    await submit();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'La contraseña debe incluir letras y números',
    );
  });

  it('muestra un mensaje genérico ante cualquier otro error', async () => {
    const { element, fillValid, submit } = await render();
    auth.register.mockRejectedValue(new Error('sin conexión'));
    await fillValid();

    await submit();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos crear la cuenta. Intenta nuevamente.',
    );
  });
});
