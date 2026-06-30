# Workflow and builder

CuraOS is **builder-led**: experiences are expressed through a workflow/BPM
engine and an app/site builder, so behavior is configured against documented
seams rather than hand-forked. This is why the web app suite shares one look, one
interaction model, and one auth flow. This page explains the three foundation
services that make that possible and how they fit together.

## The three foundation services

Three neutral core services are the spine that every domain routes through.

Workflow / BPM core (`workflow-core-service`)
:   Orchestrates human tasks, automation, and SLA timing. Process logic lives in
    one place instead of being scattered across services. A process definition
    describes the steps, the actors, the decisions, and the timers; the engine
    runs instances of it, assigns human tasks, fires automation, and tracks SLAs.

App / site builder (`builder-core-service`)
:   Generates admin, ops, and external surfaces from BPM definitions, domain
    contracts, and shared theming. The builder is how a process and a set of
    domain contracts become a usable screen without anyone hand-writing it.

Automation core (`automation-core-service`)
:   Low-code actions, connectors, and scheduling. Where you do not want to write
    a service, automation wires integrations declaratively: a trigger, a set of
    actions, and a schedule.

## How a feature becomes a surface

The builder-led model turns a domain definition into a running app through a
repeatable path:

1. **Define the process.** A BPM definition in `workflow-core-service` describes
   the human and automated steps, the decisions, and the SLAs for a domain
   activity (for example, an intake, an approval, or a fulfillment).

2. **Bind the data contracts.** Each domain publishes contracts (its API and
   event schemas). The builder reads those contracts to know the shape of the
   data a surface must show and capture.

3. **Generate the surface.** `builder-core-service` composes the BPM definition,
   the domain contracts, and the shared `@curaos/ui` theming into a surface:
   list views, forms, detail pages, and the task queue, all consistent with
   every other app.

4. **Wire automation.** `automation-core-service` connects steps that do not need
   a person: send a notification, call an external system through a connector, or
   run on a schedule.

The result is that adding or changing behavior is a configuration change against
published seams, not a fork of generated code.

## Why generated, not hand-coded

The web apps are generated from BPM definitions and domain contracts and share
the `@curaos/ui` design system. That is a deliberate charter choice:

- **Consistency.** The look, the interaction patterns, and the auth flow are
  identical across every app because they come from the same source.
- **Internationalization built in.** Generated surfaces ship dark mode and
  right-to-left Arabic that persist across reloads, without per-app work.
- **One place to improve.** A fix or an enhancement to the generator improves
  every generated app at once, instead of being re-applied by hand.

Where a generated surface cannot yet express a design, the answer is to enrich
the generator so it can, not to hand-code a one-off that drifts out of the mold.

## The plugin runtime

For behavior that genuinely needs custom code, `plugin-runtime-service` runs
extension plugins in a sandboxed runtime. Plugins extend the platform through the
published seams (workflow steps, automation actions, and domain contracts)
without being baked into a core service. This keeps the core stable while still
allowing tenant-specific or market-specific extension.

## Extension points

The builder and workflow engine expose CuraOS's main seams:

- **Workflow / BPM definitions** are the seam for changing process behavior.
- **The app / site builder** is the seam for new surfaces.
- **Automation connectors and actions** are the seam for low-code integration.
- **Plugins** are the seam for custom code that needs a sandbox.
- **Domain contracts** (API + event schemas) are the seam for data exchange.

Integrating against these seams is covered in [Integration](../integration/index.md).
The services behind them are listed in the [Services catalogue](../services/index.md).
