#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/common.sh"

BASELINE_APPIDS_FILE="${1:-$REPO_ROOT/docs/research/live-appids-spitemonger.json}"
STEAM_ROOT_INPUT="${2:-}"
OUTPUT_PREFIX="${3:-local-steam-spitemonger}"
OUTPUT_DIR="${4:-$REPO_ROOT/docs/research}"

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

windows_to_posix_path() {
	local candidate="$1"
	local normalized

	normalized="$(echo "$candidate" | sed 's#\\\\#/#g')"

	if [[ "$normalized" =~ ^([A-Za-z]):/(.*)$ ]]; then
		local drive
		drive="${BASH_REMATCH[1],,}"
		echo "/$drive/${BASH_REMATCH[2]}"
		return
	fi

	echo "$normalized"
}

detect_steam_root() {
	local candidates=(
		"/c/Program Files (x86)/Steam"
		"/c/Program Files/Steam"
		"$HOME/.steam/steam"
		"$HOME/.local/share/Steam"
	)

	local candidate
	for candidate in "${candidates[@]}"; do
		if [[ -d "$candidate/steamapps" ]]; then
			echo "$candidate"
			return
		fi
	done

	return 1
}

to_json_number_array() {
	local input_file="$1"
	jq -Rsc 'split("\n") | map(select(length > 0) | tonumber?) | map(select(. != null)) | unique | sort' "$input_file"
}

extract_library_roots() {
	local steam_root="$1"
	local output_file="$2"
	local library_folders_vdf="$steam_root/steamapps/libraryfolders.vdf"

	printf '%s\n' "$steam_root" > "$output_file"

	if [[ ! -f "$library_folders_vdf" ]]; then
		sort -u "$output_file" -o "$output_file"
		return
	fi

	while IFS= read -r raw_path; do
		local posix_path
		posix_path="$(windows_to_posix_path "$raw_path")"
		if [[ -n "$posix_path" ]]; then
			printf '%s\n' "$posix_path" >> "$output_file"
		fi
	done < <(grep -E '"path"[[:space:]]+"' "$library_folders_vdf" | sed -E 's/.*"path"[[:space:]]+"([^"]+)".*/\1/')

	sort -u "$output_file" -o "$output_file"
}

init_script "Local Steam AppID Coverage Scan"

if [[ ! -f "$BASELINE_APPIDS_FILE" ]]; then
	log_error "Baseline appid file not found: $BASELINE_APPIDS_FILE"
	exit 1
fi

if [[ -n "$STEAM_ROOT_INPUT" ]]; then
	STEAM_ROOT="$(windows_to_posix_path "$STEAM_ROOT_INPUT")"
else
	STEAM_ROOT="$(detect_steam_root)" || {
		log_error "Could not detect Steam root. Pass it explicitly as arg #2."
		exit 1
	}
fi

if [[ ! -d "$STEAM_ROOT" ]]; then
	log_error "Steam root does not exist: $STEAM_ROOT"
	exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Create a persistent log in the output directory and tee all output into it
LOG_FILE="$OUTPUT_DIR/local-steam-coverage-${OUTPUT_PREFIX}.log"
: > "$LOG_FILE" || true
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "Baseline appids: $BASELINE_APPIDS_FILE"
log_info "Steam root: $STEAM_ROOT"
log_info "Output dir: $OUTPUT_DIR"

LIBRARY_ROOTS_FILE="$TEMP_DIR/library_roots.txt"
extract_library_roots "$STEAM_ROOT" "$LIBRARY_ROOTS_FILE"

SOURCE_MANIFESTS_TXT="$TEMP_DIR/source_manifest_filenames.txt"
SOURCE_LIBRARYFOLDERS_TXT="$TEMP_DIR/source_libraryfolders_apps.txt"
SOURCE_USER_CONFIG_TXT="$TEMP_DIR/source_userdata_configs.txt"
SOURCE_COLLECTIONS_TXT="$TEMP_DIR/source_collections_json.txt"
MERGED_TXT="$TEMP_DIR/source_merged.txt"

touch "$SOURCE_MANIFESTS_TXT" "$SOURCE_LIBRARYFOLDERS_TXT" "$SOURCE_USER_CONFIG_TXT" "$SOURCE_COLLECTIONS_TXT"

