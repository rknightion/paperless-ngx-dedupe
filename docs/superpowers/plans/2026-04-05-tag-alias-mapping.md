# Tag Alias Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in tag alias mapping feature that lets users define canonical→alias YAML maps, injected into the LLM prompt to normalise tag suggestions.

**Architecture:** Two new config fields (`tagAliasesEnabled`, `tagAliasMap`) stored in `app_config` via the existing AI config system. A `{{tag_aliases}}` template placeholder in the default prompt is resolved by `buildPromptParts()`. The settings UI mirrors the existing prompt template pattern (toggle, collapsible textarea, default-diff warning, revert). YAML validation uses the `yaml` npm package in core, shared by both the API endpoint and the client.

**Tech Stack:** TypeScript, Zod, Vitest, SvelteKit 2 (Svelte 5 runes), `yaml` npm package

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/ai/tag-alias-defaults.ts` | **Create.** `DEFAULT_TAG_ALIAS_MAP` constant (the full default YAML string) |
| `packages/core/src/ai/tag-alias-validation.ts` | **Create.** `validateTagAliasYaml()` function — parses YAML, validates `Record<string, string[]>` shape |
| `packages/core/src/ai/types.ts` | **Modify.** Add `tagAliasesEnabled` and `tagAliasMap` fields to `aiConfigSchema` |
| `packages/core/src/ai/prompt.ts` | **Modify.** Add `tagAliasesEnabled` and `tagAliasMap` to `BuildPromptOptions`, resolve `{{tag_aliases}}` placeholder |
| `packages/core/src/ai/extract.ts` | **Modify.** Pass alias config through `ProcessDocumentOptions` to `buildPromptParts()` |
| `packages/core/src/ai/config.ts` | **Modify.** Add `tagAliasesEnabled` to boolean parse list, add `tagAliasMap` to string exclusion list |
| `packages/core/src/ai/batch.ts` | **Modify.** Pass alias config from `config` to `processDocument()` call |
| `packages/core/src/ai/reprocess.ts` | **Modify.** Pass alias config from `config` to `processDocument()` call |
| `packages/core/src/index.ts` | **Modify.** Export `DEFAULT_TAG_ALIAS_MAP` and `validateTagAliasYaml` |
| `packages/core/src/ai/__tests__/tag-alias-validation.test.ts` | **Create.** Tests for YAML validation |
| `packages/core/src/ai/__tests__/prompt.test.ts` | **Modify.** Add tests for `{{tag_aliases}}` resolution |
| `packages/web/src/routes/settings/+page.server.ts` | **Modify.** Add `isDefaultTagAliasMap` computation |
| `packages/web/src/routes/api/v1/ai/config/+server.ts` | **Modify.** Add server-side YAML validation in PUT handler |
| `packages/web/src/routes/settings/+page.svelte` | **Modify.** Add toggle, textarea, diff warning, revert, client-side validation |

---

### Task 1: Install `yaml` dependency

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Install yaml package**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core add yaml
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core exec -- node -e "require('yaml'); console.log('yaml loaded')"
```

Expected: `yaml loaded`

- [ ] **Step 3: Commit**

```bash
git add packages/core/package.json pnpm-lock.yaml && git commit -m "chore: add yaml dependency to core package"
```

---

### Task 2: Create the default tag alias map constant

**Files:**
- Create: `packages/core/src/ai/tag-alias-defaults.ts`

- [ ] **Step 1: Create the default alias map file**

Create `packages/core/src/ai/tag-alias-defaults.ts` with the full default YAML string. The content is the aliases section from the spec — each key is a canonical tag name, each value is an array of alias strings.

```typescript
/**
 * Default tag alias map — YAML string mapping canonical tag names to their aliases.
 * Users can customise this in the settings page.
 */
export const DEFAULT_TAG_ALIAS_MAP = `uk:
  - united-kingdom
  - united kingdom
  - great-britain
  - great britain
  - britain
  - british
  - uk-based
  - uk-wide
  - england
  - scotland
  - wales
  - northern-ireland

eu:
  - european-union
  - european union
  - europe
  - eu-wide
  - eea

domestic:
  - local
  - in-country
  - national
  - uk-domestic

international:
  - overseas
  - foreign
  - cross-border
  - worldwide
  - global
  - non-uk

action-required:
  - action required
  - needs-action
  - to-do
  - todo
  - requires-action
  - outstanding-action

active:
  - current
  - live
  - in-force
  - open
  - ongoing

pending:
  - awaiting
  - in-progress
  - in progress
  - processing
  - under-review
  - under review

cancelled:
  - canceled
  - void
  - withdrawn
  - terminated
  - called-off

completed:
  - complete
  - finished
  - closed
  - resolved
  - done

paid:
  - settled
  - payment-made
  - paid-in-full
  - payment received

unpaid:
  - outstanding
  - not-paid
  - unpaid-balance
  - balance-due

overdue:
  - late
  - past-due
  - delinquent
  - missed-deadline

renewal:
  - renew
  - renewing
  - extension
  - continuation
  - auto-renew

follow-up:
  - follow up
  - callback
  - chase
  - chasing
  - revisit

annual:
  - yearly
  - once-a-year
  - yearly-renewal

monthly:
  - every-month
  - recurring-monthly
  - per-month

travel:
  - trip
  - trips
  - travelling
  - traveling
  - holiday
  - holidays
  - vacation
  - vacations
  - tourism

business-trip:
  - work-trip
  - work travel
  - corporate-travel
  - business travel

accommodation:
  - lodging
  - lodging-booking
  - stay
  - stays
  - overnight-stay

booking:
  - reservation
  - reserved
  - booked
  - pre-booking
  - booking-reference

itinerary:
  - travel-plan
  - travel-plans
  - schedule
  - route-plan
  - trip-plan

airport:
  - terminal
  - airside
  - landside
  - airport-services

airport-transfer:
  - transfer
  - shuttle
  - taxi-transfer
  - pickup
  - dropoff
  - drop-off

flight:
  - airline
  - airfare
  - boarding
  - boarding-pass
  - passenger-flight

hotel:
  - hostel
  - resort
  - inn
  - guesthouse
  - serviced-apartment

