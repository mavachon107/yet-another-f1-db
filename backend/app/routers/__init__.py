from app.routers.api_keys import admin_router as admin_api_keys_router
from app.routers.auth import router as auth_router
from app.routers.chat import public_router as public_chat_router

from app.routers.car import admin_router as admin_car_router
from app.routers.car import public_router as public_car_router

from app.routers.championship import admin_router as admin_championship_router
from app.routers.championship import public_router as public_championship_router

from app.routers.circuit import admin_router as admin_circuit_router
from app.routers.circuit import public_router as public_circuit_router

from app.routers.circuit_version import admin_router as admin_circuit_version_router
from app.routers.circuit_version import public_router as public_circuit_version_router

from app.routers.competition import admin_router as admin_competition_router
from app.routers.competition import public_router as public_competition_router

from app.routers.constructor import admin_router as admin_constructor_router
from app.routers.constructor import public_router as public_constructor_router
from app.routers.constructor_lineage import (
    admin_router as admin_constructor_lineage_router,
)
from app.routers.constructor_lineage import (
    public_router as public_constructor_lineage_router,
)
from app.routers.constructor_lineage import router as constructor_lineage_router

from app.routers.country import public_router as public_country_router
from app.routers.csv import router as csv_router

from app.routers.driver import admin_router as admin_driver_router
from app.routers.driver import public_router as public_driver_router

from app.routers.driver_of_the_day import admin_router as admin_dotd_router
from app.routers.driver_of_the_day import public_router as public_dotd_router

from app.routers.penalty import admin_router as admin_penalty_router
from app.routers.penalty import public_router as public_penalty_router

from app.routers.driver_standing import admin_router as admin_standing_router
from app.routers.driver_standing import public_router as public_standing_router

from app.routers.engine import admin_router as admin_engine_router
from app.routers.engine import public_router as public_engine_router

from app.routers.entry import admin_router as admin_event_entry_router
from app.routers.entry import public_router as public_event_entry_router

from app.routers.event import admin_router as admin_event_router
from app.routers.event import public_router as public_event_router

from app.routers.event_championship import admin_router as admin_event_championship_router
from app.routers.event_championship import public_router as public_event_championship_router

from app.routers.reference import admin_router as admin_reference_router
from app.routers.reference import public_router as public_reference_router

from app.routers.regulatory_system import admin_router as admin_regulatory_system_router
from app.routers.regulatory_system import public_router as public_regulatory_system_router

from app.routers.scheduler import admin_router as admin_scheduler_router

from app.routers.season import admin_router as admin_season_router
from app.routers.season import public_router as public_season_router

from app.routers.session import admin_router as admin_session_router
from app.routers.session import public_router as public_session_router

from app.routers.session_result import admin_router as admin_session_result_router
from app.routers.session_result import public_router as public_session_result_router

from app.routers.stats import admin_router as admin_stats_router
from app.routers.stats import public_router as public_stats_router

from app.routers.team import admin_router as admin_team_router
from app.routers.team import public_router as public_team_router

from app.routers.tire import admin_router as admin_tire_router
from app.routers.tire import public_router as public_tire_router

__all__ = [
    "admin_api_keys_router",
    "auth_router",
    "public_chat_router",
    "admin_car_router",
    "public_car_router",
    "admin_championship_router",
    "public_championship_router",
    "admin_circuit_router",
    "public_circuit_router",
    "admin_circuit_version_router",
    "public_circuit_version_router",
    "admin_competition_router",
    "public_competition_router",
    "admin_constructor_router",
    "public_constructor_router",
    "constructor_lineage_router",
    "admin_constructor_lineage_router",
    "public_constructor_lineage_router",
    "public_country_router",
    "csv_router",
    "admin_driver_router",
    "public_driver_router",
    "admin_dotd_router",
    "public_dotd_router",
    "admin_penalty_router",
    "public_penalty_router",
    "admin_standing_router",
    "public_standing_router",
    "admin_engine_router",
    "public_engine_router",
    "admin_event_entry_router",
    "public_event_entry_router",
    "admin_event_router",
    "public_event_router",
    "admin_event_championship_router",
    "public_event_championship_router",
    "admin_reference_router",
    "public_reference_router",
    "admin_regulatory_system_router",
    "public_regulatory_system_router",
    "admin_season_router",
    "public_season_router",
    "admin_session_router",
    "public_session_router",
    "admin_session_result_router",
    "public_session_result_router",
    "admin_stats_router",
    "public_stats_router",
    "admin_team_router",
    "public_team_router",
    "admin_tire_router",
    "public_tire_router",
]
