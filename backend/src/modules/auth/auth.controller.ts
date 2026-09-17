import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../common/auth.decorators.js';
import { CurrentUser, Public } from '../../common/auth.decorators.js';
import { AuthService } from './auth.service.js';
import {
  AuthResponseDto,
  DeleteAccountDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  UserProfileDto,
} from './dto/auth.dto.js';

/** Límite estricto contra fuerza bruta: 10 intentos por minuto por IP. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN' })
  @ApiTooManyRequestsResponse()
  register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.register(dto, userAgent);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    return this.auth.login(dto, userAgent);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'INVALID_REFRESH_TOKEN | REFRESH_TOKEN_REUSED',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.refresh(dto.refreshToken, userAgent);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Revoca la sesión (familia de refresh tokens)',
  })
  logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto) {
    return this.auth.logout(user.id, dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOkResponse({ type: UserProfileDto })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Elimina la cuenta y todos sus datos personales',
  })
  deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.auth.deleteAccount(user.id, dto.password);
  }
}