parking:
  - car-park
  - car park
  - parking-fee
  - parking-charge

parking-permit:
  - resident-permit
  - parking-pass
  - permit
  - permit-parking

transportation:
  - transport
  - transit
  - public-transport
  - public transport
  - rail
  - train
  - coach
  - bus
  - taxi
  - commute

visa:
  - entry-visa
  - travel-visa
  - work-visa
  - residence-visa
  - visa-application

immigration:
  - border-control
  - residency
  - residence
  - immigration-status
  - immigration-case

property:
  - home
  - house
  - flat
  - apartment
  - real-estate
  - real estate
  - premises
  - dwelling

home-improvement:
  - diy
  - renovation
  - renovations
  - refurb
  - refurbishment
  - remodeling
  - remodelling
  - building-work

utilities:
  - utility
  - utility-bill
  - utility-bills
  - household-services
  - utility-services

internet-services:
  - broadband
  - fibre
  - fiber
  - isp
  - internet
  - internet-access
  - internet-service

electricity:
  - electric
  - power
  - electric-supply
  - electricity-supply
  - electric-bill

gas:
  - gas-supply
  - gas-bill
  - gas-service
  - gas-meter

water:
  - water-supply
  - water-bill
  - sewerage
  - wastewater

heating:
  - boiler
  - radiator
  - central-heating
  - heat
  - heat-pump

plumbing:
  - plumber
  - pipework
  - drains
  - drainage
  - leak

electrical:
  - electrician
  - wiring
  - fuse-board
  - consumer-unit
  - electrics

waste:
  - refuse
  - rubbish
  - bin-collection
  - recycling
  - disposal

cleaning-services:
  - cleaner
  - cleaning
  - housekeeping
  - domestic-cleaning
  - janitorial

installation:
  - install
  - setup
  - fitting
  - commissioning
  - install-service

maintenance:
  - upkeep
  - preventive-maintenance
  - routine-maintenance
  - servicing
  - maintenance-service

repair:
  - fix
  - fault-repair
  - remedial-work
  - mend
  - repair-service

safety:
  - hse
  - safe
  - hazard
  - risk-control
  - health-and-safety

security:
  - secure
  - protection
  - premises-security
  - guarding
  - home-security

surveillance:
  - cctv
  - camera
  - monitoring-camera
  - video-surveillance
  - security-camera

smart-home:
  - smart
  - iot
  - home-automation
  - connected-home
  - smart-device

automotive:
  - motoring
  - transport-vehicle
  - car-related
  - auto

vehicle:
  - car
  - van
  - motorcycle
  - motorbike
  - scooter
  - vehicle-owner

registration:
  - registered
  - registration-number
  - registration-doc
  - dvla
  - logbook

insurance:
  - cover
  - insured
  - insurer
  - policy-cover
  - policy-insurance

service:
  - servicing
  - routine-service
  - customer-service
  - field-service

vehicle-health-check:
  - vehicle inspection
  - vehicle-inspection
  - health-check
  - car-check
  - mot-check
  - safety-check

medical:
  - healthcare
  - clinical
  - health
  - treatment
  - patient-care

hospital:
  - clinic
  - inpatient
  - outpatient
  - ward
  - hospital-care

surgery:
  - operation
  - surgical
  - procedure
  - theatre
  - post-op

pharmacy:
  - chemist
  - dispensing
  - medication-supply
  - prescriptions
  - pharmaceutical

prescription-medication:
  - prescription
  - prescribed-medication
  - medicine
  - medication
  - rx
  - repeat-prescription

health-screening:
  - screening-programme
  - health-check
  - routine-screening
  - preventive-screening

screening:
  - test
  - diagnostic-screening
  - assessment-screening
  - medical-test

swab-test:
  - swab
  - pcr
  - lateral-flow
  - sample-test
  - specimen-test

fit-note:
  - sick-note
  - doctors-note
  - doctor's note
  - medical-note
  - statement-of-fitness

sick-leave:
  - sickness-absence
  - medical-leave
  - off-sick
  - sick-pay
  - illness-leave

therapy:
  - counselling
  - counseling
  - physiotherapy
  - psychotherapy
  - rehabilitation

dental:
  - dentist
  - dentistry
  - orthodontics
  - hygienist

optician:
  - optics
  - optical
  - ophthalmology
  - eye-care
  - eye test

care:
  - support-care
  - social-care
  - personal-care
  - care-plan

disability:
  - disabled
  - accessibility
  - accommodation-adjustment
  - reasonable-adjustment
  - impairment-support

employment:
  - job
  - work
  - employee
  - employer
  - hr
  - human-resources

salary:
  - wage
  - wages
  - pay
  - compensation
  - remuneration

payroll:
  - payslip
  - payslips
  - payroll-run
  - payroll-processing

pension:
  - retirement-plan
  - retirement-scheme
  - workplace-pension
  - pension-contribution

retirement:
  - retired
  - pension-retirement
  - retirement-planning
  - retirement-benefits

benefits:
  - perk
  - perks
  - employee-benefits
  - allowance
  - entitlements

leave:
  - annual-leave
  - holiday-leave
  - paid-leave
  - time-off
  - leave-request

maternity:
  - paternity
  - parental-leave
  - adoption-leave
  - family-leave
  - maternity-leave

redundancy:
  - layoff
  - lay-off
  - severance
  - role-redundancy
  - redundancy-pay

contractor:
  - freelance
  - freelancer
  - contract-worker
  - external-resource
  - contingent-worker

consultancy:
  - consulting
  - advisory
  - consulting-services
  - advisor
  - consultant

professional-services:
  - profserv
  - professional service
  - services-engagement
  - client-services

training:
  - learning
  - upskilling
  - workshop
  - course
  - enablement

onboarding:
  - induction
  - starter
  - new-joiner
  - employee-onboarding
  - joiner-process

work-authorisation:
  - right-to-work
  - work-permit
  - employment-eligibility
  - work-eligibility
  - labour-authorisation

timesheet:
  - time-sheet
  - time-log
  - hours-worked
  - billable-hours
  - time-entry

finance:
  - financial
  - money
  - accounts
  - financial-management
  - fiscal

