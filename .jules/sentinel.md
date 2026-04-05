## 2026-04-03 - Exposing Sensitive Data in Logs
**Vulnerability:** The `handleFirestoreError` function in `src/App.tsx` stringified the entire Firebase user object (including `email`, `displayName`, `providerData`, etc.) into `console.error` logs.
**Learning:** Even internal error logs sent to `console.error` can be captured by error monitoring systems (e.g., Sentry, LogRocket, Datadog) or browser extensions. PII should never be serialized in a blanket manner.
**Prevention:** Only log necessary diagnostic context (e.g. `userId`, `operationType`, `path`). Omit PII fields or scrub objects explicitly before serialization in `JSON.stringify`.

## 2024-11-23 - Missing Update Valdiations in Firestore Rules
**Vulnerability:** Update operations in `firestore.rules` were verifying ownership but missing full validation of updated fields (e.g., `isValidVehicle(request.resource.data)`).
**Learning:** Checking ownership is not enough. Updates must be validated against the same domain rules as creation to prevent injecting unvalidated or unauthorized fields.
**Prevention:** Always append domain validators like `isValidVehicle()` or `isValidUser()` to `allow update` clauses, and ensure all properties explicitly defined in types have size/type limits (like `geminiApiKey`, `targetEfficiency`, and `propulsion`).
