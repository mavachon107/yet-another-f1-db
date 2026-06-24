"""Entry point for the standalone scheduler: ``python -m app.scheduler``.

Default: start the long-running scheduler (recurring planner + per-session jobs).
``--once``: run a single planning + fetch pass and exit (cron / local testing).
"""

from __future__ import annotations

import argparse
import logging


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    parser = argparse.ArgumentParser(prog="app.scheduler")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single planning + fetch pass and exit (no long-running process).",
    )
    args = parser.parse_args()

    if args.once:
        from app.scheduler import planner

        planner.run_once()
        return

    from app.scheduler import runner

    runner.start()


if __name__ == "__main__":
    main()
