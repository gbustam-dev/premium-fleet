## 2024-05-24 - Remove Hardcoded Firebase API Key
**Vulnerability:** Firebase API key was hardcoded in `firebase-applet-config.json`.
**Learning:** Hardcoding API keys in configuration files committed to version control can lead to unauthorized access and quota abuse if the repository is exposed or if the key is intended to remain secret. While Firebase API keys are somewhat public, it is best practice to manage them via environment variables to prevent accidental exposure of keys for other environments or projects.
**Prevention:** Always use environment variables (e.g., `import.meta.env.VITE_FIREBASE_API_KEY`) for sensitive credentials and configuration keys.
