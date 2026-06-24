from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Make `backend/app` importable when running this script directly.
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlmodel import Session, select

from app.core.security import MAX_BCRYPT_PASSWORD_BYTES, get_password_hash
from app.database import engine
from app.models.user import User, UserRole


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or promote an admin user."
    )
    parser.add_argument("--email", required=True, help="Admin email")
    parser.add_argument(
        "--password",
        default=os.getenv("ADMIN_PASSWORD"),
        help="Admin password (or set ADMIN_PASSWORD env var)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    email = args.email.strip()
    password = args.password

    if not email:
        raise SystemExit("Email cannot be empty.")
    if not password:
        raise SystemExit("Password is required. Use --password or ADMIN_PASSWORD.")
    if len(password.encode("utf-8")) > MAX_BCRYPT_PASSWORD_BYTES:
        raise SystemExit(
            f"Password is too long for bcrypt. Max {MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes."
        )

    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == email)).first()
        if existing:
            existing.role = UserRole.admin
            existing.is_active = True
            existing.password_hash = get_password_hash(password)
            session.add(existing)
            session.commit()
            print(f"Updated existing user as admin: {email}")
            return

        user = User(
            email=email,
            password_hash=get_password_hash(password),
            role=UserRole.admin,
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        print(f"Created admin user id={user.id}, email={email}")


if __name__ == "__main__":
    main()
