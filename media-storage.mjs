import {BlobSASPermissions, BlobServiceClient} from "@azure/storage-blob";
import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";

export const MEDIA_UPLOAD_PURPOSES = Object.freeze({
  "request-opening-meter": ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  "request-closing-meter": ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  "request-first-trip-card": ["image/jpeg", "image/png", "image/webp"],
  "ticket-attachment": ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"],
  "ticket-resolution": ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"],
});

const clean = (value) => String(value || "").trim();
const enabled = (value) => ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());

export function mediaStorageConfiguration(env = process.env) {
  const requested = clean(env.MEDIA_STORAGE_PROVIDER).toLowerCase();
  const provider = requested || (clean(env.AZURE_STORAGE_CONNECTION_STRING) ? "azure" : clean(env.S3_BUCKET) ? "s3" : "");
  if (!provider) return {provider: "", configured: false};
  if (provider === "azure") {
    const connectionString = clean(env.AZURE_STORAGE_CONNECTION_STRING);
    if (!connectionString) throw new Error("AZURE_STORAGE_CONNECTION_STRING is required when MEDIA_STORAGE_PROVIDER=azure.");
    return {
      provider,
      configured: true,
      connectionString,
      container: clean(env.AZURE_STORAGE_CONTAINER) || "nerve-center-media",
    };
  }
  if (provider === "s3") {
    const bucket = clean(env.S3_BUCKET);
    if (!bucket) throw new Error("S3_BUCKET is required when MEDIA_STORAGE_PROVIDER=s3.");
    return {
      provider,
      configured: true,
      bucket,
      region: clean(env.S3_REGION) || "us-east-1",
      endpoint: clean(env.S3_ENDPOINT) || undefined,
      forcePathStyle: enabled(env.S3_FORCE_PATH_STYLE),
      accessKeyId: clean(env.S3_ACCESS_KEY_ID),
      secretAccessKey: clean(env.S3_SECRET_ACCESS_KEY),
      sessionToken: clean(env.S3_SESSION_TOKEN),
    };
  }
  throw new Error(`Unsupported MEDIA_STORAGE_PROVIDER: ${provider}`);
}

export function validMediaUploadDescriptor({purpose, contentType, size} = {}) {
  const allowed = MEDIA_UPLOAD_PURPOSES[clean(purpose)];
  const normalizedType = clean(contentType).toLowerCase();
  const normalizedSize = Number(size);
  return Boolean(allowed?.includes(normalizedType)
    && Number.isSafeInteger(normalizedSize)
    && normalizedSize > 0);
}

export function safeMediaFilename(value = "upload") {
  const filename = clean(value).split(/[\\/]/).at(-1) || "upload";
  return filename.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "upload";
}

export function mediaObjectKey({id, purpose, fileName, now = new Date()} = {}) {
  const safePurpose = clean(purpose).replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "media";
  const safeName = safeMediaFilename(fileName)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "upload";
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${safePurpose}/${year}/${month}/${clean(id)}-${safeName}`;
}

function s3Client(configuration) {
  const credentials = configuration.accessKeyId && configuration.secretAccessKey
    ? {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
        ...(configuration.sessionToken ? {sessionToken: configuration.sessionToken} : {}),
      }
    : undefined;
  return new S3Client({
    region: configuration.region,
    ...(configuration.endpoint ? {endpoint: configuration.endpoint} : {}),
    ...(configuration.forcePathStyle ? {forcePathStyle: true} : {}),
    ...(credentials ? {credentials} : {}),
  });
}

export function createMediaStorage(env = process.env) {
  const configuration = mediaStorageConfiguration(env);
  if (!configuration.configured) return null;

  if (configuration.provider === "azure") {
    const service = BlobServiceClient.fromConnectionString(configuration.connectionString);
    const container = service.getContainerClient(configuration.container);
    let ready;
    const ensureContainer = () => ready ||= container.createIfNotExists();
    const blockBlob = (objectKey) => container.getBlockBlobClient(objectKey);
    return {
      provider: "azure",
      async createUpload({objectKey, contentType}) {
        await ensureContainer();
        const uploadUrl = await blockBlob(objectKey).generateSasUrl({
          permissions: BlobSASPermissions.parse("cw"),
          startsOn: new Date(Date.now() - 5 * 60 * 1000),
          expiresOn: new Date(Date.now() + 60 * 60 * 1000),
        });
        return {uploadUrl, method: "PUT", headers: {"x-ms-blob-type": "BlockBlob", "Content-Type": contentType}};
      },
      async inspect(objectKey) {
        const properties = await blockBlob(objectKey).getProperties();
        return {size: Number(properties.contentLength || 0), contentType: clean(properties.contentType).toLowerCase()};
      },
      async downloadUrl(objectKey) {
        return blockBlob(objectKey).generateSasUrl({
          permissions: BlobSASPermissions.parse("r"),
          startsOn: new Date(Date.now() - 5 * 60 * 1000),
          expiresOn: new Date(Date.now() + 60 * 60 * 1000),
        });
      },
      async uploadBuffer({objectKey, contentType, body}) {
        await ensureContainer();
        await blockBlob(objectKey).uploadData(body, {blobHTTPHeaders: {blobContentType: contentType}});
      },
      async delete(objectKey) {
        await blockBlob(objectKey).deleteIfExists();
      },
    };
  }

  const client = s3Client(configuration);
  const input = (objectKey) => ({Bucket: configuration.bucket, Key: objectKey});
  return {
    provider: "s3",
    async createUpload({objectKey, contentType}) {
      const command = new PutObjectCommand({...input(objectKey), ContentType: contentType});
      const uploadUrl = await getSignedUrl(client, command, {expiresIn: 60 * 60});
      return {uploadUrl, method: "PUT", headers: {"Content-Type": contentType}};
    },
    async inspect(objectKey) {
      const result = await client.send(new HeadObjectCommand(input(objectKey)));
      return {size: Number(result.ContentLength || 0), contentType: clean(result.ContentType).toLowerCase()};
    },
    async downloadUrl(objectKey) {
      return getSignedUrl(client, new GetObjectCommand(input(objectKey)), {expiresIn: 60 * 60});
    },
    async uploadBuffer({objectKey, contentType, body}) {
      await client.send(new PutObjectCommand({...input(objectKey), ContentType: contentType, Body: body}));
    },
    async delete(objectKey) {
      await client.send(new DeleteObjectCommand(input(objectKey)));
    },
  };
}