banking:
  - bank
  - bank-account
  - current-account
  - savings-account
  - banking-services

billing:
  - invoice
  - invoicing
  - bill
  - bills
  - charge
  - charges

payment:
  - payment-made
  - payment-due
  - remittance
  - paid-amount
  - transaction

pricing:
  - price
  - prices
  - tariff
  - quote-pricing
  - costing

direct-debit:
  - direct debit
  - autopay
  - auto-pay
  - auto-collection
  - mandate

instalment-plan:
  - installment-plan
  - instalments
  - installments
  - payment-by-instalments
  - split-payments

payment-plan:
  - repayment-plan
  - structured-payments
  - payment-arrangement
  - agreed-payments

payment-schedule:
  - repayment-schedule
  - billing-schedule
  - collection-schedule
  - due-dates

payment-confirmation:
  - payment-receipt
  - proof-of-payment
  - payment-proof
  - paid-confirmation
  - remittance-advice

credit-card:
  - card
  - debit-card
  - charge-card
  - mastercard
  - visa-card
  - amex

tax:
  - taxation
  - tax-related
  - fiscal-tax
  - tax-charge

vat:
  - value-added-tax
  - value added tax
  - sales-tax
  - indirect-tax

self-assessment:
  - self assessment
  - tax-return
  - self-assessment-tax-return
  - personal-tax-return

investment:
  - investing
  - portfolio
  - securities
  - shares
  - funds
  - equities

mortgage:
  - home-loan
  - house-loan
  - remortgage
  - mortgage-offer
  - mortgage-application

loan:
  - lending
  - borrowing
  - personal-loan
  - secured-loan
  - credit-facility

reimbursement:
  - expense-claim
  - expenses-repaid
  - refund-to-employee
  - repay-expense

refund:
  - refunded
  - money-back
  - rebate-refund
  - return-refund

debt:
  - arrears
  - outstanding-balance
  - monies-owed
  - unpaid-debt

debt-collection:
  - collections
  - debt-recovery
  - recovery-agency
  - collections-agency
  - arrears-collection

interest:
  - apr
  - rate
  - interest-rate
  - finance-charge
  - accrued-interest

expense:
  - spend
  - expenditure
  - claimable-expense
  - expense-item
  - business-expense

budgeting:
  - budget
  - forecast
  - financial-plan
  - spending-plan
  - allocation

voucher:
  - coupon
  - promo-code
  - promocode
  - discount-code
  - gift-voucher
  - gift-card

reverse-charge:
  - vat-reverse-charge
  - reverse charge
  - domestic-reverse-charge
  - reverse-charge-vat

legal:
  - law
  - legal-matter
  - legal-advice
  - legal-review

solicitors:
  - solicitor
  - lawyer
  - attorney
  - legal-representative
  - law-firm

legal-claim:
  - claim
  - compensation-claim
  - injury-claim
  - damages-claim
  - civil-claim

litigation:
  - lawsuit
  - court-case
  - court-proceedings
  - legal-action
  - proceedings

dispute:
  - complaint-dispute
  - contested
  - disagreement
  - challenge
  - contested-charge

settlement:
  - settled-claim
  - settlement-offer
  - compromise
  - settlement-agreement

claim-authorisation:
  - claim approval
  - authorisation
  - authorization
  - pre-authorisation
  - preapproval
  - claim-approval

no-win-no-fee:
  - no win no fee
  - cfa
  - success-fee-case
  - conditional-fee-no-win-no-fee

conditional-fee:
  - conditional fee
  - cfa-agreement
  - success-fee
  - fee-agreement

gdpr:
  - data-protection
  - general-data-protection-regulation
  - privacy-regulation
  - data-privacy

privacy:
  - confidential
  - confidentiality
  - personal-data
  - privacy-notice
  - privacy-policy

data-breach:
  - breach
  - security-breach
  - privacy-breach
  - incident-breach
  - information-breach

compliance:
  - compliant
  - controls
  - adherence
  - obligations
  - compliance-review

regulatory:
  - regulation
  - regulator
  - regulated
  - statutory
  - statutory-compliance

due-diligence:
  - diligence
  - background-check
  - verification-check
  - assessment
  - vendor-diligence

liability:
  - legal-liability
  - responsibility
  - exposure
  - legal-exposure

indemnity:
  - indemnification
  - indemnify
  - hold-harmless
  - professional-indemnity

consumer-rights:
  - consumer-law
  - statutory-rights
  - buyer-protection
  - consumer-protection

policy:
  - policy-document
  - policy-doc
  - internal-policy
  - standard
  - guidance-policy

government:
  - gov
  - govt
  - public-sector
  - public sector
  - state
  - authorities

hmrc:
  - revenue-and-customs
  - her-majestys-revenue-and-customs
  - hm revenue & customs
  - tax-authority

nhs:
  - national-health-service
  - nhs-england
  - nhs trust
  - nhs-hospital

council:
  - local-council
  - borough-council
  - district-council
  - council-services
  - municipal

council-tax:
  - local-tax
  - property-tax
  - municipal-tax
  - rates

local-government:
  - local-authority
  - municipality
  - borough
  - district
  - county-council

citizenship:
  - nationality
  - naturalisation
  - naturalization
  - citizenship-application
  - passport-status

it:
  - information-technology
  - tech
  - it-services
  - digital
  - information systems

software:
  - application
  - app
  - saas
  - programme
  - program
  - platform

hardware:
  - device
  - equipment
  - appliance-tech
  - physical-device
  - computer-hardware

electronics:
  - electronic
  - gadget
  - tech-device
  - consumer-electronics

cloud-services:
  - cloud
  - hosted-service
  - hosted-platform
  - cloud-platform
  - managed-service

storage:
  - archive-storage
  - disk
  - drive
  - object-storage
  - file-storage

monitoring:
  - observability
  - alerting
  - telemetry
  - supervision
  - system-monitoring

infrastructure:
  - infra
  - platform-infrastructure
  - foundational-services
  - environment

networking:
  - network
  - lan
  - wan
  - routing
  - switching
  - network-services

wifi:
  - wireless
  - wlan
  - wireless-network
  - access-point

