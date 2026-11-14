# GitHub sync

Repository: https://github.com/Socratech-uk/solana-lab

This lab is public. Existing private repositories are never made public by the sync script.

From this folder, run:

```powershell
.\sync-github.ps1 -Check
.\sync-github.ps1 -Message "Describe the changes"
```

For a session with script execution restricted:

```powershell
powershell -ExecutionPolicy Bypass -File .\sync-github.ps1 -Message "Describe the changes"
```

Requires Git, Node.js 18 or newer, and your existing GitHub sign-in through Git Credential Manager.

- Check previews the source selection and verifies the target without committing or pushing. It may fetch GitHub branch metadata.
- A normal run stages current source changes, commits them and pushes the main branch.
- Source deletions are included in the commit; ignored local files are retained on disk.
- The script refuses remote divergence, unresolved conflicts, another origin, likely credential files/tokens, and oversized regular Git blobs. It never force-pushes or resets your source.
- Private repositories are checked again immediately before pushing.
- Credentials come from Git's credential helper, stay in memory, and are not saved by this script.
- Generated releases, caches, model-weight downloads and private local configuration are excluded by .gitignore.
- Repositories can be edited while a snapshot is uploaded; run sync again for any later changes.
- Git LFS stores every distinct asset revision and counts against the repository owner's storage allowance.

Configuration is in .github-sync.json; the reusable implementation is tools/github-sync.mjs. Last successful sync details are kept inside Git metadata, not committed source.

Advanced: `-Staged` commits only the already reviewed Git index instead of staging later working-file edits.
