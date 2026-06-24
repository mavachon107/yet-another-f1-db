from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.database import get_readonly_session
from app.models.country import Country, CountryRead

public_router = APIRouter(prefix="/v1/countries", tags=["countries"])


@public_router.get("", response_model=list[CountryRead])
def list_countries(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    session: Session = Depends(get_readonly_session),
) -> list[CountryRead]:
    statement = (
        select(Country)
        .order_by(Country.name.asc())
        .offset(offset)
        .limit(limit)
    )
    return session.exec(statement).all()


@public_router.get("/{country_code}", response_model=CountryRead)
def get_country(
    country_code: str,
    session: Session = Depends(get_readonly_session),
) -> CountryRead:
    country = session.get(Country, country_code.upper())
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    return country
