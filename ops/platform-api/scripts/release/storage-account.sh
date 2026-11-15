#!/bin/sh
# Production MinIO bootstrap; run only in the one-shot job, never in the request-serving backend.
set -eu
fail() { echo "storage-account: $1" >&2; exit 1; }
: "${MINIO_ROOT_USER:?required}" "${MINIO_ROOT_PASSWORD:?required}"
: "${STORAGE_S3_ACCESS_KEY_ID:?required}" "${STORAGE_S3_SECRET_ACCESS_KEY:?required}"
: "${STORAGE_S3_BUCKET:?required}"
[ "$STORAGE_S3_ACCESS_KEY_ID" != "$MINIO_ROOT_USER" ] || fail 'backend access key must differ from root'
[ "$STORAGE_S3_SECRET_ACCESS_KEY" != "$MINIO_ROOT_PASSWORD" ] || fail 'backend secret must differ from root'
# The bucket is inserted into a JSON policy: allow only literal S3 bucket-name characters, never JSON or ARN wildcards.
case "$STORAGE_S3_BUCKET" in ''|*[!a-z0-9.-]*) fail 'invalid bucket name' ;; esac
umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
export MC_CONFIG_DIR="$work_dir/config"
# Suppress mc output: add/edit may print credentials. Failure messages below never include them.
mc alias set bootstrap http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 || fail 'root connection failed'
mc mb --ignore-existing "bootstrap/$STORAGE_S3_BUCKET" >/dev/null 2>&1 || fail 'bucket preparation failed'
cat >"$work_dir/policy.json" <<POLICY
{"Version":"2012-10-17","Statement":[
{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::$STORAGE_S3_BUCKET"]},
{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload"],"Resource":["arn:aws:s3:::$STORAGE_S3_BUCKET/*"]}
]}
POLICY
if mc admin user svcacct info bootstrap "$STORAGE_S3_ACCESS_KEY_ID" >/dev/null 2>&1; then
  mc admin user svcacct edit bootstrap "$STORAGE_S3_ACCESS_KEY_ID" --secret-key "$STORAGE_S3_SECRET_ACCESS_KEY" --policy "$work_dir/policy.json" >/dev/null 2>&1 || fail 'account update failed'
else
  mc admin user svcacct add bootstrap "$MINIO_ROOT_USER" --access-key "$STORAGE_S3_ACCESS_KEY_ID" --secret-key "$STORAGE_S3_SECRET_ACCESS_KEY" --policy "$work_dir/policy.json" >/dev/null 2>&1 || fail 'account creation failed'
fi
echo 'storage-account: bucket and restricted account ready'
