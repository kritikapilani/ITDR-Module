---
name: Resilience Operations Core
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464555'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.1875rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1rem
  label-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1rem
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  code-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system serves enterprise IT Disaster Recovery (ITDR) workflows within business continuity management suites. Designed for Site Reliability Engineers, IT risk officers, and infrastructure leads, the aesthetic projects operational certainty, audit readiness, and technical rigor under high-stress recovery events.

The visual strategy merges Corporate Modern architecture with strict High-Density Data Minimalism:
- **Zero Decors:** Visual weight is strictly reserved for operational state indicators (RTO/RPO targets, sync health, failover orchestration logs).
- **Audit-Grade Clarity:** Data grids, drill-down panels, and telemetry widgets leverage structural horizontal lines, micro-radii, and precise typographic contrast to process thousands of server, cluster, and database dependencies without cognitive exhaustion.
- **Engineered Restraint:** Expressive color is restricted to actionable alerts and tier status metrics, ensuring incident commanders immediately identify SLA degradation.

## Colors

The palette establishes an immutable semantic system for enterprise IT resiliency:

- **Primary Accent (`#4F46E5`):** Reserved for primary operational actions (initiating failover, generating DR runbooks, applying filter models) and active navigation state indicators.
- **Secondary Accent (`#0F172A`):** The structural core anchor, applied to critical table headers, modal frames, and primary high-priority typography.
- **Surfaces & Canvases:** Base app shell renders in cool slate (`#F8FAFC`), while cards, data grids, and flyout inspector panels utilize pure white (`#FFFFFF`) with distinct 1px structural outlines (`#E2E8F0`).
- **SLA & Health State Tokens:**
  - *Met SLA / Healthy:* Surface `#ECFDF5`, Text `#065F46`, Border `#A7F3D0`. Used for synchronized replicas, validated snapshots, and met recovery point objectives.
  - *Warning / In-Review:* Surface `#FFFBEB`, Text `#92400E`, Border `#FDE68A`. Used for replication latency drifts, overdue tabletop simulations, and pending configuration approvals.
  - *Breach / Critical:* Surface `#FFF1F2`, Text `#9F1239`, Border `#FECDD3`. Used for failed health checks, active failover errors, and unrecoverable tier-0 system disruptions.

## Typography

Inter governs the typographic scale with disciplined optical adjustments tailored for maximum density and screen legibility:

- **Tabular Numerals:** All numeric data points (timestamps, latencies, byte sizes, recovery metrics) must enable `font-variant-numeric: tabular-nums` to guarantee vertical column alignment across dense lists.
- **Metric Micro-Headers:** Operational indicators, table column headers, and audit category flags utilize `label-sm` with uppercase casing and subtle letter-spacing (`0.04em`) to maintain sharp differentiation against standard field values.
- **Density Over Scale:** Display headers remain compact (topping out at `1.75rem`), prioritizing immediate viewport availability for infrastructure topology visualizers and dependency trees.

## Layout & Spacing

The layout model is anchored to a fluid 12-column grid utilizing a strict 4px base increment system configured for high information throughput:

- **Layout Grid:** A fluid 12-column infrastructure pane scales across desktop screens, featuring fixed 240px collapsable left navigation for continuity suites and context-sensitive 360px right drawers for incident drill-down.
- **Micro-Paddings:** Table cell height is fixed at a compact 36px (condensed) or 44px (standard), with `space-sm` (8px) vertical padding and `space-md` (12px) horizontal padding to minimize unnecessary vertical scrolling.
- **Responsive Adaptability:** On views narrower than 1280px, multi-column topology tables collapse non-essential SLA metrics into expandable row segments; side inspection sheets transition into high-z-index overlays.

## Elevation & Depth

Visual separation relies predominantly on sharp structural surface borders rather than drop shadows:

- **Flat Substrates:** Containers, splitters, panels, and data grids sit on level elevation planes bounded by clean 1px borders using `#E2E8F0`.
- **Micro-Shadow Base (`elevation-1`):** Applied exclusively to cards and static table shells: `box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05)`.
- **Floating Overlays (`elevation-2`):** Dropdown selectors, date pickers, popovers, and runbook step menus: `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)`.
- **Modal Failover Consoles (`elevation-3`):** Emergency orchestration dialogs and drill confirmation overlays: `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`, framed by a 1px border (`#CBD5E1`).

## Shapes

The design system employs a restrained `roundedness: 1` shape profile:

- **Base Radius (0.25rem / 4px):** Applied to standard interactive elements including buttons, form inputs, chips, badge pills, and segmented control segments.
- **Card & Container Radius (`rounded-lg`, 0.5rem / 8px):** Structural cards, modal boundaries, drill-down panels, and metrics overview blocks utilize an 8px border radius to establish structural boundary without softening the technical tone.
- **Nested Radii Strictness:** Interior elements embedded within cards must maintain consistent nested radius mathematics (outer 8px radius containing internal active rows with 4px radius separated by 4px padding).

## Components

- **Buttons:**
  - *Primary:* Background `#4F46E5`, hover `#4338CA`, text `#FFFFFF`, border-radius 4px. Compact height 32px or 36px, with font weight 500 (`label-md`).
  - *Secondary / Outline:* Background `#FFFFFF`, border 1px solid `#CBD5E1`, text `#0F172A`, hover background `#F8FAFC`.
  - *Destructive / Failover:* Background `#DC2626`, hover `#B91C1C`, text `#FFFFFF`.
- **Chips & SLA Badges:**
  - Compact badges (height 20px, font `label-sm`, padding 0 6px, border-radius 4px, border 1px solid).
  - Explicit tinting matched to operational status (Met SLA: `#ECFDF5` / `#065F46` / `#A7F3D0`; Breach: `#FFF1F2` / `#9F1239` / `#FECDD3`; In-Review: `#FFFBEB` / `#92400E` / `#FDE68A`).
- **Data Tables & Lists:**
  - Header row in `#F8FAFC`, bottom border 1px solid `#E2E8F0`, uppercase text in `#64748B` (`label-sm`).
  - Alternating or clean rows separated by 1px solid `#F1F5F9`; hover state triggers a solid `#F8FAFC` background tint with an active left edge indicator (2px primary indigo bar).
- **Form Inputs & Search:**
  - Height 32px (dense) or 36px; pure white canvas `#FFFFFF`, border 1px solid `#CBD5E1`, text `#0F172A`.
  - Focus state transitions to border `#4F46E5` with an outer ring: `box-shadow: 0 0 0 1px #4F46E5`.
- **Cards & KPI Summary Blocks:**
  - Surface `#FFFFFF`, border 1px solid `#E2E8F0`, shadow `0 1px 3px rgba(0,0,0,0.05)`.
  - Headers feature dedicated border separation (`1px solid #F1F5F9`) with integrated metric delta indicators aligned flush right.
- **Execution Runbook Steps (Domain-Specific):**
  - Linear status stepper with 2px vertical guide lines in `#E2E8F0`. Complete steps show solid green check pills (`#059669`), running steps show spinning indigo indicators (`#4F46E5`), and failed steps trigger high-contrast red warning panels (`#FFF1F2`).