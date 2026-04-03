## 2025-02-28 - [Keyboard Inaccessible Dropdown Menus]
**Learning:** Using purely `group-hover:opacity-100 group-hover:visible` for dropdown menus hides content from keyboard users. The element remains hidden from focus until explicitly hovered with a mouse.
**Action:** Always combine `group-hover` with `focus-within` for custom dropdown containers, and ensure interactive elements have proper `focus-visible` styling and ARIA roles (e.g., `listbox` and `option`).
