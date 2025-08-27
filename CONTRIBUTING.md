# Contributing to Paperless-NGX Deduplication Tool

Thank you for your interest in contributing to the Paperless-NGX Deduplication Tool! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Accept feedback gracefully

## How to Contribute

### Reporting Issues

1. **Check existing issues** first to avoid duplicates
2. Use the issue templates when available
3. Provide clear descriptions including:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details (OS, Docker version, etc.)
   - Relevant logs or screenshots

### Suggesting Features

1. Open a feature request issue
2. Describe the problem you're trying to solve
3. Explain your proposed solution
4. Be open to discussion and alternative approaches

### Contributing Code

#### Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/your-username/paperless-ngx-dedupe.git
   cd paperless-ngx-dedupe
   ```

2. **Set up the development environment**

   **Backend (Python):**

   ```bash
   # Install uv package manager
   curl -LsSf https://astral.sh/uv/install.sh | sh

   # Install dependencies
   uv sync --dev

   # Start development services
   docker-compose -f docker-compose.dev.yml up -d postgres redis

   # Run the backend
   uv run uvicorn paperless_dedupe.main:app --reload --port 30001
   ```

   **Frontend (React/TypeScript):**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Workflow

1. **Write clean, documented code**

   - Follow PEP 8 for Python code
   - Use TypeScript for frontend code
   - Add type hints to all Python functions
   - Write clear, concise comments for complex logic

2. **Write tests**

   - Add unit tests for new functionality
   - Ensure existing tests pass
   - Aim for >80% code coverage

   ```bash
   # Run Python tests
   uv run pytest

   # Run with coverage
   uv run pytest --cov=paperless_dedupe

   # Run frontend tests
   cd frontend && npm test
   ```

3. **Lint and format your code**

   ```bash
   # Backend
   uv run ruff check src/
   uv run ruff format src/

   # Frontend
   cd frontend
   npm run lint
   npm run format
   ```

4. **Update documentation**

   - Update README.md if adding new features
   - Add docstrings to new functions/classes
   - Update CHANGELOG.md with your changes

5. **Commit your changes**

   - Use clear, descriptive commit messages
   - Follow conventional commits format:
     ```
     feat: add new deduplication algorithm
     fix: resolve memory leak in cache service
     docs: update installation instructions
     chore: update dependencies
     ```

6. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   - Fill out the PR template completely
   - Link related issues
   - Ensure all CI checks pass

### Pull Request Guidelines

- **Keep PRs focused** - One feature/fix per PR
- **Update tests** - Add tests for new code
- **Document changes** - Update relevant documentation
- **Follow style guides** - Ensure linting passes
- **Be responsive** - Address review feedback promptly

## Project Structure

```
paperless-ngx-dedupe/
├── src/paperless_dedupe/    # Backend Python code
│   ├── api/v1/              # REST API endpoints
│   ├── core/                # Configuration
│   ├── models/              # Database models
│   └── services/            # Business logic
├── frontend/                # React TypeScript frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/          # Application pages
│   │   ├── services/       # API clients
│   │   └── store/          # Redux state
├── tests/                   # Test suites
├── docker-compose.dev.yml   # Development environment
└── docker-compose.yml       # Production setup
```

## Testing

### Running Tests Locally

```bash
# Backend tests
uv run pytest tests/

# Frontend tests
cd frontend && npm test

# Integration tests (requires Docker)
docker-compose -f docker-compose.dev.yml up -d
uv run pytest tests/integration/
```

### Writing Tests

- Place unit tests in `tests/unit/`
- Place integration tests in `tests/integration/`
- Use fixtures from `tests/fixtures/`
- Mock external services appropriately

## Documentation

- **Code Documentation**: Use docstrings for all public functions
- **API Documentation**: Update OpenAPI schemas when changing endpoints
- **User Documentation**: Update README for user-facing changes
- **Developer Documentation**: Update this file for development changes

## Release Process

1. Update version in `pyproject.toml` and `frontend/package.json`
2. Update CHANGELOG.md
3. Create a git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. GitHub Actions will automatically build and publish Docker images

## Getting Help

- **Discord**: [Join our community](https://discord.gg/paperless-ngx)
- **Issues**: Open a GitHub issue for bugs or questions
- **Discussions**: Use GitHub Discussions for general questions

## Recognition

Contributors will be recognized in:

- The project README
- Release notes
- GitHub contributors page

Thank you for contributing to make document management better for everyone!