log_step "Extracting appids from appmanifest filenames"
while IFS= read -r lib_root; do
	if [[ -d "$lib_root/steamapps" ]]; then
		find "$lib_root/steamapps" -maxdepth 2 -type f -name 'appmanifest_*.acf' -print \
			| sed -E 's#.*appmanifest_([0-9]+)\.acf#\1#' >> "$SOURCE_MANIFESTS_TXT"
	fi
done < "$LIBRARY_ROOTS_FILE"
sort -n "$SOURCE_MANIFESTS_TXT" | uniq > "$SOURCE_MANIFESTS_TXT.sorted"
mv "$SOURCE_MANIFESTS_TXT.sorted" "$SOURCE_MANIFESTS_TXT"
log_info "Found $(wc -l < "$SOURCE_MANIFESTS_TXT" || true) appmanifest appids (first 10):"
head -n 10 "$SOURCE_MANIFESTS_TXT" | sed 's/^/  - /'

log_step "Extracting appids from libraryfolders.vdf app sections"
while IFS= read -r lib_root; do
	vdf_file="$lib_root/steamapps/libraryfolders.vdf"
	if [[ -f "$vdf_file" ]]; then
		grep -Eo '"[0-9]{2,7}"[[:space:]]+"[0-9]+"' "$vdf_file" \
			| sed -E 's/^"([0-9]{2,7})"[[:space:]]+"[0-9]+"$/\1/' >> "$SOURCE_LIBRARYFOLDERS_TXT"
	fi
done < "$LIBRARY_ROOTS_FILE"
sort -n "$SOURCE_LIBRARYFOLDERS_TXT" | uniq > "$SOURCE_LIBRARYFOLDERS_TXT.sorted"
mv "$SOURCE_LIBRARYFOLDERS_TXT.sorted" "$SOURCE_LIBRARYFOLDERS_TXT"
log_info "Found $(wc -l < "$SOURCE_LIBRARYFOLDERS_TXT" || true) libraryfolders appids (first 10):"
head -n 10 "$SOURCE_LIBRARYFOLDERS_TXT" | sed 's/^/  - /'

log_step "Extracting appids from userdata local/shared config"
if [[ -d "$STEAM_ROOT/userdata" ]]; then
	USER_CONFIG_FILES="$TEMP_DIR/user_config_files.txt"
	find "$STEAM_ROOT/userdata" -type f \( -name 'localconfig.vdf' -o -name 'sharedconfig.vdf' \) -print > "$USER_CONFIG_FILES" || true
	log_info "Found $(wc -l < "$USER_CONFIG_FILES" || true) userdata config files (showing up to 10):"
	head -n 10 "$USER_CONFIG_FILES" | sed 's/^/  - /'
	if [[ -s "$USER_CONFIG_FILES" ]]; then
		while IFS= read -r cfg_file; do
			grep -hEo '"[0-9]{2,7}"' "$cfg_file" 2>/dev/null | tr -d '"' >> "$SOURCE_USER_CONFIG_TXT" || true
		done < "$USER_CONFIG_FILES"
	fi
fi
sort -n "$SOURCE_USER_CONFIG_TXT" | uniq > "$SOURCE_USER_CONFIG_TXT.sorted"
mv "$SOURCE_USER_CONFIG_TXT.sorted" "$SOURCE_USER_CONFIG_TXT"
log_info "Found $(wc -l < "$SOURCE_USER_CONFIG_TXT" || true) userdata config appids (first 10):"
head -n 10 "$SOURCE_USER_CONFIG_TXT" | sed 's/^/  - /'

log_step "Extracting appids from cloud-storage-namespace-1.json collections"
if [[ -d "$STEAM_ROOT/userdata" ]]; then
	COLLECTION_FILES="$TEMP_DIR/collection_files.txt"
	find "$STEAM_ROOT/userdata" -type f -name 'cloud-storage-namespace-1.json' -print > "$COLLECTION_FILES" || true
	log_info "Found $(wc -l < "$COLLECTION_FILES" || true) cloud-storage files (showing up to 10):"
	head -n 10 "$COLLECTION_FILES" | sed 's/^/  - /'
	if [[ -s "$COLLECTION_FILES" ]]; then
		while IFS= read -r json_file; do
			log_info "  processing: $json_file"
			jq -r '
				.[]?
				| select(type == "array" and length == 2)
				| select((.[0] | type) == "string" and (.[0] | startswith("user-collections.")))
				| .[1].value
				| fromjson?
				| .added[]?
				| select(type == "number")
			' "$json_file" 2>/dev/null >> "$SOURCE_COLLECTIONS_TXT" || true
		done < "$COLLECTION_FILES"
	fi
