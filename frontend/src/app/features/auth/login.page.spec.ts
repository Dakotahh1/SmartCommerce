import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  const auth = { login: vi.fn() };

  async function render(inputs: { returnUrl?: string; reason?: string } = {}) {
    auth.login.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ],
    });
    const fixture = TestBed.createComponent(LoginPage);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
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
    return { fixture, element, navigate, type };
  }

  it('valida el formulario antes de llamar a la API y muestra errores accesibles', async () => {
    const { fixture, element, type } = await render();
    await fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(auth.login).not.toHaveBeenCalled();
    expect(element.querySelector('#login-email-error')?.textContent).toContain('correo válido');

    await type('#login-email', 'no-es-un-correo');
    expect(element.querySelector('#login-email')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('normaliza el correo, inicia sesión y vuelve a la ruta interna solicitada', async () => {
    const { fixture, navigate, type } = await render({ returnUrl: '/app/comparar' });
    auth.login.mockResolvedValue({ id: 'u1' });
    await type('#login-email', '  Camila@Correo.CL ');
    await type('#login-password', 'Clave-segura-2026');

    await fixture.componentInstance.submit();

    expect(auth.login).toHaveBeenCalledWith('camila@correo.cl', 'Clave-segura-2026');
    expect(navigate).toHaveBeenCalledWith('/app/comparar');
  });

  it('bloquea redirecciones abiertas hacia otros dominios', async () => {
    const { fixture, navigate, type } = await render({ returnUrl: '//sitio-malicioso.example' });
    auth.login.mockResolvedValue({ id: 'u1' });
    await type('#login-email', 'camila@correo.cl');
    await type('#login-password', 'Clave-segura-2026');

    await fixture.componentInstance.submit();

    expect(navigate).toHaveBeenCalledWith('/app/inicio');
  });

  it('muestra un mensaje genérico ante credenciales inválidas (sin revelar si el correo existe)', async () => {
    const { fixture, element, navigate, type } = await render({ reason: 'session-expired' });
    expect(element.textContent).toContain('Tu sesión expiró');
    auth.login.mockRejectedValue({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'x',
      details: [],
      requestId: null,
    });
    await type('#login-email', 'camila@correo.cl');
    await type('#login-password', 'incorrecta1');

    await fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Correo o contraseña incorrectos.',
    );
  });
});
