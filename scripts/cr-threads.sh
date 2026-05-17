#!/usr/bin/env bash
# cr-threads.sh — fetch all CodeRabbit review threads on a PR, paginated, and emit
# a flat JSON array of thread objects on stdout.
#
# Output schema (one element per CR-authored thread):
#   {
#     threadId: "...",
#     path: "src/...",
#     line: <int>,
#     url: "https://...",
#     body: "<first comment body>",
#     isResolved: <bool>,
#     isOutdated: <bool>,
#     lastAuthorLogin: "...",
#     lastAuthorType: "User|Bot",
#     lastReplyAt: "<ISO>"
#   }
#
# Usage: cr-threads.sh <pr_number>
#
# Exit codes:
#   0 — success (output may be `[]`)
#   2 — FILTER_BROKEN or gh failure (writes diagnostic to stderr)

set -u

PR_NUMBER="${1:?pr_number required}"

OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

if [ -z "$OWNER" ] || [ -z "$REPO" ]; then
  echo "FILTER_BROKEN: failed to resolve owner/repo" >&2
  exit 2
fi

QUERY='
query($owner:String!,$repo:String!,$number:Int!,$threadsCursor:String){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$number){
      reviewThreads(first:100, after:$threadsCursor){
        pageInfo{ hasNextPage endCursor }
        nodes{
          id
          isResolved
          isOutdated
          comments(first:50){
            pageInfo{ hasNextPage endCursor }
            nodes{
              author{ login __typename }
              path
              line
              originalLine
              diffSide
              url
              body
              createdAt
            }
          }
        }
      }
    }
  }
}'

THREADS_CURSOR="null"
ALL_THREADS="[]"

while true; do
  if [ "$THREADS_CURSOR" = "null" ]; then
    page=$(gh api graphql -f query="$QUERY" -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER")
  else
    page=$(gh api graphql -f query="$QUERY" -F owner="$OWNER" -F repo="$REPO" -F number="$PR_NUMBER" -f threadsCursor="$THREADS_CURSOR")
  fi

  if [ -z "$page" ]; then
    echo "FILTER_BROKEN: empty graphql response" >&2
    exit 2
  fi

  # Append this page's nodes
  page_nodes=$(echo "$page" | jq '.data.repository.pullRequest.reviewThreads.nodes')
  if [ -z "$page_nodes" ] || [ "$page_nodes" = "null" ]; then
    echo "FILTER_BROKEN: missing reviewThreads.nodes" >&2
    exit 2
  fi

  ALL_THREADS=$(jq -n --argjson a "$ALL_THREADS" --argjson b "$page_nodes" '$a + $b')

  has_next=$(echo "$page" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage')
  end_cursor=$(echo "$page" | jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor')

  if [ "$has_next" != "true" ]; then
    break
  fi
  THREADS_CURSOR="$end_cursor"
done

# Project to the flat schema, filtered to threads whose first comment author looks like CodeRabbit
echo "$ALL_THREADS" | jq '
  [ .[]
    | select((.comments.nodes[0].author.login // "") | test("^coderabbitai(\\[bot\\])?$"; "i"))
    | {
        threadId: .id,
        path:    .comments.nodes[0].path,
        line:    (.comments.nodes[0].line // .comments.nodes[0].originalLine),
        url:     .comments.nodes[0].url,
        body:    .comments.nodes[0].body,
        isResolved,
        isOutdated,
        lastAuthorLogin: (.comments.nodes | last | .author.login),
        lastAuthorType:  (.comments.nodes | last | .author.__typename),
        lastReplyAt:     (.comments.nodes | last | .createdAt)
      }
  ]
'
