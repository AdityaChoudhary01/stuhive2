import { getR2Bucket } from '@/lib/db';
import { 
    S3Client, 
    PutObjectCommand, 
    DeleteObjectCommand, 
    GetObjectCommand 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 🚀 THE FIX: Lazy-load the S3Client so environment variables are guaranteed to be loaded
const getS3Client = () => {
    if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        throw new Error("R2 Credentials missing from environment variables.");
    }
    return new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
};

/**
 * 1. Generate Upload URL
 * Used by the browser to upload files directly to R2.
 */
export async function generateUploadUrl(key, contentType) {
    const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    return await getSignedUrl(getS3Client(), command, { expiresIn: 300 }); 
}

/**
 * 2. 🚀 PUBLIC LOGIC: Public URL for Assets
 * Use this for Thumbnails, Avatars, and Blog Covers.
 * These files remain public on cdn.stuhive.in for speed and SEO.
 */
export function getR2PublicUrl(key) {
    if (!key) return null;
    return `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${key}`;
}

/**
 * 3. 🚀 SECURE LOGIC: Signed URL for Documents
 * Use this for the actual Note files (PDF/Office) and Previews.
 * These links expire after 1 hour and cannot be shared.
 */
export async function generateReadUrl(key, fileName = "document", forceDownload = false) {
    if (!key) return null;

    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const disposition = forceDownload ? 'attachment' : 'inline';
    
    const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: `${disposition}; filename="${encodeURIComponent(safeName)}"`,
    });

    // 🚀 Pass getS3Client() here
    return await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
}

/**
 * 4. Delete File (Hybrid Approach)
 * Tries Native Cloudflare R2 Binding first (0ms latency, 0 fees).
 * Falls back to AWS SDK for local development environments.
 */
export async function deleteFileFromR2(key) {
    if (!key) return false;
    
    try {
        // Try Native Binding first (Super Fast Edge execution)
        const bucket = getR2Bucket();
        if (bucket) {
            await bucket.delete(key);
            console.log(`[Native R2] Successfully deleted ${key}`);
            return true;
        }
    } catch (e) {
        console.log(`[R2] Native binding not available, falling back to S3 Client...`);
    }

    // Fallback to S3 Client (Local dev)
    try {
        const command = new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
        });
        
        // 🚀 Pass getS3Client() here
        await getS3Client().send(command);
        console.log(`[S3 Client] Successfully deleted ${key}`);
        return true;
    } catch (error) {
        console.error(`Error deleting file ${key} from R2:`, error);
        return false;
    }
}