#!/usr/bin/env bash
# cr-fresh-review.sh — poll for a fresh CodeRabbit review on a given PR head.
#
# Writes one of these on its last line:
#   CR_REVIEW_POSTED   — a CR review submitted at/after READY_AT for HEAD_OID exists
#   CR_TIMEOUT         — 30 min elapsed without a qualifying review
#   FILTER_BROKEN: ... — the gh/jq filter returned non-numeric output (bug)
#
# Usage: cr-fresh-review.sh <pr_number> <head_oid> <ready_at_iso>
#
# Exit codes:
#   0 — CR_REVIEW_POSTED
#   1 — CR_TIMEOUT
#   2 — FILTER_BROKEN

set -u  # do NOT set -e; we handle errors explicitly so polling continues

PR_NUMBER="${1:?pr_number required}"
HEAD_OID="${2:?head_oid required}"
READY_AT="${3:?ready_at_iso required}"

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
if [ -z "$OWNER_REPO" ]; then
  echo "FILTER_BROKEN: failed to resolve OWNER_REPO" >&2
  exit 2
fi

# CRITICAL: gh api --jq does NOT accept --arg. Inline expansion only.
# Never redirect stderr to /dev/null here — silent failure = stuck polling.
build_filter() {
  printf '%s' "[ .[] | select(((.user.login // \"\") | test(\"^coderabbitai(\\\\[bot\\\\])?\\$\"; \"i\")) and .commit_id == \"$HEAD_OID\" and .submitted_at >= \"$READY_AT\") ] | length"
}

# Sanity check OUTSIDE the loop — fail loud if the call doesn't return a number
fresh=$(gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews" --jq "$(build_filter)")
case "$fresh" in
  ''|*[!0-9]*)
    echo "FILTER_BROKEN: initial probe returned: $fresh" >&2
    exit 2
    ;;
esac

DEADLINE=$(( $(date -u +%s) + 1800 ))  # 30 minutes

while [ "$(date -u +%s)" -lt "$DEADLINE" ]; do
  fresh=$(gh api "repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews" --jq "$(build_filter)")
  case "$fresh" in
    ''|*[!0-9]*)
      echo "FILTER_BROKEN: loop probe returned: $fresh" >&2
      exit 2
      ;;
  esac

  echo "[$(date -u +%H:%M:%SZ)] fresh_cr_reviews=$fresh"

  if [ "$fresh" -gt 0 ]; then
    echo "CR_REVIEW_POSTED"
    exit 0
  fi

  sleep 60
done

echo "CR_TIMEOUT"
exit 1
