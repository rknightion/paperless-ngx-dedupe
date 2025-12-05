# Changelog

## [0.2.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.1.0...v0.2.0) (2025-12-05)


### ⚠ BREAKING CHANGES

* SQLite support removed, PostgreSQL 16+ now required

### Features

* **api:** add batch operations endpoint stub ([6a35c72](https://github.com/rknightion/paperless-ngx-dedupe/commit/6a35c7296bff52f50dc27abc08669eca51e759d0))
* **api:** add dynamic confidence recalculation to duplicate groups API ([767b389](https://github.com/rknightion/paperless-ngx-dedupe/commit/767b389f8cecc37d34be9b6247a3e9fbcea05a42))
* **api:** enhance document and duplicate data models ([7a1e0a1](https://github.com/rknightion/paperless-ngx-dedupe/commit/7a1e0a16e5b3abd3e63bc82490f098cff44ab47c))
* **api:** enhance document sync with metadata and duplicate groups pagination ([53621b5](https://github.com/rknightion/paperless-ngx-dedupe/commit/53621b5dad2d27bfb6c3a2155b8c61d46ca8556a))
* **api:** improve sorting of duplicate groups by filename ([4e71d70](https://github.com/rknightion/paperless-ngx-dedupe/commit/4e71d703f6fcc54b1678611541ae7977185428cc))
* **app:** add global exception handling middleware ([bb614a9](https://github.com/rknightion/paperless-ngx-dedupe/commit/bb614a9e742ff04449757c3097072cb3641f225a))
* **bulk-operations:** implement batch actions and operation management ([4ed7a9e](https://github.com/rknightion/paperless-ngx-dedupe/commit/4ed7a9eb61b4f7d636e936b5a09e4e41df03ec27))
* **config:** add confidence score factor configuration ([3ec0b51](https://github.com/rknightion/paperless-ngx-dedupe/commit/3ec0b51b311491d3250880e1a615b52a29ff05d8))
* **config:** add configurable logging level ([a5d0bb9](https://github.com/rknightion/paperless-ngx-dedupe/commit/a5d0bb99f245968ee5d38bdb73ab2c7a8f48b66d))
* **dashboard:** redesign documents page and remove processing tab ([5718bdd](https://github.com/rknightion/paperless-ngx-dedupe/commit/5718bdd7252430fd1dcc00a069a03b8b7e2cd470))
* **database:** implement Alembic migrations ([93e6b3d](https://github.com/rknightion/paperless-ngx-dedupe/commit/93e6b3dac577ddd0f4c8912b0cadc69e84571053))
* **database:** increase max OCR length and set fixed limits ([15e6629](https://github.com/rknightion/paperless-ngx-dedupe/commit/15e66294184bf66f840cf3d2306363247f93ad87))
* **db:** add metadata fields to document model ([81db043](https://github.com/rknightion/paperless-ngx-dedupe/commit/81db0435f3ce5ab293f99ce4c6f4a1691330f621))
* **deduplication:** improve document processing with pagination ([c7539aa](https://github.com/rknightion/paperless-ngx-dedupe/commit/c7539aa2b76543f46c34a956e1135889f9eb838e))
* **docker:** improve service health checks and startup reliability ([defeaab](https://github.com/rknightion/paperless-ngx-dedupe/commit/defeaab614a78cd915a523b4dae3b6322215f33f))
* **duplicates:** add pagination and sorting to duplicates page ([fa52ece](https://github.com/rknightion/paperless-ngx-dedupe/commit/fa52ece360dc34e16c2e0dedab81064a81e1eb84))
* **duplicates:** enhance duplicate group card with tooltips and document actions ([c22f145](https://github.com/rknightion/paperless-ngx-dedupe/commit/c22f145ab6e19aa3c662bbaa04cd5a2c8efbdd83))
* migrate to PostgreSQL with worker queue architecture ([657f741](https://github.com/rknightion/paperless-ngx-dedupe/commit/657f741b3fc60377dd80977b9dfc137c0927e63a))
* **models:** add component scores to duplicate groups ([705e6e2](https://github.com/rknightion/paperless-ngx-dedupe/commit/705e6e21a228ac7a43af936e4b9c0cb9cd4f7095))
* **sync:** add document sync component with status tracking ([b02dcbe](https://github.com/rknightion/paperless-ngx-dedupe/commit/b02dcbef8bcd8c4d9f3560c9dfd086d2d4edba46))
* **telemetry:** add OpenTelemetry integration ([e90b74f](https://github.com/rknightion/paperless-ngx-dedupe/commit/e90b74fff8052cb921954eb810bb753939917af2))
* **ui:** add tooltip to primary document badge with selection criteria ([3d1f7de](https://github.com/rknightion/paperless-ngx-dedupe/commit/3d1f7defcef58798662a74e3863e98c2bf9333fc))
* **ui:** add utility function for merging Tailwind classes ([92c671f](https://github.com/rknightion/paperless-ngx-dedupe/commit/92c671f84e26daaa283554c20e122d245028b16c))
* **ui:** enhance duplicate management with improved similarity visualization ([4c77333](https://github.com/rknightion/paperless-ngx-dedupe/commit/4c77333a06f5b59d5c6c62183b2ad2cec43fea07))
* **ui:** implement dynamic confidence controls in duplicates page ([0b4c6d5](https://github.com/rknightion/paperless-ngx-dedupe/commit/0b4c6d5a2d50abc90cfb04c2fc58a96593a3f3de))
* **ui:** implement tooltip component and checkbox improvements ([59ea636](https://github.com/rknightion/paperless-ngx-dedupe/commit/59ea63649c1a5fab437b7cca00611b7057e17314))


### Bug Fixes

* **api:** add robust error handling to duplicate groups endpoint ([66f8871](https://github.com/rknightion/paperless-ngx-dedupe/commit/66f8871073a68133927c0838180330063bb0d626))
* **api:** improve error handling and logging in paperless connection test ([91eedcd](https://github.com/rknightion/paperless-ngx-dedupe/commit/91eedcd2208220ab1b037bb3172b1717bb275b98))
* **connection:** improve Paperless API connection test reliability ([522caf3](https://github.com/rknightion/paperless-ngx-dedupe/commit/522caf30f77af52c7d18b945d68d3effed5f631e))
* **documents:** correct summary page label from 'deduped' to 'analyzed' ([53bd49c](https://github.com/rknightion/paperless-ngx-dedupe/commit/53bd49cd501c5be7432f45fa21f63376e0c24cd3))
* **frontend:** handle null statistics in duplicates page ([0bc40e3](https://github.com/rknightion/paperless-ngx-dedupe/commit/0bc40e37e3a35ebf479a4cc5facc5020ef5e87a2))
* **sync:** improve sync status handling after app restart ([009d37e](https://github.com/rknightion/paperless-ngx-dedupe/commit/009d37e7d01edd9dd9d0b0a0f328a7880eb5c478))
* **ui:** improve progress tracking and error handling ([766d151](https://github.com/rknightion/paperless-ngx-dedupe/commit/766d151ee82bb997a8a60c42f9c5cd2d99c0ac75))


### Performance Improvements

* **deduplication:** optimize document similarity comparison ([2035563](https://github.com/rknightion/paperless-ngx-dedupe/commit/203556391a37f4c661e5192b7a00ea72e7b781ff))


### Documentation

* **github:** add issue templates and enhance project documentation ([9588580](https://github.com/rknightion/paperless-ngx-dedupe/commit/95885805b1f7fc1f172875abe819540c1a7454b9))
* update documentation with Alembic workflow and Redis removal ([0c10032](https://github.com/rknightion/paperless-ngx-dedupe/commit/0c10032dbf0107249f8c45486b2fec6608cdf04b))
* update todos with completed UI improvements ([2f4d803](https://github.com/rknightion/paperless-ngx-dedupe/commit/2f4d8030595e638ba1d80d79820398d93f293f94))


### Miscellaneous Chores

* **config:** increase deduplication thresholds for better accuracy ([2cc8e68](https://github.com/rknightion/paperless-ngx-dedupe/commit/2cc8e6830614b79688fa4137c50552d32a784601))
* **deps:** pin dependencies ([0b38781](https://github.com/rknightion/paperless-ngx-dedupe/commit/0b38781ff20c08185d4436c456fa4c388eea96f4))
* **dev:** add pre-commit configuration for code quality ([4ae9e0f](https://github.com/rknightion/paperless-ngx-dedupe/commit/4ae9e0f59f5218604fe448377cc0e248231ff821))
* **dev:** improve development environment configuration ([21ce3ad](https://github.com/rknightion/paperless-ngx-dedupe/commit/21ce3ad6ba73aad74d15422d26f9d729457ff725))
* **dev:** setup monitoring and improve dev environment ([9c8c9bd](https://github.com/rknightion/paperless-ngx-dedupe/commit/9c8c9bd594afa1c5c30e17fdfaba9e15d6a0e2f2))
* update dependency versions and improve code formatting ([6c0e2b1](https://github.com/rknightion/paperless-ngx-dedupe/commit/6c0e2b1733955b0629f0df4a894223d675a58954))


### Code Refactoring

* **client:** improve PaperlessClient configuration handling ([8964053](https://github.com/rknightion/paperless-ngx-dedupe/commit/89640539a74d008bdedead695ba09e9135f233ca))
* **config:** improve paperless connection configuration management ([54727e5](https://github.com/rknightion/paperless-ngx-dedupe/commit/54727e5197573a65d3777ecc8a9ccfa126fd6efc))
* **config:** remove Redis dependency ([7fb3ede](https://github.com/rknightion/paperless-ngx-dedupe/commit/7fb3edec253ecd8368a3b4a9da00d514eb2f0a21))
* **database:** migrate from PostgreSQL to SQLite for local development ([dd76714](https://github.com/rknightion/paperless-ngx-dedupe/commit/dd76714d4b7580f638ede57f13b2fcc760c999a2))
* **dev:** improve development server logging and enable hot-reloading ([6744efb](https://github.com/rknightion/paperless-ngx-dedupe/commit/6744efb91c3c572241d56bff382f19763a067270))
* **frontend:** fix unused variable warnings and clean up exports ([17300bf](https://github.com/rknightion/paperless-ngx-dedupe/commit/17300bf8472e789f99f3bfe2caf760109c97945f))
* **frontend:** replace polling with websocket for real-time updates ([b881289](https://github.com/rknightion/paperless-ngx-dedupe/commit/b8812893397fcac4d4f1d61e31973b95c0a787ea))
* remove Alembic and restructure database components ([d8ba569](https://github.com/rknightion/paperless-ngx-dedupe/commit/d8ba56960d1dc3321913010be032519057748775))
* **services:** improve deduplication service with component scores ([d2dd7a1](https://github.com/rknightion/paperless-ngx-dedupe/commit/d2dd7a163a1d42e76663a94f93b36c216f80eca7))
* **tests:** remove unused import in test configuration ([4c8b509](https://github.com/rknightion/paperless-ngx-dedupe/commit/4c8b509f2d9ff3c9da0a4e45fbf371d194878172))
* **ui:** update component import paths ([97762d6](https://github.com/rknightion/paperless-ngx-dedupe/commit/97762d691a3bab00b623f43e69ba1a2238994c34))


### Build System

* **docker:** improve dockerfile reliability and dependency management ([639e544](https://github.com/rknightion/paperless-ngx-dedupe/commit/639e544e6bf28bcee9e0d3062eb483f8c0bf2320))
* **docker:** optimize dependency installation process ([49fcad9](https://github.com/rknightion/paperless-ngx-dedupe/commit/49fcad99f667929741b6907f73195c7555685b84))
* **frontend:** add grafana faro rollup plugin to dependencies ([1ce52b8](https://github.com/rknightion/paperless-ngx-dedupe/commit/1ce52b88ba6361d75b0de8352d1c278dba383a0c))
* **frontend:** add tooltip component dependency ([37e3451](https://github.com/rknightion/paperless-ngx-dedupe/commit/37e34511d809a7dc7c5915c122c9f13712ccf44f))
* **frontend:** integrate prettier with eslint and add faro uploader ([54d1c8f](https://github.com/rknightion/paperless-ngx-dedupe/commit/54d1c8fa773b17a9710845ee31191853bcba87f2))
* **frontend:** remove --only=production flag from npm ci ([ffe2676](https://github.com/rknightion/paperless-ngx-dedupe/commit/ffe267673172f2c634dcf8679c49030c0128c918))
