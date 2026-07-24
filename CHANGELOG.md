# Changelog

## [0.16.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.15.0...v0.16.0) (2026-07-24)


### Features

* add budgeted review-only automation ([147a78b](https://github.com/rknightion/paperless-ngx-dedupe/commit/147a78b56912da32c060a3f65d05dd05b1243068))
* add clearAllAiResults function to delete all AI processing results ([ac9ab04](https://github.com/rknightion/paperless-ngx-dedupe/commit/ac9ab04781fda1768055a5eac705f54551931644))
* add contextual reset prompt after prompt revert ([5a5e006](https://github.com/rknightion/paperless-ngx-dedupe/commit/5a5e0064774552f41c1e687dd9c658a60c39aa9a))
* add document cleanup and 404 error handling for orphaned records ([1f756ff](https://github.com/rknightion/paperless-ngx-dedupe/commit/1f756ff7b2e20898939c62b5895b1cc0e34984af))
* add duplicate group detail tracking ([78bb14c](https://github.com/rknightion/paperless-ngx-dedupe/commit/78bb14cb3ba47c3d6c1508d353b6116458d41ec9))
* add durable automation schedules ([4b85911](https://github.com/rknightion/paperless-ngx-dedupe/commit/4b85911bc62f3d2c2a1a85ac40edc31bd318a6f0))
* add Faro route tracking integration ([71d644d](https://github.com/rknightion/paperless-ngx-dedupe/commit/71d644dc1d4fc1d510792b3a0055678a64301802))
* add Faro tracking to dashboard operations ([2240325](https://github.com/rknightion/paperless-ngx-dedupe/commit/2240325646f2b276def20979136f3c147d4fbf56))
* add Grafana Faro frontend observability configuration ([b38edc1](https://github.com/rknightion/paperless-ngx-dedupe/commit/b38edc1c93ba2802c7cfa8142ffbf8d5678b51ff))
* add Paperless 3 custom-field workflows ([e273974](https://github.com/rknightion/paperless-ngx-dedupe/commit/e273974eb41f9ff6389fb422f8a9fe161c3a5295))
* add POST /api/v1/ai/results/clear endpoint ([b72f1b1](https://github.com/rknightion/paperless-ngx-dedupe/commit/b72f1b170501a1892698e32364166634284d733b))
* add RAG conversation and indexing tracking ([208b479](https://github.com/rknightion/paperless-ngx-dedupe/commit/208b4798649e5238a9b8c87adcb930df788dfae4))
* add safe API contracts and readiness model ([54adb7b](https://github.com/rknightion/paperless-ngx-dedupe/commit/54adb7bb539a676ea3eb314e62dd099b41e4b7ee))
* add safe duplicate review foundations ([eba5442](https://github.com/rknightion/paperless-ngx-dedupe/commit/eba544289b020eb8347a72d4cdc86562dca871f3))
* add settings management tracking ([1f669db](https://github.com/rknightion/paperless-ngx-dedupe/commit/1f669db41d55f1a16c433a046a8495fc84e92cd1))
* add source map generation and upload for error tracking ([16cb25b](https://github.com/rknightion/paperless-ngx-dedupe/commit/16cb25b58c3d4173fa4d7d5a7d62ed42f211186e))
* add standalone Reset Processing History button with confirmation ([56cda05](https://github.com/rknightion/paperless-ngx-dedupe/commit/56cda0525d3f587ede6c2cd2cfb39decc9131088))
* add workflow-first operations cockpit ([85ee926](https://github.com/rknightion/paperless-ngx-dedupe/commit/85ee92602e18cd067ac03c7a09b340ce909613cc))
* **ai-processing:** make stats cards clickable with navigation links ([a98ccad](https://github.com/rknightion/paperless-ngx-dedupe/commit/a98ccadca0172e80ab37f02c3b59f9836ed7d98e))
* **ai-processing:** preserve limit query parameter when navigating between tabs ([657b701](https://github.com/rknightion/paperless-ngx-dedupe/commit/657b7015765096184757c478114e22aaad37333b))
* **ai:** adaptive TPM throttle for batch processing ([72222e0](https://github.com/rknightion/paperless-ngx-dedupe/commit/72222e0c7476077343086195c6a82a7c26134be3))
* **ai:** add bulk operations, grouping, and preflight checks to AI processing workflow ([dbed3a6](https://github.com/rknightion/paperless-ngx-dedupe/commit/dbed3a6ca76af99b4b404d7e37a4a67f0c9ac789))
* **ai:** add cost comparison dialog for AI model selection ([1c87d79](https://github.com/rknightion/paperless-ngx-dedupe/commit/1c87d7980b816d14b80985b02fd00fccd313f325))
* **ai:** add default tag alias map constant ([2a47e0d](https://github.com/rknightion/paperless-ngx-dedupe/commit/2a47e0dacfcbc875a46a0968a260fd7e854b2b46))
* **ai:** add failure tracking with failure types ([224305f](https://github.com/rknightion/paperless-ngx-dedupe/commit/224305fe0f009097a830cc58ce9d38f30c28155f))
* **ai:** add filtering and search capabilities to unprocessed document queue ([fb36503](https://github.com/rknightion/paperless-ngx-dedupe/commit/fb36503280754d2ec4f772f4a55b1823519f0974))
* **ai:** add flex processing support — ~50% cost reduction for background extraction ([da1dd4f](https://github.com/rknightion/paperless-ngx-dedupe/commit/da1dd4f5fbea73a99824d97491a42e9bcb6e9e78))
* **ai:** add protected tags configuration schema ([da67b18](https://github.com/rknightion/paperless-ngx-dedupe/commit/da67b18f998760d200a628a8afdbd10e40c2f6e3))
* **ai:** add quota exceeded error handling for OpenAI provider ([a22a24c](https://github.com/rknightion/paperless-ngx-dedupe/commit/a22a24c9f05c16446345f22378d42c338005be5c))
* **ai:** add reprocess functionality for failed AI extractions ([e5096fa](https://github.com/rknightion/paperless-ngx-dedupe/commit/e5096faa03eeaa9c711f63ef62763ac2fee980c4))
* **ai:** add skipped status for documents without OCR content ([138019b](https://github.com/rknightion/paperless-ngx-dedupe/commit/138019b30ea7f527368d4390c8314d8314459552))
* **ai:** add tag alias YAML validation utility with tests ([e766448](https://github.com/rknightion/paperless-ngx-dedupe/commit/e7664483f82f1b5f280e6feeda7ad85bcbf04c7f))
* **ai:** add tag_aliases placeholder to default extraction prompt ([f5693d0](https://github.com/rknightion/paperless-ngx-dedupe/commit/f5693d02a7ebc44bf1b6ddb4bb11ffbd272b7740))
* **ai:** add tagAliasesEnabled and tagAliasMap config fields ([362444c](https://github.com/rknightion/paperless-ngx-dedupe/commit/362444cfc35863f27ba23b81b379f8796c1fa772))
* **ai:** add title extraction and management to AI processing ([6d38418](https://github.com/rknightion/paperless-ngx-dedupe/commit/6d384186ad951680ed9b587c3c87e6563da11182))
* **ai:** add title suggestions to AI result displays ([f5062dd](https://github.com/rknightion/paperless-ngx-dedupe/commit/f5062dd9cda0a417fdb7f5a71163aa3a0d646ad8))
* **ai:** add visual indicator for custom prompt templates ([cc2f7e5](https://github.com/rknightion/paperless-ngx-dedupe/commit/cc2f7e517b0419c3bec205e9adf6c67129815485))
* **ai:** adjust stats grid layout to accommodate skipped documents ([0c36799](https://github.com/rknightion/paperless-ngx-dedupe/commit/0c36799655b738cc73f070cc83c9b2a1f69a2c82))
* **ai:** apply ~50% flex processing discount to cost estimates ([43a2a32](https://github.com/rknightion/paperless-ngx-dedupe/commit/43a2a32e3e0274b1d37db10207b3d4cd63167192))
* **ai:** complete AI processing UX overhaul with safety improvements and review workflow ([e144957](https://github.com/rknightion/paperless-ngx-dedupe/commit/e144957a644b40d09cbfc4483652ea031199d59d))
* **ai:** export DEFAULT_TAG_ALIAS_MAP and validateTagAliasYaml from core ([7aad44f](https://github.com/rknightion/paperless-ngx-dedupe/commit/7aad44fed2761021b026f130c81f082ccfd4de12))
* **ai:** implement comprehensive confidence gates, auto-apply, audit trails, and cost tracking ([5421894](https://github.com/rknightion/paperless-ngx-dedupe/commit/5421894bbd46d1295e7fcc9336e00ca764a3326f))
* **ai:** implement protected tags config storage and parsing ([fb8d345](https://github.com/rknightion/paperless-ngx-dedupe/commit/fb8d345a9e9ac3d2e806ee31f3ede2f7ec00189c))
* **ai:** implement protected tags filtering in applyAiResult ([53b5051](https://github.com/rknightion/paperless-ngx-dedupe/commit/53b5051a60b9319e8d625a5757c572eff186e042))
* **ai:** improve AI prompt guidelines for better classification ([a7c550c](https://github.com/rknightion/paperless-ngx-dedupe/commit/a7c550c76b9211ac175f1aa86ca0f8e1f90d4482))
* **ai:** improve progress reporting during rate limit pauses ([6a893d5](https://github.com/rknightion/paperless-ngx-dedupe/commit/6a893d51904bec59a6ecd28528be56aef323f47c))
* **ai:** improve rate limits and circuit breaker handling for better throughput ([d826137](https://github.com/rknightion/paperless-ngx-dedupe/commit/d8261372cae3f785727d0cf26e4856fd99096d92))
* **ai:** include failed AI results in processing history ([716fa06](https://github.com/rknightion/paperless-ngx-dedupe/commit/716fa065ed54077df21bf57843a61c1b7fc978b7))
* **ai:** integrate protected tags into auto-apply workflows ([156c219](https://github.com/rknightion/paperless-ngx-dedupe/commit/156c219fbd95240e968444da7ba501bd2bfbdf62))
* **ai:** resolve {{tag_aliases}} placeholder in buildPromptParts ([8ac55a4](https://github.com/rknightion/paperless-ngx-dedupe/commit/8ac55a4a735ee1f1a6cf6894203f3be218b882c0))
* **ai:** sort reference lists alphabetically for deterministic prompts ([27b9d98](https://github.com/rknightion/paperless-ngx-dedupe/commit/27b9d9859083b1ae1cbd9a8d5293e314ccd8ecca))
* **ai:** thread tag alias config through processDocument and callers ([abae43c](https://github.com/rknightion/paperless-ngx-dedupe/commit/abae43c00bf1247344d0a9f2add9f9de3e83f73a))
* **api:** add bulk apply and reject endpoints for AI results ([810d8a9](https://github.com/rknightion/paperless-ngx-dedupe/commit/810d8a97727c8197429c6bfbda4dedc8f12100a2))
* **api:** add includeDeleted parameter to duplicates endpoint ([be0c852](https://github.com/rknightion/paperless-ngx-dedupe/commit/be0c8520fe2235b620a82b3f6bfa1f31ed300f86))
* **api:** add job history management endpoints ([dc45b9b](https://github.com/rknightion/paperless-ngx-dedupe/commit/dc45b9b22a8f749cd3414e720f705bbf1412b0b9))
* **api:** add member removal functionality to duplicate groups ([8665f96](https://github.com/rknightion/paperless-ngx-dedupe/commit/8665f9600f7586ebb4f0b8aac8d6e2c07cf54a1d))
* **api:** add protected tags to AI result apply endpoint ([54c7a70](https://github.com/rknightion/paperless-ngx-dedupe/commit/54c7a70f864f0e568d7b53a3709e22ba83a1f025))
* **api:** add server-side YAML validation for tag alias map ([2694d26](https://github.com/rknightion/paperless-ngx-dedupe/commit/2694d262ca292814058a244073940e6708f67be2))
* **api:** add staleness detection to dedup config endpoint ([d82a2dd](https://github.com/rknightion/paperless-ngx-dedupe/commit/d82a2dd26d4873414d304281376d3235ef2cf800))
* **api:** update dedup config endpoint to handle discriminative weight ([58e54c6](https://github.com/rknightion/paperless-ngx-dedupe/commit/58e54c68192458aabf2146019b665d3f0a1c561f))
* **api:** update duplicate queries to include discriminative scores ([18b331c](https://github.com/rknightion/paperless-ngx-dedupe/commit/18b331c360ed2f601cb1346fd45432d646f7870a))
* **batch-worker:** integrate cross-group cleanup and improve progress reporting ([0d0c0e2](https://github.com/rknightion/paperless-ngx-dedupe/commit/0d0c0e26bba828c00c6b5dbb9ba6a7c508203258))
* complete Waves 5 and 6 hardening ([27af8de](https://github.com/rknightion/paperless-ngx-dedupe/commit/27af8de5b414bd49e4cd733977d9e35de6141b76)), closes [#469](https://github.com/rknightion/paperless-ngx-dedupe/issues/469)
* complete workflow-first modernization ([ccd231f](https://github.com/rknightion/paperless-ngx-dedupe/commit/ccd231ff3fcdfdfb367db4183e510f02af87476b)), closes [#469](https://github.com/rknightion/paperless-ngx-dedupe/issues/469)
* coordinate idempotent scheduled work ([9895a7f](https://github.com/rknightion/paperless-ngx-dedupe/commit/9895a7ff2c4a4986ee14c6eab2535df406af8ca3))
* **core:** add database index for document cleanup optimization ([417a5fe](https://github.com/rknightion/paperless-ngx-dedupe/commit/417a5feeb34721ee72705af73e29a463960fa1c0))
* **core:** export analysis hash tracking functions ([3b65ea0](https://github.com/rknightion/paperless-ngx-dedupe/commit/3b65ea0f1ed24047bc73b4f0253d74ae80637e38))
* **core:** implement cross-group document cleanup functionality ([d56283d](https://github.com/rknightion/paperless-ngx-dedupe/commit/d56283d6072e77dcba4810895beb689f3a436293))
* **dashboard:** add analysis staleness detection ([32f2e7e](https://github.com/rknightion/paperless-ngx-dedupe/commit/32f2e7ed3afe7120265051d2639ca16160e467d2))
* **db:** add archived fields to duplicate_group schema ([684039d](https://github.com/rknightion/paperless-ngx-dedupe/commit/684039d34ae46c163867ef235be5ba1c7c437f93))
* **db:** add migration for deleted group archives ([ccb419d](https://github.com/rknightion/paperless-ngx-dedupe/commit/ccb419daa7278ab5caf4c5b17219d981867433ed))
* **dedup:** add analysis config hash tracking for staleness detection ([253783f](https://github.com/rknightion/paperless-ngx-dedupe/commit/253783ffedb1d7c44c531c085133dcad51701e1c))
* **dedup:** add discriminative scoring system for structured content ([b9519bd](https://github.com/rknightion/paperless-ngx-dedupe/commit/b9519bd0468dd74bcbf7ffeb7514fadd3c9434c9))
* **dedup:** change default discriminative penalty strength from 50 to 70 ([2270c0b](https://github.com/rknightion/paperless-ngx-dedupe/commit/2270c0bbba996d2d2c293f1620cf5a2db6663ff5))
* **dedup:** enhance discriminative classifier with improved pattern detection ([29f63ed](https://github.com/rknightion/paperless-ngx-dedupe/commit/29f63ed7890f9e2b837506b26c09accbf12302bd))
* **dedup:** expand discriminative token extraction patterns ([db13dc2](https://github.com/rknightion/paperless-ngx-dedupe/commit/db13dc24f4afdee070c0e02daf3158d00098e10e))
* **dedup:** implement config migration from old weight systems ([c2ef44e](https://github.com/rknightion/paperless-ngx-dedupe/commit/c2ef44ec45cca41402f790caea8387c0dc0ef1ec))
* **dedup:** integrate config hash tracking into analysis pipeline ([9174165](https://github.com/rknightion/paperless-ngx-dedupe/commit/91741659a3462ec9839e78859cc6c1997cec7eb4))
* **dedup:** integrate discriminative scoring into similarity computation ([bb982d6](https://github.com/rknightion/paperless-ngx-dedupe/commit/bb982d614d0fcc7ec895ee2217998b207d82c280))
* **dedup:** update analysis pipeline to compute and store discriminative scores ([83c2f35](https://github.com/rknightion/paperless-ngx-dedupe/commit/83c2f3511fa65a60678b83b584244cbe22cce13c))
* **dedup:** update config management to handle discriminative weights ([533f42d](https://github.com/rknightion/paperless-ngx-dedupe/commit/533f42d4573743af102741d40b2c3c707b7d8356))
* **dedup:** update configuration schema to support three-weight system ([2e0b963](https://github.com/rknightion/paperless-ngx-dedupe/commit/2e0b963e789520a6e83bb5de8cfdb407d049ce50))
* **docs:** align docs site with m7kni.io brand + server-side SEO/LLM metadata ([586a62c](https://github.com/rknightion/paperless-ngx-dedupe/commit/586a62c39a8709ad416319008aab1ac242328825)), closes [#397](https://github.com/rknightion/paperless-ngx-dedupe/issues/397)
* **duplicates:** add navigation controls to document visual comparison ([fd1563c](https://github.com/rknightion/paperless-ngx-dedupe/commit/fd1563ca6a05ca1f851551f0a57c740a66d6faad))
* **duplicates:** add sortable columns with persistent preferences ([d0df9b1](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0df9b1da6d2d43190a7d731d0b04398479f5b76))
* export new archiving functions from core package ([ebb3ce2](https://github.com/rknightion/paperless-ngx-dedupe/commit/ebb3ce2a9b72fe390d31de6ada22379e16b4c5ed))
* **export:** include discriminative scores in CSV export ([2948247](https://github.com/rknightion/paperless-ngx-dedupe/commit/29482479f3893395c7035c926dc999beb75b72e9))
* harden configuration and diagnostics ([68723ed](https://github.com/rknightion/paperless-ngx-dedupe/commit/68723ed35f88e5093295a76a40023ec3b254dd5e))
* implement AI processing tracking ([84e54f9](https://github.com/rknightion/paperless-ngx-dedupe/commit/84e54f962e3bf9e5a09e91c94e4375db8f68c14a))
* implement duplicates management tracking ([5266afb](https://github.com/rknightion/paperless-ngx-dedupe/commit/5266afbdd865507e075bc6c3dea4be24c0130cde))
* implement Grafana Faro event tracking system ([83c4371](https://github.com/rknightion/paperless-ngx-dedupe/commit/83c4371db8e0c19945246604fe63d1fb289a920c))
* implement wizard workflow tracking ([a070955](https://github.com/rknightion/paperless-ngx-dedupe/commit/a0709550af2183123056c95575607e22791fc8f4))
* initialize Faro tracking in root layout ([e38bb12](https://github.com/rknightion/paperless-ngx-dedupe/commit/e38bb12cdb288267d69c1c2f150c87665cb793df))
* initialize Grafana Faro Web SDK ([073985f](https://github.com/rknightion/paperless-ngx-dedupe/commit/073985f1d944f6653b0e8a084b1b4547d1baba6d))
* integrate Faro configuration in server-side layout ([3fd06df](https://github.com/rknightion/paperless-ngx-dedupe/commit/3fd06dffdea5c502254012b100f6c4ed8f5b2165))
* **jobs:** add clearJobHistory function to manager ([d9fba30](https://github.com/rknightion/paperless-ngx-dedupe/commit/d9fba30115df1ed7cdffc34889ddd70dc5bf6efd))
* **jobs:** add pause and resume functionality for job management ([8246a3a](https://github.com/rknightion/paperless-ngx-dedupe/commit/8246a3ab8410549faf1b9b15da79932500859e1e))
* **jobs:** implement pause/resume support in worker execution ([a3b3e8b](https://github.com/rknightion/paperless-ngx-dedupe/commit/a3b3e8b0e23515406cdf345b624df92c5be23390))
* **jobs:** update batch worker to use archiving ([8e4ba2e](https://github.com/rknightion/paperless-ngx-dedupe/commit/8e4ba2e876e4ec62ff709b277cf8aaba63bcab1c))
* persist job activity across navigation ([b31a589](https://github.com/rknightion/paperless-ngx-dedupe/commit/b31a58947f1c0a2e0fb4ddce5066dae730d9d384))
* **queries:** add archived fields to duplicate group types ([53cfe5a](https://github.com/rknightion/paperless-ngx-dedupe/commit/53cfe5ae744676f47699322180d73f008a8a6f50))
* **queries:** implement group archiving and filtering logic ([625f20c](https://github.com/rknightion/paperless-ngx-dedupe/commit/625f20cb5b22e447abfb64c50e10c1f94a588272))
* **queries:** update setGroupStatus to archive on delete ([290c63f](https://github.com/rknightion/paperless-ngx-dedupe/commit/290c63fb2f71d9e0c17d83232fa12d7d464178a8))
* remove Anthropic API support, add OpenAI flex processing ([47a70fa](https://github.com/rknightion/paperless-ngx-dedupe/commit/47a70fa0aeba1c21573ae39ae2f4f21828b998bc))
* run schedules through shared job dispatch ([253002a](https://github.com/rknightion/paperless-ngx-dedupe/commit/253002a54d632006e7a68a7fc1e5239be880bca5))
* **schema:** add discriminative_score column to duplicate_group table ([d9ced82](https://github.com/rknightion/paperless-ngx-dedupe/commit/d9ced82653abbd5e83ad47f88de31e0e5234c575))
* **sdk:** extend Job interface and add job management methods ([31223fa](https://github.com/rknightion/paperless-ngx-dedupe/commit/31223faefa01ca04795073b25c34fd7fb1939640))
* **settings:** replace 3-weight system with 2-weight plus penalty UI ([f398e35](https://github.com/rknightion/paperless-ngx-dedupe/commit/f398e35f1cfdd07b0d376cdd6d349063baf7fb7d))
* streamline duplicate review ([c4f86a8](https://github.com/rknightion/paperless-ngx-dedupe/commit/c4f86a8ae99b635c32fe8b8f808f289326926163))
* sync applied AI results to local document table and improve UI navigation ([f579d36](https://github.com/rknightion/paperless-ngx-dedupe/commit/f579d36158ea6a0c905e6b2d5354aa0926b3c307))
* **telemetry:** add Faro User Actions to multi-step interactions ([9d26ddb](https://github.com/rknightion/paperless-ngx-dedupe/commit/9d26ddb251cd9a674b0c6bde37563ed6d38a0ea2))
* **telemetry:** add Pyroscope continuous profiling support ([2013c5c](https://github.com/rknightion/paperless-ngx-dedupe/commit/2013c5c9ec5a14360ce5ff511f3c6ce0ea4d973b))
* **telemetry:** add Pyroscope operation labels to hot code paths ([42e6ddf](https://github.com/rknightion/paperless-ngx-dedupe/commit/42e6ddffc3b8b3b79a69502efb543901f6a6ddca))
* **telemetry:** add service.namespace, resource detectors, and Pyroscope config ([0a5cbc1](https://github.com/rknightion/paperless-ngx-dedupe/commit/0a5cbc154dd8fa271d6e5eaa4b211e81a9b10c33))
* **telemetry:** enhance OpenTelemetry configuration and trace correlation ([f17e48c](https://github.com/rknightion/paperless-ngx-dedupe/commit/f17e48c2e92b273dfb7e0850e076f1c89d219fd3))
* **telemetry:** wire Faro TracingInstrumentation for end-to-end trace correlation ([5d899f0](https://github.com/rknightion/paperless-ngx-dedupe/commit/5d899f0030ad0331112254786fb397bd7df2f160))
* **types:** add discriminative score support to interfaces ([a1365cc](https://github.com/rknightion/paperless-ngx-dedupe/commit/a1365ccf8c9ebab3448509052c47a31705178d91))
* **ui:** add bulk operations for AI processing results ([6baf914](https://github.com/rknightion/paperless-ngx-dedupe/commit/6baf914c2a909a2b5eaf56df3b5f25118fea25d1))
* **ui:** add discriminative score display to confidence components ([27130e7](https://github.com/rknightion/paperless-ngx-dedupe/commit/27130e7821f6056571855bd9b75fbd3111296ca3))
* **ui:** add error banner and retry button to AiResultDetailDrawer ([f8818b6](https://github.com/rknightion/paperless-ngx-dedupe/commit/f8818b63ee5d4a4a58809aff2b6098828b083dc0))
* **ui:** add error banner and retry to history page drawer ([db7cff3](https://github.com/rknightion/paperless-ngx-dedupe/commit/db7cff37ca80d6972fb599eebe919935a5db9adf))
* **ui:** add flex processing toggle with tooltip to AI settings ([0bf18c4](https://github.com/rknightion/paperless-ngx-dedupe/commit/0bf18c4b336e0b29dd3ba8c3ed4604eefd804e95))
* **ui:** add per-document actions for group management ([9ec5bf6](https://github.com/rknightion/paperless-ngx-dedupe/commit/9ec5bf678d35dbc24a8084ed1fa62f85d6ace6a0))
* **ui:** add stale analysis warning banner component ([d6458e3](https://github.com/rknightion/paperless-ngx-dedupe/commit/d6458e3af3c414939b38907f24890673ca1bd22d))
* **ui:** allow error messages to wrap in queue page failed section ([c2c45fd](https://github.com/rknightion/paperless-ngx-dedupe/commit/c2c45fd61a16b6650ce79875040fa635c512eb5d))
* **ui:** enhance penalty strength settings with detailed guidance ([83f004b](https://github.com/rknightion/paperless-ngx-dedupe/commit/83f004bb00651a1f79be7245010e63d7390c691a))
* **ui:** integrate stale analysis warnings in dashboard ([4da6100](https://github.com/rknightion/paperless-ngx-dedupe/commit/4da610020b2e3f487b818356e92ed3a28a2793f0))
* **ui:** show inline error message in AiResultCard instead of tooltip ([c981e69](https://github.com/rknightion/paperless-ngx-dedupe/commit/c981e69f161e9c3623d1ae37dd324fa8a84ce708))
* **ui:** show inline error message in AiResultRow instead of tooltip ([4699040](https://github.com/rknightion/paperless-ngx-dedupe/commit/4699040ff158d7d79338977564f103379b8fa272))
* **ui:** update confidence breakdown to show penalty strength ([17f2764](https://github.com/rknightion/paperless-ngx-dedupe/commit/17f276440158ec212393e553512529839a33c44d))
* **ui:** update settings page for three-weight configuration system ([d90eb67](https://github.com/rknightion/paperless-ngx-dedupe/commit/d90eb67ce2d688f0276efcadd8521366b90e378f))
* **web:** add API endpoint for document cleanup across groups ([e94f936](https://github.com/rknightion/paperless-ngx-dedupe/commit/e94f9361318131fd0386a370aca9b2cc467a84cb))
* **web:** add isDefaultTagAliasMap to settings page data ([13659e9](https://github.com/rknightion/paperless-ngx-dedupe/commit/13659e97437c143c0defd098c345b8c26c324f0f))
* **web:** add Jobs navigation item to layout ([4c3402a](https://github.com/rknightion/paperless-ngx-dedupe/commit/4c3402ae0c3d60ae4cade3b21df2aafdfb34333a))
* **web:** add jobs page with filtering and history management ([60bffa3](https://github.com/rknightion/paperless-ngx-dedupe/commit/60bffa36d76a8cf60441456d94bce32c2ac17ae3))
* **web:** add pause/resume API endpoints for job control ([34935ad](https://github.com/rknightion/paperless-ngx-dedupe/commit/34935adfcb0598c7afc6570689cee8f655552e4e))
* **web:** add pause/resume UI controls and status display ([506b7cf](https://github.com/rknightion/paperless-ngx-dedupe/commit/506b7cf82efb9c5d16952fcd604dfd6c6ee5919b))
* **web:** add protected tags settings UI ([75fe680](https://github.com/rknightion/paperless-ngx-dedupe/commit/75fe68085dc729b9a9df1456924d7fcd78a19a7d))
* **web:** add show deleted checkbox and update UI for archived groups ([bfadcb5](https://github.com/rknightion/paperless-ngx-dedupe/commit/bfadcb59e5a654519687f23ff3b3b47f8288eafb))
* **web:** add tag alias mapping UI to settings page ([b8283ca](https://github.com/rknightion/paperless-ngx-dedupe/commit/b8283caf20ed5ce859637c198da99a80ea78efbe))
* **web:** enhance dashboard with jobs section link ([ca3de5c](https://github.com/rknightion/paperless-ngx-dedupe/commit/ca3de5c0069318f402f35b9781e9a3825a4b83b3))
* **web:** enhance JobStatusCard with detailed result formatting ([5b33578](https://github.com/rknightion/paperless-ngx-dedupe/commit/5b335786f059a37553e1630e50295f876d2a85d8))
* **web:** enhance queue UI for different failure types ([d0b81f7](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0b81f76a0337afdc18bdbfe1724ee917de27f47))
* **web:** update group detail page for archived groups ([317acbd](https://github.com/rknightion/paperless-ngx-dedupe/commit/317acbd8baad382e1681f096d0a9bbe986e40ede))
* **web:** update SSE interface and status tracking for paused jobs ([dc14b69](https://github.com/rknightion/paperless-ngx-dedupe/commit/dc14b69b93721e8029648a281ca8d8dcb87ae508))
* **web:** use cross-group cleanup in duplicate management UI ([98c09e8](https://github.com/rknightion/paperless-ngx-dedupe/commit/98c09e80b66774833c8c53cfcc4aeae85d2221da))


### Bug Fixes

* address code review findings for tag alias mapping ([1e0d3c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/1e0d3c0ab075a897a894f32bc8e842a8729c5010))
* **ai:** exclude no_suggestions failures from retry scope ([ad158a0](https://github.com/rknightion/paperless-ngx-dedupe/commit/ad158a0fbe0f47c38b121112ac8e2eb1bc6f2578))
* **ai:** improve error handling in AI apply worker and API ([59ad011](https://github.com/rknightion/paperless-ngx-dedupe/commit/59ad011061751d9112e5feee339363866d57e388))
* **ai:** improve model pricing lookup with fallback matching strategies ([6e595b5](https://github.com/rknightion/paperless-ngx-dedupe/commit/6e595b561d325d1a93304e53623d106b5a3746cd))
* **ai:** mark results as failed with no_suggestions type when no metadata found ([b776bf4](https://github.com/rknightion/paperless-ngx-dedupe/commit/b776bf40261142b43a92d8656c2f1ffb4e93a79f))
* **api:** restrict paperless delete proxy to duplicate members ([547142d](https://github.com/rknightion/paperless-ngx-dedupe/commit/547142d6de041291e4d6cf532ba108d4e3f910ae))
* **api:** restrict paperless delete proxy to duplicate members ([a8ccdb3](https://github.com/rknightion/paperless-ngx-dedupe/commit/a8ccdb35f2c3568107d44a010645fa8b170566b1))
* bump Playwright to 1.61.1 to fix Node 24 extract-zip install hang ([f1d5a1c](https://github.com/rknightion/paperless-ngx-dedupe/commit/f1d5a1c9bd3c7ab160ed2d95dfdebc6386037c91))
* **ci:** correct coverage-summary artifact path after sdk removal ([e05acc0](https://github.com/rknightion/paperless-ngx-dedupe/commit/e05acc0fb11ff5f8d916008bef45e56447bbba83))
* **ci:** exclude .github from prettier so workflow YAML stops failing format ([8f9a7bf](https://github.com/rknightion/paperless-ngx-dedupe/commit/8f9a7bf4b8df3dfdc7bee499799f86fccf68617f))
* **ci:** install deps in setup-node-pnpm instead of restoring a stale cache ([4f7e7e0](https://github.com/rknightion/paperless-ngx-dedupe/commit/4f7e7e09dc3e0b21147dcddfee464acdfe853d0b))
* **db:** add discriminative_score column to duplicate_group table ([d9ba8ff](https://github.com/rknightion/paperless-ngx-dedupe/commit/d9ba8fff8edb5c45c7b822f5ade2dbbaef9bc436))
* **db:** enable incremental database migrations with stored snapshots ([bace0c8](https://github.com/rknightion/paperless-ngx-dedupe/commit/bace0c85cec70bdd31ec96f96dcbe2a13745b4b8))
* **dedup:** improve money pattern matching and update UI for discriminative scoring ([f9c23e7](https://github.com/rknightion/paperless-ngx-dedupe/commit/f9c23e718af1e5c12885dc6250a3770dfa1d660e))
* **deps:** update dependency @ai-sdk/openai to v4 ([#370](https://github.com/rknightion/paperless-ngx-dedupe/issues/370)) ([2dec656](https://github.com/rknightion/paperless-ngx-dedupe/commit/2dec656e54701e355114a99cadd2564da3bcd777))
* **deps:** update dependency @anthropic-ai/sdk to v0.81.0 ([#279](https://github.com/rknightion/paperless-ngx-dedupe/issues/279)) ([620657e](https://github.com/rknightion/paperless-ngx-dedupe/commit/620657e88ccc3cb3436e610fc46e69be6e0a3807))
* **deps:** update dependency @anthropic-ai/sdk to v0.82.0 ([#283](https://github.com/rknightion/paperless-ngx-dedupe/issues/283)) ([434c7df](https://github.com/rknightion/paperless-ngx-dedupe/commit/434c7df0c513a6454c6ca7146f959f9b3f5dff4f))
* **deps:** update dependency @pyroscope/nodejs to ^0.5.0 ([#413](https://github.com/rknightion/paperless-ngx-dedupe/issues/413)) ([a618424](https://github.com/rknightion/paperless-ngx-dedupe/commit/a618424b402833e320f8298ba780279c9387c01c))
* **deps:** update dependency @pyroscope/nodejs to ^0.6.0 ([#430](https://github.com/rknightion/paperless-ngx-dedupe/issues/430)) ([0dcbcb8](https://github.com/rknightion/paperless-ngx-dedupe/commit/0dcbcb8996bd011226171887244fba19eacb1b63))
* **deps:** update dependency ai to v7 ([#376](https://github.com/rknightion/paperless-ngx-dedupe/issues/376)) ([69ed6c4](https://github.com/rknightion/paperless-ngx-dedupe/commit/69ed6c472e36361bec320b7a115a93a443e22ebe))
* **deps:** update dependency nanoid to v6 ([#436](https://github.com/rknightion/paperless-ngx-dedupe/issues/436)) ([3151159](https://github.com/rknightion/paperless-ngx-dedupe/commit/31511591f55cefd33b008bfdb1daf07e879b4861))
* **deps:** update opentelemetry-js monorepo ([#255](https://github.com/rknightion/paperless-ngx-dedupe/issues/255)) ([df507bd](https://github.com/rknightion/paperless-ngx-dedupe/commit/df507bdb43446124e8870e9fa7b2e0e12cd65c4d))
* **deps:** update opentelemetry-js monorepo ([#335](https://github.com/rknightion/paperless-ngx-dedupe/issues/335)) ([0550650](https://github.com/rknightion/paperless-ngx-dedupe/commit/0550650443b1ea90d5930497ae10377e0d9a9425))
* **deps:** update opentelemetry-js monorepo ([#401](https://github.com/rknightion/paperless-ngx-dedupe/issues/401)) ([d974f3a](https://github.com/rknightion/paperless-ngx-dedupe/commit/d974f3accc62ef400472d4f78be680e6e80dadc4))
* **deps:** update opentelemetry-js monorepo ([#464](https://github.com/rknightion/paperless-ngx-dedupe/issues/464)) ([6823f8d](https://github.com/rknightion/paperless-ngx-dedupe/commit/6823f8dd8d59956a8d59394fa935e980b8be6e9d))
* **deps:** update opentelemetry-js-contrib monorepo ([#257](https://github.com/rknightion/paperless-ngx-dedupe/issues/257)) ([693192f](https://github.com/rknightion/paperless-ngx-dedupe/commit/693192fea9c91ead22462fa2cc4c59541efd91d3))
* **deps:** update opentelemetry-js-contrib monorepo ([#336](https://github.com/rknightion/paperless-ngx-dedupe/issues/336)) ([51275eb](https://github.com/rknightion/paperless-ngx-dedupe/commit/51275eb0ddb9aa95d79009d2036745f0680d37fb))
* **deps:** update opentelemetry-js-contrib monorepo ([#402](https://github.com/rknightion/paperless-ngx-dedupe/issues/402)) ([e1084b0](https://github.com/rknightion/paperless-ngx-dedupe/commit/e1084b08e70a929e9582ed977fb46c3d7ebc1468))
* **docs:** remove glightbox slide_effect option (rejected by zensical 0.0.44) ([7bb5995](https://github.com/rknightion/paperless-ngx-dedupe/commit/7bb5995ec9592befb3ec79cf26c9711db53e7048))
* **duplicates:** add real-time progress tracking for bulk delete operations ([b740de7](https://github.com/rknightion/paperless-ngx-dedupe/commit/b740de7240826b1334d7bb3d57a36099f303c192))
* **export:** add backward compatibility for 3-weight dedup config imports ([dc5e96e](https://github.com/rknightion/paperless-ngx-dedupe/commit/dc5e96e352b2f08dca1925ea4023d5a021c69b77))
* keep connection secrets server-side ([420ec6e](https://github.com/rknightion/paperless-ngx-dedupe/commit/420ec6e1561c6cb12276f2da75c7084b54198606))
* **paperless:** disable automatic matching for created entities ([630448b](https://github.com/rknightion/paperless-ngx-dedupe/commit/630448bc27b35371ef1f7b65a57f07cd43ad8cf8))
* **paperless:** remove API version specification from Accept header ([47f6a90](https://github.com/rknightion/paperless-ngx-dedupe/commit/47f6a90cbb5fd50b5ac4875921617e872e2b58ad)), closes [#269](https://github.com/rknightion/paperless-ngx-dedupe/issues/269)
* remove redundant Revert to Default button shown when prompt is already default ([bffbe01](https://github.com/rknightion/paperless-ngx-dedupe/commit/bffbe0122730461e64fb978fe8f5a05349d10a31))
* satisfy scheduler lint gates ([7c6824f](https://github.com/rknightion/paperless-ngx-dedupe/commit/7c6824fca3543ddc4c604dccd9fec6759a0d8ed8))
* **security:** block SSRF in test-connection and fix RAG cancellation ([1b93f2b](https://github.com/rknightion/paperless-ngx-dedupe/commit/1b93f2b4e4012c0ff9f5eda789d402366a210ddb))
* **security:** gate bulk ai apply/reject-all endpoints ([bad76b7](https://github.com/rknightion/paperless-ngx-dedupe/commit/bad76b7644ffc04bd013175c068cd165bfef30a9))
* **security:** gate bulk AI apply/reject-all endpoints behind explicit config flag ([6b77dd9](https://github.com/rknightion/paperless-ngx-dedupe/commit/6b77dd91cac91a7cfe25bc34ce3cc1817c4235f9))
* share Paperless statistics across metric collectors ([d451fe0](https://github.com/rknightion/paperless-ngx-dedupe/commit/d451fe012803cd036201cf78daffe4d91dd1c14e))
* **telemetry:** add @opentelemetry/api-logs to web package dependencies ([278e0d3](https://github.com/rknightion/paperless-ngx-dedupe/commit/278e0d3b3afcbc2e8786be7960c88c37d94cd6e0))
* **ui:** replace div with button element for drawer overlay ([f51860b](https://github.com/rknightion/paperless-ngx-dedupe/commit/f51860bae05415ec6fc3f09dfe57d3537ac2f131))
* use direct yaml import in settings page instead of core barrel export ([7da6966](https://github.com/rknightion/paperless-ngx-dedupe/commit/7da69669ee1710455a88121eb90c3f14cbfe8def))
* use reactive activity collections ([ec979f5](https://github.com/rknightion/paperless-ngx-dedupe/commit/ec979f5c47e7335d755ba39512e17f1b37fc798b))


### Miscellaneous

* add Paperless correspondent management script ([9af2805](https://github.com/rknightion/paperless-ngx-dedupe/commit/9af280592e922a96527996fc4b7207f9fc51dfe6))
* add yaml dependency to core package ([112c007](https://github.com/rknightion/paperless-ngx-dedupe/commit/112c0070ee99b06c74aa2c31b646788aa2568350))
* automerge Renovate vulnerability-fix PRs ([c499dee](https://github.com/rknightion/paperless-ngx-dedupe/commit/c499deea545a62a80513b19424528db2852d77c3))
* **codacy:** tune local config and document standard changes ([1cc4d29](https://github.com/rknightion/paperless-ngx-dedupe/commit/1cc4d296f3da415595a0bbbd11d3acb0ab04d96e))
* **deps:** lock file maintenance ([#272](https://github.com/rknightion/paperless-ngx-dedupe/issues/272)) ([94f6768](https://github.com/rknightion/paperless-ngx-dedupe/commit/94f6768f8e92b801eae733958f4d47612403e938))
* **deps:** lock file maintenance ([#273](https://github.com/rknightion/paperless-ngx-dedupe/issues/273)) ([9486815](https://github.com/rknightion/paperless-ngx-dedupe/commit/9486815960f752e8fd2d8a39c8d07a76dcac8673))
* **deps:** lock file maintenance ([#299](https://github.com/rknightion/paperless-ngx-dedupe/issues/299)) ([a423ac8](https://github.com/rknightion/paperless-ngx-dedupe/commit/a423ac8bb977f04202fb9d863eac15d4ba24e312))
* **deps:** lock file maintenance ([#329](https://github.com/rknightion/paperless-ngx-dedupe/issues/329)) ([c69c165](https://github.com/rknightion/paperless-ngx-dedupe/commit/c69c1654e92fa705d999124fc622cf6096aed89b))
* **deps:** lock file maintenance ([#378](https://github.com/rknightion/paperless-ngx-dedupe/issues/378)) ([7118842](https://github.com/rknightion/paperless-ngx-dedupe/commit/7118842089b3832a1f1fab74ebc585d7014214d3))
* **deps:** lock file maintenance ([#405](https://github.com/rknightion/paperless-ngx-dedupe/issues/405)) ([2ae9cfb](https://github.com/rknightion/paperless-ngx-dedupe/commit/2ae9cfb5965cecafa1d0f28df2d8a7ce7c85aaac))
* **deps:** lock file maintenance ([#435](https://github.com/rknightion/paperless-ngx-dedupe/issues/435)) ([aedbf73](https://github.com/rknightion/paperless-ngx-dedupe/commit/aedbf737d9da63cb0701787de6ee2fe63de6cd2f))
* **deps:** lock file maintenance ([#437](https://github.com/rknightion/paperless-ngx-dedupe/issues/437)) ([40bcc9a](https://github.com/rknightion/paperless-ngx-dedupe/commit/40bcc9a9470b9f3fc99ab7f5aa9bb82982278b46))
* **deps:** lock file maintenance ([#452](https://github.com/rknightion/paperless-ngx-dedupe/issues/452)) ([da96ee7](https://github.com/rknightion/paperless-ngx-dedupe/commit/da96ee7fe5ba7468754931a829ac7fbef7a310c9))
* **deps:** unblock native and package-manager updates ([e291324](https://github.com/rknightion/paperless-ngx-dedupe/commit/e291324b549d6115aa11ef2bf18ec647443a9aa4)), closes [#468](https://github.com/rknightion/paperless-ngx-dedupe/issues/468)
* **deps:** update actions/checkout action to v7.0.1 ([#454](https://github.com/rknightion/paperless-ngx-dedupe/issues/454)) ([d62c6e3](https://github.com/rknightion/paperless-ngx-dedupe/commit/d62c6e3968b4ad6d9392b7da2a37388d4decef6d))
* **deps:** update actions/setup-node action to v6.5.0 ([#445](https://github.com/rknightion/paperless-ngx-dedupe/issues/445)) ([3ee98e0](https://github.com/rknightion/paperless-ngx-dedupe/commit/3ee98e0234500578e2f0e7ed1d617d33e1e2a836))
* **deps:** update actions/setup-node action to v7 ([#446](https://github.com/rknightion/paperless-ngx-dedupe/issues/446)) ([43ee141](https://github.com/rknightion/paperless-ngx-dedupe/commit/43ee14188fc2b9a0b40a3fd8c2aae963fe71c4fc))
* **deps:** update codacy/codacy-analysis-cli-action digest to d433603 ([#253](https://github.com/rknightion/paperless-ngx-dedupe/issues/253)) ([d4d208e](https://github.com/rknightion/paperless-ngx-dedupe/commit/d4d208efba2fa9dbed470c051b8536f1458bb277))
* **deps:** update davelosert/vitest-coverage-report-action action to v2.12.2 ([#447](https://github.com/rknightion/paperless-ngx-dedupe/issues/447)) ([254f513](https://github.com/rknightion/paperless-ngx-dedupe/commit/254f5137920bdb7390481ba67eecccf950ac819e))
* **deps:** update davelosert/vitest-coverage-report-action digest to bd52af5 ([#274](https://github.com/rknightion/paperless-ngx-dedupe/issues/274)) ([d3857cd](https://github.com/rknightion/paperless-ngx-dedupe/commit/d3857cd6bbfe030532c114adbf23b0a792e42efb))
* **deps:** update davelosert/vitest-coverage-report-action digest to c0c9b09 ([#277](https://github.com/rknightion/paperless-ngx-dedupe/issues/277)) ([05360eb](https://github.com/rknightion/paperless-ngx-dedupe/commit/05360ebea4c5a6cda4f32afdb8eb65d9018b1c1f))
* **deps:** update davelosert/vitest-coverage-report-action digest to d63aa97 ([#285](https://github.com/rknightion/paperless-ngx-dedupe/issues/285)) ([87783f1](https://github.com/rknightion/paperless-ngx-dedupe/commit/87783f1352778ef03c0820e939bc27c6ca63f8ac))
* **deps:** update dependency @ai-sdk/anthropic to v3.0.65 ([#286](https://github.com/rknightion/paperless-ngx-dedupe/issues/286)) ([3970a86](https://github.com/rknightion/paperless-ngx-dedupe/commit/3970a868bafc0c567b31b75d9a387296d2beae80))
* **deps:** update dependency @ai-sdk/anthropic to v3.0.66 ([#288](https://github.com/rknightion/paperless-ngx-dedupe/issues/288)) ([6beea4d](https://github.com/rknightion/paperless-ngx-dedupe/commit/6beea4d1567883cbb6955d4c8c773616c858a2ed))
* **deps:** update dependency @ai-sdk/openai to v3.0.49 ([#276](https://github.com/rknightion/paperless-ngx-dedupe/issues/276)) ([03724df](https://github.com/rknightion/paperless-ngx-dedupe/commit/03724dfcd78539af34866883686ccadf208bcb6f))
* **deps:** update dependency @ai-sdk/openai to v3.0.50 ([#290](https://github.com/rknightion/paperless-ngx-dedupe/issues/290)) ([541cc2f](https://github.com/rknightion/paperless-ngx-dedupe/commit/541cc2fefe220f651ad7cdda715e7e637b6aa9be))
* **deps:** update dependency @ai-sdk/openai to v3.0.51 ([#302](https://github.com/rknightion/paperless-ngx-dedupe/issues/302)) ([6505b0e](https://github.com/rknightion/paperless-ngx-dedupe/commit/6505b0e75a440ae632aeb619214fadb9473dc88c))
* **deps:** update dependency @ai-sdk/openai to v3.0.52 ([#308](https://github.com/rknightion/paperless-ngx-dedupe/issues/308)) ([43a23e0](https://github.com/rknightion/paperless-ngx-dedupe/commit/43a23e05572bce1b387c4acea8c9fcbe7a829a38))
* **deps:** update dependency @ai-sdk/openai to v3.0.75 ([#333](https://github.com/rknightion/paperless-ngx-dedupe/issues/333)) ([c2c00fd](https://github.com/rknightion/paperless-ngx-dedupe/commit/c2c00fdbb7e8cf88e3bf77aa487a3da46b4d92b4))
* **deps:** update dependency @ai-sdk/openai to v3.0.76 ([#372](https://github.com/rknightion/paperless-ngx-dedupe/issues/372)) ([d3fde78](https://github.com/rknightion/paperless-ngx-dedupe/commit/d3fde78554d1685fc9489ac639689e41bfbd6d14))
* **deps:** update dependency @ai-sdk/openai to v4.0.10 ([#426](https://github.com/rknightion/paperless-ngx-dedupe/issues/426)) ([07457c8](https://github.com/rknightion/paperless-ngx-dedupe/commit/07457c83b701af0973e1e91672571a315eedbadd))
* **deps:** update dependency @ai-sdk/openai to v4.0.11 ([#428](https://github.com/rknightion/paperless-ngx-dedupe/issues/428)) ([89bb85c](https://github.com/rknightion/paperless-ngx-dedupe/commit/89bb85cd1bc99686b5c5bd6f6a7438b3d8dd9a46))
* **deps:** update dependency @ai-sdk/openai to v4.0.13 ([#442](https://github.com/rknightion/paperless-ngx-dedupe/issues/442)) ([5a96c20](https://github.com/rknightion/paperless-ngx-dedupe/commit/5a96c20f9eaa9d60fdf205bf64c34b41b72041ec))
* **deps:** update dependency @ai-sdk/openai to v4.0.14 ([#449](https://github.com/rknightion/paperless-ngx-dedupe/issues/449)) ([da73643](https://github.com/rknightion/paperless-ngx-dedupe/commit/da73643d48ba18e7dbc18dc82c021679550b3848))
* **deps:** update dependency @ai-sdk/openai to v4.0.17 ([#460](https://github.com/rknightion/paperless-ngx-dedupe/issues/460)) ([de686f8](https://github.com/rknightion/paperless-ngx-dedupe/commit/de686f8e848c4ca7d6281b2539088523abd461bd))
* **deps:** update dependency @ai-sdk/openai to v4.0.18 ([#466](https://github.com/rknightion/paperless-ngx-dedupe/issues/466)) ([f5b2c9a](https://github.com/rknightion/paperless-ngx-dedupe/commit/f5b2c9a433cc7696fe15d052dc85ef22a3bcf971))
* **deps:** update dependency @ai-sdk/openai to v4.0.4 ([#387](https://github.com/rknightion/paperless-ngx-dedupe/issues/387)) ([8da3146](https://github.com/rknightion/paperless-ngx-dedupe/commit/8da31460bf8397fca6e6476221afc3232dbeae6e))
* **deps:** update dependency @ai-sdk/openai to v4.0.7 ([#392](https://github.com/rknightion/paperless-ngx-dedupe/issues/392)) ([3915029](https://github.com/rknightion/paperless-ngx-dedupe/commit/3915029b828fcb5996effb18ac9b92bb8f3a7b41))
* **deps:** update dependency @ai-sdk/openai to v4.0.9 ([#419](https://github.com/rknightion/paperless-ngx-dedupe/issues/419)) ([afdab11](https://github.com/rknightion/paperless-ngx-dedupe/commit/afdab11dd370c20f06f7cbd4297f05e06be61dee))
* **deps:** update dependency @grafana/faro-rollup-plugin to ^0.10.0 ([#317](https://github.com/rknightion/paperless-ngx-dedupe/issues/317)) ([5dd2c01](https://github.com/rknightion/paperless-ngx-dedupe/commit/5dd2c012baefc1495c555e275d34a56f8f9e8a35))
* **deps:** update dependency @grafana/faro-rollup-plugin to ^0.11.0 ([#366](https://github.com/rknightion/paperless-ngx-dedupe/issues/366)) ([1140e6c](https://github.com/rknightion/paperless-ngx-dedupe/commit/1140e6c12bfba8daf85866dc23161df4839e79d9))
* **deps:** update dependency @grafana/faro-rollup-plugin to v0.9.1 ([#314](https://github.com/rknightion/paperless-ngx-dedupe/issues/314)) ([8182713](https://github.com/rknightion/paperless-ngx-dedupe/commit/81827130e28ceb55509ecb3136d4a7c69ea05ec1))
* **deps:** update dependency @opentelemetry/semantic-conventions to v1.42.0 ([#410](https://github.com/rknightion/paperless-ngx-dedupe/issues/410)) ([732543f](https://github.com/rknightion/paperless-ngx-dedupe/commit/732543f82db3441ba61d5358802ec6ac18fa32f1))
* **deps:** update dependency @opentelemetry/semantic-conventions to v1.43.0 ([#427](https://github.com/rknightion/paperless-ngx-dedupe/issues/427)) ([fe3caff](https://github.com/rknightion/paperless-ngx-dedupe/commit/fe3caff27860a7e612e54bcf2c0240290720c7be))
* **deps:** update dependency @playwright/test to v1.59.0 ([#278](https://github.com/rknightion/paperless-ngx-dedupe/issues/278)) ([8cdafea](https://github.com/rknightion/paperless-ngx-dedupe/commit/8cdafeaf5214b509fdb801bf69b7cd988e88c9a3))
* **deps:** update dependency @playwright/test to v1.59.1 ([#281](https://github.com/rknightion/paperless-ngx-dedupe/issues/281)) ([0a21589](https://github.com/rknightion/paperless-ngx-dedupe/commit/0a21589e2295f037db7ef38f7b4f832533a965e9))
* **deps:** update dependency @pyroscope/nodejs to v0.4.13 ([#363](https://github.com/rknightion/paperless-ngx-dedupe/issues/363)) ([7089c82](https://github.com/rknightion/paperless-ngx-dedupe/commit/7089c821f7865dfdd1355a7e285aa5a98cb10f0b))
* **deps:** update dependency @pyroscope/nodejs to v0.6.1 ([#438](https://github.com/rknightion/paperless-ngx-dedupe/issues/438)) ([477f9dd](https://github.com/rknightion/paperless-ngx-dedupe/commit/477f9dd157b9322b02619ac799eed9078af462ff))
* **deps:** update dependency @sveltejs/adapter-node to v5.5.7 ([#364](https://github.com/rknightion/paperless-ngx-dedupe/issues/364)) ([899732a](https://github.com/rknightion/paperless-ngx-dedupe/commit/899732a84cf04b9648d21a84992d43d6a8dd3e88))
* **deps:** update dependency @sveltejs/kit to v2.56.0 ([#293](https://github.com/rknightion/paperless-ngx-dedupe/issues/293)) ([f801351](https://github.com/rknightion/paperless-ngx-dedupe/commit/f801351c233bd3b564888b277450de8d03ac513f))
* **deps:** update dependency @sveltejs/kit to v2.56.1 ([#295](https://github.com/rknightion/paperless-ngx-dedupe/issues/295)) ([887db2e](https://github.com/rknightion/paperless-ngx-dedupe/commit/887db2ee443eb2c6befa50946621d52f3d80d1d7))
* **deps:** update dependency @sveltejs/kit to v2.57.0 ([#309](https://github.com/rknightion/paperless-ngx-dedupe/issues/309)) ([745c8dc](https://github.com/rknightion/paperless-ngx-dedupe/commit/745c8dc0828976d2cb5e1aa1db9e9f014fd15ba4))
* **deps:** update dependency @sveltejs/kit to v2.57.1 ([#320](https://github.com/rknightion/paperless-ngx-dedupe/issues/320)) ([abdfecf](https://github.com/rknightion/paperless-ngx-dedupe/commit/abdfecf6f3de46fb9cde5ce63c4bb53ac82c1b6f))
* **deps:** update dependency @sveltejs/kit to v2.68.0 ([#347](https://github.com/rknightion/paperless-ngx-dedupe/issues/347)) ([8740fd5](https://github.com/rknightion/paperless-ngx-dedupe/commit/8740fd55550ecc9bdbe5bae8252831e02152a970))
* **deps:** update dependency @sveltejs/kit to v2.69.1 ([#398](https://github.com/rknightion/paperless-ngx-dedupe/issues/398)) ([c0d04ee](https://github.com/rknightion/paperless-ngx-dedupe/commit/c0d04ee84af0d8ad53adf0656615de2cd77286d0))
* **deps:** update dependency @sveltejs/kit to v2.69.2 ([#416](https://github.com/rknightion/paperless-ngx-dedupe/issues/416)) ([b31eca4](https://github.com/rknightion/paperless-ngx-dedupe/commit/b31eca403bd8ddbce8742abb48a24c3b6503582a))
* **deps:** update dependency @sveltejs/kit to v2.69.3 ([#441](https://github.com/rknightion/paperless-ngx-dedupe/issues/441)) ([964cafe](https://github.com/rknightion/paperless-ngx-dedupe/commit/964cafe0ec8e40559822e91a68183970170940f9))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v7.1.2 ([#357](https://github.com/rknightion/paperless-ngx-dedupe/issues/357)) ([a3e39a7](https://github.com/rknightion/paperless-ngx-dedupe/commit/a3e39a718faad303dc018b5c416d11bab7f73fe2))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v7.1.3 ([#408](https://github.com/rknightion/paperless-ngx-dedupe/issues/408)) ([79b37fe](https://github.com/rknightion/paperless-ngx-dedupe/commit/79b37fea5088c02d5d8e43c7cc939a8b284daa24))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v7.1.4 ([#411](https://github.com/rknightion/paperless-ngx-dedupe/issues/411)) ([d0e0595](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0e0595f96eec649b218c50b498c812ec71ec249))
* **deps:** update dependency @sveltejs/vite-plugin-svelte to v7.2.0 ([#414](https://github.com/rknightion/paperless-ngx-dedupe/issues/414)) ([5590cd2](https://github.com/rknightion/paperless-ngx-dedupe/commit/5590cd223b9f71af527af8cec891ade2d9cfda7a))
* **deps:** update dependency @types/node to v25.5.1 ([#291](https://github.com/rknightion/paperless-ngx-dedupe/issues/291)) ([d6fe84b](https://github.com/rknightion/paperless-ngx-dedupe/commit/d6fe84bbae69662220cb88ca99b819f7f263df3e))
* **deps:** update dependency @types/node to v25.5.2 ([#292](https://github.com/rknightion/paperless-ngx-dedupe/issues/292)) ([d9357d6](https://github.com/rknightion/paperless-ngx-dedupe/commit/d9357d63b7fa1bc102d66655a822e5fe53c585b1))
* **deps:** update dependency @types/node to v25.6.0 ([#322](https://github.com/rknightion/paperless-ngx-dedupe/issues/322)) ([1808e8e](https://github.com/rknightion/paperless-ngx-dedupe/commit/1808e8eacc368d719ab5c4695d39473927f7920c))
* **deps:** update dependency @types/node to v25.9.4 ([#359](https://github.com/rknightion/paperless-ngx-dedupe/issues/359)) ([b724f58](https://github.com/rknightion/paperless-ngx-dedupe/commit/b724f58c03083877824cc1c30ad3a63960debf53))
* **deps:** update dependency @types/node to v25.9.5 ([#417](https://github.com/rknightion/paperless-ngx-dedupe/issues/417)) ([e25b312](https://github.com/rknightion/paperless-ngx-dedupe/commit/e25b3121d8b4a50786e3b83c66c4c1e16fa920c8))
* **deps:** update dependency ai to v6.0.140 ([#260](https://github.com/rknightion/paperless-ngx-dedupe/issues/260)) ([e991d69](https://github.com/rknightion/paperless-ngx-dedupe/commit/e991d69cf66b48fe39f8d6fe697185988f295d8a))
* **deps:** update dependency ai to v6.0.141 ([#265](https://github.com/rknightion/paperless-ngx-dedupe/issues/265)) ([66ec136](https://github.com/rknightion/paperless-ngx-dedupe/commit/66ec136c788bec80691b8ee48aaf3b4a961ca4ad))
* **deps:** update dependency ai to v6.0.142 ([#280](https://github.com/rknightion/paperless-ngx-dedupe/issues/280)) ([b5285dd](https://github.com/rknightion/paperless-ngx-dedupe/commit/b5285dd27bb012be779a4b43dac36e0145c0e09f))
* **deps:** update dependency ai to v6.0.143 ([#284](https://github.com/rknightion/paperless-ngx-dedupe/issues/284)) ([86e092f](https://github.com/rknightion/paperless-ngx-dedupe/commit/86e092fd5f4b661a4f8281aadf905c5bd47a0f26))
* **deps:** update dependency ai to v6.0.145 ([#289](https://github.com/rknightion/paperless-ngx-dedupe/issues/289)) ([14fd773](https://github.com/rknightion/paperless-ngx-dedupe/commit/14fd773fba697db73aad780b018f3e695d959248))
* **deps:** update dependency ai to v6.0.146 ([#296](https://github.com/rknightion/paperless-ngx-dedupe/issues/296)) ([988c4b4](https://github.com/rknightion/paperless-ngx-dedupe/commit/988c4b4c3ee60e1a3f78d7c94b2dc06453b2a9f4))
* **deps:** update dependency ai to v6.0.149 ([#303](https://github.com/rknightion/paperless-ngx-dedupe/issues/303)) ([5973f91](https://github.com/rknightion/paperless-ngx-dedupe/commit/5973f914ef8bdc77c2747d92c7e17be1ade2a0f8))
* **deps:** update dependency ai to v6.0.151 ([#307](https://github.com/rknightion/paperless-ngx-dedupe/issues/307)) ([36fa3a9](https://github.com/rknightion/paperless-ngx-dedupe/commit/36fa3a92f14278c7f51f754f3c4c682cd975297e))
* **deps:** update dependency ai to v6.0.153 ([#312](https://github.com/rknightion/paperless-ngx-dedupe/issues/312)) ([88e0314](https://github.com/rknightion/paperless-ngx-dedupe/commit/88e0314cbcb932b8c568e52479f79b00eabe996b))
* **deps:** update dependency ai to v6.0.154 ([#313](https://github.com/rknightion/paperless-ngx-dedupe/issues/313)) ([6cd6864](https://github.com/rknightion/paperless-ngx-dedupe/commit/6cd68640c2cdf699730590c6fa660c13b1f323c4))
* **deps:** update dependency ai to v6.0.156 ([#319](https://github.com/rknightion/paperless-ngx-dedupe/issues/319)) ([5f95234](https://github.com/rknightion/paperless-ngx-dedupe/commit/5f952343b88fe2e64a08c9c261eec70a323caf59))
* **deps:** update dependency ai to v6.0.157 ([#324](https://github.com/rknightion/paperless-ngx-dedupe/issues/324)) ([18e1d17](https://github.com/rknightion/paperless-ngx-dedupe/commit/18e1d1713b1b76ec4266cd675a9f03522488b569))
* **deps:** update dependency ai to v6.0.158 ([#325](https://github.com/rknightion/paperless-ngx-dedupe/issues/325)) ([d0fad88](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0fad881b14b1fe2e039fde343a94df8f883562b))
* **deps:** update dependency ai to v6.0.212 ([#331](https://github.com/rknightion/paperless-ngx-dedupe/issues/331)) ([ca2293a](https://github.com/rknightion/paperless-ngx-dedupe/commit/ca2293a6fcb6d51026d05de59f9699ea4598841d))
* **deps:** update dependency ai to v6.0.213 ([#373](https://github.com/rknightion/paperless-ngx-dedupe/issues/373)) ([0c26d8c](https://github.com/rknightion/paperless-ngx-dedupe/commit/0c26d8c7a38f7337899a105b886bbbe31d237600))
* **deps:** update dependency ai to v7.0.14 ([#393](https://github.com/rknightion/paperless-ngx-dedupe/issues/393)) ([074f1ff](https://github.com/rknightion/paperless-ngx-dedupe/commit/074f1ff01e51b16157558f625edbba1642dd7066))
* **deps:** update dependency ai to v7.0.15 ([#404](https://github.com/rknightion/paperless-ngx-dedupe/issues/404)) ([d8f8895](https://github.com/rknightion/paperless-ngx-dedupe/commit/d8f8895ad21dc04d4c2648cf5bf5a451d232caac))
* **deps:** update dependency ai to v7.0.16 ([#407](https://github.com/rknightion/paperless-ngx-dedupe/issues/407)) ([c9aaddb](https://github.com/rknightion/paperless-ngx-dedupe/commit/c9aaddb0cf6d23254f62a0df62e9d46a664dcf29))
* **deps:** update dependency ai to v7.0.17 ([#415](https://github.com/rknightion/paperless-ngx-dedupe/issues/415)) ([d0866dd](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0866dd78a58808d6d49703b8a3a86463aeddb82))
* **deps:** update dependency ai to v7.0.18 ([#420](https://github.com/rknightion/paperless-ngx-dedupe/issues/420)) ([8a7adcc](https://github.com/rknightion/paperless-ngx-dedupe/commit/8a7adccbca506e91e6d0ae7146c46ecc1ca3c8a3))
* **deps:** update dependency ai to v7.0.19 ([#424](https://github.com/rknightion/paperless-ngx-dedupe/issues/424)) ([d64780a](https://github.com/rknightion/paperless-ngx-dedupe/commit/d64780a2d9302e8d0acce0f3ac80b9935eb22480))
* **deps:** update dependency ai to v7.0.20 ([#431](https://github.com/rknightion/paperless-ngx-dedupe/issues/431)) ([b6a1b1c](https://github.com/rknightion/paperless-ngx-dedupe/commit/b6a1b1c679d09a8680e5137d64e4b0c2d5c0c3bf))
* **deps:** update dependency ai to v7.0.21 ([#432](https://github.com/rknightion/paperless-ngx-dedupe/issues/432)) ([34b63cd](https://github.com/rknightion/paperless-ngx-dedupe/commit/34b63cdb62fc08b94cb2d4c6ed50d1e6bb45c54b))
* **deps:** update dependency ai to v7.0.22 ([#434](https://github.com/rknightion/paperless-ngx-dedupe/issues/434)) ([6db9b24](https://github.com/rknightion/paperless-ngx-dedupe/commit/6db9b24883be4906cb547a06a1ee4350178c55d7))
* **deps:** update dependency ai to v7.0.23 ([#440](https://github.com/rknightion/paperless-ngx-dedupe/issues/440)) ([3134eaa](https://github.com/rknightion/paperless-ngx-dedupe/commit/3134eaa2187dcbcf140cfcc2b923edf11f102280))
* **deps:** update dependency ai to v7.0.25 ([#443](https://github.com/rknightion/paperless-ngx-dedupe/issues/443)) ([7c3aa82](https://github.com/rknightion/paperless-ngx-dedupe/commit/7c3aa82e7ea9126389c3bab1007f08f429256473))
* **deps:** update dependency ai to v7.0.26 ([#444](https://github.com/rknightion/paperless-ngx-dedupe/issues/444)) ([6ee2fe2](https://github.com/rknightion/paperless-ngx-dedupe/commit/6ee2fe2c491dc6dd60bcbf2eda54db40db4ed3fb))
* **deps:** update dependency ai to v7.0.27 ([#450](https://github.com/rknightion/paperless-ngx-dedupe/issues/450)) ([0c0424e](https://github.com/rknightion/paperless-ngx-dedupe/commit/0c0424e6fb386bc75683eac76f93aed7e686034a))
* **deps:** update dependency ai to v7.0.32 ([#457](https://github.com/rknightion/paperless-ngx-dedupe/issues/457)) ([d27e824](https://github.com/rknightion/paperless-ngx-dedupe/commit/d27e824ebf12c02cd22d943b6a99a197c97710a5))
* **deps:** update dependency ai to v7.0.33 ([#461](https://github.com/rknightion/paperless-ngx-dedupe/issues/461)) ([736119d](https://github.com/rknightion/paperless-ngx-dedupe/commit/736119df786047b9584c59c06ad89fb1c5fe9812))
* **deps:** update dependency ai to v7.0.34 ([#463](https://github.com/rknightion/paperless-ngx-dedupe/issues/463)) ([fef07f4](https://github.com/rknightion/paperless-ngx-dedupe/commit/fef07f4b2527856a762d080a31e519ac2b16ebb8))
* **deps:** update dependency ai to v7.0.35 ([#467](https://github.com/rknightion/paperless-ngx-dedupe/issues/467)) ([6a56141](https://github.com/rknightion/paperless-ngx-dedupe/commit/6a56141f0b22d12b95e1ad5e3c2b3591a7ed25ff))
* **deps:** update dependency ai to v7.0.7 ([#384](https://github.com/rknightion/paperless-ngx-dedupe/issues/384)) ([a6e8d9f](https://github.com/rknightion/paperless-ngx-dedupe/commit/a6e8d9fb2b052c4bf7f4fb7381554ec6bd137636))
* **deps:** update dependency ai to v7.0.8 ([#386](https://github.com/rknightion/paperless-ngx-dedupe/issues/386)) ([10f44cb](https://github.com/rknightion/paperless-ngx-dedupe/commit/10f44cb5dcec09453daee98fc3375652b28c9d3e))
* **deps:** update dependency ai to v7.0.9 ([#390](https://github.com/rknightion/paperless-ngx-dedupe/issues/390)) ([3bd5259](https://github.com/rknightion/paperless-ngx-dedupe/commit/3bd5259be462a3af86f816a3652799213f828dfc))
* **deps:** update dependency better-sqlite3 to v12.11.1 ([#328](https://github.com/rknightion/paperless-ngx-dedupe/issues/328)) ([1de6062](https://github.com/rknightion/paperless-ngx-dedupe/commit/1de6062e3e176663a33299e756b094b8ce7ce409))
* **deps:** update dependency drizzle-orm to v0.45.2 ([#266](https://github.com/rknightion/paperless-ngx-dedupe/issues/266)) ([c0fc9f6](https://github.com/rknightion/paperless-ngx-dedupe/commit/c0fc9f66cddf391208b41e1e8cf27d990b4f4733))
* **deps:** update dependency echarts to v6.1.0 ([#367](https://github.com/rknightion/paperless-ngx-dedupe/issues/367)) ([2dea064](https://github.com/rknightion/paperless-ngx-dedupe/commit/2dea0642bcae21432745538d48e42c9900d8fc8c))
* **deps:** update dependency eslint to v10.2.0 ([#294](https://github.com/rknightion/paperless-ngx-dedupe/issues/294)) ([4acaf45](https://github.com/rknightion/paperless-ngx-dedupe/commit/4acaf45661d7a7fd48d6b50e685c9edc114f8208))
* **deps:** update dependency eslint to v10.6.0 ([#337](https://github.com/rknightion/paperless-ngx-dedupe/issues/337)) ([79f38e2](https://github.com/rknightion/paperless-ngx-dedupe/commit/79f38e26be66b1f63a0581b2c0bc05e32b051b58))
* **deps:** update dependency eslint to v10.7.0 ([#433](https://github.com/rknightion/paperless-ngx-dedupe/issues/433)) ([fc6f1bb](https://github.com/rknightion/paperless-ngx-dedupe/commit/fc6f1bbc3bd634229dc7a7016fbddbd17b129951))
* **deps:** update dependency eslint-plugin-svelte to v3.17.0 ([#287](https://github.com/rknightion/paperless-ngx-dedupe/issues/287)) ([bdbd3ec](https://github.com/rknightion/paperless-ngx-dedupe/commit/bdbd3ec998f6204ab99a31814d193f5e341a97c3))
* **deps:** update dependency eslint-plugin-svelte to v3.20.0 ([#343](https://github.com/rknightion/paperless-ngx-dedupe/issues/343)) ([171b6d1](https://github.com/rknightion/paperless-ngx-dedupe/commit/171b6d1f54e69f995aa8cb16b9a1780654d6b727))
* **deps:** update dependency eslint-plugin-svelte to v3.22.0 ([#453](https://github.com/rknightion/paperless-ngx-dedupe/issues/453)) ([122182e](https://github.com/rknightion/paperless-ngx-dedupe/commit/122182edd5ef6dfe65be7020be1c51d2e7cac020))
* **deps:** update dependency globals to v17.7.0 ([#327](https://github.com/rknightion/paperless-ngx-dedupe/issues/327)) ([5a8bd6d](https://github.com/rknightion/paperless-ngx-dedupe/commit/5a8bd6d1c382d669bbbeeb16a1a9e622d02b2094))
* **deps:** update dependency nanoid to v5.1.16 ([#365](https://github.com/rknightion/paperless-ngx-dedupe/issues/365)) ([745b086](https://github.com/rknightion/paperless-ngx-dedupe/commit/745b086734999b1db8b89b487988466f116fe270))
* **deps:** update dependency openai to v6.33.0 ([#256](https://github.com/rknightion/paperless-ngx-dedupe/issues/256)) ([920968e](https://github.com/rknightion/paperless-ngx-dedupe/commit/920968e152da0fa5a0c78e9f99a57639ce53655c))
* **deps:** update dependency openai to v6.34.0 ([#315](https://github.com/rknightion/paperless-ngx-dedupe/issues/315)) ([5fde424](https://github.com/rknightion/paperless-ngx-dedupe/commit/5fde4240203cde4e13f7024a1628d1c7b85ea55c))
* **deps:** update dependency openai to v6.45.0 ([#353](https://github.com/rknightion/paperless-ngx-dedupe/issues/353)) ([b429979](https://github.com/rknightion/paperless-ngx-dedupe/commit/b4299794cf4861f650401c9d039dc12fae85bbee))
* **deps:** update dependency openai to v6.46.0 ([#425](https://github.com/rknightion/paperless-ngx-dedupe/issues/425)) ([19f7a03](https://github.com/rknightion/paperless-ngx-dedupe/commit/19f7a03c76b3e3fc9f6f934a2e782b809d64278b))
* **deps:** update dependency prettier to ~3.9.0 ([#374](https://github.com/rknightion/paperless-ngx-dedupe/issues/374)) ([0bdbbb8](https://github.com/rknightion/paperless-ngx-dedupe/commit/0bdbbb8f00d6f2a753e4ecc78be18a525582c9bf))
* **deps:** update dependency prettier to v3.8.2 ([#321](https://github.com/rknightion/paperless-ngx-dedupe/issues/321)) ([25c5854](https://github.com/rknightion/paperless-ngx-dedupe/commit/25c5854c4c26743ceb011cee700de0c192089fda))
* **deps:** update dependency prettier to v3.8.5 ([#334](https://github.com/rknightion/paperless-ngx-dedupe/issues/334)) ([1d9b0fe](https://github.com/rknightion/paperless-ngx-dedupe/commit/1d9b0fe4dc95f4d6957e06a84873af5cd88f2345))
* **deps:** update dependency prettier to v3.9.2 ([#380](https://github.com/rknightion/paperless-ngx-dedupe/issues/380)) ([9d57baf](https://github.com/rknightion/paperless-ngx-dedupe/commit/9d57bafd5dec881b42ae0d2a3880c25dd58e6aea))
* **deps:** update dependency prettier to v3.9.3 ([#381](https://github.com/rknightion/paperless-ngx-dedupe/issues/381)) ([21b0b34](https://github.com/rknightion/paperless-ngx-dedupe/commit/21b0b34fb36ef15c95cf75c8f65fc0ca8682c763))
* **deps:** update dependency prettier to v3.9.4 ([#385](https://github.com/rknightion/paperless-ngx-dedupe/issues/385)) ([77c881b](https://github.com/rknightion/paperless-ngx-dedupe/commit/77c881be1c79eed586b927db5ab3a64adfc9e77e))
* **deps:** update dependency prettier to v3.9.5 ([#423](https://github.com/rknightion/paperless-ngx-dedupe/issues/423)) ([d0361e1](https://github.com/rknightion/paperless-ngx-dedupe/commit/d0361e131945c348ee1d642e806bd1d461e9b908))
* **deps:** update dependency prettier to v3.9.6 ([#458](https://github.com/rknightion/paperless-ngx-dedupe/issues/458)) ([2880bce](https://github.com/rknightion/paperless-ngx-dedupe/commit/2880bcefd7a24260cdd2fc1747f331e50c50faf7))
* **deps:** update dependency prettier-plugin-svelte to v3.5.2 ([#361](https://github.com/rknightion/paperless-ngx-dedupe/issues/361)) ([2949f90](https://github.com/rknightion/paperless-ngx-dedupe/commit/2949f903afdf7d92ef0d75f0166c76c78ef1ebfa))
* **deps:** update dependency prettier-plugin-svelte to v4 ([a88ca4b](https://github.com/rknightion/paperless-ngx-dedupe/commit/a88ca4b9b28ab7fe39d633a3b86901ce96debd0b))
* **deps:** update dependency prettier-plugin-svelte to v4 ([3154bed](https://github.com/rknightion/paperless-ngx-dedupe/commit/3154bed27ccc3c32b5d878ad9690849a21ab7fd4))
* **deps:** update dependency prettier-plugin-tailwindcss to ^0.8.0 ([#352](https://github.com/rknightion/paperless-ngx-dedupe/issues/352)) ([a0b1145](https://github.com/rknightion/paperless-ngx-dedupe/commit/a0b1145194ff8182818291a66e4d5fcc3765cf48))
* **deps:** update dependency sqlite-vec to v0.1.9 ([#282](https://github.com/rknightion/paperless-ngx-dedupe/issues/282)) ([eb7f1d5](https://github.com/rknightion/paperless-ngx-dedupe/commit/eb7f1d5ad465dda06fcbe41415fb8a71581f17af))
* **deps:** update dependency svelte to v5.55.1 ([#271](https://github.com/rknightion/paperless-ngx-dedupe/issues/271)) ([05d9332](https://github.com/rknightion/paperless-ngx-dedupe/commit/05d9332c9a9cf25ceefaf07245ff131ae0343856))
* **deps:** update dependency svelte to v5.55.2 ([#310](https://github.com/rknightion/paperless-ngx-dedupe/issues/310)) ([4efedc2](https://github.com/rknightion/paperless-ngx-dedupe/commit/4efedc2f2b4d267ae37b3161ab9c6e7f0f0d4ea4))
* **deps:** update dependency svelte to v5.55.3 ([#323](https://github.com/rknightion/paperless-ngx-dedupe/issues/323)) ([2c368b7](https://github.com/rknightion/paperless-ngx-dedupe/commit/2c368b7b57ec9456fe6ada770952249fc8aa3d1c))
* **deps:** update dependency svelte to v5.56.5 ([#448](https://github.com/rknightion/paperless-ngx-dedupe/issues/448)) ([a1dd7af](https://github.com/rknightion/paperless-ngx-dedupe/commit/a1dd7afd6edc0fcd588578c09629ad60b1f390df))
* **deps:** update dependency svelte to v5.56.7 ([#456](https://github.com/rknightion/paperless-ngx-dedupe/issues/456)) ([3d2cace](https://github.com/rknightion/paperless-ngx-dedupe/commit/3d2cace37710b1cda23c76d93dc3f2e65608f6a9))
* **deps:** update dependency svelte-check to v4.7.1 ([#355](https://github.com/rknightion/paperless-ngx-dedupe/issues/355)) ([ccad3ba](https://github.com/rknightion/paperless-ngx-dedupe/commit/ccad3bafdef486f6f77e16d6f8ca2efa8e5ce7fc))
* **deps:** update dependency svelte-check to v4.7.2 ([#412](https://github.com/rknightion/paperless-ngx-dedupe/issues/412)) ([14cfdfa](https://github.com/rknightion/paperless-ngx-dedupe/commit/14cfdfafb52714991d15e86903dad9957abe8da1))
* **deps:** update dependency tsx to v4.22.4 ([#368](https://github.com/rknightion/paperless-ngx-dedupe/issues/368)) ([964ccf5](https://github.com/rknightion/paperless-ngx-dedupe/commit/964ccf505bd6d03ce84a475fac0e3ea0d951ed94))
* **deps:** update dependency tsx to v4.22.5 ([#394](https://github.com/rknightion/paperless-ngx-dedupe/issues/394)) ([0727f72](https://github.com/rknightion/paperless-ngx-dedupe/commit/0727f7236e9159a659e50ddf9b13bbe02fc45dab))
* **deps:** update dependency tsx to v4.23.0 ([#403](https://github.com/rknightion/paperless-ngx-dedupe/issues/403)) ([2181c92](https://github.com/rknightion/paperless-ngx-dedupe/commit/2181c9268213cfb45802e0a99bb8bd5384fea44d))
* **deps:** update dependency typescript to v6.0.3 ([#338](https://github.com/rknightion/paperless-ngx-dedupe/issues/338)) ([8ec9ee1](https://github.com/rknightion/paperless-ngx-dedupe/commit/8ec9ee15ec37161d7d83022dfb699087b551cef8))
* **deps:** update dependency vite to v8.0.3 ([#258](https://github.com/rknightion/paperless-ngx-dedupe/issues/258)) ([0112d70](https://github.com/rknightion/paperless-ngx-dedupe/commit/0112d709c876a52f07c25af3fec153e8b181684b))
* **deps:** update dependency vite to v8.0.4 ([#300](https://github.com/rknightion/paperless-ngx-dedupe/issues/300)) ([c354388](https://github.com/rknightion/paperless-ngx-dedupe/commit/c354388356a9968d1bf665b73b951853bc346bbb))
* **deps:** update dependency vite to v8.0.5 ([#301](https://github.com/rknightion/paperless-ngx-dedupe/issues/301)) ([935c11c](https://github.com/rknightion/paperless-ngx-dedupe/commit/935c11c729055492eef0c30139bfd4b85a756b25))
* **deps:** update dependency vite to v8.0.6 ([#305](https://github.com/rknightion/paperless-ngx-dedupe/issues/305)) ([669adf7](https://github.com/rknightion/paperless-ngx-dedupe/commit/669adf76d2bbffe15e7655d15cb6f87c2f9503a4))
* **deps:** update dependency vite to v8.0.7 ([#306](https://github.com/rknightion/paperless-ngx-dedupe/issues/306)) ([f72db45](https://github.com/rknightion/paperless-ngx-dedupe/commit/f72db459c76ccd0cf8f2c5855f161e652bdfc6cf))
* **deps:** update dependency vite to v8.0.8 ([#316](https://github.com/rknightion/paperless-ngx-dedupe/issues/316)) ([d2452e4](https://github.com/rknightion/paperless-ngx-dedupe/commit/d2452e43d75f24af7fe135bceee1515c434e5864))
* **deps:** update dependency vite to v8.1.0 ([#339](https://github.com/rknightion/paperless-ngx-dedupe/issues/339)) ([086b9b0](https://github.com/rknightion/paperless-ngx-dedupe/commit/086b9b04398dffca26c945bbd7916e1a29329511))
* **deps:** update dependency vite to v8.1.1 ([#388](https://github.com/rknightion/paperless-ngx-dedupe/issues/388)) ([b17bc2d](https://github.com/rknightion/paperless-ngx-dedupe/commit/b17bc2d6ecd526ca1182288060bc33fad6d05924))
* **deps:** update dependency vite to v8.1.2 ([#389](https://github.com/rknightion/paperless-ngx-dedupe/issues/389)) ([ae7d50d](https://github.com/rknightion/paperless-ngx-dedupe/commit/ae7d50d65ab681c25caa6a290bcb42f0fd22ba8b))
* **deps:** update dependency vite to v8.1.3 ([#395](https://github.com/rknightion/paperless-ngx-dedupe/issues/395)) ([a906b71](https://github.com/rknightion/paperless-ngx-dedupe/commit/a906b71c22d8f0e74c9d9bd11cce0f536ba7f098))
* **deps:** update dependency vite to v8.1.4 ([#422](https://github.com/rknightion/paperless-ngx-dedupe/issues/422)) ([32738b2](https://github.com/rknightion/paperless-ngx-dedupe/commit/32738b20068989a581b94e54c74aa69aa66ee31c))
* **deps:** update dependency yaml to v2.9.0 ([#356](https://github.com/rknightion/paperless-ngx-dedupe/issues/356)) ([3d7b2b5](https://github.com/rknightion/paperless-ngx-dedupe/commit/3d7b2b55dc2b70511fd2a8c9992e20f1238d6e97))
* **deps:** update docker/build-push-action action to v7.3.0 ([#399](https://github.com/rknightion/paperless-ngx-dedupe/issues/399)) ([92f4bdb](https://github.com/rknightion/paperless-ngx-dedupe/commit/92f4bdbabe49602409253c4f15365eb62c352632))
* **deps:** update docker/setup-buildx-action action to v4.2.0 ([#400](https://github.com/rknightion/paperless-ngx-dedupe/issues/400)) ([b147014](https://github.com/rknightion/paperless-ngx-dedupe/commit/b1470143e7563de6b6e91fd184f7e1cceddf500a))
* **deps:** update faro-web-sdk monorepo to v2.8.0 ([#342](https://github.com/rknightion/paperless-ngx-dedupe/issues/342)) ([c6ad1ac](https://github.com/rknightion/paperless-ngx-dedupe/commit/c6ad1ac771bd781bbb288b63e5096a7682f9a122))
* **deps:** update faro-web-sdk monorepo to v2.8.1 ([#379](https://github.com/rknightion/paperless-ngx-dedupe/issues/379)) ([8563c9f](https://github.com/rknightion/paperless-ngx-dedupe/commit/8563c9fe6700677ead36ff10dde91ecc26da3aa6))
* **deps:** update faro-web-sdk monorepo to v2.8.2 ([#391](https://github.com/rknightion/paperless-ngx-dedupe/issues/391)) ([99e1218](https://github.com/rknightion/paperless-ngx-dedupe/commit/99e12182e6d697b3e6221c7084fc29c155dde087))
* **deps:** update github actions ([#345](https://github.com/rknightion/paperless-ngx-dedupe/issues/345)) ([a83bf20](https://github.com/rknightion/paperless-ngx-dedupe/commit/a83bf20eac75f0c4eb620faa46d3db09a26710e3))
* **deps:** update github actions ([#369](https://github.com/rknightion/paperless-ngx-dedupe/issues/369)) ([9893614](https://github.com/rknightion/paperless-ngx-dedupe/commit/98936143259c0885e5a94b2df1e45de0b13fe211))
* **deps:** update github/codeql-action action to v4.36.3 ([#396](https://github.com/rknightion/paperless-ngx-dedupe/issues/396)) ([58cdef8](https://github.com/rknightion/paperless-ngx-dedupe/commit/58cdef8fde655a83e79020dadd49f2c8b93b220b))
* **deps:** update github/codeql-action action to v4.37.0 ([#418](https://github.com/rknightion/paperless-ngx-dedupe/issues/418)) ([396be24](https://github.com/rknightion/paperless-ngx-dedupe/commit/396be24a4d105c455acec662103bab9ad13e99c7))
* **deps:** update github/codeql-action action to v4.37.1 ([#451](https://github.com/rknightion/paperless-ngx-dedupe/issues/451)) ([b8ed2e2](https://github.com/rknightion/paperless-ngx-dedupe/commit/b8ed2e2a2f9790f3caca24468eb9cd021d1839a0))
* **deps:** update github/codeql-action action to v4.37.2 ([#462](https://github.com/rknightion/paperless-ngx-dedupe/issues/462)) ([5d7968a](https://github.com/rknightion/paperless-ngx-dedupe/commit/5d7968ad7b5f7cf7983cc7d3d90eebb9eed77a0a))
* **deps:** update github/codeql-action action to v4.37.3 ([#465](https://github.com/rknightion/paperless-ngx-dedupe/issues/465)) ([8beea75](https://github.com/rknightion/paperless-ngx-dedupe/commit/8beea75118dd5ad854872238ec11b9146a219061))
* **deps:** update github/codeql-action digest to b8bb9f2 ([#262](https://github.com/rknightion/paperless-ngx-dedupe/issues/262)) ([4bb1fd0](https://github.com/rknightion/paperless-ngx-dedupe/commit/4bb1fd084b8de622ffbcabfcf27fa5bd3bf6c8c8))
* **deps:** update github/codeql-action digest to c10b806 ([#263](https://github.com/rknightion/paperless-ngx-dedupe/issues/263)) ([8eda0df](https://github.com/rknightion/paperless-ngx-dedupe/commit/8eda0dfc0f8e0699262a0db188f13d3c99b5bd0a))
* **deps:** update linters & formatters to v8.62.1 ([#383](https://github.com/rknightion/paperless-ngx-dedupe/issues/383)) ([7a455c1](https://github.com/rknightion/paperless-ngx-dedupe/commit/7a455c1bf351dd553b71ac642cdcfb82b5bde20b))
* **deps:** update linters & formatters to v8.63.0 ([#409](https://github.com/rknightion/paperless-ngx-dedupe/issues/409)) ([d98276b](https://github.com/rknightion/paperless-ngx-dedupe/commit/d98276b3f7d1dc69e6cf8f23e9d9a0adca98b672))
* **deps:** update linters & formatters to v8.64.0 ([#439](https://github.com/rknightion/paperless-ngx-dedupe/issues/439)) ([6b00503](https://github.com/rknightion/paperless-ngx-dedupe/commit/6b005038ebb0b065806a4c563694046a21e4f4de))
* **deps:** update linters & formatters to v8.65.0 ([#455](https://github.com/rknightion/paperless-ngx-dedupe/issues/455)) ([9a9e261](https://github.com/rknightion/paperless-ngx-dedupe/commit/9a9e2612d9dfea317a51cf451d2f51ab57bb9bd1))
* **deps:** update pnpm to v10.34.4 ([#344](https://github.com/rknightion/paperless-ngx-dedupe/issues/344)) ([a1fc59b](https://github.com/rknightion/paperless-ngx-dedupe/commit/a1fc59b7d72ba26f5506f8f57b12559d5dbe2134))
* **deps:** update pnpm to v10.34.5 ([#429](https://github.com/rknightion/paperless-ngx-dedupe/issues/429)) ([9f92505](https://github.com/rknightion/paperless-ngx-dedupe/commit/9f92505d7876b23581e98b506a4d6c85fbc9e643))
* **deps:** update pnpm to v11.17.0 ([#470](https://github.com/rknightion/paperless-ngx-dedupe/issues/470)) ([6ccd2b9](https://github.com/rknightion/paperless-ngx-dedupe/commit/6ccd2b99970108c66e8508818271fda37eddd034))
* **deps:** update pnpm/action-setup action to v6 ([#326](https://github.com/rknightion/paperless-ngx-dedupe/issues/326)) ([88ea483](https://github.com/rknightion/paperless-ngx-dedupe/commit/88ea483b918d0b16fa5030a03adf8c4911aba774))
* **deps:** update tailwindcss monorepo to v4.3.1 ([#340](https://github.com/rknightion/paperless-ngx-dedupe/issues/340)) ([4b616c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/4b616c06cefe440780d22d29b0dff0ab9a93d9ff))
* **deps:** update tailwindcss monorepo to v4.3.2 ([#382](https://github.com/rknightion/paperless-ngx-dedupe/issues/382)) ([5dcb2bd](https://github.com/rknightion/paperless-ngx-dedupe/commit/5dcb2bd5facb3a235e82b20eb763ea639488c1cf))
* **deps:** update typescript-eslint monorepo to v8.58.0 ([#275](https://github.com/rknightion/paperless-ngx-dedupe/issues/275)) ([a95032d](https://github.com/rknightion/paperless-ngx-dedupe/commit/a95032db60c4c93fb61213ad2c0874bcaa7d9493))
* **deps:** update typescript-eslint monorepo to v8.58.1 ([#311](https://github.com/rknightion/paperless-ngx-dedupe/issues/311)) ([22534c5](https://github.com/rknightion/paperless-ngx-dedupe/commit/22534c5b8d6ff6dc4fdc71a7a00a6d0c4fa6403a))
* **deps:** update typescript-eslint monorepo to v8.62.0 ([#330](https://github.com/rknightion/paperless-ngx-dedupe/issues/330)) ([d729b55](https://github.com/rknightion/paperless-ngx-dedupe/commit/d729b5576dbb1b2bf4ad37b0048805c86ce63ddc))
* **deps:** update vitest monorepo to v4.1.2 ([#259](https://github.com/rknightion/paperless-ngx-dedupe/issues/259)) ([8a44b8b](https://github.com/rknightion/paperless-ngx-dedupe/commit/8a44b8b3085f9bbb1d90d543cc027fdbc27deea4))
* **deps:** update vitest monorepo to v4.1.3 ([#304](https://github.com/rknightion/paperless-ngx-dedupe/issues/304)) ([5dfe340](https://github.com/rknightion/paperless-ngx-dedupe/commit/5dfe34042bed16a2f354378a45331c7b76dbfb02))
* **deps:** update vitest monorepo to v4.1.4 ([#318](https://github.com/rknightion/paperless-ngx-dedupe/issues/318)) ([cb1c054](https://github.com/rknightion/paperless-ngx-dedupe/commit/cb1c0543850f7063e2be805b116bdc90c125ac05))
* **deps:** update vitest monorepo to v4.1.9 ([#341](https://github.com/rknightion/paperless-ngx-dedupe/issues/341)) ([dde5899](https://github.com/rknightion/paperless-ngx-dedupe/commit/dde5899aba992e18e6c73539849d410de431ce7d))
* **deps:** update vitest to v4.1.10 ([#406](https://github.com/rknightion/paperless-ngx-dedupe/issues/406)) ([4d1fcbf](https://github.com/rknightion/paperless-ngx-dedupe/commit/4d1fcbf25f6d1e9a2b08aa2a5e64f38b6dd1001e))
* fix formatting in tag alias mapping files ([04cea2c](https://github.com/rknightion/paperless-ngx-dedupe/commit/04cea2c24d2c4309fef34165cfe7e4c83ed0b505))
* fix issue classifier ([076530a](https://github.com/rknightion/paperless-ngx-dedupe/commit/076530a1cec3b7e006af24c1c11bfc854f3d52c2))
* gitignore docs/superpowers scratch dir ([4145fca](https://github.com/rknightion/paperless-ngx-dedupe/commit/4145fca9200e2e1b6e9de2d9d52a839f71d7ac3f))
* lint ([5ef34dd](https://github.com/rknightion/paperless-ngx-dedupe/commit/5ef34ddbab9a7b9010da3555a1c1e414349d519a))
* **main:** release 0.10.0 ([278dc07](https://github.com/rknightion/paperless-ngx-dedupe/commit/278dc078febf15af4d65accb493626dd5a0f7146))
* **main:** release 0.11.0 ([69100ce](https://github.com/rknightion/paperless-ngx-dedupe/commit/69100ce5502dcd4bc57f287c70d42ec6ddec26c4))
* **main:** release 0.12.0 ([c5c43f4](https://github.com/rknightion/paperless-ngx-dedupe/commit/c5c43f4b332aa28cafed9f7bb3801b4a0d54633e))
* **main:** release 0.12.1 ([337e605](https://github.com/rknightion/paperless-ngx-dedupe/commit/337e605fcdf71e5215e250c71a3736ca53de43f7))
* **main:** release 0.13.0 ([1c86faf](https://github.com/rknightion/paperless-ngx-dedupe/commit/1c86fafb81434a120922f4a98cdf77ab94285004))
* **main:** release 0.14.0 ([4da46ae](https://github.com/rknightion/paperless-ngx-dedupe/commit/4da46aed495ed3fb0a1ac6eaff570b1b367449bc))
* **main:** release 0.15.0 ([ce28977](https://github.com/rknightion/paperless-ngx-dedupe/commit/ce289775125e2ab5e31fe245707d105036507c13))
* **main:** release 0.9.0 ([d05ef81](https://github.com/rknightion/paperless-ngx-dedupe/commit/d05ef81f979866097307563d771ad5285643d3ae))
* remove remaining Anthropic references from root package.json, e2e tests, and UI components ([bae046e](https://github.com/rknightion/paperless-ngx-dedupe/commit/bae046e738c3ab9f0753ec9644f4192e937bbcd0))
* remove Snyk from CI ([95d1bde](https://github.com/rknightion/paperless-ngx-dedupe/commit/95d1bdede528f40d35f1c8ba49f3a42b3e7f804d))
* remove triage ([2526f0d](https://github.com/rknightion/paperless-ngx-dedupe/commit/2526f0d37d745de41e0673a0c92b63546e55cb0c))
* **renovate:** group lockstep dependency families ([12db501](https://github.com/rknightion/paperless-ngx-dedupe/commit/12db501fbf49b2dbef83240256424e2b1e094048))
* **renovate:** slim to repo-specific overrides ([a94eab7](https://github.com/rknightion/paperless-ngx-dedupe/commit/a94eab758da7f740c46007db92e6492eb181e910))
* update dependencies to latest versions ([3c7b862](https://github.com/rknightion/paperless-ngx-dedupe/commit/3c7b86270b86f9ba17bde2f86b7e9e96f09290b8))


### Documentation

* add observability guide, Pyroscope setup, and updated env vars ([14537cc](https://github.com/rknightion/paperless-ngx-dedupe/commit/14537cc5278ffa195688da5ab222d046da3e67ba))
* **assets:** replace the social card with one for this project ([6ed192a](https://github.com/rknightion/paperless-ngx-dedupe/commit/6ed192a93577a46e80683a1f41cc9d2002528af2))
* expand project description to include AI features and RAG Q&A ([df550cf](https://github.com/rknightion/paperless-ngx-dedupe/commit/df550cfa959d0d9042f7631205cc0dcc925886db))
* expand project documentation with code style, Docker commands, and API conventions ([e6750e5](https://github.com/rknightion/paperless-ngx-dedupe/commit/e6750e58c19b26da4aa636e9b3760e4a5a64e084))
* **geo:** content-shape pass for LLM/search retrievability ([9abae64](https://github.com/rknightion/paperless-ngx-dedupe/commit/9abae649919443585b5734e7ecddbf78a6d9a197))
* remove Anthropic references and document flex processing ([ccfa1a8](https://github.com/rknightion/paperless-ngx-dedupe/commit/ccfa1a8c561da2cfe2b84b2fb0a565ce2462371b))
* remove CLI and SDK references from getting started guide ([b8461a4](https://github.com/rknightion/paperless-ngx-dedupe/commit/b8461a455785d7fd92fcb0bec11fe7ac17bfe337))
* remove CLI reference documentation ([1724645](https://github.com/rknightion/paperless-ngx-dedupe/commit/1724645a39e87f3027641875b687d70c8617ff1c))
* remove SDK reference documentation ([0b370a1](https://github.com/rknightion/paperless-ngx-dedupe/commit/0b370a1bc5ab48ad89584dc79af93e860155af35))
* update architecture documentation for two-package structure ([2fa3881](https://github.com/rknightion/paperless-ngx-dedupe/commit/2fa3881920133a8312a7b8eb93aa63d1c1f5de85))
* update CLAUDE.md documentation for simplified architecture ([6facb2f](https://github.com/rknightion/paperless-ngx-dedupe/commit/6facb2f40480040c2a65c4a0ed6f005acb2c72c0))
* update contributing guide for simplified package structure ([73d7060](https://github.com/rknightion/paperless-ngx-dedupe/commit/73d706098b30c2321896d9f8acf7edd7f2eb56b9))
* update development guide for two-package workflow ([12422b6](https://github.com/rknightion/paperless-ngx-dedupe/commit/12422b6d481cac017288c632b29a10b19db3afcb))
* update discriminative penalty documentation with detailed guidance ([e23d999](https://github.com/rknightion/paperless-ngx-dedupe/commit/e23d999740c9933670971ea9fee94aab58023934))
* update documentation for discriminative penalty scoring model ([53187c8](https://github.com/rknightion/paperless-ngx-dedupe/commit/53187c8ca8651be36cd6bda75023ffa841be3eb0))
* update documentation for package structure ([64068c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/64068c07e4f2afa950ea949ae093fad39de34342))
* update main documentation index and navigation ([aaa9e11](https://github.com/rknightion/paperless-ngx-dedupe/commit/aaa9e1186100d8b6c9711cc4c2d23c80cc408ca6))
* update task documentation to remove SDK references ([c07334d](https://github.com/rknightion/paperless-ngx-dedupe/commit/c07334dcdfa6321a572b5830c833a446bad289e1))


### Refactoring

* **ai:** convert cost estimation to async with lazy tiktoken loading ([c3f5ac1](https://github.com/rknightion/paperless-ngx-dedupe/commit/c3f5ac1ee40861c8aab8a93da0714b10e8c3d48d))
* **ai:** remove Anthropic provider and simplify factory to OpenAI-only ([182d97c](https://github.com/rknightion/paperless-ngx-dedupe/commit/182d97cc4d68bb6870aa89a6732e38fc9a3c221f))
* **ai:** remove Anthropic references from config, batch, prompt, costs, and tests ([6f39293](https://github.com/rknightion/paperless-ngx-dedupe/commit/6f39293ac6fcdeea3fbd47a89d6144fcb2caf123))
* **core:** fix indentation in batch processing and analysis modules ([df65811](https://github.com/rknightion/paperless-ngx-dedupe/commit/df658116a9e61e0a5ba32c8e60d25412e5e56b12))
* **dedup:** replace 3-weight system with 2-weight plus discriminative penalty ([c89c8f1](https://github.com/rknightion/paperless-ngx-dedupe/commit/c89c8f1799af1d0773868307873f1ea47da66a6b))
* **dedup:** update confidence score calculation for penalty model ([17e8ed5](https://github.com/rknightion/paperless-ngx-dedupe/commit/17e8ed56ab36c50bb5c0aad5c6ccd3e328d961f8))
* **dedup:** update scoring to use penalty-based discriminative model ([6bc9f05](https://github.com/rknightion/paperless-ngx-dedupe/commit/6bc9f05a8415222a36b92bd0fc9e4b951858dee0))
* format multi-line destructuring and function calls for consistency ([1affa5d](https://github.com/rknightion/paperless-ngx-dedupe/commit/1affa5d5f2813f3cdbfcb80fadc222db87baea09))
* **rag:** remove Anthropic provider support, always use OpenAI ([e8e5af2](https://github.com/rknightion/paperless-ngx-dedupe/commit/e8e5af2743653847bbc80bf0594dd4824163099e))
* remove document Q&A and RAG ([18e09ff](https://github.com/rknightion/paperless-ngx-dedupe/commit/18e09ff2517b551ddd22b4c859bcdf722d247039))
* remove SDK and CLI packages from monorepo ([2177239](https://github.com/rknightion/paperless-ngx-dedupe/commit/2177239a1dfafa342a6875195c5232843df679e6))
* require review for all AI suggestions ([3493920](https://github.com/rknightion/paperless-ngx-dedupe/commit/3493920589b83bda8be4191bf4ff28f419456b48))
* **telemetry:** add unit annotations to all metric instruments ([53b8050](https://github.com/rknightion/paperless-ngx-dedupe/commit/53b8050c0e59488195c406c2d4c977091f242c52))
* **telemetry:** migrate AI batch to GenAI semantic conventions ([9e9add7](https://github.com/rknightion/paperless-ngx-dedupe/commit/9e9add76dcd6c9dff2194a2bfcc7ca49f74bffe3))
* **telemetry:** migrate drizzle logger to log-based events and stable DB semconv ([ed28124](https://github.com/rknightion/paperless-ngx-dedupe/commit/ed28124a095468c8887ad2c21b33f630ad718bde))
* **telemetry:** replace span.recordException with log-based exception events ([0dd961d](https://github.com/rknightion/paperless-ngx-dedupe/commit/0dd961df89f36fa3ee142959ecc72ad2b135a6f1))
* **ui:** remove provider filter dropdown — only OpenAI is supported ([98b7435](https://github.com/rknightion/paperless-ngx-dedupe/commit/98b74356bdc4f2f02c340dac3502567cb3ba26a1))
* **web:** remove Anthropic from UI, endpoints, and dependencies ([07552c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/07552c04fe4f1cd8e2126f8dd635b97f806ccb66))


### Performance

* **ai:** optimize batch apply with reference data caching and bulk operations ([4e39c92](https://github.com/rknightion/paperless-ngx-dedupe/commit/4e39c9262865821e942f328405636871d88a985e))


### Tests

* add comprehensive tests for group archiving functionality ([768c628](https://github.com/rknightion/paperless-ngx-dedupe/commit/768c628fbb1044d80fb90fa9606a3f2a8ab66a2d))
* **ai:** add comprehensive protected tags test suite ([3cd6fd6](https://github.com/rknightion/paperless-ngx-dedupe/commit/3cd6fd6c90b4df79e9077145b11bdc9dd59336c7))
* **ai:** add comprehensive tests for failure handling ([f947530](https://github.com/rknightion/paperless-ngx-dedupe/commit/f947530e22cc93a4c1fe9d7786a97f115ca22f3c))
* **ai:** add protected tags configuration tests ([1c80e7b](https://github.com/rknightion/paperless-ngx-dedupe/commit/1c80e7b01ebb8a884fe54316303d8ddc226021bd))
* **dedup:** add comprehensive tests for discriminative scoring integration ([1cde165](https://github.com/rknightion/paperless-ngx-dedupe/commit/1cde1656b08d2e88ce4ac6de6d8c2cf33110fa17))
* **dedup:** add comprehensive tests for enhanced discriminative patterns ([d073050](https://github.com/rknightion/paperless-ngx-dedupe/commit/d073050aad51b1a569a534206452d33b7ac7202b))
* **e2e:** assert config API redacts apiToken instead of returning it ([40ec9c1](https://github.com/rknightion/paperless-ngx-dedupe/commit/40ec9c10a71b56bcd9876b9b5caa85efb3cb0e3b))
* expand discriminative token extraction test coverage ([48fbdda](https://github.com/rknightion/paperless-ngx-dedupe/commit/48fbdda2ef1357f92b10affe14a3f0620daf7aa7))
* **security:** remediate Snyk hardcoded-secret findings in RAG tests ([5b09fc6](https://github.com/rknightion/paperless-ngx-dedupe/commit/5b09fc60d228e6805ff90a23cf2cd3ee55fab063))
* update dedup config tests for penalty model migration ([0404842](https://github.com/rknightion/paperless-ngx-dedupe/commit/040484258aed56ff07bd85d36ff72d23beb0c7e3))
* update e2e test for duplicates dropdown changes ([48b3420](https://github.com/rknightion/paperless-ngx-dedupe/commit/48b34202f4704d161d34bd982407c55aeb9711d2))
* update scoring tests for penalty-based discriminative model ([4bf2cb8](https://github.com/rknightion/paperless-ngx-dedupe/commit/4bf2cb897cba360d78b7515a104a0be386eb6214))

## [0.15.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.14.0...v0.15.0) (2026-04-04)


### Features

* **ai-processing:** make stats cards clickable with navigation links ([fd52af7](https://github.com/rknightion/paperless-ngx-dedupe/commit/fd52af770693d233df5dc80f859a39bb078ca257))
* **ai-processing:** preserve limit query parameter when navigating between tabs ([ebead51](https://github.com/rknightion/paperless-ngx-dedupe/commit/ebead51539145ee205789f6206e92820b0a12d47))
* **ai:** adaptive TPM throttle for batch processing ([68b43d2](https://github.com/rknightion/paperless-ngx-dedupe/commit/68b43d212399a5c829a1684edea193fa23d1f7c6))
* **ai:** add flex processing support — ~50% cost reduction for background extraction ([54cc852](https://github.com/rknightion/paperless-ngx-dedupe/commit/54cc852a59363acb229ccd7247b7cf25b946d3c0))
* **ai:** apply ~50% flex processing discount to cost estimates ([8eeff19](https://github.com/rknightion/paperless-ngx-dedupe/commit/8eeff1964af2db6cbdcecb6aeeb2090466289fb1))
* remove Anthropic API support, add OpenAI flex processing ([912e185](https://github.com/rknightion/paperless-ngx-dedupe/commit/912e185d833e5e0037b5765f1a0bacfd9fd62445))
* **ui:** add flex processing toggle with tooltip to AI settings ([ffddc25](https://github.com/rknightion/paperless-ngx-dedupe/commit/ffddc255c1bb36ac961f8f943c2986f4c12074ca))


### Miscellaneous

* remove remaining Anthropic references from root package.json, e2e tests, and UI components ([8a25e12](https://github.com/rknightion/paperless-ngx-dedupe/commit/8a25e12e8ba1425dba2c104f6138596664236759))


### Documentation

* add design spec for removing Anthropic and adding flex processing ([1d0e30b](https://github.com/rknightion/paperless-ngx-dedupe/commit/1d0e30bbc4c3b5e29a4cd8dcd3bb7f519e4304ee))
* add implementation plan for removing Anthropic and adding flex processing ([6d0d766](https://github.com/rknightion/paperless-ngx-dedupe/commit/6d0d76622fe7f71d969b55fd5e19f84fc08078e4))
* remove Anthropic references and document flex processing ([3dba4a0](https://github.com/rknightion/paperless-ngx-dedupe/commit/3dba4a008976de7152d444758afd7cfdbb86bfae))


### Refactoring

* **ai:** remove Anthropic provider and simplify factory to OpenAI-only ([a2a22df](https://github.com/rknightion/paperless-ngx-dedupe/commit/a2a22dfd71afac055a358fc219a8798832f832a5))
* **ai:** remove Anthropic references from config, batch, prompt, costs, and tests ([0567fed](https://github.com/rknightion/paperless-ngx-dedupe/commit/0567fedbf4e0a6a64a01fd111e9225f2244c1091))
* format multi-line destructuring and function calls for consistency ([8602238](https://github.com/rknightion/paperless-ngx-dedupe/commit/8602238a88f1dfdc8d4c781e0d27835804bf1208))
* **rag:** remove Anthropic provider support, always use OpenAI ([88533ef](https://github.com/rknightion/paperless-ngx-dedupe/commit/88533eff3ff8fe0d1274d82c49148a0157e6e137))
* **ui:** remove provider filter dropdown — only OpenAI is supported ([4b0acc2](https://github.com/rknightion/paperless-ngx-dedupe/commit/4b0acc26bd7550e6bfdb4037e1034dc0f4424f8e))
* **web:** remove Anthropic from UI, endpoints, and dependencies ([06752b6](https://github.com/rknightion/paperless-ngx-dedupe/commit/06752b68452cd5bd48332c5ab3163d9fe8143979))

## [0.14.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.13.0...v0.14.0) (2026-04-04)


### Features

* add clearAllAiResults function to delete all AI processing results ([36b6ff6](https://github.com/rknightion/paperless-ngx-dedupe/commit/36b6ff69ff38fb5cc4504fc0a06ed9b483c8b5b5))
* add contextual reset prompt after prompt revert ([ec740b8](https://github.com/rknightion/paperless-ngx-dedupe/commit/ec740b874ea62ea125911ca8c4a85ab1dda95024))
* add document cleanup and 404 error handling for orphaned records ([aefd5c1](https://github.com/rknightion/paperless-ngx-dedupe/commit/aefd5c1ed8c26c4d05d57b28d97672f9a8fb000f))
* add POST /api/v1/ai/results/clear endpoint ([dcc0abb](https://github.com/rknightion/paperless-ngx-dedupe/commit/dcc0abbcc5dd3218c8fd911dba9a6ee16f3154f7))
* add standalone Reset Processing History button with confirmation ([6ad4e23](https://github.com/rknightion/paperless-ngx-dedupe/commit/6ad4e233db3ba818e169640bb3096c79de2b5998))
* **ai:** add title extraction and management to AI processing ([0c6c771](https://github.com/rknightion/paperless-ngx-dedupe/commit/0c6c77184c3e51381d4a90311c4c0313cdff8c4a))
* **ai:** add title suggestions to AI result displays ([de790cb](https://github.com/rknightion/paperless-ngx-dedupe/commit/de790cb5cde38495a8de30a39bdc28f20211c4c6))
* **ai:** add visual indicator for custom prompt templates ([62385e2](https://github.com/rknightion/paperless-ngx-dedupe/commit/62385e29f1555c3eb9f9e5ffdd6979ae5cb84081))
* sync applied AI results to local document table and improve UI navigation ([e153f3e](https://github.com/rknightion/paperless-ngx-dedupe/commit/e153f3e287d55967fa5383bd0050ca773e207ec2))
* **telemetry:** add Faro User Actions to multi-step interactions ([6d001f5](https://github.com/rknightion/paperless-ngx-dedupe/commit/6d001f52aa56b7f44aa23222dc36dbd5c16377b3))
* **telemetry:** add Pyroscope continuous profiling support ([f18ebc6](https://github.com/rknightion/paperless-ngx-dedupe/commit/f18ebc6bd076d24d91138344fcff6f74f78ccef8))
* **telemetry:** add Pyroscope operation labels to hot code paths ([286d0e4](https://github.com/rknightion/paperless-ngx-dedupe/commit/286d0e40ad7b78839e41f6096ee4e808e6faaa7b))
* **telemetry:** add service.namespace, resource detectors, and Pyroscope config ([fc66c1d](https://github.com/rknightion/paperless-ngx-dedupe/commit/fc66c1dbf768cfa6c52fcf34c18cff0308822d6a))
* **telemetry:** wire Faro TracingInstrumentation for end-to-end trace correlation ([e26ac0b](https://github.com/rknightion/paperless-ngx-dedupe/commit/e26ac0b38e94e46f12896490d5a56b93c605ada8))
* **ui:** add error banner and retry button to AiResultDetailDrawer ([62d40eb](https://github.com/rknightion/paperless-ngx-dedupe/commit/62d40eb1da646f89e19abe4ef9d6839466b9c60d))
* **ui:** add error banner and retry to history page drawer ([0c048e0](https://github.com/rknightion/paperless-ngx-dedupe/commit/0c048e06faabceb3acf62973f474a0dc988dbf7c))
* **ui:** allow error messages to wrap in queue page failed section ([72027b8](https://github.com/rknightion/paperless-ngx-dedupe/commit/72027b87516662f75ed62ac1c121d9158e1e8777))
* **ui:** show inline error message in AiResultCard instead of tooltip ([5913619](https://github.com/rknightion/paperless-ngx-dedupe/commit/5913619922fab487cb276afc3db5b0a33ab6c328))
* **ui:** show inline error message in AiResultRow instead of tooltip ([404c7c6](https://github.com/rknightion/paperless-ngx-dedupe/commit/404c7c6af81e68efbe517531170cf242dde940fa))


### Bug Fixes

* **deps:** update dependency @anthropic-ai/sdk to v0.81.0 ([#279](https://github.com/rknightion/paperless-ngx-dedupe/issues/279)) ([a79fc2a](https://github.com/rknightion/paperless-ngx-dedupe/commit/a79fc2a8a4a305bd4db671d56891cbfc184d289c))
* **deps:** update dependency @anthropic-ai/sdk to v0.82.0 ([#283](https://github.com/rknightion/paperless-ngx-dedupe/issues/283)) ([2cdd8b3](https://github.com/rknightion/paperless-ngx-dedupe/commit/2cdd8b3e5578f5d4b2481994f63b1b40dbf0ac84))
* remove redundant Revert to Default button shown when prompt is already default ([28241c0](https://github.com/rknightion/paperless-ngx-dedupe/commit/28241c016e1f5482e7b7865f4ba1d72bdfba5205))
* **telemetry:** add @opentelemetry/api-logs to web package dependencies ([1945165](https://github.com/rknightion/paperless-ngx-dedupe/commit/194516543cda5b6c4cd0e4b5e91f3ae511a83c24))


### Miscellaneous

* **deps:** lock file maintenance ([#272](https://github.com/rknightion/paperless-ngx-dedupe/issues/272)) ([0e8902a](https://github.com/rknightion/paperless-ngx-dedupe/commit/0e8902ab26a3aa8b09131094a0df1037c017e4d9))
* **deps:** lock file maintenance ([#273](https://github.com/rknightion/paperless-ngx-dedupe/issues/273)) ([6eca07d](https://github.com/rknightion/paperless-ngx-dedupe/commit/6eca07da868ec9721980878f4c5cc5d7a5d85062))
* **deps:** update davelosert/vitest-coverage-report-action digest to bd52af5 ([#274](https://github.com/rknightion/paperless-ngx-dedupe/issues/274)) ([e127a53](https://github.com/rknightion/paperless-ngx-dedupe/commit/e127a536913fe75a4f37c79dc47e1e4b2c6a57df))
* **deps:** update davelosert/vitest-coverage-report-action digest to c0c9b09 ([#277](https://github.com/rknightion/paperless-ngx-dedupe/issues/277)) ([876fc48](https://github.com/rknightion/paperless-ngx-dedupe/commit/876fc48b51354c2aa1d1599348db959080cf3c9c))
* **deps:** update davelosert/vitest-coverage-report-action digest to d63aa97 ([#285](https://github.com/rknightion/paperless-ngx-dedupe/issues/285)) ([0eabb62](https://github.com/rknightion/paperless-ngx-dedupe/commit/0eabb6277f485983610f432d5b49bdc9d62e071d))
* **deps:** update dependency @ai-sdk/anthropic to v3.0.65 ([#286](https://github.com/rknightion/paperless-ngx-dedupe/issues/286)) ([e9244c4](https://github.com/rknightion/paperless-ngx-dedupe/commit/e9244c48a567443683991cfaecb21b47a802c3d9))
* **deps:** update dependency @ai-sdk/anthropic to v3.0.66 ([#288](https://github.com/rknightion/paperless-ngx-dedupe/issues/288)) ([d8b2b85](https://github.com/rknightion/paperless-ngx-dedupe/commit/d8b2b858c2aa4a2378d5e78b950faaad3d87dd94))
* **deps:** update dependency @ai-sdk/openai to v3.0.49 ([#276](https://github.com/rknightion/paperless-ngx-dedupe/issues/276)) ([fc7644b](https://github.com/rknightion/paperless-ngx-dedupe/commit/fc7644b2e33e16596b0979fec68dbe3aef703e09))
* **deps:** update dependency @ai-sdk/openai to v3.0.50 ([#290](https://github.com/rknightion/paperless-ngx-dedupe/issues/290)) ([3caf239](https://github.com/rknightion/paperless-ngx-dedupe/commit/3caf239bd95d2d7faa057803a6fde76795008822))
* **deps:** update dependency @playwright/test to v1.59.0 ([#278](https://github.com/rknightion/paperless-ngx-dedupe/issues/278)) ([cec0b9b](https://github.com/rknightion/paperless-ngx-dedupe/commit/cec0b9b364291c89b0070b83800164f3a2696706))
* **deps:** update dependency @playwright/test to v1.59.1 ([#281](https://github.com/rknightion/paperless-ngx-dedupe/issues/281)) ([f983c3d](https://github.com/rknightion/paperless-ngx-dedupe/commit/f983c3d99d0fe82a7272f14c0f42dde5a201083d))
* **deps:** update dependency @sveltejs/kit to v2.56.0 ([#293](https://github.com/rknightion/paperless-ngx-dedupe/issues/293)) ([e24a210](https://github.com/rknightion/paperless-ngx-dedupe/commit/e24a2104a5a52677bc731f7dfe79fccf13516ace))
* **deps:** update dependency @sveltejs/kit to v2.56.1 ([#295](https://github.com/rknightion/paperless-ngx-dedupe/issues/295)) ([c333b6c](https://github.com/rknightion/paperless-ngx-dedupe/commit/c333b6c82f741c99c04b8a056b20f84c6a9c52d9))
* **deps:** update dependency @types/node to v25.5.1 ([#291](https://github.com/rknightion/paperless-ngx-dedupe/issues/291)) ([859039a](https://github.com/rknightion/paperless-ngx-dedupe/commit/859039ad1a70e69881c0cb1a19e76b2307667663))
* **deps:** update dependency @types/node to v25.5.2 ([#292](https://github.com/rknightion/paperless-ngx-dedupe/issues/292)) ([08b16f3](https://github.com/rknightion/paperless-ngx-dedupe/commit/08b16f396226e8c6c5255208e52d81f5d173bd12))
* **deps:** update dependency ai to v6.0.142 ([#280](https://github.com/rknightion/paperless-ngx-dedupe/issues/280)) ([4b53114](https://github.com/rknightion/paperless-ngx-dedupe/commit/4b53114b06fc876f17b3e06a830385aedf07ae57))
* **deps:** update dependency ai to v6.0.143 ([#284](https://github.com/rknightion/paperless-ngx-dedupe/issues/284)) ([cd5a838](https://github.com/rknightion/paperless-ngx-dedupe/commit/cd5a8382579312f450df4b517da1ae7ffce2d498))
* **deps:** update dependency ai to v6.0.145 ([#289](https://github.com/rknightion/paperless-ngx-dedupe/issues/289)) ([6263fe7](https://github.com/rknightion/paperless-ngx-dedupe/commit/6263fe7d0a1a150052113d9adeb395160ac1f486))
* **deps:** update dependency ai to v6.0.146 ([#296](https://github.com/rknightion/paperless-ngx-dedupe/issues/296)) ([0018b93](https://github.com/rknightion/paperless-ngx-dedupe/commit/0018b9385ec99302b5e4236f968d09c1962981a6))
* **deps:** update dependency eslint to v10.2.0 ([#294](https://github.com/rknightion/paperless-ngx-dedupe/issues/294)) ([cdee552](https://github.com/rknightion/paperless-ngx-dedupe/commit/cdee5523f86ef9a1a14e7af5d6f9d04352ed7479))
* **deps:** update dependency eslint-plugin-svelte to v3.17.0 ([#287](https://github.com/rknightion/paperless-ngx-dedupe/issues/287)) ([0668e1a](https://github.com/rknightion/paperless-ngx-dedupe/commit/0668e1a00847ff1a7df9749aa0b2ec3ed35afbb2))
* **deps:** update dependency sqlite-vec to v0.1.9 ([#282](https://github.com/rknightion/paperless-ngx-dedupe/issues/282)) ([a426d9c](https://github.com/rknightion/paperless-ngx-dedupe/commit/a426d9c1c3448241a8e56c83e7aaa98fdec90902))
* **deps:** update dependency svelte to v5.55.1 ([#271](https://github.com/rknightion/paperless-ngx-dedupe/issues/271)) ([e1dc582](https://github.com/rknightion/paperless-ngx-dedupe/commit/e1dc5821f5727ccc9646ee952fdfa653f68f72a0))
* **deps:** update typescript-eslint monorepo to v8.58.0 ([#275](https://github.com/rknightion/paperless-ngx-dedupe/issues/275)) ([36f6c04](https://github.com/rknightion/paperless-ngx-dedupe/commit/36f6c049248fd4a515a739a12920402a71b174f7))


### Documentation

* add AI apply failure visibility design spec ([b419a87](https://github.com/rknightion/paperless-ngx-dedupe/commit/b419a87e9cb28b1d72ae80c42d9c46a4bdfb46fc))
* add implementation plan for AI apply failure visibility ([7443a30](https://github.com/rknightion/paperless-ngx-dedupe/commit/7443a307eb20630651ac13d3eea01d957234884a))
* add observability guide, Pyroscope setup, and updated env vars ([19375c9](https://github.com/rknightion/paperless-ngx-dedupe/commit/19375c9def0522133c167f309f36c1a60dae0566))
* add observability improvements design spec ([b290db2](https://github.com/rknightion/paperless-ngx-dedupe/commit/b290db2592a229fe381e3bc0fdc0a6a8129da56e))
* add observability improvements implementation plan ([b1a3aa9](https://github.com/rknightion/paperless-ngx-dedupe/commit/b1a3aa9ebed12318c4030ee7009ac1216b8bbb5e))
* expand project documentation with code style, Docker commands, and API conventions ([60df091](https://github.com/rknightion/paperless-ngx-dedupe/commit/60df091513eeab824e19e0674b398bc8def3df8b))


### Refactoring

* **core:** fix indentation in batch processing and analysis modules ([435b3db](https://github.com/rknightion/paperless-ngx-dedupe/commit/435b3dbdf4934263cee35fad2b974a86c6f91801))
* **telemetry:** add unit annotations to all metric instruments ([fadba89](https://github.com/rknightion/paperless-ngx-dedupe/commit/fadba89e453bf48d7ca24e06367d0b4c866a5c2c))
* **telemetry:** migrate AI batch to GenAI semantic conventions ([4e204c7](https://github.com/rknightion/paperless-ngx-dedupe/commit/4e204c7c1be6f565c7f6facf37300fff322f7c47))
* **telemetry:** migrate drizzle logger to log-based events and stable DB semconv ([d29b283](https://github.com/rknightion/paperless-ngx-dedupe/commit/d29b283306d7a129069389d484e7b0ab8848ab72))
* **telemetry:** replace span.recordException with log-based exception events ([03d28bc](https://github.com/rknightion/paperless-ngx-dedupe/commit/03d28bcc152f26f38b2d6a20836c6d867e0ca3f4))


### Performance

* **ai:** optimize batch apply with reference data caching and bulk operations ([381e92d](https://github.com/rknightion/paperless-ngx-dedupe/commit/381e92d0262122de94c4ce24764b57fbb4f11fa5))

## [0.13.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.12.1...v0.13.0) (2026-03-29)


### Features

* **ai:** add cost comparison dialog for AI model selection ([eb834c7](https://github.com/rknightion/paperless-ngx-dedupe/commit/eb834c71ff849ae53491ec5b0acb0d665f312c00))
* **ai:** add filtering and search capabilities to unprocessed document queue ([1950c07](https://github.com/rknightion/paperless-ngx-dedupe/commit/1950c0794fc4aae5b3da14ce6bdbc901403538b3))
* **ai:** include failed AI results in processing history ([3ccf99e](https://github.com/rknightion/paperless-ngx-dedupe/commit/3ccf99e6f1ddd4d92e66a14f5a06de6f42c6168b))


### Bug Fixes

* **ai:** improve model pricing lookup with fallback matching strategies ([64c6da4](https://github.com/rknightion/paperless-ngx-dedupe/commit/64c6da4dfa45e4daeda9afdb40911b51d5c62315))
* **paperless:** remove API version specification from Accept header ([dfe438c](https://github.com/rknightion/paperless-ngx-dedupe/commit/dfe438c035d1ae9f5422d83189b3b1e5b0ac206a)), closes [#269](https://github.com/rknightion/paperless-ngx-dedupe/issues/269)


### Refactoring

* **ai:** convert cost estimation to async with lazy tiktoken loading ([258e069](https://github.com/rknightion/paperless-ngx-dedupe/commit/258e069329ac7717cad0a8664d53167d5f2b6846))

## [0.12.1](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.12.0...v0.12.1) (2026-03-28)


### Bug Fixes

* **duplicates:** add real-time progress tracking for bulk delete operations ([5750c87](https://github.com/rknightion/paperless-ngx-dedupe/commit/5750c871a6f5474c2c13736911102648aec65fed))

## [0.12.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.11.0...v0.12.0) (2026-03-28)


### Features

* **ai:** add protected tags configuration schema ([e434f13](https://github.com/rknightion/paperless-ngx-dedupe/commit/e434f13c32de02d0bd880955880ba3f1f9bf2aa6))
* **ai:** implement protected tags config storage and parsing ([210bbe5](https://github.com/rknightion/paperless-ngx-dedupe/commit/210bbe566a452600d184c5fa66a9555c6ecf46d2))
* **ai:** implement protected tags filtering in applyAiResult ([320f8f3](https://github.com/rknightion/paperless-ngx-dedupe/commit/320f8f33b2ba0809427ec0236420d4f6b6802995))
* **ai:** integrate protected tags into auto-apply workflows ([bc36bb6](https://github.com/rknightion/paperless-ngx-dedupe/commit/bc36bb6fde017878409fb2f10e507faae69b3cde))
* **api:** add job history management endpoints ([5e4bdd5](https://github.com/rknightion/paperless-ngx-dedupe/commit/5e4bdd58f200ca4fcecf9ee8d50632a4e81f99b6))
* **api:** add protected tags to AI result apply endpoint ([45ed955](https://github.com/rknightion/paperless-ngx-dedupe/commit/45ed9559165074b1bcb875d6d9523fbe8f8a53f3))
* **batch-worker:** integrate cross-group cleanup and improve progress reporting ([15fc0eb](https://github.com/rknightion/paperless-ngx-dedupe/commit/15fc0ebb019274defb4c56b1aa98172c40c523af))
* **core:** add database index for document cleanup optimization ([77dd475](https://github.com/rknightion/paperless-ngx-dedupe/commit/77dd475b065bee63844c5f73284c3636eeb7845c))
* **core:** implement cross-group document cleanup functionality ([3e9ff81](https://github.com/rknightion/paperless-ngx-dedupe/commit/3e9ff81e5cf51f4270a8f0b811c7b0d4dbbca493))
* **jobs:** add clearJobHistory function to manager ([63530b1](https://github.com/rknightion/paperless-ngx-dedupe/commit/63530b108b785b38e0119329ddbbc4c8a678c883))
* **sdk:** extend Job interface and add job management methods ([a7b6250](https://github.com/rknightion/paperless-ngx-dedupe/commit/a7b62507334462cb96ce00464df2e99c34b00895))
* **web:** add API endpoint for document cleanup across groups ([7fee819](https://github.com/rknightion/paperless-ngx-dedupe/commit/7fee819ea2d4cfbc7fa88dae69d04b85c5174cf9))
* **web:** add Jobs navigation item to layout ([6601200](https://github.com/rknightion/paperless-ngx-dedupe/commit/66012000958feaf047b597e91da26f988e23bfec))
* **web:** add jobs page with filtering and history management ([75fb964](https://github.com/rknightion/paperless-ngx-dedupe/commit/75fb96458eec06279efeb53a1e728f9e72a6032f))
* **web:** add protected tags settings UI ([f597a85](https://github.com/rknightion/paperless-ngx-dedupe/commit/f597a851a7e0cf0c8644b5a45df54af1457cf1a6))
* **web:** enhance dashboard with jobs section link ([4e5df27](https://github.com/rknightion/paperless-ngx-dedupe/commit/4e5df27f0ed4f6790079c691982c30c0bbb1820e))
* **web:** enhance JobStatusCard with detailed result formatting ([c46ea07](https://github.com/rknightion/paperless-ngx-dedupe/commit/c46ea076da9db08d1cc3522a8647d61adb9c3495))
* **web:** use cross-group cleanup in duplicate management UI ([2a085fc](https://github.com/rknightion/paperless-ngx-dedupe/commit/2a085fc9470acd37b82930c3078279535360edaf))


### Bug Fixes

* **ui:** replace div with button element for drawer overlay ([bea1127](https://github.com/rknightion/paperless-ngx-dedupe/commit/bea11277a2f097937e998aa1d04ef1050f067a2c))


### Miscellaneous

* **deps:** update dependency ai to v6.0.141 ([#265](https://github.com/rknightion/paperless-ngx-dedupe/issues/265)) ([f155dfe](https://github.com/rknightion/paperless-ngx-dedupe/commit/f155dfece07c36e615d396674f88047f6c51468b))
* **deps:** update dependency drizzle-orm to v0.45.2 ([#266](https://github.com/rknightion/paperless-ngx-dedupe/issues/266)) ([c1b2381](https://github.com/rknightion/paperless-ngx-dedupe/commit/c1b23817eb2ac3bcf0f62ca8c18f3a9836b47562))
* **deps:** update github/codeql-action digest to c10b806 ([#263](https://github.com/rknightion/paperless-ngx-dedupe/issues/263)) ([c880aeb](https://github.com/rknightion/paperless-ngx-dedupe/commit/c880aeb2586e066fc1a8bb403768f33bb91f901a))


### Documentation

* remove CLI and SDK references from getting started guide ([ba09889](https://github.com/rknightion/paperless-ngx-dedupe/commit/ba0988930f3a8ce5bf87a0cc531df51c0e972e84))
* remove CLI reference documentation ([55b10be](https://github.com/rknightion/paperless-ngx-dedupe/commit/55b10be227752f0a2f8eec66c70b5684b2deced2))
* remove SDK reference documentation ([5d0036d](https://github.com/rknightion/paperless-ngx-dedupe/commit/5d0036dc3f6ca18070198c80d7e04ac5d1aae143))
* update architecture documentation for two-package structure ([9207b56](https://github.com/rknightion/paperless-ngx-dedupe/commit/9207b563ac21e0fdeae5b8cdd32d7fa7f6dfc7ff))
* update CLAUDE.md documentation for simplified architecture ([f462374](https://github.com/rknightion/paperless-ngx-dedupe/commit/f462374f8734d891cb4dbf6bce20128b33bd55e9))
* update contributing guide for simplified package structure ([f339bfa](https://github.com/rknightion/paperless-ngx-dedupe/commit/f339bfa99139ab5180403e9f5d0f4eb90b4143a8))
* update development guide for two-package workflow ([e519113](https://github.com/rknightion/paperless-ngx-dedupe/commit/e519113ba4caf7e18d683194cfdf600a5bcc030b))
* update documentation for package structure ([e52d851](https://github.com/rknightion/paperless-ngx-dedupe/commit/e52d8510251b16bda886a6be39a51e7a35b7ba63))
* update main documentation index and navigation ([33e8d33](https://github.com/rknightion/paperless-ngx-dedupe/commit/33e8d33a385fc65b32ab26f7c5ea53c1df9a28d2))
* update task documentation to remove SDK references ([325ecbc](https://github.com/rknightion/paperless-ngx-dedupe/commit/325ecbcffa4fc4a8a7cd8ac02877e6ebfe4f3d0d))


### Refactoring

* remove SDK and CLI packages from monorepo ([2ebfdeb](https://github.com/rknightion/paperless-ngx-dedupe/commit/2ebfdebb02a6bd363c123c74208a2086537779af))


### Tests

* **ai:** add comprehensive protected tags test suite ([bd7890c](https://github.com/rknightion/paperless-ngx-dedupe/commit/bd7890c328c573d1610737928533b7ad1d3e2182))
* **ai:** add protected tags configuration tests ([d3f17b5](https://github.com/rknightion/paperless-ngx-dedupe/commit/d3f17b58e5c75b9718879077c0940b8fdb512741))

## [0.11.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.10.0...v0.11.0) (2026-03-27)


### Features

* add duplicate group detail tracking ([b998ef6](https://github.com/rknightion/paperless-ngx-dedupe/commit/b998ef6d39a99d7fc9a810708c1fe06dca1bdbf2))
* add Faro route tracking integration ([94a0bd5](https://github.com/rknightion/paperless-ngx-dedupe/commit/94a0bd50cce2906d661b5621d32e064d6144fbdd))
* add Faro tracking to dashboard operations ([e55b433](https://github.com/rknightion/paperless-ngx-dedupe/commit/e55b43326a7ee28066fd670c5a4761e4ab547b19))
* add Grafana Faro frontend observability configuration ([a6ca4bc](https://github.com/rknightion/paperless-ngx-dedupe/commit/a6ca4bc2886698c731ad2cdf1e34143e68091dc4))
* add RAG conversation and indexing tracking ([044ccaf](https://github.com/rknightion/paperless-ngx-dedupe/commit/044ccafc24d592889eb93311b3d13290744eaa9d))
* add settings management tracking ([a113196](https://github.com/rknightion/paperless-ngx-dedupe/commit/a113196e165e58dacfd254d93ca1c2583bcad211))
* add source map generation and upload for error tracking ([76fa092](https://github.com/rknightion/paperless-ngx-dedupe/commit/76fa09221725b7866c4d905b0deeb4bc03863360))
* **ai:** add failure tracking with failure types ([daf08a6](https://github.com/rknightion/paperless-ngx-dedupe/commit/daf08a60a4559cd2e2ccc29cabb2fa096a79df58))
* **api:** add includeDeleted parameter to duplicates endpoint ([02bbe53](https://github.com/rknightion/paperless-ngx-dedupe/commit/02bbe53959c85e93b2263a35e0880e6e29f7e73b))
* **api:** add member removal functionality to duplicate groups ([cda43cb](https://github.com/rknightion/paperless-ngx-dedupe/commit/cda43cb09e7eb1fdc2b5127ea737b6a14c0f46c6))
* **db:** add archived fields to duplicate_group schema ([d5c7d1c](https://github.com/rknightion/paperless-ngx-dedupe/commit/d5c7d1cac65a3f33f55f75baa634a88fff4809aa))
* **db:** add migration for deleted group archives ([7a24416](https://github.com/rknightion/paperless-ngx-dedupe/commit/7a244162adcb05f31e908016d8f08ec6ef93d99f))
* **dedup:** change default discriminative penalty strength from 50 to 70 ([0cebe1f](https://github.com/rknightion/paperless-ngx-dedupe/commit/0cebe1f4b3e3aa6b520adee5a6324285ee2ea8be))
* **dedup:** enhance discriminative classifier with improved pattern detection ([c8616df](https://github.com/rknightion/paperless-ngx-dedupe/commit/c8616dff1cfbe6399e77a8f6add68a66391715b2))
* **duplicates:** add navigation controls to document visual comparison ([64025d3](https://github.com/rknightion/paperless-ngx-dedupe/commit/64025d3d5876a3d5c98286a8f8b0210656a6d27f))
* **duplicates:** add sortable columns with persistent preferences ([cfa1fc7](https://github.com/rknightion/paperless-ngx-dedupe/commit/cfa1fc7e02c32cf48b20c629d7693b52c9436171))
* export new archiving functions from core package ([6bef547](https://github.com/rknightion/paperless-ngx-dedupe/commit/6bef547fcceac1c64971b808803aa4d158147333))
* implement AI processing tracking ([f05995f](https://github.com/rknightion/paperless-ngx-dedupe/commit/f05995f65114f2b7d7cb1fa494738adbb742b27c))
* implement duplicates management tracking ([5322087](https://github.com/rknightion/paperless-ngx-dedupe/commit/532208789c89e1c909c6ebaa06b7ae0d11fc85e4))
* implement Grafana Faro event tracking system ([db7bffe](https://github.com/rknightion/paperless-ngx-dedupe/commit/db7bffe13edb15eee323138457b7f1687ee3a485))
* implement wizard workflow tracking ([911b976](https://github.com/rknightion/paperless-ngx-dedupe/commit/911b9767debb99b13085f30f94e3a8ba2703e5b6))
* initialize Faro tracking in root layout ([90099e6](https://github.com/rknightion/paperless-ngx-dedupe/commit/90099e634e3dec4a4493a050545a51864023bcfd))
* initialize Grafana Faro Web SDK ([0375270](https://github.com/rknightion/paperless-ngx-dedupe/commit/03752707b1305a4742e5e2e2ed0c3d32d222191e))
* integrate Faro configuration in server-side layout ([a69ef11](https://github.com/rknightion/paperless-ngx-dedupe/commit/a69ef11f7742884e24eafd4d55bd6882b7f5c52e))
* **jobs:** update batch worker to use archiving ([b4cd5d9](https://github.com/rknightion/paperless-ngx-dedupe/commit/b4cd5d9e8e7ef259cbe2eae392c645957dc26eed))
* **queries:** add archived fields to duplicate group types ([f14cb07](https://github.com/rknightion/paperless-ngx-dedupe/commit/f14cb07c857ba56a68a8f22db28d40d57ba4d629))
* **queries:** implement group archiving and filtering logic ([e44fc06](https://github.com/rknightion/paperless-ngx-dedupe/commit/e44fc0698481fdfc36d42d093c62dafbdfe7a817))
* **queries:** update setGroupStatus to archive on delete ([672a6f7](https://github.com/rknightion/paperless-ngx-dedupe/commit/672a6f7b591bc75795004fb1caf1f44beb2d6613))
* **telemetry:** enhance OpenTelemetry configuration and trace correlation ([95ae7f0](https://github.com/rknightion/paperless-ngx-dedupe/commit/95ae7f09dcd90f33f2e2f71d62cb3c2bdeb406fc))
* **ui:** add per-document actions for group management ([3a417a9](https://github.com/rknightion/paperless-ngx-dedupe/commit/3a417a9850ccd473d11bc154a9c2ca3bc8f5aaf7))
* **ui:** enhance penalty strength settings with detailed guidance ([ffe78a7](https://github.com/rknightion/paperless-ngx-dedupe/commit/ffe78a7dc3d2cfbdfbe0fd32a2e5fd635ceecc07))
* **web:** add show deleted checkbox and update UI for archived groups ([0d9e867](https://github.com/rknightion/paperless-ngx-dedupe/commit/0d9e867aa1f68022e38f298c9326b46c4f15d9bb))
* **web:** enhance queue UI for different failure types ([c4af9b3](https://github.com/rknightion/paperless-ngx-dedupe/commit/c4af9b31cdd15704dcd8654f612d5e39c2b638bb))
* **web:** update group detail page for archived groups ([2ae84c3](https://github.com/rknightion/paperless-ngx-dedupe/commit/2ae84c3ddfb716d7083e35976efcca874e7da21a))


### Bug Fixes

* **ai:** exclude no_suggestions failures from retry scope ([40eae4b](https://github.com/rknightion/paperless-ngx-dedupe/commit/40eae4bd1a6e1420cc65c052deb88c78f62b76bb))
* **ai:** improve error handling in AI apply worker and API ([e659a07](https://github.com/rknightion/paperless-ngx-dedupe/commit/e659a07cb292a5a3a10998a1d57f45aef63fb717))
* **ai:** mark results as failed with no_suggestions type when no metadata found ([c2e2c32](https://github.com/rknightion/paperless-ngx-dedupe/commit/c2e2c32b0a9f0098c016e3279315383d7d791919))
* **db:** enable incremental database migrations with stored snapshots ([e4bf0de](https://github.com/rknightion/paperless-ngx-dedupe/commit/e4bf0de20e054a1cf435e2b64910eb17e025210d))


### Miscellaneous

* **deps:** update dependency ai to v6.0.140 ([#260](https://github.com/rknightion/paperless-ngx-dedupe/issues/260)) ([8ab5c6b](https://github.com/rknightion/paperless-ngx-dedupe/commit/8ab5c6bea1d081fea83e5237fa1dad5061ea7ca7))
* **deps:** update github/codeql-action digest to b8bb9f2 ([#262](https://github.com/rknightion/paperless-ngx-dedupe/issues/262)) ([e611986](https://github.com/rknightion/paperless-ngx-dedupe/commit/e61198692307fb045b3c145751717eafc52d6d90))
* update dependencies to latest versions ([9aef750](https://github.com/rknightion/paperless-ngx-dedupe/commit/9aef750315b872b6babb75f3a73ddf30c727e3db))


### Documentation

* update discriminative penalty documentation with detailed guidance ([82745a8](https://github.com/rknightion/paperless-ngx-dedupe/commit/82745a87b21d116bd596d59ff1e43b280ad2c7b2))


### Tests

* add comprehensive tests for group archiving functionality ([f1581fa](https://github.com/rknightion/paperless-ngx-dedupe/commit/f1581fae3277e2da844eb6050baf7b75cd87e6b5))
* **ai:** add comprehensive tests for failure handling ([1333978](https://github.com/rknightion/paperless-ngx-dedupe/commit/1333978481a91b1fec611ad3da19ebd56cc99e2c))
* **dedup:** add comprehensive tests for enhanced discriminative patterns ([5d4b0f1](https://github.com/rknightion/paperless-ngx-dedupe/commit/5d4b0f15afb78411971a5318df8785c313cd4e4c))
* update e2e test for duplicates dropdown changes ([d14ffc0](https://github.com/rknightion/paperless-ngx-dedupe/commit/d14ffc0e5825f5d8d6937a9fc6ecd4e2c671111d))

## [0.10.0](https://github.com/rknightion/paperless-ngx-dedupe/compare/v0.9.0...v0.10.0) (2026-03-26)


### Features

* **ai:** add bulk operations, grouping, and preflight checks to AI processing workflow ([2e076bf](https://github.com/rknightion/paperless-ngx-dedupe/commit/2e076bf2f945a2640f16a6e600c883d16d242df0))
* **ai:** complete AI processing UX overhaul with safety improvements and review workflow ([93d6ad0](https://github.com/rknightion/paperless-ngx-dedupe/commit/93d6ad0231f41cd844044519bd62a2988e2d7ae1))
* **ai:** implement comprehensive confidence gates, auto-apply, audit trails, and cost tracking ([3564894](https://github.com/rknightion/paperless-ngx-dedupe/commit/356489432d0e588108b9438f82244352e0fa33e6))
* **ai:** sort reference lists alphabetically for deterministic prompts ([c23f464](https://github.com/rknightion/paperless-ngx-dedupe/commit/c23f4645f4a91bfeb564d2f0edc33aae40006379))
* **api:** add staleness detection to dedup config endpoint ([3e9f020](https://github.com/rknightion/paperless-ngx-dedupe/commit/3e9f0201d7c6b6eab245015160f34980b9e90253))
* **api:** update dedup config endpoint to handle discriminative weight ([33c735d](https://github.com/rknightion/paperless-ngx-dedupe/commit/33c735d27ce300f76f0728d8428e9e2c5be65991))
* **api:** update duplicate queries to include discriminative scores ([419b27d](https://github.com/rknightion/paperless-ngx-dedupe/commit/419b27da919b4f7d4e8dd7d70b87e24d108cff8f))
* **core:** export analysis hash tracking functions ([b93455e](https://github.com/rknightion/paperless-ngx-dedupe/commit/b93455eb7b5b952c4a3ce1b7de8cd38756290119))
* **dashboard:** add analysis staleness detection ([bcb8f92](https://github.com/rknightion/paperless-ngx-dedupe/commit/bcb8f923ebecc78129232ecf2ccd4f05187742a9))
* **dedup:** add analysis config hash tracking for staleness detection ([aad2fdf](https://github.com/rknightion/paperless-ngx-dedupe/commit/aad2fdf8c1c038143cd8bc5589f887b87f484403))
* **dedup:** add discriminative scoring system for structured content ([48a831f](https://github.com/rknightion/paperless-ngx-dedupe/commit/48a831ffecc0ad52bf15911daaa2b46b0f2288bc))
* **dedup:** expand discriminative token extraction patterns ([d4bc016](https://github.com/rknightion/paperless-ngx-dedupe/commit/d4bc016a68cf5aeb527b3fe156a513d523bd9fa1))
* **dedup:** implement config migration from old weight systems ([5384dac](https://github.com/rknightion/paperless-ngx-dedupe/commit/5384dac347eec5bb22cd71a913f14c75a28a86c7))
* **dedup:** integrate config hash tracking into analysis pipeline ([f7bfb02](https://github.com/rknightion/paperless-ngx-dedupe/commit/f7bfb02f7ece3e435c2f225fbfd395cc4c5c16e1))
* **dedup:** integrate discriminative scoring into similarity computation ([2d40c01](https://github.com/rknightion/paperless-ngx-dedupe/commit/2d40c01bc46ade47d92a09de30e3edb7e13fb244))
* **dedup:** update analysis pipeline to compute and store discriminative scores ([92a3e98](https://github.com/rknightion/paperless-ngx-dedupe/commit/92a3e987e958315807dddf5717199e4d6c4a60d0))
* **dedup:** update config management to handle discriminative weights ([cfae76a](https://github.com/rknightion/paperless-ngx-dedupe/commit/cfae76a9721f820063775bfecd20bfc19d0e4a64))
* **dedup:** update configuration schema to support three-weight system ([544a2e7](https://github.com/rknightion/paperless-ngx-dedupe/commit/544a2e70a87d9110b1f058bbe11db11dfb3ad963))
* **export:** include discriminative scores in CSV export ([7a210c3](https://github.com/rknightion/paperless-ngx-dedupe/commit/7a210c3821b82e52ab9395ea6969a81736750204))
* **schema:** add discriminative_score column to duplicate_group table ([5ccf728](https://github.com/rknightion/paperless-ngx-dedupe/commit/5ccf728bf074402cf19d5d8a691173e0cea93639))
* **settings:** replace 3-weight system with 2-weight plus penalty UI ([ee5c423](https://github.com/rknightion/paperless-ngx-dedupe/commit/ee5c423ff75859e2529cec7b12c323ad5cc53aa7))
* **types:** add discriminative score support to interfaces ([7f46e07](https://github.com/rknightion/paperless-ngx-dedupe/commit/7f46e07c998f3aaedc27f9b1779b7aefc9776e50))
* **ui:** add discriminative score display to confidence components ([c032c69](https://github.com/rknightion/paperless-ngx-dedupe/commit/c032c69dae04ab91d99c7b0cedeaf5e58f5821aa))
* **ui:** add stale analysis warning banner component ([df86257](https://github.com/rknightion/paperless-ngx-dedupe/commit/df86257d4dda23de8ab9495b786de0c636856ab7))
* **ui:** integrate stale analysis warnings in dashboard ([5fa8ec2](https://github.com/rknightion/paperless-ngx-dedupe/commit/5fa8ec204698979586c179abf045735d8b6df027))
* **ui:** update confidence breakdown to show penalty strength ([63175f8](https://github.com/rknightion/paperless-ngx-dedupe/commit/63175f809f1ca8c17c3bd2d8c379c8be9f008b81))
* **ui:** update settings page for three-weight configuration system ([e6386eb](https://github.com/rknightion/paperless-ngx-dedupe/commit/e6386eb1cc90c432e43e4a146b5dde1eed9a85e4))


### Bug Fixes

* **db:** add discriminative_score column to duplicate_group table ([a9e3eeb](https://github.com/rknightion/paperless-ngx-dedupe/commit/a9e3eebd57ce24ca46262351b03b5b49139cce18))
* **dedup:** improve money pattern matching and update UI for discriminative scoring ([42e7286](https://github.com/rknightion/paperless-ngx-dedupe/commit/42e7286b31146710795d3982b1891cdaf8ee0c95))
* **deps:** update opentelemetry-js monorepo ([#255](https://github.com/rknightion/paperless-ngx-dedupe/issues/255)) ([6df9720](https://github.com/rknightion/paperless-ngx-dedupe/commit/6df9720c141ea701186e14fcb5c699edfde53743))
* **deps:** update opentelemetry-js-contrib monorepo ([#257](https://github.com/rknightion/paperless-ngx-dedupe/issues/257)) ([d9fbe8d](https://github.com/rknightion/paperless-ngx-dedupe/commit/d9fbe8df2cac7c1d7315d25684268c510f05e168))
* **export:** add backward compatibility for 3-weight dedup config imports ([4149eb3](https://github.com/rknightion/paperless-ngx-dedupe/commit/4149eb39006a2a9150ffab1db8e566b46d21b23e))


### Miscellaneous

* **deps:** update codacy/codacy-analysis-cli-action digest to d433603 ([#253](https://github.com/rknightion/paperless-ngx-dedupe/issues/253)) ([2928f1c](https://github.com/rknightion/paperless-ngx-dedupe/commit/2928f1cc77e8a216a6f3a96952b5b2debdde820f))
* **deps:** update dependency openai to v6.33.0 ([#256](https://github.com/rknightion/paperless-ngx-dedupe/issues/256)) ([57bd3a5](https://github.com/rknightion/paperless-ngx-dedupe/commit/57bd3a52d9c1f73c3684427d5036fa3e2980370e))
* **deps:** update dependency vite to v8.0.3 ([#258](https://github.com/rknightion/paperless-ngx-dedupe/issues/258)) ([1f87b6c](https://github.com/rknightion/paperless-ngx-dedupe/commit/1f87b6ca05c6346e8f14d05945ab63e55494d9fb))
* **deps:** update vitest monorepo to v4.1.2 ([#259](https://github.com/rknightion/paperless-ngx-dedupe/issues/259)) ([2a9fcb6](https://github.com/rknightion/paperless-ngx-dedupe/commit/2a9fcb694011c1591e771e32d6705795fe854204))
* fix issue classifier ([7247e79](https://github.com/rknightion/paperless-ngx-dedupe/commit/7247e79921f5ec4e4cae3c8a31317d52f5499c14))
* remove triage ([e3496d8](https://github.com/rknightion/paperless-ngx-dedupe/commit/e3496d8168bbfb25125a2ed570683f2488df041c))


### Documentation

* update documentation for discriminative penalty scoring model ([6f52495](https://github.com/rknightion/paperless-ngx-dedupe/commit/6f524958cc64734f82062afc7577c43ce17a9a4b))


### Refactoring

* **dedup:** replace 3-weight system with 2-weight plus discriminative penalty ([84aa0bc](https://github.com/rknightion/paperless-ngx-dedupe/commit/84aa0bceef6cc8a3e1d505c1fdb548249ab4a580))
* **dedup:** update confidence score calculation for penalty model ([5bf9ed0](https://github.com/rknightion/paperless-ngx-dedupe/commit/5bf9ed0d2f58a6c07d55181cf490b2e3532380c8))
* **dedup:** update scoring to use penalty-based discriminative model ([7dd44ab](https://github.com/rknightion/paperless-ngx-dedupe/commit/7dd44abeebf7d788d5aa7349994f8526316db2b3))


### Tests

* **dedup:** add comprehensive tests for discriminative scoring integration ([9ce212f](https://github.com/rknightion/paperless-ngx-dedupe/commit/9ce212f961a7ee97dec7d212432fcffdd88068d0))
* expand discriminative token extraction test coverage ([efa3587](https://github.com/rknightion/paperless-ngx-dedupe/commit/efa3587e8c2bed76b7d53e5cf722c4209920aebb))
* update dedup config tests for penalty model migration ([c4a9f2a](https://github.com/rknightion/paperless-ngx-dedupe/commit/c4a9f2a73d751da310f1025da45744efc5849084))
* update scoring tests for penalty-based discriminative model ([03c180c](https://github.com/rknightion/paperless-ngx-dedupe/commit/03c180ce1811af7f83197c2fa62f45fa6658ba67))

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
