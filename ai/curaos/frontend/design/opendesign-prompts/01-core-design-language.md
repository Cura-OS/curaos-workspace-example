# OpenDesign Prompt 01 — CuraOS Core Design Language (keystone)

> Paste this into OpenDesign. Generate the prototype/design-system. Then export the result into the claude.ai Design project "Design System" (projectId 1c1d6624-a84f-4e3a-a05a-ade9d07a3429) OR save the files and point me at them, and I will pull them via DesignSync get_file and wire them into @curaos/ui + the app generator.

## Product context
CuraOS is a self-hosted, composable platform: a neutral generic core plus opt-in vertical overlays (HealthStack, EducationStack, ERP). It ships ONE design system consumed by 22 apps: admin/ops consoles (admin-app, fleet-manager, business-* workflow/automation/shop/donation/site, front-office), a visual builder IDE (builder-studio), a workflow canvas (workflow-designer), an auth UI (hosted-login), consumer personal apps (personal-calendar/notes/tasks/tracking/shop/donation/site/automation/workflow), and 2 mobile apps (clinician-app, patient-app, React Native). Tech: React 19 + Next.js 15, @curaos/ui on shadcn/ui (Radix) + Ant Design 5, Tailwind toggleable, Style Dictionary W3C tokens. Must hit WCAG AA+, support dark mode, RTL, and per-tenant theming overrides.

## Brand direction (user pick: FRESH MODERN PALETTE)
Propose ONE cohesive fresh-modern brand (not the current slate+blue). Healthcare-grade trust + modern platform-tech confidence. Calm, accessible, not cartoonish. Give a distinctive primary hue + one accent. Avoid generic SaaS-purple cliche unless it is clearly differentiated.

## Deliver (as a design-system prototype)
1. **Foundations / tokens** (emit as W3C design tokens, light + dark):
   - Color: primary ramp (50-900), neutral/ink ramp, semantic (success/warning/error/info) each with ramp, surface/bg/line, focus ring.
   - Typography: font family (web-safe + Inter-class fallback), type scale (display/h1-h4/body/body-sm/caption/code), weights, line-heights.
   - Spacing scale, radius scale, elevation/shadow scale, motion (durations + easings), z-index, breakpoints.
2. **Core widgets** (the set all 22 apps reuse) - light + dark, default/hover/focus/disabled/loading + error states where relevant:
   Button (primary/secondary/ghost/danger, 3 sizes, icon), Input/Textarea/Select/Combobox, Checkbox/Radio/Switch, Form-field (label+hint+error), Table (sortable header, row states, pagination), Card, Modal/Dialog, Drawer, Tabs, Sidebar-nav + Topbar (app shell), Breadcrumb, Toast/Alert/Banner, Badge/Pill/Status, Avatar, Tooltip, Dropdown-menu, Pagination, Empty-state, Skeleton/Loader, Tag-input, Date-picker, KPI/stat card, Chart container (line/bar/donut placeholders), Command palette.
3. **App-shell layout** rendered in context: collapsible sidebar + topbar + content, shown for an admin console screen (tenant list + KPIs + table) AND a builder/canvas screen, so the system is proven in real layouts.
4. **A11y + theming notes:** contrast pairs, focus visibility, dark-mode mapping, how a tenant override re-skins via token swap.

## Output format I can consume
Self-contained HTML preview files per component group, each starting with a first-line comment `<!-- @dsCard group="..." -->` so they render as cards in the claude.ai Design System pane, PLUS a tokens file (tokens.json / Style Dictionary format). Group names: Foundations, Buttons, Forms, Data, Navigation, Feedback, Overlays, App Shell.
