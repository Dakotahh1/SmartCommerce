import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums.js';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'camila@correo.cl' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Clave-segura-2026', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir letras y números',
  })
  password!: string;

  @ApiProperty({ example: 'Camila Vergara' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[^<>]*$/, {
    message: 'El nombre contiene caracteres no permitidos',
  })
  displayName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'camila@correo.cl' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Clave-segura-2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token opaco recibido al iniciar sesión',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  refreshToken!: string;
}

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Contraseña actual para confirmar la eliminación',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty()
  createdAt!: Date;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;

  @ApiProperty({ description: 'JWT de corta duración' })
  accessToken!: string;

  @ApiProperty({ description: 'Token opaco rotativo' })
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    description: 'Segundos hasta que expira el access token',
    example: 900,
  })
  expiresIn!: number;
}
