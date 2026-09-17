from typing import Annotated

from fastapi import Depends, Request

from app.sources.openfoodfacts import OpenFoodFactsClient


def get_off_client(request: Request) -> OpenFoodFactsClient:
    client: OpenFoodFactsClient = request.app.state.off_client
    return client


OffClient = Annotated[OpenFoodFactsClient, Depends(get_off_client)]
