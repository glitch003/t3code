# Maintaining the glitch003 desktop build

The `custom/current-session-pr-actions` branch carries the personal changes. Keep
`main` available as the upstream baseline. The sidebar's Fix and Resolve actions
send to the current thread, queue behind an active turn, and leave the composer
draft intact. The thread must be started and on the pull request's project and
head branch. Web and desktop share this sidebar; the native mobile UI is separate.

## Build on macOS

Follow the [development prerequisites](development.md#macos-dmg-prerequisites), then
run from the checkout:

```sh
vp install --frozen-lockfile
vp run check:changed
custom_base_version=$(node -p "JSON.parse(require('fs').readFileSync('apps/server/package.json', 'utf8')).version.split('-')[0]")
custom_revision=$(git rev-parse --short HEAD)
vp run dist:desktop:dmg --build-version "${custom_base_version}-pr.glitch003.${custom_revision}"
```

Artifacts are written to `release/`. The `-pr.` version marker deliberately uses
T3's preview packaging: no update feed is configured, so official automatic
updates cannot replace the customization. Updates require merging and rebuilding.
Local builds are unsigned by default; macOS passkeys require a signed,
provisioned app as described in the development guide.

Test with `vp run dev:desktop` and its separate development data before replacing
the installed app. Never point a development server at the live `~/.t3/userdata`.
Quit the installed app before installing a replacement; keep the previous app
and a backup of its data. New upstream versions can migrate the database.

## Bring in an upstream release

Commit or stash local work first. Add the upstream remote once if it is missing:

```sh
git remote add upstream https://github.com/pingdotgg/t3code.git
```

Choose a stable release tag from the upstream releases page, then fetch that exact
tag and merge it on the custom branch. For example, substitute the desired tag
for `vX.Y.Z` below:

```sh
git switch custom/current-session-pr-actions
git fetch upstream tag vX.Y.Z
git merge --no-edit vX.Y.Z
```

Resolve any conflicts before continuing. If Git cannot find a common ancestor
because this checkout is shallow, fetch more history from both remotes; do not
use `--allow-unrelated-histories`.

Run the build steps above, test the resulting app, then push the custom branch:

```sh
git push origin custom/current-session-pr-actions
```

GitHub's Sync fork button updates source history only. It does not rebuild the
app or apply this branch's changes to an official binary. No recurring update job
is required; repeat this procedure when a release is worth upgrading to.
