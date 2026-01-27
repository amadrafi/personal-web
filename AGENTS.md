# Repository Guidelines

## Project Structure & Module Organization
- `content/` holds Markdown posts and pages (use `hugo new` to scaffold). Example: `content/post/my-first-post.md`.
- `archetypes/` defines default front matter for new content.
- `layouts/` and `themes/github-style/` contain templates and theme assets.
- `static/` is for files copied as-is to the site (images, CSS, JS).
- `public/` is the generated site output; treat it as build artifacts.
- Site configuration lives in `hugo.toml`.

## Build, Test, and Development Commands
- `hugo server -D` runs the local dev server and includes drafts for preview.
- `hugo` builds the production site into `public/`.
- `hugo new post/<slug>.md` creates a new post with default front matter.

## Coding Style & Naming Conventions
- Use Markdown for content files with TOML front matter (top-of-file `+++` blocks).
- Prefer kebab-case slugs for content files: `my-new-post.md`.
- Keep `hugo.toml` formatting consistent with existing 2-space indentation.
- If adding custom assets, place them under `static/` and reference with root paths (e.g., `/images/avatar.png`).

## Testing Guidelines
- No automated tests are configured for this repository.
- Validate changes by running `hugo server -D` and inspecting pages locally.

## Commit & Pull Request Guidelines
- Commit history is minimal, so there is no enforced convention. Use concise, imperative messages (e.g., "Add about page").
- PRs should include a short summary, list of affected sections, and screenshots or URLs from `hugo server` when UI changes are made.

## Configuration & Content Tips
- Update site metadata in `hugo.toml` (`baseURL`, `title`, `params`).
- Draft posts require `draft = false` before they appear in production builds.
