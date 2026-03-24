# Changelog

## [0.9.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.8.0...v0.9.0) (2026-03-24)


### Features

* **ai:** add concurrent processing with configurable batch size ([6d7be9a](https://github.com/rknightion/paperless-ngx-dedupe/commit/6d7be9ab11d7853d65c9d616280ff19b548863d0))
* **ai:** add getPendingAiResultIds query function ([78e2646](https://github.com/rknightion/paperless-ngx-dedupe/commit/78e26466ef508c1a9d89302d0f418a27bac614ea))
* **ai:** implement intelligent rate limiting based on provider tier limits ([f5d555e](https://github.com/rknightion/paperless-ngx-dedupe/commit/f5d555eed10b06a8da4c4ed596cefc3f703b1eb0))
* **ai:** improve AI prompt guidelines for better classification ([f61c194](https://github.com/rknightion/paperless-ngx-dedupe/commit/f61c194efe68a1878f84f48b49493c4c8beab66d))
* **api:** add bulk apply and reject endpoints for AI results ([f26a7fc](https://github.com/rknightion/paperless-ngx-dedupe/commit/f26a7fc9e02eed603ae3e838330bda318608ba20))
* **rag:** increase default topK and maxContextTokens for better retrieval ([eb18034](https://github.com/rknightion/paperless-ngx-dedupe/commit/eb18034941cf10a5c310ed2f9e1bcfc025a3cf3a))
* **ui:** add bulk operations for AI processing results ([e172579](https://github.com/rknightion/paperless-ngx-dedupe/commit/e17257960f1759477f801ef84ce7d27191348142))


### Bug Fixes

* **ai:** improve circuit breaker behavior in concurrent processing ([5fb801b](https://github.com/rknightion/paperless-ngx-dedupe/commit/5fb801bc9cc9c040195db6bc972383fa7519b1e3))
* **paperless:** disable automatic matching for created entities ([ecfd057](https://github.com/rknightion/paperless-ngx-dedupe/commit/ecfd057286f78f16158444fe2bd4ef7a6bdecaa2))
* **rag:** prevent FTS5 syntax errors with special characters in queries ([a85269b](https://github.com/rknightion/paperless-ngx-dedupe/commit/a85269bc32653a1675d86fe50baf9083ea309637))


### Miscellaneous

* **deps:** update dependency ai to v6.0.138 ([10c74ee](https://github.com/rknightion/paperless-ngx-dedupe/commit/10c74eeb2fa7500f770f190a5d6ef36f5242ba36))


### Documentation

* expand project description to include AI features and RAG Q&A ([70769ce](https://github.com/rknightion/paperless-ngx-dedupe/commit/70769ce04b97380fa7929f5221ca97aa4b8b840e))


### Tests

* **ai:** add comprehensive tests for concurrent processing and rate limiting ([b79801e](https://github.com/rknightion/paperless-ngx-dedupe/commit/b79801ec78ab50b71735c5420eca5b4a5c0012aa))

## [0.8.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.7.0...v0.8.0) (2026-03-24)


### Features

* add prometheus metrics scrape endpoint ([d1e4ade](https://github.com/rknightion/paperless-ngx-dedupe/commit/d1e4adebcf32bdd7bb685a44db2314bbc49f887a))
* **ai:** add circuit breaker pattern to prevent cascading batch failures ([26e2948](https://github.com/rknightion/paperless-ngx-dedupe/commit/26e294854aadb79f3fad485a23908803a437089a))
* **ai:** add reasoning effort support for Anthropic provider ([27f760a](https://github.com/rknightion/paperless-ngx-dedupe/commit/27f760a7daf629cb5aad216e6901e05ea8f2add8))
* **ai:** add unprocessed documents count to AI stats ([91d2b54](https://github.com/rknightion/paperless-ngx-dedupe/commit/91d2b5430b91ac3e43b7e5ddacd641ab38cc32df))
* **ai:** enhance default prompt with improved guidelines and examples ([3904fbb](https://github.com/rknightion/paperless-ngx-dedupe/commit/3904fbbc00256e9aa93df0e95e3cd40a65321576))
* **api:** add purge deleted groups endpoint ([78f091b](https://github.com/rknightion/paperless-ngx-dedupe/commit/78f091b99944342ea54ce99bf4cef43b1548a6b8))
* **api:** expose totalMemberCount in duplicates endpoint ([fd13234](https://github.com/rknightion/paperless-ngx-dedupe/commit/fd132341a0ae7027eff69cab4cb6b664ce59757c))
* **api:** handle status transition errors in duplicate group updates ([d41b01c](https://github.com/rknightion/paperless-ngx-dedupe/commit/d41b01c6c5781cfc8c59bed15d58bfd8b5dbdc6f))
* **batch:** increase group processing limits from 1000 to 50000 ([d452001](https://github.com/rknightion/paperless-ngx-dedupe/commit/d45200159a5a37fec8a0ede8e42c56d57433b00e))
* **core:** add primaryPaperlessId to duplicate group summaries ([ab1871c](https://github.com/rknightion/paperless-ngx-dedupe/commit/ab1871c5211ba4fb709e4f933885c7c29a8cb5bf))
* **core:** add RAG (Retrieval-Augmented Generation) functionality for document querying ([5e9b2ed](https://github.com/rknightion/paperless-ngx-dedupe/commit/5e9b2ed6bdf23d6ead2167991b1eee837de2aeef))
* **duplicates:** add purge functionality for deleted groups ([f253b71](https://github.com/rknightion/paperless-ngx-dedupe/commit/f253b7174c83b954cb667e1c57f6dc86ac627e62))
* **duplicates:** add status transition validation for deleted groups ([5f397bc](https://github.com/rknightion/paperless-ngx-dedupe/commit/5f397bca3dcb8116701de38201bbf07e046db39f))
* **duplicates:** prevent batch operations on deleted groups ([318c0e6](https://github.com/rknightion/paperless-ngx-dedupe/commit/318c0e624e5d7a7305722500b9303c1f8eb76cb7))
* **evals:** add OpenAI evaluation assets for document classification ([1d848eb](https://github.com/rknightion/paperless-ngx-dedupe/commit/1d848eb8603774126a4f5c77e74e3f0bf2b624fa))
* implement prometheus telemetry support ([2fc808c](https://github.com/rknightion/paperless-ngx-dedupe/commit/2fc808c42dff3486afd2289ee33b59a4de2396d5))
* **queries:** add totalMemberCount to duplicate groups pagination ([52ca184](https://github.com/rknightion/paperless-ngx-dedupe/commit/52ca184a41687e0b47f96f99703f35e7796b5a3a))
* **sdk:** add purge deleted groups method to client ([b583c01](https://github.com/rknightion/paperless-ngx-dedupe/commit/b583c01878cac184b890416464ac186bea8f5be1))
* **web:** add deleted group count to duplicates page data ([e67848f](https://github.com/rknightion/paperless-ngx-dedupe/commit/e67848f2ea662dbb74445fbcf3f74cf48aab46ee))
* **web:** add document count estimation and preview modal ([ec1fc91](https://github.com/rknightion/paperless-ngx-dedupe/commit/ec1fc91d276a0247906d2d45704114726b9ac7f6))
* **web:** add expanded view mode to duplicates wizard ([6f61994](https://github.com/rknightion/paperless-ngx-dedupe/commit/6f6199476e35ec41d5fa4e6113743d444151e920))
* **web:** add informative tooltips to advanced AI settings ([f67057f](https://github.com/rknightion/paperless-ngx-dedupe/commit/f67057fec87ec1b48d707855fd7d28c474b7cf20))
* **web:** add pause functionality to AI processing ([5d368ec](https://github.com/rknightion/paperless-ngx-dedupe/commit/5d368ec80771bde69af8f70286f12a98de0b034c))
* **web:** add purge deleted groups functionality to duplicates UI ([0b1fb8e](https://github.com/rknightion/paperless-ngx-dedupe/commit/0b1fb8e62fef09093fb4637ea031f413db2a9370))
* **web:** add ThumbnailPreview component for document thumbnails ([81f9bce](https://github.com/rknightion/paperless-ngx-dedupe/commit/81f9bcef377b0b8d995679aa646c74d8a33579a4))
* **web:** add WizardGroupCard component for expanded duplicate view ([1ff577b](https://github.com/rknightion/paperless-ngx-dedupe/commit/1ff577be4b4aed953834405f7b93323089cbc0d6))
* **web:** enhance wizard UI with view toggles and thumbnails ([1b0899b](https://github.com/rknightion/paperless-ngx-dedupe/commit/1b0899b8dea5ee292a4da2fc224ce3f059ee6198))
* **web:** export new duplicate components from index ([4efb172](https://github.com/rknightion/paperless-ngx-dedupe/commit/4efb172ba68cc72427d8045dbffab47e6ebc3df5))
* **web:** extend reasoning effort support to all AI providers ([be21e9c](https://github.com/rknightion/paperless-ngx-dedupe/commit/be21e9cbb3089df4d1113d3d81e54a30b34ce227))
* **web:** improve deleted group status display in action bar ([b9df353](https://github.com/rknightion/paperless-ngx-dedupe/commit/b9df353bc3e1e3507a3e003135bea2b27e803c1a))
* **web:** pass paperlessUrl to wizard page from server ([aa5ec01](https://github.com/rknightion/paperless-ngx-dedupe/commit/aa5ec016738c5309a6a146b7fa72880b4fde6813))
* **wizard:** display accurate document counts using totalMemberCount ([9a274a2](https://github.com/rknightion/paperless-ngx-dedupe/commit/9a274a25926923ae843d288ee5c6eae292c0c8fb))


### Bug Fixes

* add Document Q&A with RAG (Retrieval-Augmented Generation) support ([720f26f](https://github.com/rknightion/paperless-ngx-dedupe/commit/720f26f13d2afcd943eddb12af63b9c1412d6b9c))
* **ask:** correct expandedSources state management and cleanup ([0b60471](https://github.com/rknightion/paperless-ngx-dedupe/commit/0b6047166cfe3e0fa5b0bfa137197e30cf49eec6))
* **ask:** make expandedSources reactive with $state wrapper ([722fcfe](https://github.com/rknightion/paperless-ngx-dedupe/commit/722fcfedf02be2d58e92d881c8a253a554f911c6))
* **deps:** update dependency lucide-svelte to v1 ([299e41f](https://github.com/rknightion/paperless-ngx-dedupe/commit/299e41f629dd81a2fb4ce0c85ffab22fd3064366))
* **deps:** update dependency lucide-svelte to v1 ([6facb32](https://github.com/rknightion/paperless-ngx-dedupe/commit/6facb32e230267a471717bfb652ebe412d3f6198))
* **rag:** add concurrent batch processing for embedding generation ([c83419c](https://github.com/rknightion/paperless-ngx-dedupe/commit/c83419cea5a277b195c9698d68db67fd11cf468d))
* **rag:** replace require with createRequire for ES module compatibility ([5361878](https://github.com/rknightion/paperless-ngx-dedupe/commit/5361878027754b95f9bcc43844caabf087369331))
* **sync:** add AI results and chunks to purge ([b52b313](https://github.com/rknightion/paperless-ngx-dedupe/commit/b52b313cf09d002768f4ef88d696f31606b16bca))
* **web:** increase thumbnail size in duplicate detection wizard ([48df29c](https://github.com/rknightion/paperless-ngx-dedupe/commit/48df29c7092a1cd882001c73d0cbda3b36ae03d0))


### Miscellaneous

* **core:** update AI SDK dependencies and API usage for v6 compatibility ([1c40a3b](https://github.com/rknightion/paperless-ngx-dedupe/commit/1c40a3becd4edf825be108504bc5598ed21ea280))
* **deps:** lock file maintenance ([#238](https://github.com/rknightion/paperless-ngx-dedupe/issues/238)) ([79ce64b](https://github.com/rknightion/paperless-ngx-dedupe/commit/79ce64b3926a0da9ac2eef1fc1c882f2028fafe9))
* **deps:** lock file maintenance ([#240](https://github.com/rknightion/paperless-ngx-dedupe/issues/240)) ([ffffc89](https://github.com/rknightion/paperless-ngx-dedupe/commit/ffffc89dd36501732150bfd88c4c1189de46b632))
* **deps:** update dependency @ai-sdk/anthropic to v3 ([ef771a2](https://github.com/rknightion/paperless-ngx-dedupe/commit/ef771a2889cb03e4c85d10cb399ed0f2a7458179))
* **deps:** update dependency @ai-sdk/anthropic to v3 ([693ca01](https://github.com/rknightion/paperless-ngx-dedupe/commit/693ca01a3d7b267f5e19999f756b2dc8797b6086))
* **deps:** update dependency @ai-sdk/anthropic to v3.0.64 ([#250](https://github.com/rknightion/paperless-ngx-dedupe/issues/250)) ([c79b7d0](https://github.com/rknightion/paperless-ngx-dedupe/commit/c79b7d0533735d6beabb0bbddc1cf4b5d17eee3a))
* **deps:** update dependency @ai-sdk/openai to v3 ([127bce2](https://github.com/rknightion/paperless-ngx-dedupe/commit/127bce284bdf616a257b68df31a56cb8ce9f6097))
* **deps:** update dependency @ai-sdk/openai to v3 ([f07b9f1](https://github.com/rknightion/paperless-ngx-dedupe/commit/f07b9f17ef65861caad795bf7b451182732cf492))
* **deps:** update dependency ai to v6 ([f554e7d](https://github.com/rknightion/paperless-ngx-dedupe/commit/f554e7d1e0c87da7d14f963ae2832c8e9dbe40fa))
* **deps:** update dependency ai to v6 ([1e224b8](https://github.com/rknightion/paperless-ngx-dedupe/commit/1e224b8289a134887f6a4b708ee49a8466ec9157))
* **deps:** update dependency ai to v6.0.137 ([ec51702](https://github.com/rknightion/paperless-ngx-dedupe/commit/ec5170221bfe00c39044219e787061b0f324bd11))
* **deps:** update dependency svelte to v5.55.0 ([#243](https://github.com/rknightion/paperless-ngx-dedupe/issues/243)) ([fa7ecb5](https://github.com/rknightion/paperless-ngx-dedupe/commit/fa7ecb57e1d5227daaec93fca71526cd6a8b5304))
* **deps:** update dependency vite to v8.0.2 ([#242](https://github.com/rknightion/paperless-ngx-dedupe/issues/242)) ([91a6fb3](https://github.com/rknightion/paperless-ngx-dedupe/commit/91a6fb30393c2f859d388ba4e286da3d55db961b))
* **deps:** update pnpm to v10.33.0 ([#251](https://github.com/rknightion/paperless-ngx-dedupe/issues/251)) ([1660ab9](https://github.com/rknightion/paperless-ngx-dedupe/commit/1660ab98e71614fe07c8f24a3cf7815f7aba4c9b))
* **deps:** update typescript-eslint monorepo to v8.57.2 ([#248](https://github.com/rknightion/paperless-ngx-dedupe/issues/248)) ([122888e](https://github.com/rknightion/paperless-ngx-dedupe/commit/122888e9834878d6d47850f8eefa833f185ccc48))
* **deps:** update vitest monorepo to v4.1.1 ([#249](https://github.com/rknightion/paperless-ngx-dedupe/issues/249)) ([3032563](https://github.com/rknightion/paperless-ngx-dedupe/commit/3032563f33bafa866b41906c19847877bfc857bf))
* upgrade TypeScript to v6 and improve type safety ([4555291](https://github.com/rknightion/paperless-ngx-dedupe/commit/4555291ea1389d398c7f02c938353bc9b25d83a2))


### Documentation

* add Document Q&A API reference and configuration guide ([237b2c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/237b2c050e7539595b3ec53f881a383d4ba7d9e3))
* **evals:** add OpenAI evaluation framework documentation ([904977a](https://github.com/rknightion/paperless-ngx-dedupe/commit/904977a287e740a14bc164bfa668291bbe570b0d))
* update api reference for prometheus endpoint ([a0b3fbc](https://github.com/rknightion/paperless-ngx-dedupe/commit/a0b3fbc0368effea29eafeabc1c50c7408109d33))
* update configuration for prometheus support ([7d0281c](https://github.com/rknightion/paperless-ngx-dedupe/commit/7d0281c543815551acb0a4529590e3455b37855d))


### Refactoring

* **ai:** simplify prompt building by removing legacy template support ([dc1b953](https://github.com/rknightion/paperless-ngx-dedupe/commit/dc1b953a8b639951ad639bdb3a4f25e33c9465f9))


### Tests

* add comprehensive test coverage for AI and RAG modules ([d62e56b](https://github.com/rknightion/paperless-ngx-dedupe/commit/d62e56bda41ba022a6c184bddc0f1020d6040e85))
* **ai:** add tests for unprocessed documents count ([5afc25f](https://github.com/rknightion/paperless-ngx-dedupe/commit/5afc25fe5ce5b023c4534d3bb094266f5ef1cb93))
* **duplicates:** add comprehensive tests for deleted group handling ([b2f1103](https://github.com/rknightion/paperless-ngx-dedupe/commit/b2f11034683833a328d3b904df32cb0ec81e5f79))
* **rag:** expose docBatchSize option to improve circuit breaker testing ([85f0f6d](https://github.com/rknightion/paperless-ngx-dedupe/commit/85f0f6dcdb15c673dacf35676a232bd0aae5524d))

## [0.7.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.6.2...v0.7.0) (2026-03-22)


### Features

* add AI SDK dependencies and configure peer dependencies ([77c1a29](https://github.com/rknightion/paperless-ngx-dedupe/commit/77c1a29886781b579a995a93f4a6f25c0087fac0))
* add informational tooltip to sync documentation section ([165d3d1](https://github.com/rknightion/paperless-ngx-dedupe/commit/165d3d1546842c3b213dc09169f03ac5f7dcba12))
* **ai:** add batch processing capabilities ([71a28a5](https://github.com/rknightion/paperless-ngx-dedupe/commit/71a28a5c140af1ef23dc28969649374663b297f8))
* **ai:** add comprehensive evaluation test suite ([b0859fb](https://github.com/rknightion/paperless-ngx-dedupe/commit/b0859fbe906a84f0e9fedd2aa8b275a4592202b4))
* **ai:** add comprehensive telemetry to batch processing ([9e648f6](https://github.com/rknightion/paperless-ngx-dedupe/commit/9e648f659b5495b7f93a8e76264825cd8c00d5ad))
* **ai:** add configuration environment variables ([99290a3](https://github.com/rknightion/paperless-ngx-dedupe/commit/99290a3bc591b8ae83d2d5aa7fc373ddc9283843))
* **ai:** add core AI provider interfaces and error types ([14f0a32](https://github.com/rknightion/paperless-ngx-dedupe/commit/14f0a32cd8bbcb4d585ab78b679c077157e1feac))
* **ai:** add document processing and extraction logic ([2d4fb29](https://github.com/rknightion/paperless-ngx-dedupe/commit/2d4fb29bfbd7b1d7a5e4e5818a9aea12a4b7b4b3))
* **ai:** add provider factory for dynamic AI provider creation ([50b7c49](https://github.com/rknightion/paperless-ngx-dedupe/commit/50b7c49f42a2da095460dd9c4700a8d6d0b75093))
* **ai:** add result application and management ([795e346](https://github.com/rknightion/paperless-ngx-dedupe/commit/795e3469b51df3920c520796721d1625c6ff5aa0))
* **ai:** add telemetry metrics for AI processing ([4668433](https://github.com/rknightion/paperless-ngx-dedupe/commit/46684334484ad38e7ff571290b2ecc13ed359161))
* **ai:** enhance apply and reject operations with telemetry ([daeae22](https://github.com/rknightion/paperless-ngx-dedupe/commit/daeae2275b1581f7293531cdf3684a617770158d))
* **ai:** implement Anthropic provider with prompt caching ([b3c4cac](https://github.com/rknightion/paperless-ngx-dedupe/commit/b3c4caccea43990c5f6e2e44b16fb9ab4f82aeb1))
* **ai:** implement configuration management system ([bd5f998](https://github.com/rknightion/paperless-ngx-dedupe/commit/bd5f99869f3ac36a98b4193611d6c12e2e0f55fb))
* **ai:** implement intelligent prompt building system ([bc7f9d8](https://github.com/rknightion/paperless-ngx-dedupe/commit/bc7f9d805c800562c80afe02c09a7e1408311f1b))
* **ai:** implement OpenAI provider with structured output parsing ([f81a1c5](https://github.com/rknightion/paperless-ngx-dedupe/commit/f81a1c54513216c7ea84387191ac981185d775da))
* **config:** add AI configuration environment variables ([9926ddb](https://github.com/rknightion/paperless-ngx-dedupe/commit/9926ddb8cbcb974bac018f9f8e400d527d595296))
* **dedup:** add skip reason tracking for detailed analysis reporting ([8a6da1c](https://github.com/rknightion/paperless-ngx-dedupe/commit/8a6da1ce84a33657ddf16bc32bee46746a484c54))
* export AI processing modules from core package ([bb4fd3e](https://github.com/rknightion/paperless-ngx-dedupe/commit/bb4fd3e1931c3529ace4f30653f1fbaf63c0bf34))
* **jobs:** add AI processing background worker ([a9a5601](https://github.com/rknightion/paperless-ngx-dedupe/commit/a9a5601c4c51ef091c04b9c8a2168d1d8d6ad84c))
* **paperless:** add document update and entity creation methods ([4110867](https://github.com/rknightion/paperless-ngx-dedupe/commit/4110867d730b09eb5f37d08f00fde60cd730f91b))
* **schema:** add AI processing result table and relations ([160110e](https://github.com/rknightion/paperless-ngx-dedupe/commit/160110e94955a7438aa3d568723d261e251297e3))
* **sdk:** add AI processing client methods ([a038815](https://github.com/rknightion/paperless-ngx-dedupe/commit/a038815c7b4842d07a7752a24d479fa297d29209))
* **types:** add AI-related enum types ([2c30cd9](https://github.com/rknightion/paperless-ngx-dedupe/commit/2c30cd91b40b05b0bf6591757dc9c67c8435dd82))
* **web:** add AI configuration to settings page ([fa5e48b](https://github.com/rknightion/paperless-ngx-dedupe/commit/fa5e48bdead1a4000019cbc5f4e96380f689ce50))
* **web:** add AI dependencies to web package ([648d377](https://github.com/rknightion/paperless-ngx-dedupe/commit/648d377e15001112a527f619a78a60df819ba66c))
* **web:** add AI processing API endpoints ([3080395](https://github.com/rknightion/paperless-ngx-dedupe/commit/308039552b725fc78078b9a316ce29d6270591cd))
* **web:** add AI processing page server logic ([286e36d](https://github.com/rknightion/paperless-ngx-dedupe/commit/286e36d337c69c32a9e6eb54689dece665a12f2e))
* **web:** enhance job status display with skip reason tooltips ([470cb6e](https://github.com/rknightion/paperless-ngx-dedupe/commit/470cb6ebd2d32a9ecdf782af1ec11e222082c160))
* **web:** implement AI processing user interface ([04e756f](https://github.com/rknightion/paperless-ngx-dedupe/commit/04e756f4716bfb7436809b8e097bc81c9269e706))


### Bug Fixes

* add API version header to Paperless client requests ([1f2b45e](https://github.com/rknightion/paperless-ngx-dedupe/commit/1f2b45eafb9689f81f04d1a69e2aa0e076261424))
* add Paperless-NGX v3 API compatibility with dual v2/v3 support ([15c5166](https://github.com/rknightion/paperless-ngx-dedupe/commit/15c51664ac1b7bee1ae881f41184574a1f966860))
* **api:** update AI rejection endpoints to use new telemetry functions ([7787d0c](https://github.com/rknightion/paperless-ngx-dedupe/commit/7787d0cb1896d5cefbe276882c7f500d0e8cecb5))
* **dedup:** track skipped documents and full rebuild status in analysis results ([25e48b9](https://github.com/rknightion/paperless-ngx-dedupe/commit/25e48b9c15242c42d1e286e43ab1927619d015d9))
* **deps:** update dependency @anthropic-ai/sdk to v0.80.0 ([#237](https://github.com/rknightion/paperless-ngx-dedupe/issues/237)) ([8f8f426](https://github.com/rknightion/paperless-ngx-dedupe/commit/8f8f426add009daab4875775c5eab97f04656db2))
* handle null inbox_tags in Paperless statistics schema ([799c296](https://github.com/rknightion/paperless-ngx-dedupe/commit/799c2965c21141708cb585a0ec0f9b3a50e3b2cf))
* improve dockerignore patterns for monorepo structure ([829b388](https://github.com/rknightion/paperless-ngx-dedupe/commit/829b38863676a291362e710b67952a9d3bdc1727))
* remove confusing 'unchanged' count from job status display ([16e5d88](https://github.com/rknightion/paperless-ngx-dedupe/commit/16e5d8870026a20e88e04dc7680b2b2ee6114fc6))
* **web:** prevent reactive state initialization issues in AI processing page ([172d2c3](https://github.com/rknightion/paperless-ngx-dedupe/commit/172d2c3b1f102da3ab065d607aa8ff8dd19652eb))


### Miscellaneous

* **deps:** update dependency eslint to v10.1.0 ([#234](https://github.com/rknightion/paperless-ngx-dedupe/issues/234)) ([fff7d6f](https://github.com/rknightion/paperless-ngx-dedupe/commit/fff7d6f539632acdd680c2d179dd823a27c60587))
* **deps:** update dependency eslint-plugin-svelte to v3.16.0 ([#235](https://github.com/rknightion/paperless-ngx-dedupe/issues/235)) ([e8fe6aa](https://github.com/rknightion/paperless-ngx-dedupe/commit/e8fe6aafe5f4109a130fb690287844019ed08210))
* **deps:** update dependency svelte to v5.54.1 ([#236](https://github.com/rknightion/paperless-ngx-dedupe/issues/236)) ([d686b59](https://github.com/rknightion/paperless-ngx-dedupe/commit/d686b59f66512918da561e0a93cd176dbd5df96a))
* **deps:** update dorny/test-reporter action to v3 ([#233](https://github.com/rknightion/paperless-ngx-dedupe/issues/233)) ([fb7d24e](https://github.com/rknightion/paperless-ngx-dedupe/commit/fb7d24e4ecab2cf2131ba17dfd6d3934794920b1))
* **deps:** update dorny/test-reporter digest to df62474 ([#232](https://github.com/rknightion/paperless-ngx-dedupe/issues/232)) ([c50bb58](https://github.com/rknightion/paperless-ngx-dedupe/commit/c50bb5887e48deba2249d1a851e0f60e4e4e85ec))
* **deps:** update github/codeql-action digest to 3869755 ([#231](https://github.com/rknightion/paperless-ngx-dedupe/issues/231)) ([9bd73e6](https://github.com/rknightion/paperless-ngx-dedupe/commit/9bd73e6cca307282142bdb3f0a27f0065405a0d0))
* **deps:** update github/codeql-action digest to c6f9311 ([#229](https://github.com/rknightion/paperless-ngx-dedupe/issues/229)) ([3a14490](https://github.com/rknightion/paperless-ngx-dedupe/commit/3a14490c26c5acc0044dab2a864fbe30ed9dffa2))


### Documentation

* add AI processing to navigation structure ([fbacb73](https://github.com/rknightion/paperless-ngx-dedupe/commit/fbacb731469e6cf9b547eb75c1ec3c0c4c2c6873))
* **ai:** add comprehensive AI processing documentation ([1ef48b6](https://github.com/rknightion/paperless-ngx-dedupe/commit/1ef48b6480b07228dfd140b218d33ac0d1b3d004))
* **api:** add AI processing API reference documentation ([21df574](https://github.com/rknightion/paperless-ngx-dedupe/commit/21df5748cbf3eb0758a40c0c9814daebcde3ad13))


### Tests

* update test configurations for AI feature flag ([9bc5162](https://github.com/rknightion/paperless-ngx-dedupe/commit/9bc51626e138e2e4c7efe6fe32efc2b9032a9d5c))

## [0.6.2](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.6.1...v0.6.2) (2026-03-20)


### Bug Fixes

* **deps:** update dependency lucide-svelte to ^0.577.0 ([#201](https://github.com/rknightion/paperless-ngx-dedupe/issues/201)) ([405c759](https://github.com/rknightion/paperless-ngx-dedupe/commit/405c7595a6bb4c672cff33130907681989285ce9))
* **deps:** update opentelemetry-js monorepo ([#206](https://github.com/rknightion/paperless-ngx-dedupe/issues/206)) ([a3aa3f9](https://github.com/rknightion/paperless-ngx-dedupe/commit/a3aa3f920cf5e04869d6a61df9dfaeac2d956fe3))
* **deps:** update opentelemetry-js-contrib monorepo ([#217](https://github.com/rknightion/paperless-ngx-dedupe/issues/217)) ([f55cbfe](https://github.com/rknightion/paperless-ngx-dedupe/commit/f55cbfea26e8a67eaba06f4bb20432de41bd74da))
* preserve filter state when navigating back from duplicate detail page ([f911a3e](https://github.com/rknightion/paperless-ngx-dedupe/commit/f911a3e5ee3ecb20d262dce825e4ab1d3913158a))


### Miscellaneous

* **deps:** update actions/cache digest to 6682284 ([#225](https://github.com/rknightion/paperless-ngx-dedupe/issues/225)) ([411cc05](https://github.com/rknightion/paperless-ngx-dedupe/commit/411cc05a9ffd6cbe34c36219211d1dd15f303fc9))
* **deps:** update actions/download-artifact digest to 3e5f45b ([#210](https://github.com/rknightion/paperless-ngx-dedupe/issues/210)) ([1a761d5](https://github.com/rknightion/paperless-ngx-dedupe/commit/1a761d5041e81478287f2a2e658dd88cc754ccb8))
* **deps:** update actions/setup-node digest to 53b8394 ([#207](https://github.com/rknightion/paperless-ngx-dedupe/issues/207)) ([61c6246](https://github.com/rknightion/paperless-ngx-dedupe/commit/61c62464babe80c71f5ac08314ec72734fec4b22))
* **deps:** update dependency @sveltejs/kit to v2.55.0 ([#212](https://github.com/rknightion/paperless-ngx-dedupe/issues/212)) ([aba345e](https://github.com/rknightion/paperless-ngx-dedupe/commit/aba345e8b70ac48279cb07792ebfe4ca2846487f))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v7 ([d36812f](https://github.com/rknightion/paperless-ngx-dedupe/commit/d36812ff6d72b35124eb6be506b8e33500b2530c))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v7 ([a140b58](https://github.com/rknightion/paperless-ngx-dedupe/commit/a140b58cda3633ac8118ab1d718f34662cb8fe8d))
* **deps:** update dependency better-sqlite3 to v12.8.0 ([#213](https://github.com/rknightion/paperless-ngx-dedupe/issues/213)) ([7910ae4](https://github.com/rknightion/paperless-ngx-dedupe/commit/7910ae49cc68d865b986a67bca92310201960bb7))
* **deps:** update dependency drizzle-kit to v0.31.10 ([#224](https://github.com/rknightion/paperless-ngx-dedupe/issues/224)) ([4f0d871](https://github.com/rknightion/paperless-ngx-dedupe/commit/4f0d8710ed89825f1574c19acbf5edf13afda5d9))
* **deps:** update dependency globals to v17.4.0 ([#199](https://github.com/rknightion/paperless-ngx-dedupe/issues/199)) ([f13c125](https://github.com/rknightion/paperless-ngx-dedupe/commit/f13c12562180cf17d10c3d9010fa0d3355046b81))
* **deps:** update dependency prettier-plugin-svelte to v3.5.1 ([#204](https://github.com/rknightion/paperless-ngx-dedupe/issues/204)) ([7efdadb](https://github.com/rknightion/paperless-ngx-dedupe/commit/7efdadbc6dcbfb813e641b04954212d128d05966))
* **deps:** update dependency vite to v8 ([b80cefc](https://github.com/rknightion/paperless-ngx-dedupe/commit/b80cefc9dc44b3666ad0bb978ef890ae010f4ce3))
* **deps:** update dependency vite to v8 ([b72643e](https://github.com/rknightion/paperless-ngx-dedupe/commit/b72643eb88a6dcbb8592f2650fd7712a67e39ea2))
* **deps:** update dependency vite to v8.0.1 ([#227](https://github.com/rknightion/paperless-ngx-dedupe/issues/227)) ([f8b4a87](https://github.com/rknightion/paperless-ngx-dedupe/commit/f8b4a878e2e6d7950824921a903fec38896eb01a))
* **deps:** update docker/login-action action to v4 ([#208](https://github.com/rknightion/paperless-ngx-dedupe/issues/208)) ([9431c38](https://github.com/rknightion/paperless-ngx-dedupe/commit/9431c38b3c02d2b82b9bc58cd0e08a7b2b22639b))
* **deps:** update dorny/test-reporter digest to 3d76b34 ([#203](https://github.com/rknightion/paperless-ngx-dedupe/issues/203)) ([85f5eda](https://github.com/rknightion/paperless-ngx-dedupe/commit/85f5edae21e8461d187d58b801be9c78d2133a9f))
* **deps:** update github actions ([#220](https://github.com/rknightion/paperless-ngx-dedupe/issues/220)) ([cd43ab4](https://github.com/rknightion/paperless-ngx-dedupe/commit/cd43ab42b25cfe8dc5f0f015869ee8b9955493be))
* **deps:** update github/codeql-action digest to b1bff81 ([#202](https://github.com/rknightion/paperless-ngx-dedupe/issues/202)) ([2630162](https://github.com/rknightion/paperless-ngx-dedupe/commit/2630162bef95d4fc23b7185f0994a00148b955d2))
* **deps:** update pnpm to v10.32.1 ([#214](https://github.com/rknightion/paperless-ngx-dedupe/issues/214)) ([e07d886](https://github.com/rknightion/paperless-ngx-dedupe/commit/e07d8862e3462f1bb1d3460539782168dc6adb18))
* **deps:** update pnpm/action-setup action to v5 ([#223](https://github.com/rknightion/paperless-ngx-dedupe/issues/223)) ([aff4bd8](https://github.com/rknightion/paperless-ngx-dedupe/commit/aff4bd8e853dab11c1569b967339574acdabe8be))
* **deps:** update pnpm/action-setup digest to fc06bc1 ([#211](https://github.com/rknightion/paperless-ngx-dedupe/issues/211)) ([c795fd7](https://github.com/rknightion/paperless-ngx-dedupe/commit/c795fd724b8fbc7108576778fc49511ccafde7ff))
* **deps:** update tailwindcss monorepo to v4.2.2 ([#226](https://github.com/rknightion/paperless-ngx-dedupe/issues/226)) ([68a8abe](https://github.com/rknightion/paperless-ngx-dedupe/commit/68a8abe6161118c9183f44909e425469192c1f13))
* **deps:** update typescript-eslint monorepo to v8.57.0 ([#215](https://github.com/rknightion/paperless-ngx-dedupe/issues/215)) ([179e990](https://github.com/rknightion/paperless-ngx-dedupe/commit/179e990a4be237c81a90f4b15e9e74281aa4a020))
* **deps:** update typescript-eslint monorepo to v8.57.1 ([#222](https://github.com/rknightion/paperless-ngx-dedupe/issues/222)) ([e2ae494](https://github.com/rknightion/paperless-ngx-dedupe/commit/e2ae4944a44eb35c955cddaf426dc745409f3c5f))
* **deps:** update vitest monorepo to v4.1.0 ([#216](https://github.com/rknightion/paperless-ngx-dedupe/issues/216)) ([544fc04](https://github.com/rknightion/paperless-ngx-dedupe/commit/544fc048260c62d975b61edc7f1b72d8030605de))

## [0.6.1](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.6.0...v0.6.1) (2026-02-28)


### Bug Fixes

* **dedup:** improve group preservation logic tests ([78afe39](https://github.com/rknightion/paperless-ngx-dedupe/commit/78afe39cacc1ec2f6433b971105e3048a47dd1e7))


### Miscellaneous

* **deps:** update davelosert/vitest-coverage-report-action digest to 2500daf ([#186](https://github.com/rknightion/paperless-ngx-dedupe/issues/186)) ([95299ab](https://github.com/rknightion/paperless-ngx-dedupe/commit/95299ab189bfdae8273d6301e2536d5fde6e6250))
* **deps:** update dependency @opentelemetry/auto-instrumentations-node to v0.70.1 ([#190](https://github.com/rknightion/paperless-ngx-dedupe/issues/190)) ([fcaa4e8](https://github.com/rknightion/paperless-ngx-dedupe/commit/fcaa4e89ba152bc85d0a3094dad5ab5dd9a76cf1))
* **deps:** update dependency @opentelemetry/semantic-conventions to v1.40.0 ([#192](https://github.com/rknightion/paperless-ngx-dedupe/issues/192)) ([a585598](https://github.com/rknightion/paperless-ngx-dedupe/commit/a58559800caa84cee699a375d5ce4130cbdb32dc))
* **deps:** update dependency @sveltejs/adapter-node to v5.5.4 ([#194](https://github.com/rknightion/paperless-ngx-dedupe/issues/194)) ([dd947e8](https://github.com/rknightion/paperless-ngx-dedupe/commit/dd947e8e88073f6f26a55b8478d8f6cad61093a1))
* **deps:** update dependency @sveltejs/kit to v2.53.1 ([#187](https://github.com/rknightion/paperless-ngx-dedupe/issues/187)) ([596d8ba](https://github.com/rknightion/paperless-ngx-dedupe/commit/596d8baa5a1d70a388c2e6b14ff14a5c13fa2d21))
* **deps:** update dependency @sveltejs/kit to v2.53.2 ([#188](https://github.com/rknightion/paperless-ngx-dedupe/issues/188)) ([f3a80e7](https://github.com/rknightion/paperless-ngx-dedupe/commit/f3a80e7f29d7c2fb19fb8f8781494118f60fbc8d))
* **deps:** update dependency @sveltejs/kit to v2.53.3 ([#196](https://github.com/rknightion/paperless-ngx-dedupe/issues/196)) ([bb0c998](https://github.com/rknightion/paperless-ngx-dedupe/commit/bb0c998a156820f1d8df47cd31b4aee8c24489c9))
* **deps:** update dependency @sveltejs/kit to v2.53.4 ([#198](https://github.com/rknightion/paperless-ngx-dedupe/issues/198)) ([767f6e3](https://github.com/rknightion/paperless-ngx-dedupe/commit/767f6e3c29367cd2b342150b533dcd1514283072))
* **deps:** update dependency eslint to v10.0.2 ([#184](https://github.com/rknightion/paperless-ngx-dedupe/issues/184)) ([64398d5](https://github.com/rknightion/paperless-ngx-dedupe/commit/64398d519fcd32a1c7cac32b25232d78c3661ce4))
* **deps:** update dependency svelte to v5.53.3 ([#179](https://github.com/rknightion/paperless-ngx-dedupe/issues/179)) ([f7cbbec](https://github.com/rknightion/paperless-ngx-dedupe/commit/f7cbbecc600a97c1b6c60d0721d0980e7668e2a6))
* **deps:** update dependency svelte to v5.53.5 ([#189](https://github.com/rknightion/paperless-ngx-dedupe/issues/189)) ([4c0be07](https://github.com/rknightion/paperless-ngx-dedupe/commit/4c0be07ae030c51e926490e72261a80e4ec279e0))
* **deps:** update dependency svelte to v5.53.6 ([#197](https://github.com/rknightion/paperless-ngx-dedupe/issues/197)) ([e5944a4](https://github.com/rknightion/paperless-ngx-dedupe/commit/e5944a4c2d1a68716dd1afbc60d14bdd689c29ae))
* **deps:** update dependency svelte-check to v4.4.4 ([#193](https://github.com/rknightion/paperless-ngx-dedupe/issues/193)) ([59470f0](https://github.com/rknightion/paperless-ngx-dedupe/commit/59470f00edbd0050e8fdcf8f4fc25cdfc5e577e5))
* **deps:** update github artifact actions ([#195](https://github.com/rknightion/paperless-ngx-dedupe/issues/195)) ([ca2878a](https://github.com/rknightion/paperless-ngx-dedupe/commit/ca2878aa72746da761812e994b71510404a31790))
* **deps:** update pnpm to v10.30.2 ([#185](https://github.com/rknightion/paperless-ngx-dedupe/issues/185)) ([37b999e](https://github.com/rknightion/paperless-ngx-dedupe/commit/37b999e7d6bb7fa55e0e305aaa7b638919d08c4e))
* **deps:** update pnpm to v10.30.3 ([#191](https://github.com/rknightion/paperless-ngx-dedupe/issues/191)) ([79d7e14](https://github.com/rknightion/paperless-ngx-dedupe/commit/79d7e14e9258bbdc830c9870fb2a65ff30e1098a))
* **deps:** update tailwindcss monorepo to v4.2.1 ([#181](https://github.com/rknightion/paperless-ngx-dedupe/issues/181)) ([936df8d](https://github.com/rknightion/paperless-ngx-dedupe/commit/936df8da6f2f7313a21c7e77f0297cf98cb48e87))
* **deps:** update typescript-eslint monorepo to v8.56.1 ([#182](https://github.com/rknightion/paperless-ngx-dedupe/issues/182)) ([86b4108](https://github.com/rknightion/paperless-ngx-dedupe/commit/86b41084458620b61fb8a82b26bd6f7b083dcaf9))
* remove integration tests and pipeline infrastructure ([fb8d702](https://github.com/rknightion/paperless-ngx-dedupe/commit/fb8d7021ddec05b1be6d5eca4cbeacfb01f5414e))


### Performance

* **test:** reduce test corpus size and optimize CI config ([0a8e009](https://github.com/rknightion/paperless-ngx-dedupe/commit/0a8e009e2513f05cb1577ff87c63a72bf344347e))


### Tests

* reduce resource usage and ensure unique PDFs ([17873c4](https://github.com/rknightion/paperless-ngx-dedupe/commit/17873c4e9151bd05ac0cb416ffdfee5d3caa1b92))

## [0.6.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.5.0...v0.6.0) (2026-02-23)


### Features

* add metrics from paperless-exporter project ([a3f5712](https://github.com/rknightion/paperless-ngx-dedupe/commit/a3f57123659ccd7595eec11ff17270383c3966a9))
* add pdf-lib dependency for PDF generation in tests ([8b2a8d8](https://github.com/rknightion/paperless-ngx-dedupe/commit/8b2a8d8731b8a046c0027917bab3bbfbec4bc93a))
* add pipeline test script to package.json ([0aa3e3d](https://github.com/rknightion/paperless-ngx-dedupe/commit/0aa3e3dcd33b5cae931bdeb15c76b93003103e56))
* **api:** add phase progress to SSE progress events ([ef33920](https://github.com/rknightion/paperless-ngx-dedupe/commit/ef339202bcbe67441827a27a87ac4506dce1b3f4))
* **api:** support purge parameter in sync endpoint ([4a26bb7](https://github.com/rknightion/paperless-ngx-dedupe/commit/4a26bb7d87371c49b9153b1f65e83d6c6e67a5ab))
* **config:** add SYNC_METADATA_CONCURRENCY configuration option ([f401abc](https://github.com/rknightion/paperless-ngx-dedupe/commit/f401abc5b6c3ee1a1b82861f3293cc8356b4f10d))
* **core:** add purgeAllDocumentData function to clear local database ([4ad6e4b](https://github.com/rknightion/paperless-ngx-dedupe/commit/4ad6e4b7d6d64c4bc1873c2d0e8dcfdebecb9187))
* **core:** export purge functionality from main module ([ef4b99b](https://github.com/rknightion/paperless-ngx-dedupe/commit/ef4b99bde3b976873884cc9615c82fed3f973a80))
* **dedup:** add phase progress to analysis operations ([1cc0d33](https://github.com/rknightion/paperless-ngx-dedupe/commit/1cc0d33ba74c7199dd8312872b732b49b106a853))
* **jobs:** extend progress callback to include phase progress ([636b60c](https://github.com/rknightion/paperless-ngx-dedupe/commit/636b60c8b16228770cb7ed02ff67d6d6ea05bc65))
* **progress:** add phase progress tracking to job system ([33a759c](https://github.com/rknightion/paperless-ngx-dedupe/commit/33a759cfc666f2dd4f66ac0d652eeeb22248136e))
* **sdk:** add phase progress to SSE event types ([bef0bcb](https://github.com/rknightion/paperless-ngx-dedupe/commit/bef0bcb23909c5094159b9c34a2d5b903c512e3d))
* **sdk:** add SyncOptions to client sync method ([02be31a](https://github.com/rknightion/paperless-ngx-dedupe/commit/02be31abc14419e5a1d10b83db883a0e6834bf53))
* **sync:** add purgeBeforeSync option to sync operations ([53b8884](https://github.com/rknightion/paperless-ngx-dedupe/commit/53b8884703da415bb0a3107139c72b907707bf65))
* **sync:** implement phase progress tracking in document sync ([2b15885](https://github.com/rknightion/paperless-ngx-dedupe/commit/2b158857da32aa242ea242456e7f9a2fa1aa4bdf))
* **sync:** implement pipelined metadata fetching with concurrency control ([748eca1](https://github.com/rknightion/paperless-ngx-dedupe/commit/748eca106684f6ee007cb0f9afc2d0ca472b615c))
* **sync:** update sync types for phase progress support ([5cfd459](https://github.com/rknightion/paperless-ngx-dedupe/commit/5cfd45948446d681efe903c108f2165ccd234885))
* **ui:** add error message display for failed jobs ([8e9551a](https://github.com/rknightion/paperless-ngx-dedupe/commit/8e9551acf7e844ff2928d77823cc926b4d089ae5))
* **ui:** improve sync status display with detailed results ([33c7141](https://github.com/rknightion/paperless-ngx-dedupe/commit/33c7141954be60b8ff4d63eea3d072f9ba161d48))
* **web:** add purge option to sync UI with confirmation dialog ([e60d4a4](https://github.com/rknightion/paperless-ngx-dedupe/commit/e60d4a45cfe75ad9fb915e284c0d0173c9f2ac1e))
* **web:** enhance progress bar with phase progress and ETA ([ff23df1](https://github.com/rknightion/paperless-ngx-dedupe/commit/ff23df1396053fa9579a59826a8cd48b6e1a0b7e))
* **web:** implement phase progress in main page operations ([db6a8a4](https://github.com/rknightion/paperless-ngx-dedupe/commit/db6a8a483be897a03556d4e85edaf17a17a95a49))
* **web:** integrate phase progress throughout UI components ([147eea4](https://github.com/rknightion/paperless-ngx-dedupe/commit/147eea4c05110bbb590828f291f176032bd61027))
* **worker:** support purge option in sync worker task data ([c418ba0](https://github.com/rknightion/paperless-ngx-dedupe/commit/c418ba050237d9fe32f3028d5b735d5121b665f3))


### Bug Fixes

* ci ([f28b473](https://github.com/rknightion/paperless-ngx-dedupe/commit/f28b47366efb147300323da21d8451432ef79f5c))
* **deps:** update dependency lucide-svelte to ^0.568.0 ([#158](https://github.com/rknightion/paperless-ngx-dedupe/issues/158)) ([a1e45f8](https://github.com/rknightion/paperless-ngx-dedupe/commit/a1e45f893eccf72f2baba870ca2c24f9f08a4488))
* **deps:** update dependency lucide-svelte to ^0.574.0 ([#162](https://github.com/rknightion/paperless-ngx-dedupe/issues/162)) ([cfc9285](https://github.com/rknightion/paperless-ngx-dedupe/commit/cfc9285f50e8b8a2e18fd68225440fe63d2c99a4))
* **deps:** update dependency lucide-svelte to ^0.575.0 ([#169](https://github.com/rknightion/paperless-ngx-dedupe/issues/169)) ([7a54f06](https://github.com/rknightion/paperless-ngx-dedupe/commit/7a54f0644171d86a1675fafb8cf4b2fe5a5ee0ac))
* **deps:** update opentelemetry-js-contrib monorepo ([#159](https://github.com/rknightion/paperless-ngx-dedupe/issues/159)) ([f0d5f40](https://github.com/rknightion/paperless-ngx-dedupe/commit/f0d5f40e38295f9f308deec90adee9b2b3cf539f))
* remove tasks endpoint metrics ([e78c9c3](https://github.com/rknightion/paperless-ngx-dedupe/commit/e78c9c3554957a7e30d7b01e80a02f3e725cd404))
* **telemetry:** improve HTTP instrumentation filtering configuration ([b637dc0](https://github.com/rknightion/paperless-ngx-dedupe/commit/b637dc09b088a97a14d61811417727fb612378e1))


### Miscellaneous

* add curl to Docker and reduce sync page size ([52381ec](https://github.com/rknightion/paperless-ngx-dedupe/commit/52381ec50aae55e1934f68220343fee74bb7de86))
* claude.md improvements ([86e2f1e](https://github.com/rknightion/paperless-ngx-dedupe/commit/86e2f1e3c532d7e193570a0f55c2fff9450cfef5))
* **deps:** lock file maintenance ([#177](https://github.com/rknightion/paperless-ngx-dedupe/issues/177)) ([8d41e1d](https://github.com/rknightion/paperless-ngx-dedupe/commit/8d41e1d6f7ac203504bb1f3d406dfee6a872eea0))
* **deps:** lock file maintenance ([#178](https://github.com/rknightion/paperless-ngx-dedupe/issues/178)) ([719c053](https://github.com/rknightion/paperless-ngx-dedupe/commit/719c053b23adafe9511a156c4ed89e653da4cd42))
* **deps:** pin dependencies ([#151](https://github.com/rknightion/paperless-ngx-dedupe/issues/151)) ([07f0cbb](https://github.com/rknightion/paperless-ngx-dedupe/commit/07f0cbbfd3e309114948add56a4c7d125dc36509))
* **deps:** update actions/checkout action to v6 ([5d7fd05](https://github.com/rknightion/paperless-ngx-dedupe/commit/5d7fd0590d671094d4f71ab5bbf00c6fbfe7289d))
* **deps:** update actions/checkout action to v6 ([bdd1bf6](https://github.com/rknightion/paperless-ngx-dedupe/commit/bdd1bf6ea626bc3f3800c510711198bfef434a91))
* **deps:** update aquasecurity/trivy-action digest to c1824fd ([3dca951](https://github.com/rknightion/paperless-ngx-dedupe/commit/3dca95155ac70a60beada2ab709ca12c30e3655e))
* **deps:** update aquasecurity/trivy-action digest to c1824fd ([a6de668](https://github.com/rknightion/paperless-ngx-dedupe/commit/a6de668e404573d7402a60067adae9229b643eef))
* **deps:** update codacy/codacy-analysis-cli-action digest to 30783d0 ([#156](https://github.com/rknightion/paperless-ngx-dedupe/issues/156)) ([6ee4d0b](https://github.com/rknightion/paperless-ngx-dedupe/commit/6ee4d0bb757f71b0660903bfb825213be547468c))
* **deps:** update dependency @sveltejs/kit to v2.52.2 ([#166](https://github.com/rknightion/paperless-ngx-dedupe/issues/166)) ([b173429](https://github.com/rknightion/paperless-ngx-dedupe/commit/b173429b2d04295162f3ebb8d8c8a16d25c30542))
* **deps:** update dependency @sveltejs/kit to v2.53.0 ([#174](https://github.com/rknightion/paperless-ngx-dedupe/issues/174)) ([f163373](https://github.com/rknightion/paperless-ngx-dedupe/commit/f163373adaefbf67e9db871a8a8c7d07dc506e2b))
* **deps:** update dependency eslint to v10.0.1 ([#172](https://github.com/rknightion/paperless-ngx-dedupe/issues/172)) ([4fb3c69](https://github.com/rknightion/paperless-ngx-dedupe/commit/4fb3c69b4a6fab7b30536a2e834b15dacca9a533))
* **deps:** update dependency prettier-plugin-svelte to v3.5.0 ([#168](https://github.com/rknightion/paperless-ngx-dedupe/issues/168)) ([07470d3](https://github.com/rknightion/paperless-ngx-dedupe/commit/07470d34dffe355139a64de85935ae0b0e165c2c))
* **deps:** update dependency svelte to v5.51.3 ([#160](https://github.com/rknightion/paperless-ngx-dedupe/issues/160)) ([4548c0f](https://github.com/rknightion/paperless-ngx-dedupe/commit/4548c0f9d1bfd8360a7dd48f88054d444d2c3aed))
* **deps:** update dependency svelte to v5.51.5 ([#164](https://github.com/rknightion/paperless-ngx-dedupe/issues/164)) ([dea7b30](https://github.com/rknightion/paperless-ngx-dedupe/commit/dea7b30215a2a1a1900f8f804662034835e260e0))
* **deps:** update dependency svelte to v5.53.0 ([#167](https://github.com/rknightion/paperless-ngx-dedupe/issues/167)) ([e273aca](https://github.com/rknightion/paperless-ngx-dedupe/commit/e273acae5c5534f40b7004833c6eeab8fd9b6fa5))
* **deps:** update dependency svelte to v5.53.1 ([#175](https://github.com/rknightion/paperless-ngx-dedupe/issues/175)) ([807e299](https://github.com/rknightion/paperless-ngx-dedupe/commit/807e299484b3448009886fd7bdb52e70babb2e82))
* **deps:** update dependency svelte to v5.53.2 ([#176](https://github.com/rknightion/paperless-ngx-dedupe/issues/176)) ([ea916d7](https://github.com/rknightion/paperless-ngx-dedupe/commit/ea916d7e021bbc278ebf82d301424cda12252fa3))
* **deps:** update dependency svelte-check to v4.4.1 ([#165](https://github.com/rknightion/paperless-ngx-dedupe/issues/165)) ([6b32a01](https://github.com/rknightion/paperless-ngx-dedupe/commit/6b32a01ef092f059c5e5ea2d0db0289d7fdb68cb))
* **deps:** update dependency svelte-check to v4.4.3 ([#173](https://github.com/rknightion/paperless-ngx-dedupe/issues/173)) ([b86c904](https://github.com/rknightion/paperless-ngx-dedupe/commit/b86c9048bc9db763ccdbca0b5af4a4da1e267a2d))
* **deps:** update github/codeql-action digest to 89a39a4 ([#171](https://github.com/rknightion/paperless-ngx-dedupe/issues/171)) ([c3a4746](https://github.com/rknightion/paperless-ngx-dedupe/commit/c3a47463647970312cb8d0d2fe281e2efe76d3eb))
* **deps:** update pnpm to v10.30.0 ([#161](https://github.com/rknightion/paperless-ngx-dedupe/issues/161)) ([73c2e98](https://github.com/rknightion/paperless-ngx-dedupe/commit/73c2e98ae4fcfb79d88de79d048a5ccf7fe1b189))
* **deps:** update pnpm to v10.30.1 ([#170](https://github.com/rknightion/paperless-ngx-dedupe/issues/170)) ([675f249](https://github.com/rknightion/paperless-ngx-dedupe/commit/675f249c873404ada7904eda6faec947eeed3b37))
* **deps:** update tailwindcss monorepo to v4.2.0 ([#163](https://github.com/rknightion/paperless-ngx-dedupe/issues/163)) ([8216d7a](https://github.com/rknightion/paperless-ngx-dedupe/commit/8216d7a0a6ee5f7c530e7a315c6563ebf0055d93))
* **deps:** update typescript-eslint monorepo to v8.56.0 ([#157](https://github.com/rknightion/paperless-ngx-dedupe/issues/157)) ([9e7a889](https://github.com/rknightion/paperless-ngx-dedupe/commit/9e7a88910f22e9b0435d02c96258c0fcfd7bc1e5))
* lint ([b6c0c74](https://github.com/rknightion/paperless-ngx-dedupe/commit/b6c0c7494b0061ac4c57ded1d84975eef35f454d))
* remove sync metadata concurrency configuration option ([fe40fb8](https://github.com/rknightion/paperless-ngx-dedupe/commit/fe40fb8eec3c390340286ca9a4f172cceea57c44))


### Documentation

* add quality checks and development guidelines to CLAUDE.md ([790e342](https://github.com/rknightion/paperless-ngx-dedupe/commit/790e342fe3340b30ce6f69294302bbfe3e667017))
* update documentation to reflect simplified 2-component scoring ([96f6ee5](https://github.com/rknightion/paperless-ngx-dedupe/commit/96f6ee51d6bd3b8a1d6a604f4c7eb8a26b9bc4f2))


### Refactoring

* **api:** update SDK and API types to remove file size and metadata fields ([15c69bf](https://github.com/rknightion/paperless-ngx-dedupe/commit/15c69bf007b77b76e68bafa000ba827ca277fdf6))
* **cli:** remove metadata and filename weight options from config commands ([656a422](https://github.com/rknightion/paperless-ngx-dedupe/commit/656a422f0a9bbcfb6e4173598302b3ad37c07700))
* **core:** update test configurations for simplified scoring system ([dba1011](https://github.com/rknightion/paperless-ngx-dedupe/commit/dba10111138b0bf8a3cf95fa377dbfe94b45c126))
* **db:** remove storage and file size related fields from schema and queries ([b465d6e](https://github.com/rknightion/paperless-ngx-dedupe/commit/b465d6e68796cb2da768deaa8521e2d9bb06b4cd))
* **dedup:** remove metadata and filename similarity scoring ([b33a669](https://github.com/rknightion/paperless-ngx-dedupe/commit/b33a6691309949beaf4049fd01eb512e7bec49de))
* **export:** remove file size and metadata fields from CSV export ([70ba722](https://github.com/rknightion/paperless-ngx-dedupe/commit/70ba7221fd3b7a7099429c5f2f3ce0383902730f))
* **paperless:** change getDocuments to return page metadata ([468e2a7](https://github.com/rknightion/paperless-ngx-dedupe/commit/468e2a7deba1021ab39f22a4493604dc58c1cf43))
* **paperless:** replace task fetching with count-based metrics ([16f0652](https://github.com/rknightion/paperless-ngx-dedupe/commit/16f0652e1aa1619543c06b5d58a25a770c2e08a3))
* **settings:** simplify confidence weight configuration to 2-component system ([84f8b1e](https://github.com/rknightion/paperless-ngx-dedupe/commit/84f8b1e415240d291e319b58dacf521befd865cd))
* **sync:** pass metadata concurrency from config to sync worker ([2af7736](https://github.com/rknightion/paperless-ngx-dedupe/commit/2af7736d8d39c0a283c186a33424e0ccae051442))
* **sync:** remove document metadata fetching and file size tracking ([fa93b40](https://github.com/rknightion/paperless-ngx-dedupe/commit/fa93b409b78e073707e36b1575639a285a470f5f))
* **sync:** rename concurrency option to metadataConcurrency ([7b193ce](https://github.com/rknightion/paperless-ngx-dedupe/commit/7b193ce06a05f0a7e8cefb75dbc7a80268f11640))
* **ui:** remove file size displays and metadata scoring from web interface ([7d3fb06](https://github.com/rknightion/paperless-ngx-dedupe/commit/7d3fb069ad497c22a0f12d670b2845bedac93574))


### Performance

* **core:** optimize API calls and resource usage ([6b7af0c](https://github.com/rknightion/paperless-ngx-dedupe/commit/6b7af0cd15192698b5e3686672b213fb91e36d78))
* **sync:** increase default page size to improve throughput ([5eef665](https://github.com/rknightion/paperless-ngx-dedupe/commit/5eef665644e3520bbd8d86201ce95776cdc0165b))


### Tests

* add comprehensive test corpus for pipeline E2E testing ([9efcfad](https://github.com/rknightion/paperless-ngx-dedupe/commit/9efcfad1cb980df1cea58067a823a76cf65f44e1))
* add dedicated Vitest configuration for pipeline tests ([99c3513](https://github.com/rknightion/paperless-ngx-dedupe/commit/99c351369feb34f24e820a294669bb97b3fd5a95))
* add PDF generator utility for pipeline testing ([beb7e41](https://github.com/rknightion/paperless-ngx-dedupe/commit/beb7e41fb0e004cff2f7853d155f46499a904fac))
* add pipeline test setup utilities and database management ([02421ba](https://github.com/rknightion/paperless-ngx-dedupe/commit/02421baa5a2baadac27ac458a2af13e91ae5b781))
* exclude pipeline tests from main test configuration ([ea1fb6e](https://github.com/rknightion/paperless-ngx-dedupe/commit/ea1fb6ee10ace8f5813ccbc30ba025950a3428e5))
* implement comprehensive pipeline E2E test suite ([52d3744](https://github.com/rknightion/paperless-ngx-dedupe/commit/52d37448577f0a0fb6ed7bb7a2ad0ffc99e30ed9))
* remove file size and metadata similarity assertions ([6a70935](https://github.com/rknightion/paperless-ngx-dedupe/commit/6a70935d4c6e083927c0efb774236d0389d5c489))
* **sync:** enhance sync-documents tests with comprehensive metadata testing ([a52dd01](https://github.com/rknightion/paperless-ngx-dedupe/commit/a52dd01ad86248a0e465c0fe9832eb0f079b293c))
* **sync:** update config schema tests for new SYNC_METADATA_CONCURRENCY ([f79af45](https://github.com/rknightion/paperless-ngx-dedupe/commit/f79af4545dcad26d6915b5f779031438d0774ced))
* update paperless client tests for new return format ([3b69704](https://github.com/rknightion/paperless-ngx-dedupe/commit/3b6970441e69665ac01fb8f486a4ffe7b892f15a))

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