fi
sort -n "$SOURCE_COLLECTIONS_TXT" | uniq > "$SOURCE_COLLECTIONS_TXT.sorted"
mv "$SOURCE_COLLECTIONS_TXT.sorted" "$SOURCE_COLLECTIONS_TXT"

cat "$SOURCE_MANIFESTS_TXT" "$SOURCE_LIBRARYFOLDERS_TXT" "$SOURCE_USER_CONFIG_TXT" "$SOURCE_COLLECTIONS_TXT" \
	| sort -n | uniq > "$MERGED_TXT"

BASELINE_JSON="$TEMP_DIR/baseline.json"
MANIFESTS_JSON="$TEMP_DIR/source_manifests.json"
LIBRARYFOLDERS_JSON="$TEMP_DIR/source_libraryfolders.json"
USER_CONFIG_JSON="$TEMP_DIR/source_user_config.json"
COLLECTIONS_JSON="$TEMP_DIR/source_collections.json"
MERGED_JSON="$TEMP_DIR/source_merged.json"

jq -c 'map(select(type == "number")) | unique | sort' "$BASELINE_APPIDS_FILE" > "$BASELINE_JSON"
to_json_number_array "$SOURCE_MANIFESTS_TXT" > "$MANIFESTS_JSON"
to_json_number_array "$SOURCE_LIBRARYFOLDERS_TXT" > "$LIBRARYFOLDERS_JSON"
to_json_number_array "$SOURCE_USER_CONFIG_TXT" > "$USER_CONFIG_JSON"
to_json_number_array "$SOURCE_COLLECTIONS_TXT" > "$COLLECTIONS_JSON"
to_json_number_array "$MERGED_TXT" > "$MERGED_JSON"

REPORT_JSON_PATH="$OUTPUT_DIR/local-steam-coverage-${OUTPUT_PREFIX}.json"
REPORT_MD_PATH="$OUTPUT_DIR/local-steam-coverage-${OUTPUT_PREFIX}.md"

jq -n \
	--arg generatedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
	--arg steamRoot "$STEAM_ROOT" \
	--arg baselinePath "$BASELINE_APPIDS_FILE" \
	--arg outputPrefix "$OUTPUT_PREFIX" \
	--slurpfile baseline "$BASELINE_JSON" \
	--slurpfile manifests "$MANIFESTS_JSON" \
	--slurpfile libraryfolders "$LIBRARYFOLDERS_JSON" \
	--slurpfile userconfig "$USER_CONFIG_JSON" \
	--slurpfile collections "$COLLECTIONS_JSON" \
	--slurpfile merged "$MERGED_JSON" \
	'
	def overlap(a; b): [a[] as $id | select((b | index($id)) != null) | $id] | unique | sort;
	def diff(a; b): [a[] as $id | select((b | index($id)) == null) | $id] | unique | sort;

	($baseline[0]) as $baseline | ($manifests[0]) as $manifests | ($libraryfolders[0]) as $libraryfolders | ($userconfig[0]) as $userconfig | ($collections[0]) as $collections | ($merged[0]) as $merged |

	{
		metadata: {
			generatedAt: $generatedAt,
			steamRoot: $steamRoot,
			baselineAppidsPath: $baselinePath,
			outputPrefix: $outputPrefix
		},
		sources: {
			appmanifest_filenames: {
				confidence: "high",
				appidCount: ($manifests | length),
				overlapWithBaselineCount: (overlap($manifests; $baseline) | length)
			},
			libraryfolders_vdf_apps: {
				confidence: "high",
				appidCount: ($libraryfolders | length),
				overlapWithBaselineCount: (overlap($libraryfolders; $baseline) | length)
			},
			userdata_local_shared_config: {
				confidence: "medium-low",
				appidCount: ($userconfig | length),
				overlapWithBaselineCount: (overlap($userconfig; $baseline) | length)
			},
			cloud_storage_collections: {
				confidence: "high",
				appidCount: ($collections | length),
				overlapWithBaselineCount: (overlap($collections; $baseline) | length)
			}
		},
		merged: {
			localSignalAppidCount: ($merged | length),
			baselineAppidCount: ($baseline | length),
			overlapCount: (overlap($merged; $baseline) | length),
			localOnlyCount: (diff($merged; $baseline) | length),
			baselineMissingCount: (diff($baseline; $merged) | length),
			overlapPctOfBaseline: (
				if ($baseline | length) > 0
				then ((overlap($merged; $baseline) | length) / ($baseline | length) * 100)
				else 0
				end
			)
		},
		samples: {
			localOnlyFirst50: (diff($merged; $baseline)[:50]),
			baselineMissingFirst50: (diff($baseline; $merged)[:50]),
			overlapFirst50: (overlap($merged; $baseline)[:50])
		}
	}
	' > "$REPORT_JSON_PATH"

