# Repository Guidelines

## Project Structure & Module Organization

- Backend: `src/paperless_dedupe/` (FastAPI). Key areas: `api/v1/` (routes), `services/` (business logic), `core/` (config), `models/` (DB + Alembic).
- Frontend: `frontend/` (Vite + React + TS). Static assets in `frontend/public/`.
- Tests: `tests/` with `unit/`, `integration/`, and `benchmarks/`; common fixtures in `tests/fixtures/`.
- Migrations: `alembic/` with `alembic.ini`.
- Scripts: `scripts/` (e.g., `test.sh`, `setup-dev.sh`). Runtime data in `data/`. Environment in `.env`.

## Build, Test, and Development Commands

- Install deps: `uv sync` (uses `pyproject.toml`).
- Run dev (backend+frontend): `uv run paperless-dedupe-dev` (or `uv run python dev.py`).
- Backend only: `uv run uvicorn paperless_dedupe.main:app --reload --port 30001`.
- Frontend only: `npm -C frontend install && npm -C frontend run dev`.
- DB up (for integration): `docker-compose up -d postgres redis`; migrate: `uv run alembic upgrade head`.
- Tests: `uv run pytest` or `./scripts/test.sh` (coverage and benchmarks).

## Coding Style & Naming Conventions

- Python: ruff for lint + format (`pre-commit` runs `ruff-check --fix` and `ruff-format`). Target Py 3.13, line length 88, 4-space indents.
- Types: mypy configured; prefer precise typing and `pydantic` models at boundaries.
- Naming: modules/packages `snake_case`; classes `PascalCase`; functions/vars `snake_case`.
- Frontend: ESLint + Prettier; components `PascalCase.tsx`, hooks `useX.ts`, utilities `camelCase.ts`.

## Testing Guidelines

- Framework: `pytest` with markers: `unit`, `integration`, `slow`.
- Structure: `tests/unit/test_*.py`, `tests/integration/test_*.py`, `tests/benchmarks/`.
- Run subsets: `uv run pytest -m unit -q`, single test: `uv run pytest -k name -q`.
- Coverage: HTML report in `htmlcov/`; pre-commit enforces a minimal threshold.

## Commit & Pull Request Guidelines

- Style: Conventional Commits (e.g., `feat(api): add batch endpoint`, `fix(ui): handle empty state`).
- Before PR: run `pre-commit run -a` and `uv run pytest` (DB-backed tests require services up).
- PRs: include clear description, linked issues, screenshots/GIFs for UI, migration notes for DB changes, and test notes (which markers ran).

## Security & Configuration

- Use `.env.example` → `.env`; never commit secrets. Hooks run `detect-secrets` and `gitleaks`.
- Optional telemetry via OTEL env vars; see `dev.py` for helpful defaults and logging.
