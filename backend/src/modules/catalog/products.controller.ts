import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.decorators.js';
import { ProductQueryDto } from './products.dto.js';
import { ProductsService } from './products.service.js';

/** Catálogo público: visitantes pueden explorar sin cuenta. */
@ApiTags('catálogo')
@Public()
@Controller({ version: '1' })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @ApiOkResponse({
    description: 'Página de productos normalizados con filtros y búsqueda',
  })
  search(@Query() query: ProductQueryDto) {
    return this.products.search(query);
  }

  @Get('products/:id')
  @ApiOkResponse({
    description:
      'Detalle con nutrientes, dietas, procedencia e historial de precios',
  })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.findOne(id);
  }

  @Get('categories')
  @ApiOkResponse({ description: 'Categorías con cantidad de productos' })
  categories() {
    return this.products.listCategories();
  }
}
