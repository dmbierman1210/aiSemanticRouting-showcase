# Copilot Instruction Router: Open showcase

A generated, static GitHub Pages site: an interactive, pre-computed replay of how the router matches a request to a skill, with skill excerpts, file facts, guardrails and the test-suite list. It makes no model calls and no external requests.

- Repository: https://github.com/dmbierman1210/aiSemanticRouting-showcase
- Live site: https://dmbierman1210.github.io/aiSemanticRouting-showcase/

Do not edit the files here by hand: they are overwritten every time the site is generated.

## Update the site

From a clone of the source repository (it has `tools/build-showcase.ps1` and `showcase/template/`), build into a clone of this repository, then commit and push the result:

```powershell
./tools/build-showcase.ps1 -Variant public -Out <path to a clone of this repository>
```

Page layout and wording live in `showcase/template/`; the numbers, prompts and skill text are read from the source repository, so rebuilding after a release refreshes them.

## Take the site down

- Unpublish only: Settings > Pages > Unpublish site, or `gh api -X DELETE repos/dmbierman1210/aiSemanticRouting-showcase/pages`. The repository stays; publish again by re-enabling Pages on the `main` branch, root folder.
- Remove everything: delete the repository (Settings > General > Danger Zone, or `gh repo delete dmbierman1210/aiSemanticRouting-showcase`).
