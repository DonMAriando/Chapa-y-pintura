#!/usr/bin/env bash
set -euo pipefail

export DOCKER_BUILDKIT=1

REGISTRY="ghcr.io/donmariando/chapa-y-pintura"
LATEST_TAG="prod-latest"
SOURCE_URL="https://github.com/DonMAriando/Chapa-y-pintura"
VERSION_RE='^prod-[0-9]+\.[0-9]+\.[0-9]+$'

cd "$(dirname "$0")/.."

parse_args() {
  CI=false
  RAW_VERSION=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --ci)
        CI=true
        ;;
      --*)
        echo "unknown flag: $1" >&2
        exit 1
        ;;
      *)
        if [ -n "$RAW_VERSION" ]; then
          echo "unexpected argument: $1" >&2
          exit 1
        fi
        RAW_VERSION="$1"
        ;;
    esac
    shift
  done
}

parse_prod_version() {
  local raw="${1-}"
  if [ -z "$raw" ] || ! [[ "$raw" =~ $VERSION_RE ]]; then
    echo "invalid version: ${raw:-<empty>} (expected prod-X.Y.Z)" >&2
    return 1
  fi
  printf '%s\n' "$raw"
}

highest_prod_tag() {
  local tag=""
  local t
  while IFS= read -r t; do
    if [[ "$t" =~ $VERSION_RE ]]; then
      tag="$t"
      break
    fi
  done < <(git tag --list 'prod-*' --sort=-v:refname)
  if [ -z "$tag" ]; then
    printf 'prod-1.0.0\n'
  else
    printf '%s\n' "$tag"
  fi
}

bump_patch() {
  local version="$1"
  local rest="${version#prod-}"
  local major="${rest%%.*}"
  local rest2="${rest#*.}"
  local minor="${rest2%%.*}"
  local patch="${rest2#*.}"
  printf 'prod-%s.%s.%s\n' "$major" "$minor" "$((patch + 1))"
}

resolve_release() {
  local ci="$1"
  local raw="${2-}"
  local version
  if [ "$ci" = true ]; then
    version="$(parse_prod_version "$raw")" || return 1
    GIT_TAG_POLICY="ci"
  elif [ -z "$raw" ]; then
    git fetch --tags >/dev/null 2>&1 || true
    version="$(bump_patch "$(highest_prod_tag)")"
    GIT_TAG_POLICY="local"
  else
    version="$(parse_prod_version "$raw")" || return 1
    GIT_TAG_POLICY="local"
  fi
  VERSION="$version"
  GIT_SHA="$(git rev-parse HEAD)"
  IMAGE_PIN="${REGISTRY}:${VERSION}"
  IMAGE_LATEST="${REGISTRY}:${LATEST_TAG}"
}

ensure_local_tag_free() {
  local version="$1"
  if git rev-parse "refs/tags/$version" >/dev/null 2>&1; then
    echo "Git tag already exists: $version" >&2
    exit 1
  fi
}

publish_release() {
  if [ "$GIT_TAG_POLICY" = local ]; then
    ensure_local_tag_free "$VERSION"
  fi

  echo "building $IMAGE_PIN"
  docker build \
    -f Dockerfile \
    -t "$IMAGE_PIN" \
    -t "$IMAGE_LATEST" \
    --label "org.opencontainers.image.source=${SOURCE_URL}" \
    --label "org.opencontainers.image.version=${VERSION}" \
    --label "org.opencontainers.image.revision=${GIT_SHA}" \
    .

  echo "pushing $IMAGE_PIN"
  docker push "$IMAGE_PIN"
  echo "pushing $IMAGE_LATEST"
  docker push "$IMAGE_LATEST"

  if [ "$GIT_TAG_POLICY" = local ]; then
    git tag "$VERSION"
    echo "tagged $VERSION (not pushed)"
  fi
}

main() {
  parse_args "$@"
  resolve_release "$CI" "$RAW_VERSION" || exit 1
  publish_release
}

main "$@"
