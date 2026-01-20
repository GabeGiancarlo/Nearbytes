#!/bin/bash
set -e

echo "=== Staging all changes ==="
git add -A

echo ""
echo "=== Checking what will be committed ==="
git status --short | head -20

echo ""
echo "=== Committing changes ==="
git commit -m "Add complete UI implementation with Svelte 5" || echo "No changes to commit"

echo ""
echo "=== Switching to main branch ==="
git checkout main 2>/dev/null || git checkout -b main

echo ""
echo "=== Merging feature branch ==="
git merge feature/deduplication-and-naming-fixes --no-edit 2>/dev/null || echo "Already on main or merge not needed"

echo ""
echo "=== Pushing to GitHub ==="
git push origin main || git push -u origin main

echo ""
echo "✅ Done! Your UI files are now on GitHub main branch."
