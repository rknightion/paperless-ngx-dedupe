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
