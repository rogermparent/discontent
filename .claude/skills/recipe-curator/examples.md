# Worked transcripts

Real tool calls and real (abbreviated — long arrays cut with `…`) JSON,
captured from headless `/recipe-curator` runs against a scratch copy of a
Playwright fixture content directory. Timestamps and absolute paths differ
from run to run; the step headings match [SKILL.md](SKILL.md).

> **Placeholder.** The v2 transcripts are captured from two `claude -p`
> runs — the Christmas-Cookies story on the `christmas-cookies` fixture, and
> the meal-plan ask on `three-recipes-groups` — and land here before this
> phase closes. The old v1 transcripts, which showed the CLI rather than the
> tools, have been removed rather than left to contradict SKILL.md.

## A collection with a nested collection: "organize the cookie recipes into one featured group called Christmas Cookies, then combine the linzer cookies into a group that is accessible both at the top level and inside it"

### 1. Where do writes go?

_Run A transcript pending._

### 3. Reuse first

_Run A transcript pending._

### 7. Group them

_Run A transcript pending._ The shape is pinned meanwhile by
`test/christmasCookies.test.ts`, which replays the same tool sequence over an
in-memory client on the committed fixture.

### 8. Report

_Run A transcript pending._

## A meal plan: "three vegetarian dinners under 45 minutes for this week"

### 1. Where do writes go?

_Run B transcript pending._

### 4–5. Candidates, dry-run each

_Run B transcript pending._

### 6. Import the keepers

_Run B transcript pending._

### 7. Group them

_Run B transcript pending._

### 8. Report

_Run B transcript pending._
