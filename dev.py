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

# ANSI color codes for output
RESET = "\033[0m"
BACKEND_COLOR = "\033[36m"  # Cyan
FRONTEND_COLOR = "\033[35m"  # Magenta
ERROR_COLOR = "\033[31m"  # Red
SUCCESS_COLOR = "\033[32m"  # Green
INFO_COLOR = "\033[33m"  # Yellow


class DevServer:
    def __init__(self):
        self.backend_process = None
        self.frontend_process = None
        self.root_dir = Path(__file__).parent
        self.frontend_dir = self.root_dir / "frontend"
        self.running = False

    def check_requirements(self):
        """Check if required tools are installed."""
        requirements = []

        # Check for uv (required)
        if not shutil.which("uv"):
            requirements.append(
                "uv (install with: curl -LsSf https://astral.sh/uv/install.sh | sh)"
            )

        # Check for node/npm
        if not shutil.which("node"):
            requirements.append("Node.js (install from: https://nodejs.org/)")

        if not shutil.which("npm"):
            requirements.append("npm (usually comes with Node.js)")

        if requirements:
            print(f"{ERROR_COLOR}❌ Missing requirements:{RESET}")
            for req in requirements:
                print(f"  - {req}")
            print()
            print(
                f"{INFO_COLOR}💡 This script requires uv for Python environment management{RESET}"
            )
            print(f"{INFO_COLOR}   Run it with: uv run python dev.py{RESET}")
            return False

        return True

    def setup_environment(self):
        """Set up environment variables for local development."""
        env = os.environ.copy()

        # Set default environment variables if not already set
        env.setdefault(
            "PAPERLESS_DEDUPE_DATABASE_URL", "sqlite:///data/paperless_dedupe.db"
        )
        env.setdefault(
            "PAPERLESS_DEDUPE_SECRET_KEY", "dev-secret-key-change-in-production"
        )
        env.setdefault("PAPERLESS_DEDUPE_LOG_LEVEL", "INFO")

        # Configure OpenTelemetry Resource attributes for dev without requiring user env
        # See: https://opentelemetry.io/docs/specs/semconv/registry/attributes/service/#service-attributes
        if "OTEL_RESOURCE_ATTRIBUTES" not in env:
            # Prefer hostname as instance id; fall back to PID
            try:
                instance_id = os.uname().nodename  # type: ignore[attr-defined]
            except Exception:
                instance_id = str(os.getpid())

            env["OTEL_RESOURCE_ATTRIBUTES"] = (
                "service.name=paperless-dedupe,"
                "service.namespace=paperless-ngx,"
                "deployment.environment=development,"
                f"service.instance.id={instance_id}"
            )

        # Load from .env if it exists
        env_file = self.root_dir / ".env"
        if env_file.exists():
            print(f"{INFO_COLOR}📄 Loading environment from .env{RESET}")
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        key = key.strip()
                        value = value.strip()
                        # Remove surrounding quotes if present
                        if value and len(value) >= 2:
                            if (value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'"):
                                value = value[1:-1]
                        # Special handling for OTEL_EXPORTER_OTLP_HEADERS
                        # Should be in format: "Authorization=Basic <token>"
                        # NOT URL encoded like "Authorization=Basic%20<token>"
                        if key == "OTEL_EXPORTER_OTLP_HEADERS":
                            # Replace URL-encoded space if present
                            value = value.replace("%20", " ")
                        env[key] = value
                        
            # Debug: Show OTEL env vars if present
            otel_vars = {k: v for k, v in env.items() if k.startswith("OTEL_")}
            if otel_vars:
                print(f"{INFO_COLOR}🔭 OpenTelemetry configuration detected:{RESET}")
                for k, v in otel_vars.items():
                    if "HEADERS" in k or "TOKEN" in k or "AUTH" in k:
                        # Mask sensitive values
                        masked_value = v[:20] + "..." if len(v) > 20 else v
                        print(f"  {k}={masked_value}")
                    else:
                        print(f"  {k}={v}")
                
                # Enable OTEL debug logging if not set
                if "OTEL_LOG_LEVEL" not in env:
                    env["OTEL_LOG_LEVEL"] = "info"
                    print(f"{INFO_COLOR}  Setting OTEL_LOG_LEVEL=info for debugging{RESET}")

        return env

    def print_output(self, name, color, line):
        """Print colored output from a process."""
        if line:
            print(f"{color}[{name}]{RESET} {line}", end="")

    async def read_backend_output(self):
        """Read backend output continuously."""
        if self.backend_process and self.backend_process.stdout:
            try:
                async for line in self.backend_process.stdout:
                    if not self.running:
                        break
                    try:
                        decoded = line.decode("utf-8")
                    except UnicodeDecodeError:
                        decoded = line.decode("latin-1", errors="replace")
                    self.print_output("BACKEND", BACKEND_COLOR, decoded)
            except Exception as e:
                if self.running:
                    print(f"{ERROR_COLOR}Backend output error: {e}{RESET}")

    async def run_backend(self, env):
        """Run the backend FastAPI server."""
        print(f"{BACKEND_COLOR}🚀 Starting backend server...{RESET}")

        # Ensure database directory exists
        os.makedirs("data", exist_ok=True)

        # Run migrations first - but show output in real-time
        print(f"{BACKEND_COLOR}📊 Running database migrations...{RESET}")
        migration_cmd = ["uv", "run", "alembic", "upgrade", "head"]

        try:
            # Run migrations with real-time output
            migration_process = await asyncio.create_subprocess_exec(
                *migration_cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.root_dir,
            )

            # Read migration output
            stdout, stderr = await migration_process.communicate()

            if stdout:
                for line in stdout.decode().splitlines():
                    print(f"{BACKEND_COLOR}[MIGRATION]{RESET} {line}")

            if migration_process.returncode != 0:
                if stderr:
                    print(f"{ERROR_COLOR}❌ Migration failed: {stderr.decode()}{RESET}")
                return False

            print(f"{BACKEND_COLOR}✓ Migrations completed{RESET}")

        except Exception as e:
            print(f"{ERROR_COLOR}❌ Failed to run migrations: {e}{RESET}")
            return False

        # Start the backend server
        # Get log level from environment (default to INFO)
        log_level = env.get("PAPERLESS_DEDUPE_LOG_LEVEL", "INFO").lower()
        print(f"{BACKEND_COLOR}📝 Using log level: {log_level.upper()}{RESET}")
        print(f"{BACKEND_COLOR}🔥 Hot-reloading enabled for development{RESET}")

        # Check if OTEL is configured
        otel_configured = any(k.startswith("OTEL_EXPORTER") for k in env.keys())
        
        # Build uvicorn command - WITHOUT --reload if OTEL is configured
        # (--reload breaks opentelemetry-instrument due to subprocess spawning)
        if otel_configured:
            print(f"{BACKEND_COLOR}⚠️  OTEL detected: Disabling --reload (incompatible with opentelemetry-instrument){RESET}")
            print(f"{BACKEND_COLOR}   See: https://github.com/open-telemetry/opentelemetry-python-contrib/issues/385{RESET}")
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
                # NO --reload when using OTEL!
            ]
        else:
            # Normal dev mode with hot-reloading
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
                "--reload",  # Hot-reloading enabled when not using OTEL
            ]

        # Add access log for info and debug levels
        if log_level in ["info", "debug"]:
            cmd.append("--access-log")

        # Debug: Verify OTEL variables are in env right before subprocess creation
        otel_in_env = {k: v for k, v in env.items() if k.startswith("OTEL_")}
        if otel_in_env:
            print(f"{BACKEND_COLOR}🔭 Passing OTEL config to backend process:{RESET}")
            for k in sorted(otel_in_env.keys()):
                v = otel_in_env[k]
                if "HEADERS" in k or "TOKEN" in k or "AUTH" in k:
                    print(f"{BACKEND_COLOR}  {k}=***{RESET}")
                else:
                    print(f"{BACKEND_COLOR}  {k}={v}{RESET}")
        
        print(f"{BACKEND_COLOR}🚀 Launching backend with command:{RESET}")
        print(f"{BACKEND_COLOR}  {' '.join(cmd)}{RESET}")

        # Normal subprocess creation - no special buffering needed
        self.backend_process = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # Combine streams again
            cwd=self.root_dir,
        )

        # Don't block here - the output will be read in a separate task
        return True

    async def read_frontend_output(self):
        """Read frontend output continuously."""
        if self.frontend_process and self.frontend_process.stdout:
            try:
                async for line in self.frontend_process.stdout:
                    if not self.running:
                        break
                    self.print_output("FRONTEND", FRONTEND_COLOR, line.decode())
            except Exception as e:
                if self.running:
                    print(f"{ERROR_COLOR}Frontend output error: {e}{RESET}")

    async def run_frontend(self, env):
        """Run the frontend Vite dev server."""
        print(f"{FRONTEND_COLOR}🎨 Starting frontend server...{RESET}")

        # Check if node_modules exists, if not run npm install
        node_modules = self.frontend_dir / "node_modules"
        if not node_modules.exists():
            print(f"{FRONTEND_COLOR}📦 Installing frontend dependencies...{RESET}")
            install_cmd = ["npm", "install"]

            install_process = await asyncio.create_subprocess_exec(
                *install_cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=self.frontend_dir,
            )

            async for line in install_process.stdout:
                self.print_output("FRONTEND", FRONTEND_COLOR, line.decode())

            await install_process.wait()
            if install_process.returncode != 0:
                print(f"{ERROR_COLOR}❌ npm install failed{RESET}")
                return False

        # Start the frontend dev server
        cmd = ["npm", "run", "dev"]

        self.frontend_process = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=self.frontend_dir,
        )

        # Don't block here - the output will be read in a separate task
        return True

    async def run(self):
        """Run both servers concurrently."""
        if not self.check_requirements():
            sys.exit(1)

        env = self.setup_environment()

        print(
            f"{SUCCESS_COLOR}═══════════════════════════════════════════════════════{RESET}"
        )
        print(
            f"{SUCCESS_COLOR}   Paperless-NGX Dedupe - Local Development Server{RESET}"
        )
        print(
            f"{SUCCESS_COLOR}═══════════════════════════════════════════════════════{RESET}"
        )
        print()
        print(f"{INFO_COLOR}📝 Backend API: http://localhost:30001{RESET}")
        print(f"{INFO_COLOR}🎨 Frontend UI: http://localhost:3000{RESET}")
        print(f"{INFO_COLOR}📚 API Docs: http://localhost:30001/docs{RESET}")
        print()
        print(f"{INFO_COLOR}Press Ctrl+C to stop all servers{RESET}")
        print(
            f"{SUCCESS_COLOR}═══════════════════════════════════════════════════════{RESET}"
        )
        print()

        self.running = True

        try:
            # Start both servers
            backend_started = await self.run_backend(env)
            frontend_started = await self.run_frontend(env)

            if not backend_started or not frontend_started:
                print(f"{ERROR_COLOR}❌ Failed to start servers{RESET}")
                return

            # Run output readers and wait for processes concurrently
            await asyncio.gather(
                self.read_backend_output(),
                self.read_frontend_output(),
                self.backend_process.wait()
                if self.backend_process
                else asyncio.sleep(0),
                self.frontend_process.wait()
                if self.frontend_process
                else asyncio.sleep(0),
                return_exceptions=True,
            )
        except KeyboardInterrupt:
            print(f"\n{INFO_COLOR}🛑 Shutting down servers...{RESET}")
        finally:
            await self.cleanup()

    async def cleanup(self):
        """Clean up processes on exit."""
        self.running = False

        if self.backend_process and self.backend_process.returncode is None:
            try:
                self.backend_process.terminate()
                await asyncio.wait_for(self.backend_process.wait(), timeout=5)
                print(f"{BACKEND_COLOR}✓ Backend server stopped{RESET}")
            except TimeoutError:
                try:
                    self.backend_process.kill()
                    await self.backend_process.wait()
                    print(f"{BACKEND_COLOR}✓ Backend server forcibly stopped{RESET}")
                except ProcessLookupError:
                    # Process already terminated
                    print(f"{BACKEND_COLOR}✓ Backend server already stopped{RESET}")
            except ProcessLookupError:
                # Process already terminated
                print(f"{BACKEND_COLOR}✓ Backend server already stopped{RESET}")
        elif self.backend_process:
            print(f"{BACKEND_COLOR}✓ Backend server already stopped{RESET}")

        if self.frontend_process and self.frontend_process.returncode is None:
            try:
                self.frontend_process.terminate()
                await asyncio.wait_for(self.frontend_process.wait(), timeout=5)
                print(f"{FRONTEND_COLOR}✓ Frontend server stopped{RESET}")
            except TimeoutError:
                try:
                    self.frontend_process.kill()
                    await self.frontend_process.wait()
                    print(f"{FRONTEND_COLOR}✓ Frontend server forcibly stopped{RESET}")
                except ProcessLookupError:
                    # Process already terminated
                    print(f"{FRONTEND_COLOR}✓ Frontend server already stopped{RESET}")
            except ProcessLookupError:
                # Process already terminated
                print(f"{FRONTEND_COLOR}✓ Frontend server already stopped{RESET}")
        elif self.frontend_process:
            print(f"{FRONTEND_COLOR}✓ Frontend server already stopped{RESET}")

        print(f"{SUCCESS_COLOR}👋 Goodbye!{RESET}")


def signal_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    # The KeyboardInterrupt will be caught in the async run method
    pass


async def main():
    """Main entry point."""
    signal.signal(signal.SIGINT, signal_handler)
    server = DevServer()
    await server.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        # Suppress the traceback for clean exit
        sys.exit(0)
