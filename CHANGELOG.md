# Changelog

## [0.5.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.4.0...v0.5.0) (2026-02-15)


### Features

* **jobs:** implement periodic telemetry flushing in workers ([b6fb843](https://github.com/rknightion/paperless-ngx-dedupe/commit/b6fb843320dcbe8c387ec944ad52bc88c9a808e2))
* **telemetry:** add worker telemetry flush functionality ([1a6c00d](https://github.com/rknightion/paperless-ngx-dedupe/commit/1a6c00d6d943d460532c63a6bc6f55eb91a313e1))


### Refactoring

* rebrand from Paperless-Dedupe to Paperless NGX Dedupe ([4b68560](https://github.com/rknightion/paperless-ngx-dedupe/commit/4b68560c98893c9f929bf26d139db14bd2568b72))


### Performance

* **jobs:** add memory limits to worker processes ([1bf39af](https://github.com/rknightion/paperless-ngx-dedupe/commit/1bf39aff650e607078f3ec4b2b898ef5cd8d88a6))
* **telemetry:** configure span limits and remove auto-instrumentation ([cdfa97c](https://github.com/rknightion/paperless-ngx-dedupe/commit/cdfa97cb58622f6065a263a04e21a02ebbce2d63))
* **telemetry:** optimize span recording checks ([c1293f9](https://github.com/rknightion/paperless-ngx-dedupe/commit/c1293f9a99bcb89ce418f1959ed11ec75c82926a))

## [0.4.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.3.1...v0.4.0) (2026-02-15)


### Features

* **dedup:** update default configuration parameters ([5537bb5](https://github.com/rknightion/paperless-ngx-dedupe/commit/5537bb57289bb10e14d9e590e184583e876d1cdc))
* enable prometheus metrics & OTEL ([80490ef](https://github.com/rknightion/paperless-ngx-dedupe/commit/80490ef8937b314d862eb9dcd7bb8212714ae7e1))
* **sync:** optimize document processing and metadata fetching ([7f7dc4a](https://github.com/rknightion/paperless-ngx-dedupe/commit/7f7dc4a121cca0b569db1ca5030e9f19ea922e85))
* **telemetry:** add OpenTelemetry metrics and spans for observability ([474201a](https://github.com/rknightion/paperless-ngx-dedupe/commit/474201ae7db015f0d26f74ce31c922303111c309))
* update UI terminology from 'Unresolved' to 'Pending' groups ([af4fc0f](https://github.com/rknightion/paperless-ngx-dedupe/commit/af4fc0fb8e725658f2825caa1e95089d3021edad))


### Bug Fixes

* **deps:** update dependency commander to v14 ([0b95bd4](https://github.com/rknightion/paperless-ngx-dedupe/commit/0b95bd46b9e1df25f6dc15a9d0fe6f51391d2387))
* **deps:** update dependency commander to v14 ([f522135](https://github.com/rknightion/paperless-ngx-dedupe/commit/f522135da07f9c856702da870c57f00ab228dff9))
* **deps:** update dependency dotenv to v17 ([#137](https://github.com/rknightion/paperless-ngx-dedupe/issues/137)) ([93f84be](https://github.com/rknightion/paperless-ngx-dedupe/commit/93f84be75f3637528bf35e5d95ee0ad52e6d427f))
* **deps:** update dependency pino to v10 ([#138](https://github.com/rknightion/paperless-ngx-dedupe/issues/138)) ([0e5f3fc](https://github.com/rknightion/paperless-ngx-dedupe/commit/0e5f3fc9ccff0ed915b24656f2ac0cb02ec5221f))
* **telemetry:** resolve OpenTelemetry configuration issues ([7c71573](https://github.com/rknightion/paperless-ngx-dedupe/commit/7c715739489b88297575d658ad11a3b4a3ee68b9))
* **test:** correct mock Paperless API response format ([66c6d9c](https://github.com/rknightion/paperless-ngx-dedupe/commit/66c6d9c127814915d34748f2c650dcb1b6652000))


### Miscellaneous

* **deps:** pin dependencies ([#145](https://github.com/rknightion/paperless-ngx-dedupe/issues/145)) ([4f89ad9](https://github.com/rknightion/paperless-ngx-dedupe/commit/4f89ad983286a8a619f7e0521dff2969632c6c59))
* **deps:** update actions/setup-node action to v6 ([#130](https://github.com/rknightion/paperless-ngx-dedupe/issues/130)) ([e6ca353](https://github.com/rknightion/paperless-ngx-dedupe/commit/e6ca3537c3b6390bc489f9dfe30a2d6c63ba1b06))
* **deps:** update dependency @sveltejs/kit to v2.52.0 ([dc8bc15](https://github.com/rknightion/paperless-ngx-dedupe/commit/dc8bc155c053605acd0bf81209cfd9c56f8b9a8d))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v6 ([#131](https://github.com/rknightion/paperless-ngx-dedupe/issues/131)) ([4ab92fc](https://github.com/rknightion/paperless-ngx-dedupe/commit/4ab92fca07a1d2d4168ca88c1572a5686b9829dc))
* **deps:** update dependency svelte to v5.51.1 ([6f00d01](https://github.com/rknightion/paperless-ngx-dedupe/commit/6f00d01eed7bf45fa352d225d8e4259167afabc0))
* **deps:** update dependency svelte to v5.51.2 ([#144](https://github.com/rknightion/paperless-ngx-dedupe/issues/144)) ([91193f4](https://github.com/rknightion/paperless-ngx-dedupe/commit/91193f4207d80991082583b625a5e902d8c83c6b))
* **deps:** update dependency vite to v7 ([#134](https://github.com/rknightion/paperless-ngx-dedupe/issues/134)) ([e2f4f0f](https://github.com/rknightion/paperless-ngx-dedupe/commit/e2f4f0fffd2bfb2f5b5f42363a9a79d15646c5b7))
* **deps:** update postgres docker tag to v18 ([51e3a5e](https://github.com/rknightion/paperless-ngx-dedupe/commit/51e3a5ee0884f5b101da80cb32dd67246b44cc83))
* **deps:** update postgres docker tag to v18 ([b226169](https://github.com/rknightion/paperless-ngx-dedupe/commit/b22616905eb5007ba29ea0808646c62a6f2b6f59))
* fix ci ([979953e](https://github.com/rknightion/paperless-ngx-dedupe/commit/979953ee81b1d931e0b4dc23d8a5f21272b4525e))
* format ([833629f](https://github.com/rknightion/paperless-ngx-dedupe/commit/833629f2bfc0534f6b9222e5a32df8f1b34512e3))
* improve otel ([2fef211](https://github.com/rknightion/paperless-ngx-dedupe/commit/2fef2110e0d8d2f621ce57539fba25276977132c))
* use local bind mount docker ([aaed112](https://github.com/rknightion/paperless-ngx-dedupe/commit/aaed1125edec54533632fc6346b6493475a763c9))


### Refactoring

* **dedup:** simplify metadata scoring to use only file size ([baac696](https://github.com/rknightion/paperless-ngx-dedupe/commit/baac696082a45d40b0bbe6c5c3d2e3953809cce3))
* replace review/resolved flags with status enum ([79d3d4f](https://github.com/rknightion/paperless-ngx-dedupe/commit/79d3d4f498a9c00cbe902621984e7365e8d66e83))
* update Zod schema API for v4 compatibility ([20f1e5d](https://github.com/rknightion/paperless-ngx-dedupe/commit/20f1e5da82cef65f36fed1d5d94fd82186dc576e))


### Tests

* **config:** enhance test configuration with coverage and reporting ([16de79e](https://github.com/rknightion/paperless-ngx-dedupe/commit/16de79e52e902ac20b9a35d64f8b6f70034e50a4))
* **core:** add comprehensive integration tests for Paperless-NGX ([c3d17bd](https://github.com/rknightion/paperless-ngx-dedupe/commit/c3d17bd3274d8348fc9a51cc2bd53d9ada829335))
* update UI text expectations for terminology changes ([922849a](https://github.com/rknightion/paperless-ngx-dedupe/commit/922849abec422f48b2e8265e9e7fcceb280c4d79))
* **web:** add comprehensive E2E API tests ([40f92e1](https://github.com/rknightion/paperless-ngx-dedupe/commit/40f92e1021a94d22b583e4a7329f2a5e8317e65b))

## [0.3.1](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.3.0...v0.3.1) (2026-02-14)


### Features

* **core:** Expose detailed duplicate similarity scores ([df6ef58](https://github.com/rknightion/paperless-ngx-dedupe/commit/df6ef58f5b4c89222c8e41938701d22bf49bb989))
* **core:** Implement comprehensive document statistics ([7074ff2](https://github.com/rknightion/paperless-ngx-dedupe/commit/7074ff284756f63ebde4a5b1e8f1561fdecb5147))
* **web:** Add duplicate group preview modal and score breakdown ([6cfbe36](https://github.com/rknightion/paperless-ngx-dedupe/commit/6cfbe3691409df62179720984bcad0b47d7f030b))
* **web:** Enhance Dashboard with new document statistics ([e066b3f](https://github.com/rknightion/paperless-ngx-dedupe/commit/e066b3ff002e15ddaa6fe2192c7080d12f4a56ca))
* **web:** Improve duplicates page with filters and explanations ([5003e01](https://github.com/rknightion/paperless-ngx-dedupe/commit/5003e01a9f98b4ee65f420de08a07d2d38c58bea))


### Bug Fixes

* **web:** Adjust Tooltip component positioning ([e952544](https://github.com/rknightion/paperless-ngx-dedupe/commit/e952544b0fee568ed6db2e58c82b6fc4bdab0f5b))


### Miscellaneous

* **ci:** Optimize Docker build caching ([a79327a](https://github.com/rknightion/paperless-ngx-dedupe/commit/a79327a158f18781e37aed9dbb9a13b50a63b46b))
* **docker:** Improve Dockerfile and .dockerignore ([ca4630c](https://github.com/rknightion/paperless-ngx-dedupe/commit/ca4630cbfe613f03503b15669e261660f7703611))
* Update actions/checkout version ([ed07b42](https://github.com/rknightion/paperless-ngx-dedupe/commit/ed07b4221b6554b8bf0bf8260d7166114fc00fe5))
* **web:** Centralize byte formatting utility ([64aa8f0](https://github.com/rknightion/paperless-ngx-dedupe/commit/64aa8f06f1794fc51688c35077e3dfdaf9bd21cc))
* **web:** Minor UI refinements and build config ([42987c2](https://github.com/rknightion/paperless-ngx-dedupe/commit/42987c2401602087a04a96ade141e1864bbd5008))


### Documentation

* **readme:** update quickstart and documentation links ([c7239c8](https://github.com/rknightion/paperless-ngx-dedupe/commit/c7239c82a1d8d5ddc22464e43f45581aa7081a48))

## [0.3.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.2.0...v0.3.0) (2026-02-14)


### Features

* Add application static assets ([0e3e832](https://github.com/rknightion/paperless-ngx-dedupe/commit/0e3e8324851853a3e4cc006cf3a193a6bc893dc8))
* Configure Docker and worker path for core package deployment ([3fe238a](https://github.com/rknightion/paperless-ngx-dedupe/commit/3fe238a81b50a8a83bdd14028dbe9f60d1ca7dcd))
* **db:** ensure database directory exists on startup ([0e3210c](https://github.com/rknightion/paperless-ngx-dedupe/commit/0e3210ccfd94cef86004c0752007a78232ed5560))
* Enhance settings page with detailed explanations and info tooltips ([7504c17](https://github.com/rknightion/paperless-ngx-dedupe/commit/7504c171adede033ccc142f12d4b1ca1848cec5c))
* Improve global layout and navigation styling ([889cfe2](https://github.com/rknightion/paperless-ngx-dedupe/commit/889cfe2b40f4030ff3241e6dcd14f3430dafb60e))
* Introduce Tooltip and InfoIcon UI components ([a0d149d](https://github.com/rknightion/paperless-ngx-dedupe/commit/a0d149d636edbf4748750583b13d9ccdf2337eff))
* **jobs:** implement stale job recovery on startup ([f221d55](https://github.com/rknightion/paperless-ngx-dedupe/commit/f221d5590dc74bfdb3cf4a4cbf643e918b7df695))
* **web:** integrate stale job recovery into web server startup ([fb920a7](https://github.com/rknightion/paperless-ngx-dedupe/commit/fb920a73a008109c6f0e960ebdb3d2de0beeebfd))


### Bug Fixes

* **db:** improve migration idempotency for unique indexes ([3d58658](https://github.com/rknightion/paperless-ngx-dedupe/commit/3d586582acb4b275080a1bd63e5b84fa99a68266))
* **worker:** handle worker crashes and clarify dev setup ([a07f8d5](https://github.com/rknightion/paperless-ngx-dedupe/commit/a07f8d5fdee132c959f11e8f8c4157e02273aa2e))


### Miscellaneous

* **deps:** bump toolchain deps, add utilities, tweak CSS ([e6b8aa0](https://github.com/rknightion/paperless-ngx-dedupe/commit/e6b8aa0ffec5e40bd2a6291d12d22b37098a29ff))
* **deps:** update github artifact actions ([#135](https://github.com/rknightion/paperless-ngx-dedupe/issues/135)) ([af2a72a](https://github.com/rknightion/paperless-ngx-dedupe/commit/af2a72a360dd2b0dff1c0c916995d1252dc36962))
* **deps:** update globals to 17.3.0 ([4e46621](https://github.com/rknightion/paperless-ngx-dedupe/commit/4e466210e09069aefff5c334f928e2697966c0fc))
* Exclude docs and site directories from linting and formatting ([1164698](https://github.com/rknightion/paperless-ngx-dedupe/commit/1164698e757fe66231fd7e316b1fa869fd02db10))
* fix ([a0f5e82](https://github.com/rknightion/paperless-ngx-dedupe/commit/a0f5e82107f31c37f4fc50229006127b969051b6))


### Documentation

* added docs ([f0c78c2](https://github.com/rknightion/paperless-ngx-dedupe/commit/f0c78c2bb267b789d72dba9e45246cb9d2daf93b))


### Tests

* **jobs:** add unit tests for stale job recovery ([02ca27f](https://github.com/rknightion/paperless-ngx-dedupe/commit/02ca27f9424dde1a2af83de9f91bf209be8c8783))

## [0.2.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.1.0...v0.2.0) (2026-02-13)


### Features

* add backup/restore UI to settings ([27e4763](https://github.com/rknightion/paperless-ngx-dedupe/commit/27e4763ad10c9e652225e3fbd28433de1d813f2f))
* add config export/import API endpoints ([9549c5c](https://github.com/rknightion/paperless-ngx-dedupe/commit/9549c5c4b3b1d765dba765af650124a27651ac46))
* add config export/import functionality ([bc943e7](https://github.com/rknightion/paperless-ngx-dedupe/commit/bc943e7528bebc37d85a9806e953c5169f9bae64))
* add CSV export for duplicate reports ([95a6fff](https://github.com/rknightion/paperless-ngx-dedupe/commit/95a6fff9b38acf96244310d38929b7eee8d70366))
* add custom error page component ([d0f9351](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0f93512ce4e67f1b324d48bcd121a6ab44b95c4))
* add export/import type definitions ([c5cd46a](https://github.com/rknightion/paperless-ngx-dedupe/commit/c5cd46a3ca03111906e49b0f2a52a0b1aba01f08))
* export new functions and types from core ([6c700ac](https://github.com/rknightion/paperless-ngx-dedupe/commit/6c700acf97972712a8758dab5ed44a63f50c69dd))
* implement responsive sidebar navigation ([ac2bd9f](https://github.com/rknightion/paperless-ngx-dedupe/commit/ac2bd9f6e2a33bbc06a4e07cd38f1e424198952a))


### Miscellaneous

* **deps:** pin dependencies ([#117](https://github.com/rknightion/paperless-ngx-dedupe/issues/117)) ([4e99181](https://github.com/rknightion/paperless-ngx-dedupe/commit/4e991814c369b8b9a4269503b81a24955853285d))
* **deps:** pin dependencies ([#124](https://github.com/rknightion/paperless-ngx-dedupe/issues/124)) ([dccc753](https://github.com/rknightion/paperless-ngx-dedupe/commit/dccc753760f9d7d77e510ba79fc517b2b52b6991))
* **deps:** update actions/cache action to v5 ([#126](https://github.com/rknightion/paperless-ngx-dedupe/issues/126)) ([ff69ba9](https://github.com/rknightion/paperless-ngx-dedupe/commit/ff69ba937dd783321a1733230699aaa538a8c918))
* **deps:** update actions/checkout action to v6 ([e51d7f0](https://github.com/rknightion/paperless-ngx-dedupe/commit/e51d7f0d5207fb208fd27af0d684070274dbbd4a))
* **deps:** update actions/checkout action to v6 ([40b7f45](https://github.com/rknightion/paperless-ngx-dedupe/commit/40b7f45dfe82acad3b18f8e43b8779a6648f22e1))
* **deps:** update dependency @sveltejs/kit to v2.51.0 ([#120](https://github.com/rknightion/paperless-ngx-dedupe/issues/120)) ([7229a2c](https://github.com/rknightion/paperless-ngx-dedupe/commit/7229a2c2d06c3b03bacb01abff167114a187f2b3))
* **deps:** update dependency prettier to ~3.8.0 ([042ccad](https://github.com/rknightion/paperless-ngx-dedupe/commit/042ccad2254a2f1ec75453d8f9f2ca11add2bbf9))
* **deps:** update dependency prettier to ~3.8.0 ([29e7151](https://github.com/rknightion/paperless-ngx-dedupe/commit/29e7151669a4e21596b435c5b101cb4fec4ab9fe))
* **deps:** update dependency prettier-plugin-tailwindcss to ^0.7.0 ([ef67c61](https://github.com/rknightion/paperless-ngx-dedupe/commit/ef67c61d30e8a3ac683b5e5aeac7ec03017c4e04))
* **deps:** update dependency prettier-plugin-tailwindcss to ^0.7.0 ([fb5b94f](https://github.com/rknightion/paperless-ngx-dedupe/commit/fb5b94f2ec071548ec411dc46e80a4fba104a89e))
* **deps:** update dependency svelte to v5.51.0 ([#118](https://github.com/rknightion/paperless-ngx-dedupe/issues/118)) ([0650dd8](https://github.com/rknightion/paperless-ngx-dedupe/commit/0650dd83756978c8726bcb4b7324b9bf805d69d6))
* **deps:** update dependency svelte-check to v4.4.0 ([2893e96](https://github.com/rknightion/paperless-ngx-dedupe/commit/2893e968783b224b94226adbdd9b8bbff96e8b16))
* **deps:** update dependency svelte-check to v4.4.0 ([532aee3](https://github.com/rknightion/paperless-ngx-dedupe/commit/532aee3a8695913061d6c2a985d984bfa0a7960a))
* **deps:** update eslint monorepo to v10 ([96812ff](https://github.com/rknightion/paperless-ngx-dedupe/commit/96812ffbac7d15aeaf5bab0263bb3ad124d7b9a3))
* **deps:** update eslint monorepo to v10 (major) ([099c229](https://github.com/rknightion/paperless-ngx-dedupe/commit/099c2298952d4e585ec0ffee741d1ad3a63e3a88))
* **deps:** update pnpm to v10.29.3 ([#119](https://github.com/rknightion/paperless-ngx-dedupe/issues/119)) ([f3ae414](https://github.com/rknightion/paperless-ngx-dedupe/commit/f3ae414e17a939907e1319d63ab5aa91536eb31a))
* mark documentation phase as complete ([ada8bc6](https://github.com/rknightion/paperless-ngx-dedupe/commit/ada8bc6f3e7e23fd33ec8614a4e4ad79b8398d9c))


### Documentation

* add algorithm explanation guide ([24432fd](https://github.com/rknightion/paperless-ngx-dedupe/commit/24432fdc5eef52ec0391953e4c10652f5ded44a6))
* add comprehensive API reference guide ([83d280f](https://github.com/rknightion/paperless-ngx-dedupe/commit/83d280ff968a0197b3781584d4cb0faf08d15302))
* add comprehensive troubleshooting guide ([405b2fb](https://github.com/rknightion/paperless-ngx-dedupe/commit/405b2fbae9fa9f34fc7dc8d5d673635344dae45b))
* add configuration reference guide ([efcf9c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/efcf9c041b561cae1f41d4defc6bc66a56d6ebdb))
* add getting started walkthrough ([5c4614d](https://github.com/rknightion/paperless-ngx-dedupe/commit/5c4614dd237b13a8cf22dfdd8a01e78aac37ddac))
* restructure README with simplified overview ([479d4c9](https://github.com/rknightion/paperless-ngx-dedupe/commit/479d4c9a33d18e6da5c946b0c097164d6c6883bf))


### Refactoring

* expose buildGroupWhere for reuse ([84a338e](https://github.com/rknightion/paperless-ngx-dedupe/commit/84a338e1dd1e1b48d66806f19d6b60bff54c6579))


### Tests

* remove database dialect assertion ([8577069](https://github.com/rknightion/paperless-ngx-dedupe/commit/85770693938e47a6f1d90d07af2d93c1b71a6039))
