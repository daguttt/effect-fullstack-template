# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations. Replace `<owner>` and `<repo>` in the GraphQL examples with the values from `gh repo view --json owner,name`.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` -- `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

How this repo expresses Wayfinder maps. The `/wayfinder` skill points here for the tracker-specific half.

### Labels

- A **map** is an issue labelled `wayfinder:map`. List them: `gh issue list --label wayfinder:map --state open`.
- Every **ticket** carries exactly one type label: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.

### Relationships

Both use GitHub's **native** relationships, not a body convention. Neither is exposed by `gh issue` flags — they are GraphQL mutations taking node IDs.

- **Ticket belongs to map**: a native sub-issue. Mutation `addSubIssue` / `removeSubIssue`.
- **Ticket blocks ticket**: a native issue dependency. Mutation `addBlockedBy` / `removeBlockedBy`.
- **Claim**: the assignee. `gh issue edit <n> --add-assignee <user>`. An open, unassigned ticket is unclaimed.

Resolve issue numbers to node IDs first:

```bash
gh api graphql -f query='{ repository(owner:"<owner>", name:"<repo>") {
  a: issue(number:767){ id } b: issue(number:765){ id } } }'
```

Then wire them. `addSubIssue` also accepts `subIssueUrl` instead of `subIssueId`, which saves one lookup:

```bash
# make <ticket> a child of <map>
gh api graphql -f query='mutation($map:ID!,$ticket:ID!){
  addSubIssue(input:{issueId:$map, subIssueId:$ticket}){ issue { number } } }' \
  -f map=<MAP_NODE_ID> -f ticket=<TICKET_NODE_ID>

# make <blocker> block <ticket>
gh api graphql -f query='mutation($ticket:ID!,$blocker:ID!){
  addBlockedBy(input:{issueId:$ticket, blockingIssueId:$blocker}){ issue { number } } }' \
  -f ticket=<TICKET_NODE_ID> -f blocker=<BLOCKER_NODE_ID>
```

### Reading the frontier

**`subIssues` does not return blocking edges.** Listing a map's open unassigned children and calling that the frontier will hand you blocked tickets. Always ask for `blockedBy` in the same query:

```bash
gh api graphql -f query='
query {
  repository(owner: "<owner>", name: "<repo>") {
    issue(number: <MAP>) {
      subIssues(first: 100) {
        nodes {
          number title state
          assignees(first: 3) { nodes { login } }
          labels(first: 5) { nodes { name } }
          blockedBy(first: 10) { nodes { number state } }
        }
      }
    }
  }
}' --jq '.data.repository.issue.subIssues.nodes[] | select(.state=="OPEN") | "#\(.number) \(.title)\n   assignee=\([.assignees.nodes[].login]|join(","))  type=\([.labels.nodes[].name]|join(","))  blockedBy=\([.blockedBy.nodes[] | "\(.number)(\(.state))"]|join(","))"'
```

A ticket is on the frontier when it is `OPEN`, has no assignee, and **every** `blockedBy` node is `CLOSED`.

### Resolving a ticket

1. `gh issue comment <n> --body-file <file>` — the resolution.
2. `gh issue close <n>`.
3. Append a one-line context pointer to the map's Decisions-so-far: `gh issue view <map> --json body --jq .body > /tmp/map.md`, edit, then `gh issue edit <map> --body-file /tmp/map.md`.

Maps are edited by concurrent sessions. **Re-fetch the map body immediately before editing it** — never write back a body you read earlier in the session, or you will silently revert another session's decision line.

<!--
Verified by execution: the frontier query, the node-ID lookup, `gh label list`.
Verified by GraphQL introspection only: the `addSubIssue` / `addBlockedBy` input
fields (`AddSubIssueInput`, `AddBlockedByInput`). The mutations themselves were
not run.
-->
