---
name: design-system
description: Sistema de diseño UI/UX del dashboard AutoLujo. Úsalo SIEMPRE que construyas o modifiques cualquier pantalla, componente o vista de la plataforma admin (todo lo que vive bajo /admin y /cartera, y módulos futuros). Define colores, tipografía, botones, tags, filtros, tablas, tabs, toggles, inputs, cards, chat y jerarquía. Base blanco/negro con acentos semánticos. NO aplica a la landing pública (negro/dorado + PT Serif + Montserrat).
---

# Sistema de diseño — Dashboard AutoLujo

Estética: **SaaS limpio, blanco y negro, denso en datos**, con **color solo en acentos semánticos** (tags, estados). Referente visual: paneles tipo Linear. Prioriza legibilidad y consistencia. El color nunca es decorativo: comunica estado o categoría.

> **Alcance:** dashboard (`/admin`, `/cartera`, módulos futuros). La **landing** (`/`, `/privacidad`, `/terminos`) NO usa este sistema.

## 0. Fuente de verdad (no inventar)

Esto es lo que **existe hoy**. No crees `components/ui/`. No uses tokens que no están en `app/globals.css`.

| Qué | Dónde |
|---|---|
| Tokens CSS / Tailwind | `app/globals.css` (`@theme`) |
| Encabezado, KPI, chips, empty, cards de módulo | `components/kit.tsx` |
| Inputs, select, submit, form card | `components/form.tsx` |
| Sidebar, layout, tema claro/oscuro | `components/shell.tsx` |
| Logo sidebar | `components/brand.tsx` |
| Fuentes | `app/layout.tsx` |

**No hay** (aún): `Button`, `Badge`, `FiltersBar`, `Tabs`, `Toggle`, `Stepper`, Lucide, ni carpeta `components/ui/`. Si hace falta un patrón nuevo, reutiliza `kit`/`form` o extiende esos archivos y actualiza esta skill.

## 1. Principios
1. **Blanco de base, negro para acción y texto.** Color en dosis pequeñas con significado.
2. **Jerarquía por tamaño y peso, no por color.**
3. **Densidad cómoda.** Filas ~44–52px.
4. **Un acento por elemento.**
5. **Bordes 1px antes que sombras.** Sombra solo para menús/modales.

## 2. Dos paletas (no mezclar)

### Dashboard — contenido (`bg-paper`)
Neutrales (nombres reales de token):

| Token | Valor | Uso |
|---|---|---|
| `paper` | `#FFFFFF` | fondo de página (`bg-paper`) |
| `surface` | `#FFFFFF` | cards, tablas, inputs |
| `surface-2` | `#F3F4F6` | hover de fila, fondos secundarios |
| `ink` | `#0A0A0A` | texto, botón primario |
| `muted` | `#6B7280` | texto secundario |
| `faint` | `#9CA3AF` | placeholders |
| `line` | `#E5E7EB` | bordes |
| `line-strong` | `#D1D5DB` | hover de borde |

Acentos semánticos (texto + wash):

| Token | Color | Wash | Significa |
|---|---|---|---|
| `verde` / `good` | `#059669` | `#ECFDF5` | activo, al día, aprobado |
| `azul` | `#2563EB` | `#EFF6FF` | info, categoría, chats |
| `rojo` / `crit` | `#DC2626` | `#FEF2F2` | error, vencido, rechazado |
| `ambar` / `warn` | `#D97706` | `#FFFBEB` | pendiente, advertencia |
| `gris` | `#6B7280` | `#F3F4F6` | inactivo, borrador |
| `purpura` | `#7C3AED` | `#F5F3FF` | tag extra (poco) |

Aliases: `text-good` = verde, `text-warn` = ámbar, `text-crit` = rojo. Prefiere `text-verde` / `text-ambar` / `text-rojo` en UI nueva.

**En el área de contenido no uses dorado** (`text-gold`, `bg-gold`, `ring-gold`) para cifras, links, focus ni chips de estado. El dorado es chrome de marca, no semántica de datos.

### Chrome de marca (sidebar + landing)
| Token | Valor | Uso |
|---|---|---|
| `side-bg` | `#000000` | sidebar `bg-black` |
| `side-active` / `gold` | `#C9A44A` | ítem activo, labels de sección, barra de 3px |
| `gold-wash` | `#FFF8E6` | landing; no como fondo de página del dashboard |

Landing: negro, blanco, dorado. Títulos `font-serif` (PT Serif). UI de landing: Montserrat (`font-brand-ui`).

## 3. Tipografía

- **Dashboard:** Inter (`font-sans` vía `--font-brand-sans`). Sin serif en títulos de `/admin` y `/cartera`.
- **Landing / legales:** PT Serif en titulares; Montserrat en el resto.
- **Sidebar fallback** (si no hay `logo.png`): PT Serif en el wordmark.

Escala:

| Rol | Tamaño / peso | Notas |
|---|---|---|
| display / h1 | 24–28 / 700 | `PageHeader` |
| h2 | 18 / 600 | sección (`Band`) |
| body | 14 / 400 | |
| label | 11–12 / 500 | `uppercase tracking-[0.12em]`–`0.16em` `text-muted` |
| micro | 10–11 / 600 | eyebrows |

