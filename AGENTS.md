# Project Rules & Agent Protocol

## 🚨 Critical Workflow: Build Info Updates
**Context:** This project uses `build-info.js` to display the current "Build Date" and "Commit ID" in the extension UI (Settings & Roadmap pages).

**The Rule:**
Before creating **ANY** commit, pushing a branch, or marking a task as "Complete", you **MUST** perform the following update sequence:

1.  **Run the update script:**
    ```bash
    npm run update-build
    ```
    *(This updates `build-info.js` with the current timestamp).*

2.  **Stage the file:**
    ```bash
    git add build-info.js
    ```
    *(This ensures the updated date is actually included in your commit).*

**Why is this mandatory?**
If this step is skipped, the "Build Date" seen by users will remain "stuck" on the previous version, causing confusion. Do not rely solely on the pre-commit hook; explicitly run this to ensure success.

## Environment Setup
* Ensure the `.husky/pre-commit` hook is executable:
    ```bash
    chmod +x .husky/pre-commit
    ```
