// Minimal AWS Signature V4 client for Backblaze B2's S3-compatible API.
const encoder = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (value) => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
const hmac = async (key, value) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), encoder.encode(value)));
const rfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const xmlEscape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xmlDecode = (value) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function config(env) {
  const endpoint = String(env.B2_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = String(env.B2_BUCKET || '');
  const keyId = String(env.B2_KEY_ID || '');
  const secret = String(env.B2_APPLICATION_KEY || '');
  if (!endpoint || !bucket || !keyId || !secret) throw new Error('B2_CONFIGURATION_MISSING');
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.backblazeb2.com')) throw new Error('B2_ENDPOINT_INVALID');
  return { endpoint, bucket, keyId, secret, region: parsed.hostname.split('.')[1] };
}

function canonicalQuery(url) {
  return [...url.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort((a, b) => a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]))
    .map(([k, v]) => k + '=' + v).join('&');
}

async function signedFetch(env, key, { method = 'GET', query = [], headers = {}, body = null, range = null } = {}) {
  const cfg = config(env);
  const path = '/' + cfg.bucket + (key ? '/' + key.split('/').map(rfc3986).join('/') : '');
  const url = new URL(cfg.endpoint + path);
  for (const [name, value] of query) url.searchParams.append(name, String(value));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = await sha256(body ?? new Uint8Array());
  const requestHeaders = new Headers(headers);
  requestHeaders.set('x-amz-content-sha256', payloadHash);
  requestHeaders.set('x-amz-date', amzDate);
  if (range) requestHeaders.set('range', range);
  const signedNames = [...requestHeaders.keys()].map((x) => x.toLowerCase()).filter((x) => ['host', 'content-type', 'range'].includes(x) || x.startsWith('x-amz-')).sort();
  const canonicalHeaders = signedNames.map((name) => name + ':' + (name === 'host' ? url.host : requestHeaders.get(name).trim().replace(/\\s+/g, ' ')) + '\\n').join('');
  const signedHeaders = signedNames.join(';');
  const canonicalRequest = [method, url.pathname, canonicalQuery(url), canonicalHeaders, signedHeaders, payloadHash].join('\\n');
  const scope = date + '/' + cfg.region + '/s3/aws4_request';
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonicalRequest)].join('\\n');
  let signingKey = encoder.encode('AWS4' + cfg.secret);
  for (const part of [date, cfg.region, 's3', 'aws4_request']) signingKey = await hmac(signingKey, part);
  const signature = hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC' }, false, ['sign']), encoder.encode(toSign)));
  requestHeaders.set('authorization', 'AWS4-HMAC-SHA256 Credential=' + cfg.keyId + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature);
  const response = await fetch(url, { method, headers: requestHeaders, body: ['GET', 'HEAD'].includes(method) ? undefined : body });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error('B2_S3_' + response.status + ':' + detail);
  }
  return response;
}

function tag(xml, name) {
  const match = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  return match ? xmlDecode(match[1]) : '';
}

export async function b2CreateMultipart(env, key, contentType, metadata) {
  const headers = { 'content-type': contentType, 'cache-control': 'private, no-store' };
  for (const [name, value] of Object.entries(metadata || {})) headers['x-amz-meta-' + name.toLowerCase()] = value;
  const response = await signedFetch(env, key, { method: 'POST', query: [['uploads', '']], headers, body: '' });
  const xml = await response.text();
  const uploadId = tag(xml, 'UploadId');
  if (!uploadId) throw new Error('B2_MULTIPART_UPLOAD_ID_MISSING');
  return { uploadId };
}

export async function b2UploadPart(env, key, uploadId, partNumber, data) {
  const response = await signedFetch(env, key, { method: 'PUT', query: [['partNumber', partNumber], ['uploadId', uploadId]], body: data });
  return { etag: response.headers.get('etag') || '' };
}

export async function b2CompleteMultipart(env, key, uploadId, parts) {
  const body = '<CompleteMultipartUpload>' + parts.map((part) => '<Part><PartNumber>' + part.partNumber + '</PartNumber><ETag>' + xmlEscape(part.etag) + '</ETag></Part>').join('') + '</CompleteMultipartUpload>';
  await signedFetch(env, key, { method: 'POST', query: [['uploadId', uploadId]], headers: { 'content-type': 'application/xml' }, body });
}

export async function b2AbortMultipart(env, key, uploadId) {
  await signedFetch(env, key, { method: 'DELETE', query: [['uploadId', uploadId]] });
}

export async function b2GetObject(env, key, range = null, head = false) {
  const response = await signedFetch(env, key, { method: head ? 'HEAD' : 'GET', range });
  return { body: response.body, size: Number(response.headers.get('content-length') || 0), status: response.status };
}

export async function b2DeleteObjectVersions(env, key) {
  let keyMarker = '', versionMarker = '';
  for (let page = 0; page < 20; page++) {
    const query = [['versions', ''], ['prefix', key], ['max-keys', '1000']];
    if (keyMarker) query.push(['key-marker', keyMarker]);
    if (versionMarker) query.push(['version-id-marker', versionMarker]);
    const response = await signedFetch(env, '', { method: 'GET', query });
    const xml = await response.text();
    const entries = [...xml.matchAll(/<(?:Version|DeleteMarker)>([\\s\\S]*?)<\\/(?:Version|DeleteMarker)>/g)]
      .map((match) => ({ key: tag(match[1], 'Key'), versionId: tag(match[1], 'VersionId') }))
      .filter((item) => item.key === key && item.versionId);
    for (const item of entries) {
      await signedFetch(env, key, { method: 'DELETE', query: [['versionId', item.versionId]] });
    }
    if (!/<IsTruncated>true<\\/IsTruncated>/.test(xml)) return;
    keyMarker = tag(xml, 'NextKeyMarker');
    versionMarker = tag(xml, 'NextVersionIdMarker');
    if (!keyMarker && !versionMarker) throw new Error('B2_VERSION_LIST_PAGINATION_INVALID');
  }
  throw new Error('B2_VERSION_LIST_PAGE_LIMIT');
}

export { b2AbortMultipart, b2CompleteMultipart, b2CreateMultipart, b2DeleteObjectVersions, b2GetObject, b2UploadPart };
