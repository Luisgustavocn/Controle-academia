import path from "node:path";
import { getOptionalEnvironmentValue } from "@/lib/env";

export function getAppDataDirectory() {
  const configured = getOptionalEnvironmentValue("APP_DATA_DIR");
  if (configured) {
    return path.resolve(configured);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_DATA_DIR nao configurado para producao");
  }

  return path.join(process.cwd(), "data");
}

export function getUploadsDirectory() {
  const configured = getOptionalEnvironmentValue("UPLOAD_DIR");
  return configured ? path.resolve(configured) : path.join(getAppDataDirectory(), "uploads");
}

export function getBrandingUploadsDirectory() {
  return path.join(getUploadsDirectory(), "branding");
}

export function getDefaultBackupDirectory() {
  const configured = getOptionalEnvironmentValue("BACKUP_EXPORT_DIR");
  return configured ? path.resolve(configured) : path.join(getAppDataDirectory(), "backups");
}
