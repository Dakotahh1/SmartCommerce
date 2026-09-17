import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../auth.decorators.js';
import { AppException } from '../app.exception.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

const request = {
  originalUrl: '/api/v1/products?q=avena',
  url: '/api/v1/products',
  id: 'req-1',
} as AuthenticatedRequest;

function run(exception: unknown) {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return {
    status: response.status.mock.calls[0][0] as number,
    body: response.json.mock.calls[0][0],
  };
}

describe('AllExceptionsFilter', () => {
  it('mantiene código y detalles de AppException', () => {
    const { status, body } = run(
      new AppException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Ya existe', [
        { field: 'email', message: 'x' },
      ]),
    );
    expect(status).toBe(409);
    expect(body).toMatchObject({
      statusCode: 409,
      code: 'EMAIL_TAKEN',
      message: 'Ya existe',
      details: [{ field: 'email', message: 'x' }],
      path: '/api/v1/products',
      requestId: 'req-1',
    });
  });

  it('asigna códigos por defecto a HttpException de Nest', () => {
    expect(run(new NotFoundException()).body.code).toBe('NOT_FOUND');
    const validation = run(new BadRequestException(['a debe ser número']));
    expect(validation.body).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Datos inválidos',
      details: ['a debe ser número'],
    });
  });

  it('traduce el rate limit a 429', () => {
    const { status, body } = run(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.code).toBe('TOO_MANY_REQUESTS');
  });

  it('nunca expone detalles de errores no controlados', () => {
    const { status, body } = run(
      new Error(
        'duplicate key value violates unique constraint "users_email_uq" SELECT * FROM users',
      ),
    );
    expect(status).toBe(500);
    expect(body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
      details: [],
    });
    expect(JSON.stringify(body)).not.toContain('SELECT');
    expect(JSON.stringify(body)).not.toContain('stack');
  });
});
