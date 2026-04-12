## 2025-02-28 - [Keyboard Inaccessible Dropdown Menus]
**Learning:** Using purely `group-hover:opacity-100 group-hover:visible` for dropdown menus hides content from keyboard users. The element remains hidden from focus until explicitly hovered with a mouse.
**Action:** Always combine `group-hover` with `focus-within` for custom dropdown containers, and ensure interactive elements have proper `focus-visible` styling and ARIA roles (e.g., `listbox` and `option`).

## 2024-04-05 - Form Input Labels and Focus Routing
**Learning:** Labels that are visual siblings to inputs (but don't encapsulate them) lack programmatic connection, meaning clicking the label won't focus the input and screen readers won't announce the label name correctly.
**Action:** Always link visual label siblings to their inputs using `htmlFor` and `id` attributes to preserve focus routing and improve accessibility.

## 2025-04-10 - Empty States and Conditional Pagination
**Learning:** Empty lists without explicit empty states create a confusing experience, leaving users unsure if data failed to load or if the list is genuinely empty. Also, pagination controls like "Load more" look broken when rendered below an empty list.
**Action:** Always implement a dedicated empty state container with an icon and helpful copy for lists. Conditionally render pagination or "Load more" controls only when list items exist.
## 2024-04-12 - File Input Keyboard Accessibility
**Learning:** Using `className="hidden"` on file inputs completely removes them from the tab order, breaking keyboard navigation for file uploads.
**Action:** Always use `className="sr-only"` for visually hidden inputs, correctly link them with `id` and `htmlFor` on the wrapping `<label>`, and use `focus-within` on the `<label>` to ensure visible focus indicators.