OVERLAP_COUNT="$(jq -r '.merged.overlapCount' "$REPORT_JSON_PATH")"
BASELINE_COUNT="$(jq -r '.merged.baselineAppidCount' "$REPORT_JSON_PATH")"
LOCAL_SIGNAL_COUNT="$(jq -r '.merged.localSignalAppidCount' "$REPORT_JSON_PATH")"
BASELINE_MISSING_COUNT="$(jq -r '.merged.baselineMissingCount' "$REPORT_JSON_PATH")"
OVERLAP_PCT="$(jq -r '.merged.overlapPctOfBaseline | @text' "$REPORT_JSON_PATH")"

cat > "$REPORT_MD_PATH" <<EOF
# Local Steam AppID Coverage Report

- Generated: $(jq -r '.metadata.generatedAt' "$REPORT_JSON_PATH")
- Steam root: $(jq -r '.metadata.steamRoot' "$REPORT_JSON_PATH")
- Baseline appids file: $(jq -r '.metadata.baselineAppidsPath' "$REPORT_JSON_PATH")

## Headline

- Baseline appids: $BASELINE_COUNT
- Local signal appids (merged): $LOCAL_SIGNAL_COUNT
- Overlap with baseline: $OVERLAP_COUNT
- Baseline missing from local signals: $BASELINE_MISSING_COUNT
- Coverage of baseline by local signals: ${OVERLAP_PCT}%

## Source Breakdown

| Source | Confidence | AppIDs | Overlap with baseline |
|---|---|---:|---:|
| appmanifest filenames | $(jq -r '.sources.appmanifest_filenames.confidence' "$REPORT_JSON_PATH") | $(jq -r '.sources.appmanifest_filenames.appidCount' "$REPORT_JSON_PATH") | $(jq -r '.sources.appmanifest_filenames.overlapWithBaselineCount' "$REPORT_JSON_PATH") |
| libraryfolders.vdf apps | $(jq -r '.sources.libraryfolders_vdf_apps.confidence' "$REPORT_JSON_PATH") | $(jq -r '.sources.libraryfolders_vdf_apps.appidCount' "$REPORT_JSON_PATH") | $(jq -r '.sources.libraryfolders_vdf_apps.overlapWithBaselineCount' "$REPORT_JSON_PATH") |
| userdata local/shared config | $(jq -r '.sources.userdata_local_shared_config.confidence' "$REPORT_JSON_PATH") | $(jq -r '.sources.userdata_local_shared_config.appidCount' "$REPORT_JSON_PATH") | $(jq -r '.sources.userdata_local_shared_config.overlapWithBaselineCount' "$REPORT_JSON_PATH") |
| cloud-storage collections | $(jq -r '.sources.cloud_storage_collections.confidence' "$REPORT_JSON_PATH") | $(jq -r '.sources.cloud_storage_collections.appidCount' "$REPORT_JSON_PATH") | $(jq -r '.sources.cloud_storage_collections.overlapWithBaselineCount' "$REPORT_JSON_PATH") |

## Sample AppIDs

- Local-only first 50: $(jq -c '.samples.localOnlyFirst50' "$REPORT_JSON_PATH")
- Baseline-missing first 50: $(jq -c '.samples.baselineMissingFirst50' "$REPORT_JSON_PATH")
- Overlap first 50: $(jq -c '.samples.overlapFirst50' "$REPORT_JSON_PATH")

EOF

log_success "Coverage JSON written: $REPORT_JSON_PATH"
log_success "Coverage markdown written: $REPORT_MD_PATH"
log_info "Summary: overlap $OVERLAP_COUNT / $BASELINE_COUNT (${OVERLAP_PCT}%)"
