"""Standalone OpenF1 auto-fetch scheduler.

Runs as a dedicated process (``python -m app.scheduler``), separate from the web app.
It periodically plans per-session fetch jobs aligned to each session's true end time
(read from OpenF1's UTC ``date_end``) and fetches results/weather/fastest-laps shortly
after a session ends, retrying until the data is published, then going quiet.
"""
