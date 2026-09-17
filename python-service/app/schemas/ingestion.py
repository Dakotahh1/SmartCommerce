from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.product import NormalizationReport, NormalizedProduct

TagSlug = str


class IngestionSearchRequest(CamelModel):
    country: TagSlug = Field(default="chile", pattern=r"^[a-z][a-z-]{1,39}$")
    category: TagSlug | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9:-]{1,79}$")
    brand: TagSlug | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9:-]{1,79}$")
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=50, ge=1, le=100)


class SourceDescriptor(CamelModel):
    code: str = "openfoodfacts"
    name: str = "Open Food Facts"
    api_url: str
    license: str = "ODbL-1.0"
    terms_url: str = "https://world.openfoodfacts.org/terms-of-use"


class IngestionSearchResponse(CamelModel):
    source: SourceDescriptor
    request: IngestionSearchRequest
    fetched_at: datetime
    total_available: int
    products: list[NormalizedProduct]
    report: NormalizationReport
