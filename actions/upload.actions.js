"use server";

import { auth } from "@/lib/auth";
import { generateUploadUrl } from "@/lib/r2";
import { randomHex } from "@/lib/edge-action-utils";

export async function getUploadUrl(fileName, fileType, requestThumbnail = false, requestPreview = false) {
  try {
    const session = await auth();
    if (!session) return { error: "Unauthorized" };

    const timestamp = Date.now();
    const randomString = randomHex(4);
    const extension = fileName.split(".").pop();
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
    const fileKey = `notes/${session.user.id}/${timestamp}-${randomString}-${nameWithoutExt}.${extension}`;
    const uploadUrl = await generateUploadUrl(fileKey, fileType);

    let thumbUrl = null;
    let thumbKey = null;
    if (requestThumbnail) {
      thumbKey = `thumbnails/${session.user.id}/${timestamp}-${randomString}-thumb.webp`;
      thumbUrl = await generateUploadUrl(thumbKey, "image/webp");
    }

    let previewUploadUrl = null;
    let previewKey = null;
    if (requestPreview) {
      previewKey = `previews/${session.user.id}/${timestamp}-${randomString}-preview.pdf`;
      previewUploadUrl = await generateUploadUrl(previewKey, "application/pdf");
    }

    return {
      success: true,
      uploadUrl,
      fileKey,
      thumbUrl,
      thumbKey,
      previewUploadUrl,
      previewKey,
    };
  } catch (error) {
    console.error("R2 Note Presigned URL Error:", error);
    return { error: "Failed to generate upload authorization for R2" };
  }
}

export async function getAvatarUploadUrlAction() {
  try {
    const session = await auth();
    if (!session) return { error: "Unauthorized" };

    const timestamp = Date.now();
    const fileKey = `avatars/${session.user.id}/${timestamp}-avatar.webp`;
    const uploadUrl = await generateUploadUrl(fileKey, "image/webp");

    return { success: true, uploadUrl, fileKey };
  } catch (error) {
    console.error("R2 Avatar URL Error:", error);
    return { error: "Failed to generate avatar upload link" };
  }
}

export async function getBlogCoverUploadUrlAction(fileType = "image/webp") {
  try {
    const session = await auth();
    if (!session) return { error: "Unauthorized" };

    const timestamp = Date.now();
    const randomString = randomHex(4);
    const fileKey = `blogs/${session.user.id}/${timestamp}-${randomString}-cover`;
    const uploadUrl = await generateUploadUrl(fileKey, fileType);

    return { success: true, uploadUrl, fileKey };
  } catch (error) {
    console.error("R2 Blog Cover URL Error:", error);
    return { error: "Failed to generate blog cover upload link" };
  }
}

export async function getUniversityLogoUploadUrlAction(fileType = "image/webp") {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") return { error: "Unauthorized" };

    const timestamp = Date.now();
    const fileKey = `universities/logos/${timestamp}-logo.webp`;
    const uploadUrl = await generateUploadUrl(fileKey, fileType);

    return { success: true, uploadUrl, fileKey };
  } catch (error) {
    console.error("R2 University Logo URL Error:", error);
    return { error: "Failed to generate university logo link" };
  }
}

export async function getUniversityCoverUploadUrlAction(fileType = "image/webp") {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") return { error: "Unauthorized" };

    const timestamp = Date.now();
    const fileKey = `universities/covers/${timestamp}-cover.webp`;
    const uploadUrl = await generateUploadUrl(fileKey, fileType);

    return { success: true, uploadUrl, fileKey };
  } catch (error) {
    console.error("R2 University Cover URL Error:", error);
    return { error: "Failed to generate university cover link" };
  }
}
