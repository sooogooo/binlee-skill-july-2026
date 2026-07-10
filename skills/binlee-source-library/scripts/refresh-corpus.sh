#!/usr/bin/env bash
set -euo pipefail

source_url="https://drli.beaucare.org"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
reference_dir="${script_dir}/../references"
work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

homepage="$(curl --fail --location --silent --show-error "${source_url}/")"
asset_path="$(printf '%s' "${homepage}" | grep -oE '/assets/index-[^" ]+\.js' | head -n 1)"

if [[ -z "${asset_path}" ]]; then
  printf '%s\n' "Unable to find the application bundle URL." >&2
  exit 1
fi

bundle_url="${source_url}${asset_path}"
content_length="$(curl --fail --location --silent --show-error --head "${bundle_url}" | tr -d '\r' | awk 'tolower($1) == "content-length:" { print $2 }')"

if [[ ! "${content_length}" =~ ^[0-9]+$ ]] || (( content_length == 0 )); then
  printf '%s\n' "Unable to determine application bundle size." >&2
  exit 1
fi

chunk_size=1048576
part=0
for (( start=0; start<content_length; start+=chunk_size )); do
  end=$(( start + chunk_size - 1 ))
  if (( end >= content_length )); then end=$(( content_length - 1 )); fi
  printf -v part_path '%s/part-%03d.js' "${work_dir}" "${part}"
  curl --fail --location --silent --show-error --range "${start}-${end}" -o "${part_path}" "${bundle_url}" &
  ((part+=1))
done
wait

cat "${work_dir}"/part-*.js > "${work_dir}/bundle.js"
node "${script_dir}/extract-corpus.mjs" \
  "${work_dir}/bundle.js" \
  "${reference_dir}/articles.json" \
  "${reference_dir}/article-index.jsonl" \
  "${reference_dir}/manifest.json" \
  "${source_url}" \
  "${bundle_url}"
