#!/usr/bin/env python3
"""Development server runner for Paperless-NGX Dedupe.

Runs both backend and frontend concurrently for local development.
"""

import asyncio
import os
import shutil
import signal
import sys
from pathlib import Path

# ANSI color codes
RESET = "\033[0m"
CYAN = "\033[36m"
MAGENTA = "\033[35m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"


class DevServer:
    def __init__(self):
        self.backend_process = None
        self.frontend_process = None
        self.root_dir = Path(__file__).parent
        self.frontend_dir = self.root_dir / "frontend"
        self.running = False

    def check_requirements(self) -> bool:
        """Check if required tools are installed."""
        missing = []
        if not shutil.which("uv"):
            missing.append("uv (curl -LsSf https://astral.sh/uv/install.sh | sh)")
        if not shutil.which("node"):
            missing.append("Node.js (https://nodejs.org/)")

        if missing:
            print(f"{RED}Missing requirements:{RESET}")
            for req in missing:
                print(f"  - {req}")
            return False
        return True

    def load_env(self) -> dict:
        """Set up environment variables for local development."""
        env = os.environ.copy()

        # Defaults
        env.setdefault(
            "PAPERLESS_DEDUPE_DATABASE_URL", "sqlite:///data/paperless_dedupe.db"
        )
        env.setdefault(
            "PAPERLESS_DEDUPE_SECRET_KEY", "dev-secret-key-change-me-please-1234"
        )
        env.setdefault("PAPERLESS_DEDUPE_LOG_LEVEL", "INFO")

        # OTEL resource attributes
        if "OTEL_RESOURCE_ATTRIBUTES" not in env:
            instance_id = getattr(
                os, "uname", lambda: type("", (), {"nodename": str(os.getpid())})()
            ).nodename
            env["OTEL_RESOURCE_ATTRIBUTES"] = (
                f"service.name=paperless-dedupe,service.namespace=paperless-ngx,"
                f"deployment.environment=development,service.instance.id={instance_id}"
            )

        # Load .env file
        env_file = self.root_dir / ".env"
        if env_file.exists():
            print(f"{YELLOW}Loading .env{RESET}")
            for line in env_file.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    value = value.strip().strip("\"'")
                    if key == "OTEL_EXPORTER_OTLP_HEADERS":
                        value = value.replace("%20", " ")
                    env[key.strip()] = value

        return env

    def print_line(self, name: str, color: str, line: str):
        """Print colored output from a process."""
        if line:
            print(f"{color}[{name}]{RESET} {line}", end="")

    async def read_output(self, process, name: str, color: str):
        """Read process output continuously."""
        if not process or not process.stdout:
            return
        try:
            async for line in process.stdout:
                if not self.running:
                    break
                try:
                    self.print_line(name, color, line.decode("utf-8"))
                except UnicodeDecodeError:
                    self.print_line(
                        name, color, line.decode("latin-1", errors="replace")
                    )
        except Exception:
            pass

    async def run_backend(self, env: dict) -> bool:
        """Run the backend FastAPI server."""
        print(f"{CYAN}Starting backend...{RESET}")
        os.makedirs("data", exist_ok=True)

        # Run migrations
        print(f"{CYAN}Running migrations...{RESET}")
        proc = await asyncio.create_subprocess_exec(
            "uv",
            "run",
            "alembic",
            "upgrade",
            "head",
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self.root_dir,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"{RED}Migration failed: {stderr.decode()}{RESET}")
            return False

        # Build uvicorn command
        log_level = env.get("PAPERLESS_DEDUPE_LOG_LEVEL", "INFO").lower()
        otel_configured = any(k.startswith("OTEL_EXPORTER") for k in env)

        if otel_configured:
            print(f"{CYAN}OTEL detected - disabling hot-reload{RESET}")
            cmd = [
                "uv",
                "run",
                "opentelemetry-instrument",
                "uvicorn",
                "paperless_dedupe.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                "30001",
                "--log-level",
                log_level,
            ]
        else:
            cmd = [
                "uv",
                "run",
                "uvicorn",
                "paperless_dedupe.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                "30001",
                "--log-level",
                log_level,
                "--reload",
            ]

        self.backend_process = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=self.root_dir,
        )
        return True

    async def run_frontend(self, env: dict) -> bool:
        """Run the frontend Vite dev server."""
        print(f"{MAGENTA}Starting frontend...{RESET}")

        # Install deps if needed
        if not (self.frontend_dir / "node_modules").exists():
            print(f"{MAGENTA}Installing frontend dependencies...{RESET}")
            proc = await asyncio.create_subprocess_exec(
                "npm",
                "install",
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=self.frontend_dir,
            )
            async for line in proc.stdout:
                self.print_line("FRONTEND", MAGENTA, line.decode())
            await proc.wait()
            if proc.returncode != 0:
                print(f"{RED}npm install failed{RESET}")
                return False

        self.frontend_process = await asyncio.create_subprocess_exec(
            "npm",
            "run",
            "dev",
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=self.frontend_dir,
        )
        return True

    async def stop_process(self, process, name: str, color: str):
        """Stop a process gracefully."""
        if not process or process.returncode is not None:
            return
        try:
            process.terminate()
            await asyncio.wait_for(process.wait(), timeout=5)
        except (TimeoutError, ProcessLookupError):
            try:
                process.kill()
                await process.wait()
            except ProcessLookupError:
                pass
        print(f"{color}{name} stopped{RESET}")

    async def run(self):
        """Run both servers concurrently."""
        if not self.check_requirements():
            sys.exit(1)

        env = self.load_env()

        print(f"{GREEN}{'=' * 55}{RESET}")
        print(f"{GREEN}   Paperless-NGX Dedupe - Development Server{RESET}")
        print(f"{GREEN}{'=' * 55}{RESET}")
        print(f"{YELLOW}Backend API: http://localhost:30001{RESET}")
        print(f"{YELLOW}Frontend UI: http://localhost:3000{RESET}")
        print(f"{YELLOW}API Docs:    http://localhost:30001/docs{RESET}")
        print(f"{YELLOW}Press Ctrl+C to stop{RESET}")
        print(f"{GREEN}{'=' * 55}{RESET}\n")

        self.running = True

        try:
            if not await self.run_backend(env) or not await self.run_frontend(env):
                print(f"{RED}Failed to start servers{RESET}")
                return

            await asyncio.gather(
                self.read_output(self.backend_process, "BACKEND", CYAN),
                self.read_output(self.frontend_process, "FRONTEND", MAGENTA),
                self.backend_process.wait()
                if self.backend_process
                else asyncio.sleep(0),
                self.frontend_process.wait()
                if self.frontend_process
                else asyncio.sleep(0),
                return_exceptions=True,
            )
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Shutting down...{RESET}")
        finally:
            self.running = False
            await self.stop_process(self.backend_process, "Backend", CYAN)
            await self.stop_process(self.frontend_process, "Frontend", MAGENTA)
            print(f"{GREEN}Goodbye!{RESET}")


def main():
    """Main entry point."""
    signal.signal(signal.SIGINT, lambda s, f: None)
    try:
        asyncio.run(DevServer().run())
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
