import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b2CreateMultipart, b2DeleteObjectVersions } from '../worker/src/b2-s3.js';

const env = {
  B2_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
  B2_BUCKET: 'wefagh-classroom-recordings',
  B2_KEY_ID: 'test-key-id',
  B2_APPLICATION_KEY: 'test-application-secret',
};

test('B2 multipart initiation uses AWS SigV4 and returns upload id', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response('<InitiateMultipartUploadResult><UploadId>upload-123</UploadId></InitiateMultipartUploadResult>', { status: 200 });
  };
  const result = await b2CreateMultipart(env, 'classroom/12/recording-1', 'video/mp4', { sessionid: '12' });
  assert.equal(result.uploadId, 'upload-123');
  assert.match(captured.url, /^https:\/\/s3\.us-east-005\.backblazeb2\.com\/wefagh-classroom-recordings\/classroom\/12\/recording-1\?uploads=$/);
  assert.match(captured.options.headers.get('authorization'), /AWS4-HMAC-SHA256 Credential=test-key-id\/\d{8}\/us-east-005\/s3\/aws4_request/);
  assert.match(captured.options.headers.get('authorization'), /SignedHeaders=.*x-amz-meta-sessionid/);
});

test('B2 expiry cleanup permanently deletes every version and delete marker for the exact key', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    if (options.method === 'GET') {
      return new Response(`<ListVersionsResult>
        <Version><Key>classroom/12/recording-1</Key><VersionId>version-a</VersionId></Version>
        <DeleteMarker><Key>classroom/12/recording-1</Key><VersionId>marker-b</VersionId></DeleteMarker>
        <Version><Key>classroom/12/recording-10/other</Key><VersionId>other-c</VersionId></Version>
        <IsTruncated>false</IsTruncated>
      </ListVersionsResult>`, { status: 200 });
    }
    return new Response(null, { status: 204 });
  };
  await b2DeleteObjectVersions(env, 'classroom/12/recording-1');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[1].url, /versionId=version-a/);
  assert.match(calls[2].url, /versionId=marker-b/);
  assert.ok(calls.slice(1).every((call) => call.method === 'DELETE'));
});