server:
  - host
  - node
  - machine
  - server-host
  - compute-node

hosting:
  - web-hosting
  - managed-hosting
  - host-provider
  - colocation
  - colo

domain:
  - fqdn
  - domain-name
  - dns-name
  - hostname-domain

dns:
  - domain-name-system
  - name-resolution
  - nameserver
  - dns-records

dmarc:
  - email-authentication
  - domain-based-message-authentication
  - dkim-spf-dmarc
  - anti-spoofing

ssl:
  - tls
  - certificate
  - cert
  - x509
  - encryption-certificate

kubernetes:
  - k8s
  - cluster
  - orchestration
  - container-platform

automation:
  - automated
  - workflow-automation
  - scripting
  - orchestration
  - runbook-automation

deployment:
  - deploy
  - release
  - rollout
  - go-live
  - provisioning

migration:
  - move
  - transfer
  - cutover
  - transition
  - platform-migration

configuration:
  - config
  - settings
  - parameterisation
  - configuration-management
  - setup-config

cybersecurity:
  - cyber
  - infosec
  - information-security
  - cyber-security
  - security-operations

authentication:
  - authn
  - login
  - sign-in
  - identity-verification
  - mfa
  - 2fa

authorisation:
  - authorization
  - authz
  - permissions
  - access-rights
  - entitlements

access-control:
  - access-management
  - identity-access-management
  - iam
  - role-based-access
  - rbac

backup:
  - backups
  - snapshot
  - copy
  - backup-policy
  - data-protection-copy

recovery:
  - restore
  - disaster-recovery
  - dr
  - failover
  - business-continuity

troubleshooting:
  - diagnostics
  - triage
  - debug
  - fault-finding
  - root-cause

update:
  - patch
  - changes
  - revision
  - refresh
  - minor-update

upgrade:
  - major-upgrade
  - uplift
  - version-upgrade
  - enhancement
  - replacement-upgrade

licensing:
  - licence
  - license
  - entitlement
  - software-license
  - product-license

mobile:
  - smartphone
  - tablet
  - cellular
  - handset
  - mobile-device

analytics:
  - analysis
  - dashboard
  - metrics
  - reporting-analytics
  - insight

vendor:
  - provider
  - partner
  - third-party
  - third party
  - external-vendor

supplier:
  - supplier-account
  - supply-partner
  - supplier-management
  - supplier-record

procurement:
  - purchasing
  - sourcing
  - acquisition
  - buying
  - vendor-selection

purchase:
  - bought
  - order
  - procurement-purchase
  - purchase-order
  - shopping

shipping:
  - shipment
  - freight
  - dispatch
  - postage
  - courier

delivery:
  - delivered
  - fulfillment
  - fulfilment
  - drop-off
  - receipt-of-goods

returns:
  - return
  - rma
  - sent-back
  - reverse-logistics
  - returned-item

replacement:
  - exchange
  - swap
  - substitute
  - replacement-item

warranty:
  - guarantee
  - extended-warranty
  - manufacturer-warranty
  - protection-plan
  - care-plan
  - applecare
  - applecare-plus

support:
  - helpdesk
  - ticket
  - assistance
  - technical-support
  - customer-support

subscription:
  - recurring
  - plan
  - membership
  - subscription-renewal
  - recurring-service

project:
  - programme
  - initiative
  - workstream
  - implementation
  - delivery-project

operations:
  - ops
  - day-to-day
  - operational
  - run
  - business-operations

management:
  - administration
  - admin
  - oversight
  - control
  - coordination

incident:
  - issue
  - problem
  - event
  - outage-event
  - ticketed-incident

incident-response:
  - ir
  - response
  - containment
  - remediation
  - emergency-response

outage:
  - downtime
  - interruption
  - service-down
  - unavailable
  - service-disruption

escalation:
  - escalate
  - raised-priority
  - senior-review
  - urgent-escalation

change-management:
  - change
  - change-control
  - cab
  - approved-change
  - operational-change

governance:
  - oversight-governance
  - steering
  - control-framework
  - board-review
  - decision-making

audit:
  - audited
  - audit-trail
  - assurance
  - review-audit
  - control-audit

reporting:
  - report
  - status-report
  - summary
  - reporting-pack
  - management-report

research:
  - analysis-research
  - investigation
  - study
  - exploration
  - findings

conference:
  - event
  - summit
  - convention
  - expo
  - meetup

strategy:
  - strategic
  - roadmap
  - plan
  - planning
  - direction

quality:
  - qa
  - quality-assurance
  - standard-of-service
  - verification
  - acceptance

risk:
  - risks
  - risk-assessment
  - exposure-risk
  - risk-register
  - control-risk

evidence:
  - proof
  - supporting-evidence
  - attachment-evidence
  - corroboration
  - substantiation

family:
  - household
  - relatives
  - personal-family
  - dependants
  - dependents

childcare:
  - nursery
  - child-care
  - childminder
  - childminding
  - daycare

children:
  - child
  - kids
  - dependants-children
  - dependent-children

donor:
  - donation
  - giving
  - donor-services
  - charity-giving

funeral:
  - memorial
  - burial
  - cremation
  - end-of-life
  - funeral-services

bereavement:
  - grief
  - condolence
  - loss
  - bereavement-leave
  - next-of-kin

welfare:
  - support-benefit
  - social-support
  - assistance-payment
  - welfare-support

meals:
  - food
  - dining
  - catering
  - subsistence
  - meal-expense

restaurant:
  - dining-out
  - eatery
  - restaurant-booking
  - food-venue

education:
  - learning
  - academic
  - study
  - education-services
  - higher-education

school:
  - college
  - university
  - academy
  - educational-institution

certification:
  - certified
  - qualification
  - credential
  - certificate
  - exam-pass

accreditation:
  - accredited
  - accreditation-status
  - approved-standard
  - endorsed

examination:
  - exam
  - assessment
  - test
  - evaluation
  - exam-result`;
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core exec -- npx tsc --noEmit packages/core/src/ai/tag-alias-defaults.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/ai/tag-alias-defaults.ts && git commit -m "feat(ai): add default tag alias map constant"
```

---

### Task 3: Create YAML validation utility with tests

