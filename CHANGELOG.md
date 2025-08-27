# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub Actions CI/CD pipeline for automated testing and deployment
- Multi-platform Docker image support (amd64, arm64)
- Automated dependency updates with Dependabot
- Comprehensive documentation (CONTRIBUTING.md, SECURITY.md)
- Docker image publishing to GitHub Container Registry

### Changed

- Improved documentation for open source release
- Enhanced .env.example with clear optional configuration notes
- Separated development and production docker-compose configurations

## [1.0.0] - 2025-01-18

### Added

- **Web Interface**: Modern React TypeScript frontend with real-time updates

  - Dashboard with statistics and system overview
  - Virtual scrolling for large document collections
  - Real-time WebSocket updates for processing status
  - Web-based configuration interface
  - Visual duplicate group management

- **Core Features**:

  - Advanced fuzzy matching using MinHash/LSH algorithms
  - Multi-factor confidence scoring system
  - Scalable architecture handling 13,000+ documents
  - Redis caching layer for performance
  - PostgreSQL for persistent storage

- **API Endpoints**:

  - Complete REST API with OpenAPI documentation
  - Document management and synchronization
  - Duplicate group operations
  - Processing control and monitoring
  - Configuration management

- **Deduplication Engine**:

  - MinHash signatures for fast similarity detection
  - LSH indexing for O(n log n) scaling
  - Fuzzy text matching for OCR variations
  - Configurable similarity thresholds

- **Developer Experience**:
  - Docker and docker-compose support
  - Comprehensive test suite with pytest
  - Type hints throughout Python codebase
  - TypeScript for frontend type safety

### Performance

- Processes ~1000 documents/minute on modern hardware
- Sub-linear complexity using LSH indexing
- Memory efficient (~50MB for 13K document metadata)
- Multi-layer caching strategy

### Infrastructure

- FastAPI backend with async/await support
- React 19 with Redux Toolkit for state management
- WebSocket integration for real-time updates
- Health checks for all services
- Automatic database migrations with Alembic

## [0.1.0] - 2025-01-01 (Pre-release)

### Added

- Initial proof of concept
- Basic deduplication algorithm
- Command-line interface
- SQLite storage backend

---

## Release Types

- **Major (X.0.0)**: Breaking changes to API or configuration
- **Minor (0.X.0)**: New features, backwards compatible
- **Patch (0.0.X)**: Bug fixes and minor improvements

## Upgrade Notes

### From 0.x to 1.0.0

- First stable release - no upgrade path from pre-release versions
- Recommend fresh installation with Docker

[Unreleased]: https://github.com/rknightion/paperless-ngx-dedupe/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rknightion/paperless-ngx-dedupe/releases/tag/v1.0.0
[0.1.0]: https://github.com/rknightion/paperless-ngx-dedupe/releases/tag/v0.1.0
