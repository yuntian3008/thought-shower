#!/usr/bin/env bash
# cr-fresh-review.sh — poll the CodeRabbit commit status on a given PR head.
#
# CodeRabbit posts a GitHub commit status with context "CodeRabbit":
#   state=pending  description="Review in progress"
#   state=success  description="Review completed" | "Review skipped"
#   state=failure  description=<error text>
#
# We poll the combined-status endpoint (returns the latest status per context)
# and exit as soon as state is success or failure.
#
# Writes one of these on its last line:
#   CR_REVIEW_POSTED   — state=success (any description, including "skipped")
#   CR_REVIEW_FAILED   — state=failure
#   CR_TIMEOUT         — 30 min elapsed with no terminal state
#   FILTER_BROKEN: ... — gh call or jq filter returned malformed output
#
# Usage: cr-fresh-review.sh <pr_number> <head_oid>
#
# Exit codes:
#   0 — CR_REVIEW_POSTED
#   1 — CR_TIMEOUT
#   2 — FILTER_BROKEN
#   3 — CR_REVIEW_FAILED

set -u  # do NOT set -e; we handle errors explicitly so polling continues

PR_NUMBER="${1:?pr_number required}"
HEAD_OID="${2:?head_oid required}"

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
if [ -z "$OWNER_REPO" ]; then
  echo "FILTER_BROKEN: failed to resolve OWNER_REPO" >&2
  exit 2
fi

# Returns: "<state>|<description>" if a CodeRabbit status exists, "<none>|" if not.
read_cr_status() {
  gh api "repos/$OWNER_REPO/commits/$HEAD_OID/status" --jq \
    '(.statuses // []) | map(select(.context == "CodeRabbit")) | (first // null) | if . == null then "<none>|" else "\(.state)|\(.description // "")" end'
}

# Sanity check OUTSIDE the loop — fail loud if the call doesn't return parseable output
probe=$(read_cr_status)
case "$probe" in
  ''|*[!|]*) ;;  # any non-empty string containing '|' is fine; we just want to ensure gh+jq worked
esac
if [ -z "$probe" ]; then
  echo "FILTER_BROKEN: initial probe returned empty (gh or jq failure)" >&2
  exit 2
fi

DEADLINE=$(( $(date -u +%s) + 1800 ))  # 30 minutes

while [ "$(date -u +%s)" -lt "$DEADLINE" ]; do
  raw=$(read_cr_status)
  if [ -z "$raw" ]; then
    echo "FILTER_BROKEN: loop probe returned empty" >&2
    exit 2
  fi

  state="${raw%%|*}"
  desc="${raw#*|}"

  # Progress lines go to stderr so they do NOT trigger Monitor notifications.
  # Only terminal lines (CR_REVIEW_POSTED / CR_REVIEW_FAILED / CR_TIMEOUT / FILTER_BROKEN)
  # are emitted on stdout — exactly one notification per script run.
  if [ "$state" = "<none>" ]; then
    echo "[$(date -u +%H:%M:%SZ)] cr_status=<none> (waiting for webhook)" >&2
  else
    echo "[$(date -u +%H:%M:%SZ)] cr_status=$state ($desc)" >&2
  fi

  case "$state" in
    success)
      echo "CR_REVIEW_POSTED"
      exit 0
      ;;
    failure)
      echo "CR_REVIEW_FAILED: $desc"
      exit 3
      ;;
  esac

  sleep 60
done

echo "CR_TIMEOUT"
exit 1
