import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEnum } from 'class-validator';
import { Repository } from 'typeorm';
import { AppException } from '../../common/app.exception.js';
import type { AuthUser } from '../../common/auth.decorators.js';
import { CurrentUser, Roles } from '../../common/auth.decorators.js';
import { Role } from '../../common/enums.js';
import { PaginationQueryDto, toPage } from '../../common/pagination.js';
import { User } from '../../database/entities/user.entity.js';
import { toProfile } from '../auth/auth.service.js';

export class UpdateRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}

/** Administración de usuarios: solo rol `admin`. */
@ApiTags('admin · usuarios')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Requiere rol admin' })
@Roles(Role.ADMIN)
@Controller({ path: 'admin/users', version: '1' })
export class UsersController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get()
  async list(@Query() query: PaginationQueryDto) {
    const [users, total] = await this.users.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return toPage(
      users.map((user) => ({
        ...toProfile(user),
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  @Patch(':id/role')
  async updateRole(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    if (id === admin.id) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CANNOT_CHANGE_OWN_ROLE',
        'No puedes cambiar tu propio rol',
      );
    }
    const user = await this.users.findOne({ where: { id } });
    if (!user)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'Usuario no encontrado',
      );
    user.role = dto.role;
    return toProfile(await this.users.save(user));
  }
}
