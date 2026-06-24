"""URL slug generation for public entities.

A slug is the canonical public URL key for an entity, e.g. ``alexander_albon``
or ``ferrari_sf_23``. It is derived deterministically from the entity's
human-readable name(s) (ascii-folded, lowercased, non-alphanumeric runs
collapsed to ``_``) and made unique within its table by appending ``_2``,
``_3`` … on collision.
"""

import re
import unicodedata

from sqlmodel import Session, select


def slugify_text(*parts: str) -> str:
    """Build a base slug from one or more text parts.

    ``Nico``/``Hülkenberg`` -> ``nico_hulkenberg``,
    ``Ferrari``/``SF-23`` -> ``ferrari_sf_23``.
    """
    raw = " ".join(p for p in parts if p)
    normalized = unicodedata.normalize("NFKD", raw)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "_", ascii_only).strip("_")


def slugify(first_name: str, last_name: str) -> str:
    """Driver slug from first and last name (kept for backwards-compat)."""
    return slugify_text(first_name, last_name)


def unique_slug(
    session: Session,
    model_cls,
    base: str,
    exclude_id: int | None = None,
) -> str:
    """Return a slug guaranteed unique across ``model_cls``'s table.

    ``model_cls`` must have ``id`` and ``slug`` columns. ``exclude_id`` skips a
    row's own record so regenerating its slug on rename does not self-collide.
    """
    base = base or getattr(model_cls, "__tablename__", "item")
    candidate = base
    suffix = 2
    while True:
        statement = select(model_cls.id).where(model_cls.slug == candidate)
        if exclude_id is not None:
            statement = statement.where(model_cls.id != exclude_id)
        if session.exec(statement).first() is None:
            return candidate
        candidate = f"{base}_{suffix}"
        suffix += 1


def unique_driver_slug(
    session: Session,
    first_name: str,
    last_name: str,
    exclude_id: int | None = None,
) -> str:
    """Return a slug unique across the ``driver`` table."""
    from app.models.driver import Driver

    return unique_slug(
        session, Driver, slugify_text(first_name, last_name) or "driver", exclude_id
    )
