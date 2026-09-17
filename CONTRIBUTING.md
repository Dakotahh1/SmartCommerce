# Guía de contribución

## Flujo de trabajo (GitHub Flow)

1. Crear una rama corta desde `main` actualizada:
   ```bash
   git switch main && git pull
   git switch -c feature/backend-auth-refresh
   ```
2. Commits pequeños con **Conventional Commits** en español:
   - `feat(backend): rotación de refresh tokens`
   - `fix(frontend): refresco de sesión en interceptor`
   - `test(python): casos de sellos ALTO EN para líquidos`
   - `docs: ADR de comunicación interna`
   - `ci: escaneo de imágenes con Trivy`
3. Ejecutar localmente lint y pruebas del componente modificado (ver README).
4. Abrir un **pull request** hacia `main` usando la plantilla. Debe pasar el check **`quality-gate`**.
5. Al menos una revisión de otra persona del equipo antes de integrar (*squash* o *merge commit*).

## Prefijos de rama

| Prefijo | Uso |
|---|---|
| `feature/` | Nueva funcionalidad (`feature/frontend-compare`) |
| `fix/` | Corrección de errores |
| `docs/` | Documentación y ADR |
| `ci/` | Pipeline y automatización |
| `infra/` | Docker, Terraform, despliegue |
| `design/` | Prototipos y design system |

## Reglas

- Nunca subir `.env`, credenciales, llaves ni estado de Terraform (gitleaks lo bloquea en CI).
- Toda decisión arquitectónica relevante → nuevo ADR en `docs/adr/`.
- Todo endpoint nuevo → DTO validado, decorador de roles, documentación Swagger y prueba.
- Todo cambio de esquema → migración con `up` y `down`.
- El código incluido debe poder ser explicado por quien lo integra.

## Entregas

Cada entrega parcial se identifica con un tag anotado y una release:

```bash
git tag -a v0.1.0-ep1 -m "Entrega Parcial 1: arquitectura y pipeline DevSecOps"
git push origin v0.1.0-ep1
```