Números: `tabular-nums`. Montos: componente `Money` (formato `es-PA`, sin centavos, prefijo visual `USD`).

## 4. Espaciado, radios, elevación

Escala 4px: `2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`.

Radios: inputs/botones **8px** (`rounded-lg`); cards **12px** (`rounded-xl`); pills `rounded-full`.

Elevación: cards = `ring-1 ring-line` (sin sombra). Sombras solo en overlays.

Focus global (`globals.css`): `outline: 2px solid var(--color-ink); outline-offset: 2px`. Inputs: `focus:ring-2 focus:ring-ink/20`, no gold.

Tema: por defecto **claro** (`data-theme="light"` en `ThemeToggle`). Oscuro existe en tokens; no diseñar pantallas nuevas “dark-first”.

## 5. Componentes reales

### `PageHeader` (`kit`)
Eyebrow 11px muted uppercase · título 24–28 bold · subtítulo 14 muted · `action` a la derecha. Sin mástil negro, sin serif.

### Botones
- Primario: `rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-black` (`SubmitButton` en `form.tsx`).
- Secundario: `bg-white text-ink ring-1 ring-line hover:bg-surface-2`.
- Peligro: `text-rojo ring-1 ring-rojo/30`.
- Disabled: `disabled:opacity-50`. Loading: cambia el texto + disabled.

### `StatusChip`
`tone`: `good` | `warn` | `crit` | `neutral` | `azul` | `purpura`. Pill + punto. **No uses `tone="gold"`** en contenido (si hace falta “en preparación”, usa `neutral`).

### `Kpi`
Card `rounded-xl ring-1 ring-line`. Label uppercase muted. Valor `text-2xl` (hero `text-4xl`–`5xl`). `tone`: `default` | `good` | `warn` | `crit` | `pronto`.

### Filtros / búsqueda
Patrón: input con lupa + chips de estado. Ejemplo en `inbox.tsx`. Search: `rounded-lg ring-1 ring-line`, focus ink.

### Tablas
Header 11–12px `text-muted`. Filas `border-b border-line hover:bg-surface-2`, `px-4 py-3`. Contenedor `rounded-xl ring-1 ring-line overflow-x-auto`. Empty: `EmptyState`.

### Chat (`inbox.tsx`)
Sin avatares. Entrante: `bg-gris-wash text-ink rounded-2xl`. Saliente: `bg-ink text-white`, alineado a la derecha. Sistema: `bg-rojo-wash text-rojo`. Timestamp 10px muted. Composer: textarea + `Enviar` primario.

### Sidebar (`shell.tsx`)
Ancho **17.5rem (280px)**, fondo **negro**, texto blanco. Sección en gold uppercase. Activo: `text-gold` + barra gold 2px a la izquierda. Inactivo: `text-white/60 hover:text-white`. Drawer bajo `md`. Topbar móvil negra. **No hay íconos Lucide** en nav (solo label). `ThemeToggle` abajo.

### Formularios (`form.tsx`)
`Field`, `Select`, `SubmitButton`, `FormCard`. Label 11px uppercase muted. Input `rounded-lg ring-1 ring-line`. Error: `text-rojo` + ring rojo.

## 5b–5i. El resto (sin alucinar componentes)

- **Íconos:** SVG inline outline 16px, `strokeWidth` 1.5. No emoji como ícono de UI (emoji solo en copy/chat).
- **Layout:** `main` padding `px-5 sm:px-8 lg:px-12`. Algunas páginas envuelven `max-w-6xl mx-auto py-10`. Tablas `overflow-x-auto`. Sin scroll horizontal del body.
- **Movimiento:** 150–200ms hover; respeta `prefers-reduced-motion` (ya en `globals.css`).
- **Copy es-PA:** sentence case. Fechas con `Intl` `es-PA`. Botones dicen la acción.
- **A11y:** contraste ink/muted sobre blanco; focus visible; color + texto en estados; `aria-label` en botones solo-ícono.
- **No hay** toasts/modales/steppers/gráficas como componentes compartidos. Si los añades: toast abajo-derecha, semántica en el ícono; modal overlay `bg-black/40`.

## 6. Do / Don't
- ✅ Color solo para estado/categoría. ❌ Fondos grandes de color.
- ✅ Primario negro. ❌ Primario azul/verde/dorado.
- ✅ Dorado solo en sidebar y landing. ❌ `text-gold` en tablas, KPIs o focus de inputs.
- ✅ Inter en dashboard. ❌ `font-serif` / PT Serif / Montserrat en `/admin` y `/cartera`.
- ✅ Importar de `@/components/kit` y `@/components/form`. ❌ Inventar `components/ui/Button`.
- ✅ Tokens `paper`, `ink`, `verde`, `ambar`… ❌ `--color-bg` u otros nombres que no están en `@theme`.

## 7. Cómo aplicar
1. Parte de blanco + negro; color solo en chips/estados según §2.
2. Reutiliza `PageHeader`, `Kpi`, `StatusChip`, `EmptyState`, `Field`.
3. Si falta un patrón, impleméntalo en `kit`/`form` y actualiza **esta** skill (y `.cursor/skills/design-system/SKILL.md`).
4. No copies la landing al dashboard ni al revés.