**Files:**
- Create: `packages/core/src/ai/tag-alias-validation.ts`
- Create: `packages/core/src/ai/__tests__/tag-alias-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/ai/__tests__/tag-alias-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateTagAliasYaml } from '../tag-alias-validation.js';

describe('validateTagAliasYaml', () => {
  it('accepts valid alias map', () => {
    const yaml = `nhs:\n  - national-health-service\n  - nhs-england\ncouncil:\n  - local-council`;
    const result = validateTagAliasYaml(yaml);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts empty string as valid (no aliases)', () => {
    const result = validateTagAliasYaml('');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid YAML syntax', () => {
    const result = validateTagAliasYaml('nhs:\n  - [invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects non-object YAML (e.g. a plain string)', () => {
    const result = validateTagAliasYaml('just a string');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a mapping');
  });

  it('rejects non-object YAML (e.g. an array)', () => {
    const result = validateTagAliasYaml('- item1\n- item2');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a mapping');
  });

  it('rejects keys that map to non-array values', () => {
    const result = validateTagAliasYaml('nhs: just-a-string');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('nhs');
    expect(result.error).toContain('array');
  });

  it('rejects arrays containing non-string items', () => {
    const result = validateTagAliasYaml('nhs:\n  - 123\n  - true');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('nhs');
    expect(result.error).toContain('strings');
  });

  it('accepts an alias map with many entries', () => {
    const yaml = Array.from({ length: 50 }, (_, i) => `tag-${i}:\n  - alias-${i}-a\n  - alias-${i}-b`).join('\n');
    const result = validateTagAliasYaml(yaml);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core test -- --run src/ai/__tests__/tag-alias-validation.test.ts
```

Expected: FAIL — `validateTagAliasYaml` does not exist yet

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/ai/tag-alias-validation.ts`:

```typescript
import { parse } from 'yaml';

export interface TagAliasValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a YAML string as a tag alias map.
 * Expected shape: Record<string, string[]> — each key is a canonical tag,
 * each value is an array of alias strings.
 */
export function validateTagAliasYaml(yaml: string): TagAliasValidationResult {
  if (yaml.trim() === '') {
    return { valid: true };
  }

  let parsed: unknown;
  try {
    parsed = parse(yaml);
  } catch (e) {
    return { valid: false, error: `Invalid YAML syntax: ${(e as Error).message}` };
  }

  if (parsed === null || parsed === undefined) {
    return { valid: true };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'Tag alias map must be a mapping of tag names to alias lists' };
  }

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      return { valid: false, error: `"${key}" must map to an array of aliases` };
    }
    if (!value.every((item) => typeof item === 'string')) {
      return { valid: false, error: `"${key}" aliases must all be strings` };
    }
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core test -- --run src/ai/__tests__/tag-alias-validation.test.ts
```

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/tag-alias-validation.ts packages/core/src/ai/__tests__/tag-alias-validation.test.ts && git commit -m "feat(ai): add tag alias YAML validation utility with tests"
```

---

### Task 4: Add config fields to `aiConfigSchema`

**Files:**
- Modify: `packages/core/src/ai/types.ts:115-161`
- Modify: `packages/core/src/ai/config.ts:7-50`

- [ ] **Step 1: Add schema fields to `types.ts`**

In `packages/core/src/ai/types.ts`, add the import and two new fields to `aiConfigSchema`:

Add import at top:
```typescript
import { DEFAULT_TAG_ALIAS_MAP } from './tag-alias-defaults.js';
```

Add these two fields inside the `z.object({...})` in `aiConfigSchema`, after the `protectedTagNames` field (line 150):

```typescript
  // Tag alias mapping — normalise LLM tag suggestions via canonical→alias YAML map
  tagAliasesEnabled: z.boolean().default(false),
  tagAliasMap: z.string().default(DEFAULT_TAG_ALIAS_MAP),
```

- [ ] **Step 2: Update `config.ts` to handle the new boolean**

In `packages/core/src/ai/config.ts`, add `'tagAliasesEnabled'` to the boolean parse list in `parseConfigValue()` (add it after `shortKey === 'flexProcessing'` on line 28):

```typescript
    shortKey === 'tagAliasesEnabled' ||
```

And add `'tagAliasMap'` to the string exclusion list for the numeric parser (line 45, after `'reasoningEffort'`):

```typescript
    shortKey !== 'tagAliasMap' &&
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core check
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/ai/types.ts packages/core/src/ai/config.ts && git commit -m "feat(ai): add tagAliasesEnabled and tagAliasMap config fields"
```

---

### Task 5: Update `buildPromptParts()` and add tests

**Files:**
- Modify: `packages/core/src/ai/prompt.ts:1-66`
- Modify: `packages/core/src/ai/__tests__/prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to `packages/core/src/ai/__tests__/prompt.test.ts`, inside the existing `describe('buildPromptParts', ...)` block. Update `baseOptions` to include the new fields:

Add to `baseOptions`:
```typescript
    tagAliasesEnabled: false,
    tagAliasMap: '',
