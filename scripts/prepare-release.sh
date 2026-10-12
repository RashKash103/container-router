#!/usr/bin/env bash
#
# Prepares a release and pushes its tag. The release itself is built and
# published by .github/workflows/release.yaml, which runs on the pushed tag.
#
# Usage: scripts/prepare-release.sh 1.3.0 [--dry-run]

set -euo pipefail

version=${1:-}
dry_run=${2:-}

if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Usage: $0 <major.minor.patch> [--dry-run]" >&2
    exit 1
fi

repository_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repository_root"

tag="v$version"

run() {
    if [[ $dry_run == --dry-run ]]; then
        echo "dry run: $*"
    else
        "$@"
    fi
}

fail() {
    echo "error: $1" >&2
    exit 1
}

command -v git >/dev/null || fail 'git is required.'

branch=$(git branch --show-current)
[[ $branch == main ]] || fail "releases must be prepared from main; current branch is '$branch'."
[[ -z $(git status --porcelain) ]] || fail 'the working tree must be clean.'

git fetch origin main
read -r behind ahead < <(git rev-list --left-right --count HEAD...origin/main | tr '\t' ' ')
[[ $behind == 0 && $ahead == 0 ]] || fail 'main must be synchronized with origin/main.'

current=$(node -p "require('./package.json').version")
[[ $version != "$current" ]] || fail "version $version is already the current version."
[[ $(printf '%s\n%s\n' "$current" "$version" | sort -V | head -1) == "$current" ]] ||
    fail "version $version must be newer than the current version $current."

! git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null || fail "tag $tag already exists."

# Promote the Unreleased notes into a section for this tag.
notes=$(awk '
    $0 == "## [Unreleased]" { found = 1; next }
    found && /^## \[/ { exit }
    found && (NF || started) { started = 1; print }
' changelog.md | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
[[ -n ${notes//[[:space:]]/} ]] || fail 'changelog.md has no notes under "## [Unreleased]".'

python3 - "$tag" <<'PYTHON'
import io
import sys

tag = sys.argv[1]
path = 'changelog.md'
text = io.open(path, encoding='utf-8').read()
marker = '## [Unreleased]\n'
assert text.count(marker) == 1, 'changelog.md must have exactly one Unreleased section'
text = text.replace(marker, f'{marker}\n## [{tag}]\n', 1)
io.open(path, 'w', encoding='utf-8').write(text)
PYTHON

for file in package.json src/extension/manifest.json; do
    sed -i "0,/\"version\": \"[0-9]\+\.[0-9]\+\.[0-9]\+\"/s//\"version\": \"$version\"/" "$file"
    packaged=$(node -p "require('./$file').version")
    [[ $packaged == "$version" ]] || fail "could not set the version in $file."
done

echo "Prepared $tag:"
git --no-pager diff --stat

run git add package.json src/extension/manifest.json changelog.md
run git commit -m "chore(release): prepare $tag"
run git push origin main
run git tag "$tag"
run git push origin "$tag"

if [[ $dry_run == --dry-run ]]; then
    echo
    echo "Dry run complete. Revert the edits above with: git checkout -- ."
else
    echo
    echo "Pushed $tag. The release workflow builds and publishes it:"
    echo "  https://github.com/RashKash103/container-router/actions/workflows/release.yaml"
fi
