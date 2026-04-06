## 2025-02-28 - [Keyboard Inaccessible Dropdown Menus]
**Learning:** Using purely `group-hover:opacity-100 group-hover:visible` for dropdown menus hides content from keyboard users. The element remains hidden from focus until explicitly hovered with a mouse.
**Action:** Always combine `group-hover` with `focus-within` for custom dropdown containers, and ensure interactive elements have proper `focus-visible` styling and ARIA roles (e.g., `listbox` and `option`).

## 2024-04-05 - Form Input Labels and Focus Routing
**Learning:** Labels that are visual siblings to inputs (but don't encapsulate them) lack programmatic connection, meaning clicking the label won't focus the input and screen readers won't announce the label name correctly.
**Action:** Always link visual label siblings to their inputs using `htmlFor` and `id` attributes to preserve focus routing and improve accessibility.