```

Add new test cases after the existing ones:

```typescript
  it('injects tag alias map when enabled', () => {
    const aliasYaml = 'nhs:\n  - national-health-service';
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      promptTemplate: 'Tags: {{existing_tags}}\n\n{{tag_aliases}}',
      tagAliasesEnabled: true,
      tagAliasMap: aliasYaml,
    });
    expect(systemPrompt).toContain('<alias_map>');
    expect(systemPrompt).toContain('nhs:');
    expect(systemPrompt).toContain('national-health-service');
    expect(systemPrompt).toContain('</alias_map>');
  });

  it('injects disabled message when tag aliases are off', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      promptTemplate: '{{tag_aliases}}',
      tagAliasesEnabled: false,
      tagAliasMap: 'nhs:\n  - national-health-service',
    });
    expect(systemPrompt).toContain('No tag alias mappings are configured.');
    expect(systemPrompt).not.toContain('<alias_map>');
  });

  it('leaves prompt unchanged when no {{tag_aliases}} placeholder exists', () => {
    const { systemPrompt } = buildPromptParts({
      ...baseOptions,
      promptTemplate: 'No placeholder here',
      tagAliasesEnabled: true,
      tagAliasMap: 'nhs:\n  - national-health-service',
    });
    expect(systemPrompt).toBe('No placeholder here');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core test -- --run src/ai/__tests__/prompt.test.ts
```

Expected: FAIL — `tagAliasesEnabled` not in `BuildPromptOptions`

- [ ] **Step 3: Update `prompt.ts`**

In `packages/core/src/ai/prompt.ts`:

Add two new fields to `BuildPromptOptions` interface (after `includeTags`):

```typescript
  tagAliasesEnabled: boolean;
  tagAliasMap: string;
```

In `buildPromptParts()`, destructure the new fields:

```typescript
  const {
    promptTemplate,
    documentTitle,
    documentContent,
    existingCorrespondents,
    existingDocumentTypes,
    existingTags,
    includeCorrespondents,
    includeDocumentTypes,
    includeTags,
    tagAliasesEnabled,
    tagAliasMap,
  } = options;
```

Build the alias block before the `systemPrompt` assignment:

```typescript
  const tagAliasBlock = tagAliasesEnabled
    ? `Tag Alias Map:\n<alias_map>\n${tagAliasMap}\n</alias_map>`
    : 'No tag alias mappings are configured.';
```

Add `.replace('{{tag_aliases}}', tagAliasBlock)` to the `systemPrompt` chain (after the `{{existing_tags}}` replace):

```typescript
  const systemPrompt = promptTemplate
    .replace('{{existing_correspondents}}', correspondentList)
    .replace('{{existing_document_types}}', documentTypeList)
    .replace('{{existing_tags}}', tagList)
    .replace('{{tag_aliases}}', tagAliasBlock)
    .trim();
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core test -- --run src/ai/__tests__/prompt.test.ts
```

Expected: All tests PASS (including the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/prompt.ts packages/core/src/ai/__tests__/prompt.test.ts && git commit -m "feat(ai): resolve {{tag_aliases}} placeholder in buildPromptParts"
```

---

### Task 6: Update `DEFAULT_EXTRACTION_PROMPT` with alias placeholder

**Files:**
- Modify: `packages/core/src/ai/types.ts:5-107`

- [ ] **Step 1: Add the `{{tag_aliases}}` placeholder to the default prompt**

In `packages/core/src/ai/types.ts`, in the `DEFAULT_EXTRACTION_PROMPT` string, add the following after the existing Tags rules (after line 43, the line ending with `"tax-2024", "insurance", "medical", "home-improvement").`):

```
  - When suggesting tags, consult the alias map below. If a tag you would suggest appears as an alias (listed under a key), use the key instead.

{{tag_aliases}}
```

This goes between the Tags rules and the "Rules" section. The exact location is after the line:

```
  - You may return up to 5 tags only when no suitable existing tag covers a clear, document-specific concept. Tags must be concise, lowercase, and hyphenated (e.g., "tax-2024", "insurance", "medical", "home-improvement").
```

And before the line:

```
Rules
```

- [ ] **Step 2: Verify it compiles and existing tests still pass**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core check && pnpm --filter @paperless-dedupe/core test -- --run
```

Expected: No compile errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/ai/types.ts && git commit -m "feat(ai): add tag_aliases placeholder to default extraction prompt"
```

---

### Task 7: Thread alias config through `processDocument` and callers

**Files:**
- Modify: `packages/core/src/ai/extract.ts:7-37`
- Modify: `packages/core/src/ai/batch.ts:270-286`
- Modify: `packages/core/src/ai/reprocess.ts:91-104`

- [ ] **Step 1: Update `ProcessDocumentOptions` in `extract.ts`**

Add two new fields to the `ProcessDocumentOptions` interface in `extract.ts` (after `includeTags`):

```typescript
  tagAliasesEnabled: boolean;
  tagAliasMap: string;
```

Pass them through to `buildPromptParts` in the `processDocument` function:

```typescript
  const { systemPrompt, userPrompt } = buildPromptParts({
    promptTemplate: options.promptTemplate,
    documentTitle: options.documentTitle,
    documentContent: truncatedContent,
    existingCorrespondents: options.existingCorrespondents,
    existingDocumentTypes: options.existingDocumentTypes,
    existingTags: options.existingTags,
    includeCorrespondents: options.includeCorrespondents,
    includeDocumentTypes: options.includeDocumentTypes,
    includeTags: options.includeTags,
    tagAliasesEnabled: options.tagAliasesEnabled,
    tagAliasMap: options.tagAliasMap,
  });
```

- [ ] **Step 2: Update `batch.ts` call site**

In `packages/core/src/ai/batch.ts`, in the `processOne` function (around line 273), add the two new fields to the `processDocument()` call:

```typescript
            const extraction = await processDocument({
              provider,
              documentTitle: doc.title,
              documentContent: doc.fullText!,
              existingCorrespondents: correspondentNames,
              existingDocumentTypes: documentTypeNames,
              existingTags: tagNames,
              promptTemplate: config.promptTemplate,
              maxContentLength: config.maxContentLength,
              includeCorrespondents: config.includeCorrespondents,
              includeDocumentTypes: config.includeDocumentTypes,
              includeTags: config.includeTags,
              reasoningEffort: config.reasoningEffort,
              tagAliasesEnabled: config.tagAliasesEnabled,
              tagAliasMap: config.tagAliasMap,
            });
```

- [ ] **Step 3: Update `reprocess.ts` call site**

In `packages/core/src/ai/reprocess.ts`, in the `reprocessSingleResult` function (around line 91), add the two new fields to the `processDocument()` call:

```typescript
    extraction = await processDocument({
      provider,
      documentTitle: doc.title,
      documentContent: content.fullText,
      existingCorrespondents: correspondentNames,
      existingDocumentTypes: documentTypeNames,
      existingTags: tagNames,
      promptTemplate: config.promptTemplate,
      maxContentLength: config.maxContentLength,
      includeCorrespondents: config.includeCorrespondents,
      includeDocumentTypes: config.includeDocumentTypes,
      includeTags: config.includeTags,
      reasoningEffort: config.reasoningEffort,
      tagAliasesEnabled: config.tagAliasesEnabled,
      tagAliasMap: config.tagAliasMap,
    });
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm --filter @paperless-dedupe/core check
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/extract.ts packages/core/src/ai/batch.ts packages/core/src/ai/reprocess.ts && git commit -m "feat(ai): thread tag alias config through processDocument and callers"
```

---

### Task 8: Export new symbols from `index.ts`

**Files:**
- Modify: `packages/core/src/index.ts:263-269`

- [ ] **Step 1: Add exports**

In `packages/core/src/index.ts`, update the AI exports section.

Add `DEFAULT_TAG_ALIAS_MAP` to the existing `from './ai/types.js'` export (line 265):

```typescript
export {
  aiConfigSchema,
  DEFAULT_EXTRACTION_PROMPT,
  DEFAULT_TAG_ALIAS_MAP,
  DEFAULT_AI_CONFIG,
  OPENAI_MODELS,
  AI_CONFIG_PREFIX,
} from './ai/types.js';
```

Wait — `DEFAULT_TAG_ALIAS_MAP` is in `tag-alias-defaults.ts`, not `types.ts`. But `types.ts` imports it. We need to re-export it. Since `types.ts` already imports `DEFAULT_TAG_ALIAS_MAP`, we have two options: re-export from types or add a separate export line. The cleaner approach is to add a separate export:

```typescript
export { DEFAULT_TAG_ALIAS_MAP } from './ai/tag-alias-defaults.js';
export { validateTagAliasYaml } from './ai/tag-alias-validation.js';
export type { TagAliasValidationResult } from './ai/tag-alias-validation.js';
```

Add these lines after the existing `from './ai/types.js'` exports block.

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm check
```

Expected: No errors across both packages

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts && git commit -m "feat(ai): export DEFAULT_TAG_ALIAS_MAP and validateTagAliasYaml from core"
```

---

### Task 9: Add server-side YAML validation to AI config API

**Files:**
- Modify: `packages/web/src/routes/api/v1/ai/config/+server.ts`

- [ ] **Step 1: Add validation to the PUT handler**

Update `packages/web/src/routes/api/v1/ai/config/+server.ts`:

```typescript
import { apiSuccess, apiError, ErrorCode } from '$lib/server/api';
import { getAiConfig, setAiConfig, aiConfigSchema, validateTagAliasYaml } from '@paperless-dedupe/core';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }
  const config = getAiConfig(locals.db);
  return apiSuccess(config);
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  if (!locals.config.AI_ENABLED) {
    return apiError(ErrorCode.BAD_REQUEST, 'AI processing is not enabled');
  }

  const body = await request.json();
  const result = aiConfigSchema.partial().safeParse(body);

  if (!result.success) {
    return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid AI configuration', result.error.issues);
  }

  // Validate tag alias YAML if provided
  if (typeof result.data.tagAliasMap === 'string') {
    const aliasValidation = validateTagAliasYaml(result.data.tagAliasMap);
    if (!aliasValidation.valid) {
      return apiError(ErrorCode.VALIDATION_FAILED, `Invalid tag alias map: ${aliasValidation.error}`);
    }
  }

  const updated = setAiConfig(locals.db, result.data);
  return apiSuccess(updated);
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm check
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/api/v1/ai/config/+server.ts && git commit -m "feat(api): add server-side YAML validation for tag alias map"
```

---

### Task 10: Update settings page server load

**Files:**
- Modify: `packages/web/src/routes/settings/+page.server.ts`

- [ ] **Step 1: Add `isDefaultTagAliasMap` and import**

Update `packages/web/src/routes/settings/+page.server.ts`:

```typescript
import {
  getConfig,
  getDedupConfig,
  getDashboard,
  getAiConfig,
  getRagConfig,
  getRagStats,
  DEFAULT_EXTRACTION_PROMPT,
  DEFAULT_TAG_ALIAS_MAP,
} from '@paperless-dedupe/core';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const config = getConfig(locals.db);
  const dedupConfig = getDedupConfig(locals.db);
  const dashboard = getDashboard(locals.db);

  return {
    config,
    dedupConfig,
    system: {
      databaseUrl: locals.config.DATABASE_URL,
      paperlessUrl: locals.config.PAPERLESS_URL,
      totalDocuments: dashboard.totalDocuments,
      duplicateGroups: dashboard.pendingGroups,
    },
    aiEnabled: locals.config.AI_ENABLED,
    aiConfig: locals.config.AI_ENABLED ? getAiConfig(locals.db) : null,
    isDefaultPrompt: locals.config.AI_ENABLED
      ? getAiConfig(locals.db).promptTemplate === DEFAULT_EXTRACTION_PROMPT
      : true,
    isDefaultTagAliasMap: locals.config.AI_ENABLED
      ? getAiConfig(locals.db).tagAliasMap === DEFAULT_TAG_ALIAS_MAP
      : true,
    hasOpenAiKey: !!locals.config.AI_OPENAI_API_KEY,
    ragEnabled: locals.config.RAG_ENABLED,
    ragConfig: locals.config.RAG_ENABLED ? getRagConfig(locals.db) : null,
    ragStats: locals.config.RAG_ENABLED ? getRagStats(locals.db) : null,
  };
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm check
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/settings/+page.server.ts && git commit -m "feat(web): add isDefaultTagAliasMap to settings page data"
```

---

### Task 11: Add tag alias mapping UI to settings page

**Files:**
- Modify: `packages/web/src/routes/settings/+page.svelte`

This task adds the toggle, collapsible textarea, default-diff warning, revert button, and client-side YAML validation — mirroring the prompt template pattern.

- [ ] **Step 1: Add state variables**

In the `<script>` block of `+page.svelte`, add these state variables after the existing AI config states (after line 91, near `let showRevertResetPrompt`):

```typescript
  // Tag alias mapping
  let aiTagAliasesEnabled = $state(initialAiConfig?.tagAliasesEnabled ?? false);
  let aiTagAliasMap = $state(initialAiConfig?.tagAliasMap ?? '');
  let isDefaultTagAliasMap = $state(untrack(() => data.isDefaultTagAliasMap) ?? true);
  let showTagAliases = $state(false);
  let tagAliasValidationError = $state<string | null>(null);
  let showRevertResetTagAliases = $state(false);
```

- [ ] **Step 2: Add the import for `validateTagAliasYaml`**

The validation function runs in the browser, so we need to import it from core. Add to the existing import from `@paperless-dedupe/core` (this is not directly in the svelte file — it needs a dynamic import or direct import). Since core is available as a source dependency, add a top-level import. However, core's `validateTagAliasYaml` uses the `yaml` package which is a core dependency.

Add to the `<script>` block imports (this will work because the web package resolves core from source):

```typescript
  import { validateTagAliasYaml } from '@paperless-dedupe/core';
```

Note: If `@paperless-dedupe/core` isn't already imported in the svelte file, check — it's imported in `+page.server.ts` but for client code the import path should still work via the path alias. If there are issues, the validation can be inlined as a small function instead.

- [ ] **Step 3: Add tag alias fields to `saveAiConfig()`**

In the `saveAiConfig()` function, add these fields to the JSON body (after the `protectedTagNames` field):

```typescript
          tagAliasesEnabled: aiTagAliasesEnabled,
          tagAliasMap: aiTagAliasMap,
```

Also add client-side validation at the start of `saveAiConfig()`, before the `fetch` call:

```typescript
    // Validate tag alias YAML before saving
    if (aiTagAliasesEnabled && aiTagAliasMap.trim()) {
      const validation = validateTagAliasYaml(aiTagAliasMap);
      if (!validation.valid) {
        tagAliasValidationError = validation.error ?? 'Invalid YAML';
        isSavingAi = false;
        return;
      }
    }
    tagAliasValidationError = null;
```

- [ ] **Step 4: Add `revertTagAliases()` function**

Add this function after the existing `revertPrompt()` function:

```typescript
  async function revertTagAliases() {
    try {
      aiTagAliasMap = '';
      const saveRes = await fetch('/api/v1/ai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagAliasMap: undefined }),
      });
      if (saveRes.ok) {
        const freshRes = await fetch('/api/v1/ai/config');
        const freshJson = await freshRes.json();
        if (freshRes.ok) {
          aiTagAliasMap = freshJson.data?.tagAliasMap ?? '';
        }
        isDefaultTagAliasMap = true;
        showRevertResetTagAliases = true;
      }
    } catch {
      aiSaveStatus = { type: 'error', message: 'Failed to revert tag alias map' };
    }
  }
```

- [ ] **Step 5: Add the UI section**

In the template, add the tag alias mapping section after the Prompt Template section (after the `</div>` that closes the Prompt Template section, before the Reset Processing History section). Insert after the closing `</div>` on line 1137:

```svelte
      <!-- Tag Alias Mapping -->
      <div class="border-soft mt-6 border-t pt-4">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={aiTagAliasesEnabled} class="accent-accent h-4 w-4 rounded" />
            <span class="text-ink text-sm font-medium">Enable Tag Alias Mapping</span>
          </label>
        </div>
        <p class="text-muted mt-1 text-xs">
          Maps variant tag names to canonical tags in the LLM prompt. When enabled, the alias map is included in the system prompt to normalise tag suggestions.
        </p>

        {#if aiTagAliasesEnabled}
          <div class="mt-3">
            <button
              onclick={() => (showTagAliases = !showTagAliases)}
              class="text-accent hover:text-accent-hover text-sm font-medium"
            >
              {showTagAliases ? 'Hide' : 'Show'}
              {isDefaultTagAliasMap ? '' : 'Custom '}Tag Alias Map
            </button>
            {#if !isDefaultTagAliasMap && !showTagAliases}
              <p class="text-warn mt-1 text-xs">Differs from recommended default</p>
            {/if}
            {#if showTagAliases}
              <div class="mt-3 space-y-3">
                {#if !isDefaultTagAliasMap}
                  <div class="bg-warn-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm">
                    <AlertTriangle class="text-warn mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p>
                        Your tag alias map has been customised and differs from the latest recommended default.
                      </p>
                      <button
                        onclick={revertTagAliases}
                        class="text-accent hover:text-accent-hover mt-2 text-xs font-medium"
                      >
                        Revert to Default
                      </button>
                    </div>
                  </div>
                {/if}
                {#if showRevertResetTagAliases}
                  <div class="bg-success-light text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm">
                    <Check class="text-success mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p>
                        Tag alias map reverted to default. Reset processing history so documents can be reprocessed with the updated aliases?
                      </p>
                      <div class="mt-2 flex gap-2">
                        <button
                          onclick={async () => {
                            showRevertResetTagAliases = false;
                            await showResetConfirmation();
                          }}
                          class="text-accent hover:text-accent-hover text-xs font-medium"
                        >
                          Reset History
                        </button>
                        <button
                          onclick={() => {
                            showRevertResetTagAliases = false;
                            aiSaveStatus = { type: 'success', message: 'Tag alias map reverted to default' };
                          }}
                          class="text-muted hover:text-ink text-xs font-medium"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                {/if}
                <textarea
                  bind:value={aiTagAliasMap}
                  rows="16"
                  class="border-soft bg-surface text-ink focus:border-accent focus:ring-accent w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed focus:ring-1 focus:outline-none"
                  class:border-red-500={tagAliasValidationError}
                ></textarea>
                {#if tagAliasValidationError}
                  <p class="text-xs text-red-600">{tagAliasValidationError}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
```

- [ ] **Step 6: Verify it compiles**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm check
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/routes/settings/+page.svelte && git commit -m "feat(web): add tag alias mapping UI to settings page"
```

---

### Task 12: Full build and test verification

**Files:** None (verification only)

- [ ] **Step 1: Run full lint, format, type-check, and test suite**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm lint && pnpm format && pnpm check && pnpm test
```

Expected: All pass with zero errors

- [ ] **Step 2: Fix any issues found**

If lint/format issues appear, fix with:

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm lint:fix && pnpm format:fix
```

Then re-run the check.

- [ ] **Step 3: Run full build**

```bash
cd /Users/rob/repos/paperless-ngx-dedupe && pnpm build
```

Expected: Build completes successfully

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "chore: fix lint/format issues from tag alias mapping feature"
```
