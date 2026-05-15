/**
 * FFmpeg Static Binary Installer
 *
 * This file is based on and modified from the "ffmpeg-static" npm package
 * Original source: https://github.com/eugeneware/ffmpeg-static
 * License: GPL-3.0
 *
 * Modifications made for Raycast Media Converter extension
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { encode as encodeQuery } from "querystring";
import { strictEqual } from "assert";
import { createGunzip } from "zlib";
import { pipeline } from "stream";
import { extname } from "path";
import { getBinaryPath } from ".";
import axios from "axios";

// Configuration constants
import {
  executableBaseName,
  RELEASE_ENV_VAR,
  BINARIES_URL_ENV_VAR,
  DOWNLOAD_DIR_ENV_VAR,
  RELEASE_TAG,
} from "./ffmpegInstallConstants";

interface DownloadError extends Error {
  url?: string;
  statusCode?: number;
  code?: string;
}

const loadEnvLocal = (): void => {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const envFile = fs.readFileSync(envPath, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
};

loadEnvLocal();

const binaryPath: string | null = getBinaryPath();

const exitOnError = (err: Error): void => {
  console.error(err);
  process.exit(1);
};

const exitOnErrorOrWarnWith =
  (msg: string) =>
  (err: DownloadError): void => {
    if (err.statusCode === 404) console.warn(msg);
    else exitOnError(err);
  };

if (!binaryPath) {
  exitOnError(new Error(`ffmpeg-static install failed: No binary found for architecture`));
}

// Create the download directory if it's a custom location
const customDownloadDir = process.env[DOWNLOAD_DIR_ENV_VAR];
if (customDownloadDir) {
  const downloadDir = path.resolve(customDownloadDir);
  try {
    fs.mkdirSync(downloadDir, { recursive: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== "EEXIST") {
      exitOnError(new Error(`Failed to create download directory ${downloadDir}: ${error.message}`));
    }
  }
}

try {
  if (fs.statSync(binaryPath!).isFile()) {
    console.info(`${executableBaseName} is installed already.`);
    process.exit(0);
  }
} catch (err) {
  const error = err as NodeJS.ErrnoException;
  if (error && error.code !== "ENOENT") exitOnError(error);
}

// https://github.com/request/request/blob/a9557c9e7de2c57d92d9bab68a416a87d255cd3d/lib/getProxyFromURI.js#L66-L71
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxyUrl) {
  // Axios will automatically handle proxy settings from environment variables
  console.log(`Using proxy: ${proxyUrl}`);
}

// https://advancedweb.hu/how-s3-signed-urls-work/
const normalizeS3Url = (url: string): string => {
  const urlObj = new URL(url);
  if (urlObj.hostname.slice(-17) !== ".s3.amazonaws.com") return urlObj.href;
  const query = Array.from(urlObj.searchParams.entries())
    .filter(([key]: [string, string]) => key.slice(0, 6).toLowerCase() !== "x-amz-")
    .reduce((query: Record<string, string>, [key, val]: [string, string]) => ({ ...query, [key]: val }), {});
  urlObj.search = encodeQuery(query);
  return urlObj.href;
};
strictEqual(normalizeS3Url("https://example.org/foo?bar"), "https://example.org/foo?bar");
const signedS3TestUrl = process.env.FFMPEG_STATIC_SIGNED_S3_TEST_URL;
if (signedS3TestUrl) {
  const expectedUrl = new URL(signedS3TestUrl);
  for (const key of Array.from(expectedUrl.searchParams.keys())) {
    if (key.slice(0, 6).toLowerCase() === "x-amz-") {
      expectedUrl.searchParams.delete(key);
    }
  }
  strictEqual(normalizeS3Url(signedS3TestUrl), expectedUrl.href);
}

const isGzUrl = (url: string): boolean => {
  const urlPath = new URL(url).pathname.split("/");
  const filename = urlPath[urlPath.length - 1];
  return Boolean(filename && extname(filename) === ".gz");
};

type ProgressCallback = (deltaBytes: number, totalBytes: number | null) => void;

async function downloadFile(url: string, destinationPath: string, progressCallback?: ProgressCallback): Promise<void> {
  try {
    const response = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
      timeout: 30000,
      validateStatus: (status) => status < 400,
    });

    const file = fs.createWriteStream(destinationPath);
    const isGzStream = isGzUrl(url);

    // Set up progress tracking if callback provided
    let totalBytes: number | null = null;
    const contentLength = response.headers["content-length"];
    if (contentLength && progressCallback) {
      totalBytes = parseInt(contentLength, 10);

      (response.data as NodeJS.ReadableStream).on("data", (chunk: Buffer) => {
        progressCallback(chunk.length, totalBytes);
      });
    }

    return new Promise<void>((resolve, reject) => {
      if (isGzStream) {
        pipeline(response.data as NodeJS.ReadableStream, createGunzip(), file, (err: NodeJS.ErrnoException | null) => {
          if (err) {
            reject(new Error(`Failed to download and extract file: ${err.message}`));
          } else {
            resolve();
          }
        });
      } else {
        pipeline(response.data as NodeJS.ReadableStream, file, (err: NodeJS.ErrnoException | null) => {
          if (err) {
            reject(new Error(`Failed to download file: ${err.message}`));
          } else {
            resolve();
          }
        });
      }
    });
  } catch (error) {
    const err = error as { response?: { status: number }; message?: string };
    throw new Error(
      `Failed to download ${url}. Status: ${err.response?.status || "unknown"}, Message: ${err.message || "unknown error"}`,
    );
  }
}

const release = process.env[RELEASE_ENV_VAR] || RELEASE_TAG;
const arch = process.env.npm_config_arch || os.arch();
const platform = process.env.npm_config_platform || os.platform();
const downloadsUrl =
  process.env[BINARIES_URL_ENV_VAR] || "https://github.com/eugeneware/ffmpeg-static/releases/download";
const baseUrl = `${downloadsUrl}/${release}`;
const downloadUrl = `${baseUrl}/${executableBaseName}-${platform}-${arch}.gz`;
const readmeUrl = `${baseUrl}/${platform}-${arch}.README`;
const licenseUrl = `${baseUrl}/${platform}-${arch}.LICENSE`;

if (!binaryPath) {
  exitOnError(new Error("Binary path is null"));
}

const safeBinaryPath = binaryPath as string; // We know it's not null after the check above

downloadFile(downloadUrl, safeBinaryPath, undefined)
  .then(() => {
    fs.chmodSync(safeBinaryPath, 0o755); // make executable
  })
  .catch(exitOnError)

  .then(() => downloadFile(readmeUrl, `${safeBinaryPath}.README`))
  .catch(exitOnErrorOrWarnWith(`Failed to download the ${executableBaseName} README.`))

  .then(() => downloadFile(licenseUrl, `${safeBinaryPath}.LICENSE`))
  .catch(exitOnErrorOrWarnWith(`Failed to download the ${executableBaseName} LICENSE.`));
