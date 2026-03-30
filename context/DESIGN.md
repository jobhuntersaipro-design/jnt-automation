# Design System Specification: The Logistics Authority

## 1. Overview & Creative North Star
**The Creative North Star: "The Precision Architect"**
This design system moves away from the cluttered, utilitarian aesthetic of traditional logistics software. Instead, it adopts the persona of a high-end editorial publication—clean, authoritative, and obsessively organized. We achieve "Modern Minimalism" not through emptiness, but through intentional structural depth.

By breaking the rigid 12-column grid with **intentional asymmetry** (e.g., wide data tables offset by slim, high-contrast summary sidebars) and utilizing a **Tonal Layering** approach, we transform dry salary data into a premium dashboard experience. The interface should feel like a custom-tailored suit: perfectly fitted, quiet in its elegance, yet unmistakably powerful.

---

## 2. Colors & Surface Logic
Our palette balances the cold, trustworthy professionalism of deep blues with the high-energy "J&T" red/orange accent to signal action and brand identity.

### Surface Hierarchy & The "No-Line" Rule
Traditional 1px borders are prohibited for sectioning. We define space through **Background Shifts**:
- **Base Layer:** `surface` (#f8f9fa) – The canvas.
- **Sectioning:** Use `surface_container_low` (#f3f4f5) to group related data clusters.
- **Prominence:** Use `surface_container_lowest` (#ffffff) for primary interactive cards to make them "pop" against the gray base.

### The Glass & Gradient Rule
For high-level summary cards (e.g., Total Monthly Payout), do not use flat colors. Apply a subtle **Linear Gradient** from `primary` (#0040a1) to `primary_container` (#0056d2) at a 135° angle. For floating navigation or filters, use **Glassmorphism**:
- **Background:** `surface_container_lowest` at 80% opacity.
- **Effect:** `backdrop-filter: blur(12px)`.

### Specialized Logistics Logic (Gender-Specific Avatars)
To provide instant visual recognition for dispatcher management:
- **Male Dispatchers:** Avatar ring uses `primary` (#0040a1) at 2px weight.
- **Female Dispatchers:** Avatar ring uses a custom soft rose (suggested: #f472b6) to provide a clear, non-conflicting distinction from the brand red.

---

## 3. Typography
We utilize a dual-typeface system to create an editorial feel. **Manrope** provides a modern, geometric authority for headings, while **Inter** ensures maximum legibility for dense tabular data.

*   **Display (Manrope):** Use `display-lg` (3.5rem) for high-level monthly totals. Tracking should be set to `-0.02em` to feel "tight" and premium.
*   **Headlines (Manrope):** `headline-sm` (1.5rem) for section titles. Use `on_surface` color to maintain a "dark ink" feel.
*   **Body (Inter):** `body-md` (0.875rem) is the workhorse for table data. Use `on_surface_variant` (#424654) for secondary data to create a clear hierarchy.
*   **Labels (Inter):** `label-md` (0.75rem) in All Caps with `+0.05em` letter spacing for table headers.

---

## 4. Elevation & Depth
We eschew "Standard Web" shadows for **Ambient Occlusion**.

*   **The Layering Principle:** Depth is achieved by stacking. A `surface_container_lowest` card sitting on a `surface_container_high` background creates a natural lift.
*   **Ambient Shadows:** For floating modals or "Active" states, use:
    *   `box-shadow: 0 12px 40px -12px rgba(25, 28, 29, 0.08);`
    *   The shadow must be tinted with the `on_surface` color to feel like natural light, never pure black.
*   **The Ghost Border:** If a separator is required for accessibility, use `outline_variant` (#c3c6d6) at **15% opacity**. Anything higher is too heavy for this system.

---

## 5. Components

### Summary Cards
*   **Styling:** No borders. Use `surface_container_lowest` (#ffffff).
*   **Corner Radius:** `xl` (0.75rem) for the outer container; `md` (0.375rem) for internal elements.
*   **Logic:** Feature a "Brand Accent Trace"—a 4px vertical line of `tertiary` (#940002) on the left edge to anchor the brand identity.

### Data Tables (Logistics Heavy)
*   **Layout:** Forbid divider lines. Use `spacing-4` (0.9rem) vertical padding between rows. 
*   **Row Hover:** Transition background to `surface_container_high` (#e7e8e9) with a `DEFAULT` (0.25rem) radius.
*   **Hierarchy:** The "Salary Amount" column should use `title-md` and `primary` color to draw the eye immediately.

### Buttons
*   **Primary:** `primary` (#0040a1) background with `on_primary` text. Use `md` (0.375rem) rounding.
*   **Tertiary (Action):** `tertiary` (#940002) used exclusively for "Finalize Payroll" or "Critical Error" states. This is our "J&T" signature pop.

### Input Fields
*   **Soft Focus:** Default state uses `surface_container_highest` background. On focus, transition to `surface_container_lowest` with a 1px `ghost border` and a subtle `primary` outer glow (4px blur).

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Negative Space:** Use `spacing-12` (2.75rem) between major dashboard modules. Space is a luxury; use it.
*   **Use Tonal Shifts:** Distinguish the sidebar from the main content by using `surface_dim` (#d9dadb) for the sidebar background.
*   **Align to the Baseline:** Ensure all numerical data in tables is tabular-numeric (monospaced numbers) for easy vertical scanning.

### Don’t:
*   **Don't use 100% Black:** Never use #000000. Use `on_surface` (#191c1d) for maximum readability without eye strain.
*   **Don't use "Floating" Dividers:** Never place a line in the middle of a card. Use a 4px gap (`spacing-2.5`) to create a visual break instead.
*   **Don't Over-Round:** Avoid "Pill" shapes for anything other than status chips. We want the system to feel architectural and precise, not "bubbly." Use `md` and `lg` radii for a professional edge.