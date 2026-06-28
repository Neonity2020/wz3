# Project Build Guidelines

- Keep the app local-first. Prefer local files, local storage, and Tauri-side persistence over remote services unless the feature truly requires a networked backend.
- Keep the implementation lightweight. Use the platform, Svelte, Tauri, Rust, and existing project helpers before adding new packages.
- Keep the design minimal. Favor clear workflows, restrained UI, and small focused components over decorative or complex interfaces.
- Avoid bulky dependencies unless there is a concrete need. Before adding one, confirm that it solves a real problem better than a small local implementation or an existing dependency.
- Preserve the current desktop-app shape: fast startup, small bundle, simple data model, and private user data stored locally.
